# Release procedure

rqg uses source tags, package-root distribution tags, and GitHub Release assets. It does not publish to npm or GitHub Packages.

## Preflight

From a clean `main` branch:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:consumers:packed
npm run distribution:prepare
```

Package versions, the root version, and the intended source tag must match.

## Distribution tags

The release workflow normally creates package tags. They can be prepared before the source release to validate real GitHub installation:

```bash
npm run distribution:tags -- --push
npm run test:consumers:git
```

The script never moves a tag. If a tag exists, its package tree must exactly match regenerated output.

## Publication boundary

After CI passes and release approval is explicit:

```bash
git switch main
git pull --ff-only
git tag -a v0.1.0 -m "rqg v0.1.0"
git push origin v0.1.0
```

Pushing `v0.1.0` triggers `.github/workflows/release.yml`. It validates the source, creates or verifies package tags, reruns isolated Git consumers, creates tarballs and checksums, and creates the GitHub Release.

Verify the workflow and release:

```bash
gh run list --workflow release.yml --limit 1
gh release view v0.1.0
gh release download v0.1.0 --dir /tmp/rqg-v0.1.0
(cd /tmp/rqg-v0.1.0 && sha256sum --check SHA256SUMS)
```

Do not reuse or force-update a released version. Correct release defects with a new semantic version.
