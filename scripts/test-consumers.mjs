import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';

const mode = process.argv[2];
if (mode !== 'packed' && mode !== 'git') {
  throw new TypeError('Consumer mode must be packed or git');
}

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(
  await readFile(resolve(root, 'package.json'), 'utf8'),
);
const version = manifest.version;
const repository = process.env.GITHUB_REPOSITORY ?? 'zrira/rqg';
const temporary = await mkdtemp(resolve(tmpdir(), `rqg-consumers-${mode}-`));

try {
  const specifications =
    mode === 'packed'
      ? await createPackedSpecifications(temporary)
      : {
          core: `git+https://github.com/${repository}.git#core-v${version}`,
          express: `git+https://github.com/${repository}.git#express-v${version}`,
          nestjs: `git+https://github.com/${repository}.git#nestjs-v${version}`,
        };

  await testCore(resolve(temporary, 'core-consumer'), specifications.core);
  await testExpress(
    resolve(temporary, 'express-consumer'),
    specifications.express,
  );
  await testNest(resolve(temporary, 'nestjs-consumer'), specifications.nestjs);

  process.stdout.write(`All ${mode} consumers passed for rqg ${version}\n`);
} finally {
  if (process.env.RQG_KEEP_CONSUMERS !== '1') {
    await rm(temporary, { force: true, recursive: true });
  } else {
    process.stdout.write(`Kept consumers at ${temporary}\n`);
  }
}

async function createPackedSpecifications(directory) {
  const packages = resolve(directory, 'packages');
  run(process.execPath, [
    resolve(root, 'scripts/prepare-distribution.mjs'),
    '--output',
    packages,
    '--version',
    version,
    '--repository',
    repository,
  ]);

  const archives = resolve(directory, 'archives');
  await mkdir(archives, { recursive: true });
  const coreArchive = pack(resolve(packages, 'core'), archives);

  for (const packageName of ['express', 'nestjs']) {
    const path = resolve(packages, packageName, 'package.json');
    const adapter = JSON.parse(await readFile(path, 'utf8'));
    adapter.dependencies['@rqg/core'] = `file:${coreArchive}`;
    await writeFile(path, `${JSON.stringify(adapter, null, 2)}\n`);
  }

  return {
    core: coreArchive,
    express: pack(resolve(packages, 'express'), archives),
    nestjs: pack(resolve(packages, 'nestjs'), archives),
  };
}

async function testCore(directory, packageSpecification) {
  await createConsumer(directory, [
    packageSpecification,
    'typescript@5.9.3',
    '@types/node@24',
  ]);
  await writeSource(
    directory,
    `import assert from 'node:assert/strict';
import { createRateLimiter, createRequestId, createTimer, isRequestId } from '@rqg/core';

const requestId = createRequestId();
assert.equal(isRequestId(requestId), true);
const readings = [10, 14];
const timer = createTimer({ clock: () => readings.shift() ?? 14 });
assert.equal(timer.stop(), 4);
const limiter = createRateLimiter({ max: 1, windowMs: 1_000, clock: () => 0 });
assert.equal((await limiter.consume('consumer')).reason, 'within-limit');
assert.equal((await limiter.consume('consumer')).reason, 'limit-exceeded');
`,
  );
  compileAndRun(directory);
  await verifyInstalledPackage(directory, '@rqg/core');
}

async function testExpress(directory, packageSpecification) {
  await createConsumer(directory, [
    packageSpecification,
    'express@5.3.0',
    '@types/express@5.0.6',
    'typescript@5.9.3',
    '@types/node@24',
  ]);
  await writeSource(
    directory,
    `import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { getRequestId, rateLimit, requestId, requestObservability } from '@rqg/express';

const app = express();
app.use(requestId());
app.use(requestObservability({ logger: { log() {} } }));
app.use(rateLimit({ max: 1, windowMs: 1_000, clock: () => 0, identity: () => 'consumer' }));
app.get('/', (_request, response) => response.json({ requestId: getRequestId(response) }));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = \`http://127.0.0.1:\${address.port}\`;
const first = await fetch(origin);
assert.equal(first.status, 200);
assert.match(first.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/);
const second = await fetch(origin);
assert.equal(second.status, 429);
assert.equal(second.headers.get('retry-after'), '1');
server.close();
await once(server, 'close');
`,
  );
  compileAndRun(directory);
  await verifyInstalledPackage(directory, '@rqg/express');
  await verifyInstalledPackage(directory, '@rqg/core');
}

async function testNest(directory, packageSpecification) {
  await createConsumer(directory, [
    packageSpecification,
    '@nestjs/common@11.2.7',
    '@nestjs/core@11.2.7',
    '@nestjs/platform-express@11.2.7',
    'reflect-metadata@0.2.2',
    'rxjs@7.8.2',
    'typescript@5.9.3',
    '@types/node@24',
  ]);
  await writeSource(
    directory,
    `import 'reflect-metadata';
import assert from 'node:assert/strict';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { RateLimit, RequestId, RqgModule } from '@rqg/nestjs';

@Controller()
class AppController {
  @Get()
  @RateLimit({ max: 1, windowMs: 1_000 })
  get(@RequestId() requestId: string | undefined) { return { requestId }; }
}
@Module({
  imports: [RqgModule.forRoot({
    requestId: {},
    rateLimit: { global: false, max: 10, windowMs: 1_000, clock: () => 0, identity: () => 'consumer' },
  })],
  controllers: [AppController],
})
class AppModule {}

const app = await NestFactory.create(AppModule, { logger: false });
await app.listen(0, '127.0.0.1');
const origin = await app.getUrl();
const first = await fetch(origin);
assert.equal(first.status, 200);
assert.match(first.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/);
assert.equal((await first.json()).requestId, first.headers.get('x-request-id'));
const second = await fetch(origin);
assert.equal(second.status, 429);
await app.close();

@Module({ imports: [RqgModule.forRoot({ requestId: false }), RqgModule.forRoot({ requestId: false })] })
class ConflictModule {}
const conflict = await NestFactory.create(ConflictModule, { logger: false });
await assert.rejects(conflict.init(), /Conflicting RqgModule root registrations detected/);
await conflict.close();
`,
  );
  compileAndRun(directory);
  await verifyInstalledPackage(directory, '@rqg/nestjs');
  await verifyInstalledPackage(directory, '@rqg/core');
}

async function createConsumer(directory, dependencies) {
  await mkdir(resolve(directory, 'src'), { recursive: true });
  await writeFile(
    resolve(directory, 'package.json'),
    `${JSON.stringify({ name: 'rqg-isolated-consumer', private: true, type: 'module' }, null, 2)}\n`,
  );
  await writeFile(
    resolve(directory, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          outDir: 'dist',
          skipLibCheck: false,
        },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    )}\n`,
  );
  run(
    'npm',
    [
      'install',
      '--no-audit',
      '--no-fund',
      ...(mode === 'git' ? ['--allow-git=all'] : []),
      ...dependencies,
    ],
    directory,
  );
}

async function writeSource(directory, source) {
  await writeFile(resolve(directory, 'src/main.ts'), source);
}

function compileAndRun(directory) {
  run(
    resolve(directory, 'node_modules/.bin/tsc'),
    ['-p', 'tsconfig.json'],
    directory,
  );
  run(process.execPath, ['dist/main.js'], directory);
}

async function verifyInstalledPackage(directory, packageName) {
  const packagePath = resolve(
    directory,
    'node_modules',
    ...packageName.split('/'),
  );
  const installed = JSON.parse(
    await readFile(resolve(packagePath, 'package.json'), 'utf8'),
  );
  if (installed.version !== version) {
    throw new Error(
      `${packageName} resolved ${installed.version}, expected ${version}`,
    );
  }
  await Promise.all([
    readFile(resolve(packagePath, 'dist/index.js')),
    readFile(resolve(packagePath, 'dist/index.d.ts')),
  ]);
}

function pack(directory, destination) {
  const output = run(
    'npm',
    ['pack', directory, '--pack-destination', destination, '--json'],
    root,
  );
  const parsed = JSON.parse(output);
  const details = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
  const filename = details?.filename;
  if (typeof filename !== 'string')
    throw new Error('npm pack returned no file');
  return resolve(destination, filename);
}

function run(command, arguments_, cwd = root) {
  return execFileSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, npm_config_update_notifier: 'false' },
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}
