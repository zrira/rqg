import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, readArgument('--output') ?? '.release/packages');
const rootManifest = await readJson(resolve(root, 'package.json'));
const version =
  readArgument('--version') ?? requireString(rootManifest.version, 'version');
const repository =
  readArgument('--repository') ?? process.env.GITHUB_REPOSITORY ?? 'zrira/rqg';

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new TypeError('Distribution version must be a valid release version');
}
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  throw new TypeError('GitHub repository must use owner/name format');
}
if (output === root || output === resolve('/')) {
  throw new TypeError('Distribution output must not be a project or filesystem root');
}

await rm(output, { force: true, recursive: true });
await mkdir(output, { recursive: true });

for (const packageName of ['core', 'express', 'nestjs']) {
  const source = resolve(root, 'packages', packageName);
  const destination = resolve(output, packageName);
  const manifest = await readJson(resolve(source, 'package.json'));

  if (manifest.version !== version) {
    throw new Error(`${packageName} version must equal ${version}`);
  }

  await Promise.all([
    requireFile(resolve(source, 'dist/index.js')),
    requireFile(resolve(source, 'dist/index.d.ts')),
  ]);
  await mkdir(destination, { recursive: true });
  await Promise.all([
    cp(resolve(source, 'dist'), resolve(destination, 'dist'), {
      recursive: true,
    }),
    cp(resolve(source, 'README.md'), resolve(destination, 'README.md')),
    cp(resolve(root, 'LICENSE'), resolve(destination, 'LICENSE')),
  ]);

  const distributed = {
    ...manifest,
    version,
    repository: {
      type: 'git',
      url: `git+https://github.com/${repository}.git`,
    },
    homepage: `https://github.com/${repository}#readme`,
    bugs: `https://github.com/${repository}/issues`,
  };
  delete distributed.scripts;
  delete distributed.publishConfig;
  if (packageName !== 'core') {
    distributed.dependencies = {
      '@rqg/core': `github:${repository}#core-v${version}`,
    };
  }

  await writeFile(
    resolve(destination, 'package.json'),
    `${JSON.stringify(distributed, null, 2)}\n`,
  );
}

process.stdout.write(
  `Prepared @rqg packages ${version} for ${repository} in ${output}\n`,
);

function readArgument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new TypeError(`${name} requires a value`);
  }
  return value;
}

async function readJson(path) {
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError(`${path} must contain a JSON object`);
  }
  return parsed;
}

async function requireFile(path) {
  await readFile(path);
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a nonempty string`);
  }
  return value;
}
