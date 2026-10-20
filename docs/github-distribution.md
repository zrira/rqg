# GitHub distribution

rqg is not published to npm or GitHub Packages. The monorepo remains the source of truth, while generated Git tags provide installable package roots.

## Why package-root tags

npm Git dependencies install the repository root. A fragment such as `#packages/core` selects a Git ref, not a workspace directory, so the normal source tag cannot independently install an rqg workspace.

Three approaches were evaluated:

| Approach                                         | Result                                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Three generated repositories                     | Supports Git installation, but adds repository synchronization, permissions, and maintenance overhead.                           |
| GitHub Release tarballs only                     | Useful immutable archives, but adapter dependency resolution cannot naturally select the core asset through normal npm metadata. |
| Package-root commits and tags in this repository | Supports npm Git dependencies, keeps one repository, preserves package names/exports/types, and requires no registry. Selected.  |

For version `0.1.0`, generated commits are referenced by:

- `core-v0.1.0`
- `express-v0.1.0`
- `nestjs-v0.1.0`

The tagged tree contains only `package.json`, `README.md`, `LICENSE`, and `dist/`. Adapter manifests pin `@rqg/core` to `github:zrira/rqg#core-v0.1.0`. The source tag `v0.1.0` remains the auditable monorepo release.

## Reproducibility

`npm run distribution:prepare` builds package-root directories from existing manifests and compiled output. It removes development scripts and rewrites only distribution metadata and adapter core dependencies.

`npm run distribution:tags -- --push` creates package commits directly from those directories without changing the working tree. Existing tags are accepted only when their tree exactly matches regenerated contents; a mismatch fails instead of moving a tag.

The release workflow validates source, regenerates package trees, creates or verifies package tags, installs all three packages from the actual GitHub URLs in isolated consumers, and then creates a GitHub Release with tarballs and SHA-256 checksums.

## Installation

```bash
npm install github:zrira/rqg#core-v0.1.0
npm install github:zrira/rqg#express-v0.1.0 express@^5
npm install github:zrira/rqg#nestjs-v0.1.0 \
  @nestjs/common@^11 @nestjs/core@^11 @nestjs/platform-express@^11 \
  reflect-metadata@^0.2 rxjs@^7.8
```

A lockfile records the resolved Git commit, making subsequent `npm ci` installations immutable even if a tag were improperly moved. rqg's release process never moves package tags.

## Unsupported layout

This does not install an rqg package:

```bash
npm install github:zrira/rqg#v0.1.0
```

That ref points to the private monorepo root package, which intentionally has no runtime entry point or exports. GitHub URL fragments cannot select `packages/core`.
