import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const packageNames = ['core', 'express', 'nestjs'] as const;

async function readManifest(packageName: (typeof packageNames)[number]) {
  const manifestUrl = new URL(
    `../packages/${packageName}/package.json`,
    import.meta.url,
  );
  const parsed: unknown = JSON.parse(await readFile(manifestUrl, 'utf8'));

  if (typeof parsed !== 'object' || parsed === null) {
    throw new TypeError(`${packageName}/package.json must contain an object`);
  }

  return parsed;
}

describe('workspace architecture', () => {
  it.each(packageNames)(
    '%s exposes ESM and TypeScript declarations',
    async (packageName) => {
      const manifest = await readManifest(packageName);

      expect(manifest).toMatchObject({
        version: '0.1.0',
        type: 'module',
        exports: {
          '.': {
            types: './dist/index.d.ts',
            import: './dist/index.js',
          },
        },
      });
    },
  );

  it('keeps core free of framework dependencies', async () => {
    const manifest = await readManifest('core');

    expect(manifest).not.toHaveProperty('dependencies');
    expect(manifest).not.toHaveProperty('peerDependencies');
  });

  it.each(['express', 'nestjs'] as const)(
    '%s depends on core',
    async (packageName) => {
      const manifest = await readManifest(packageName);

      expect(manifest).toHaveProperty('dependencies.@rqg/core', '0.1.0');
    },
  );
});
