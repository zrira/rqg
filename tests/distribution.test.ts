import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
let output = '';

beforeAll(async () => {
  const releaseRoot = resolve(root, '.release');
  await mkdir(releaseRoot, { recursive: true });
  output = await mkdtemp(`${releaseRoot}/distribution-test-`);
  await execute(
    process.execPath,
    [
      resolve(root, 'scripts/prepare-distribution.mjs'),
      '--output',
      output,
      '--version',
      '0.1.0',
      '--repository',
      'zrira/rqg',
    ],
    { cwd: root },
  );
});

afterAll(async () => {
  if (output.length > 0) await rm(output, { force: true, recursive: true });
});

describe('GitHub distribution', () => {
  it.each(['core', 'express', 'nestjs'])(
    'creates an installable %s package root',
    async (packageName) => {
      const directory = resolve(output, packageName);
      const manifest = await readJson(resolve(directory, 'package.json'));
      const files = await readdir(directory);

      expect(manifest).toMatchObject({
        name: `@rqg/${packageName}`,
        version: '0.1.0',
        type: 'module',
        main: './dist/index.js',
        types: './dist/index.d.ts',
      });
      expect(files.sort()).toEqual([
        'LICENSE',
        'README.md',
        'dist',
        'package.json',
      ]);
      await expect(
        readFile(resolve(directory, 'dist/index.js')),
      ).resolves.toBeTruthy();
      await expect(
        readFile(resolve(directory, 'dist/index.d.ts')),
      ).resolves.toBeTruthy();
    },
  );

  it.each(['express', 'nestjs'])(
    'pins %s to the immutable core release tag',
    async (packageName) => {
      const manifest = await readJson(
        resolve(output, packageName, 'package.json'),
      );
      expect(manifest).toHaveProperty(
        'dependencies.@rqg/core',
        'github:zrira/rqg#core-v0.1.0',
      );
    },
  );

  it('keeps the monorepo root unsupported as a package installation target', async () => {
    const manifest = await readJson(resolve(root, 'package.json'));

    expect(manifest).toMatchObject({ private: true });
    expect(manifest).not.toHaveProperty('exports');
    expect(manifest).not.toHaveProperty('main');
  });
});

async function readJson(path: string): Promise<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError(`${path} must contain an object`);
  }
  return parsed as Record<string, unknown>;
}
