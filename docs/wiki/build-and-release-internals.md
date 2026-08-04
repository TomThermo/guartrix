# Build and release internals

This page documents the maintainer-facing build, staging, and packaging pipeline behind the simpler [Release builds](release-builds.md) guide.

## Build layers

Guartrix has three practical build outputs:

| Output | Purpose |
|--------|---------|
| Normal `dist/` builds | Readable development/debug output from TypeScript |
| `build/` tree | Runnable staged release tree for operator testing or deployment |
| `dist-release/` and `dist-download/` artifacts | Customer-facing tarballs and zips |

## Main scripts

| Script | Role |
|--------|------|
| `scripts/build-out.sh` | Compile and stage a runnable `build/` tree |
| `scripts/esbuild-release.mjs` | Bundle/minify API and daemon for shipping builds |
| `scripts/lib-stage-release.sh` | Shared staging logic and denylist enforcement |
| `scripts/package-release.sh` | Produce tarball releases |
| Download bundle packaging script | Produce downloadable zips and publish manifests |

## `build/` semantics

`build-out.sh` does more than compile:

- creates a staged tree
- can link runtime assets such as `.env`, `data/`, and `cert/`
- can optionally skip compile or perform an install step

That means `build/` is convenient for operator-host deployment, but it is not the same as a sanitized customer package.

## Sanitized release staging

Customer release staging intentionally strips or excludes:

- git metadata
- TypeScript source trees
- operator-only download gate code
- local secrets and runtime state
- private licensing components that do not belong in this repo

This staging boundary is one of the most important maintainer concepts because public GitHub source and customer downloads are intentionally not the same artifact shape.

## Release package types

### Tarball release

`package-release.sh` creates a portable release tarball intended for shipping without the whole git checkout.

### Download bundle release

The download-bundle packaging step creates:

- per-component zips
- a combined master zip
- published files under the downloads area
- supporting manifest data

See [Prod-web and downloads](prod-web-and-downloads.md) for the web-serving side.

## OpenAPI and docs maintenance

Build/release maintenance is closely tied to docs tooling:

- `check-openapi-coverage.mjs`
- `generate-openapi-stubs.mjs`
- `capture-wiki-screenshots.mjs`

These scripts are not shipping artifacts, but they matter for release readiness and documentation accuracy.

## Related

- [Release builds](release-builds.md)
- [Prod-web and downloads](prod-web-and-downloads.md)
- [Development](development.md)
