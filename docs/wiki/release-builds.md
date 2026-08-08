# Commercial release builds

For **selling / self-hosted installs**, ship minified bundles — not TypeScript sources.

## What customers get

| Piece | Build |
|-------|--------|
| `apps/web` | Vite (already minified) |
| `apps/api` | esbuild minify + **javascript-obfuscator** → one `dist/index.js` |
| `apps/daemon` | same |

npm dependencies (Prisma, Fastify, ssh2, …) stay in `node_modules` — native modules must.

Obfuscation applies only to **release** bundles (what goes in `/download` zips and `build/`). GitHub `src/` stays readable TypeScript. Skip with `RELEASE_OBFUSCATE=0`.

This is **not DRM**. It raises the bar for casual copying; the real control is your
[license key / validate API](licensing.md). Determined reverse-engineering of `Node.js` applications is still possible.

## Commands (source tree / your build machine)

```bash
# Everything into ./build (minified) + ready to start from there
npm run build:out
bash build/start.sh
# or: npm run start:build

# Only minify in-place under apps/*/dist (no build/ folder)
npm run build:release

# Pack a tarball without src/
npm run package:release
# → dist-release/guartrix-<version>-<date>.tar.gz

# Separate component zips + one master zip → password page /download
npm run package:download
# → dist-download/ and data/downloads/
```

`build/` reuses this repo’s `.env`, `data/` and `cert/` via symlinks (override with
`bash scripts/build-out.sh --no-link-runtime --npm-install` for a more portable tree).

Dev / day-to-day on this repo still uses readable `tsc` output:

```bash
npm run build          # TypeScript → multi-file dist (easy to debug)
bash scripts/start.sh
```

### Password downloads (`/download`) — **operator host only**

The password download gate lives in `scripts/prod-web-download.mjs` on **this**
machine. It is **not** included in customer zips.

After `npm run package:download`, open **https://download.guartrix.com/download**
(or apex `/download`, which redirects when `DOWNLOAD_PUBLIC_HOST` is set) and unlock with
`DOWNLOAD_PASSWORD` from `.env`. The page lists:

| File | Contents |
|------|----------|
| `guartrix-bundle-latest.zip` | Master zip of all parts |
| `guartrix-panel-*.zip` | Customer panel (**no** git, src, or download gate) |
| `guartrix.env.example` | Panel `.env` template (also inside every panel/api/web zip) |
| `daemon.env.example` | Same content as `data/daemon.env.example` in the daemon zip (next to live `data/daemon.env`) |
| `guartrix-api/web/daemon-*.zip` | Individual build outputs |

Customer packages are staged with `guartrix_stage_release_tree … customer` which strips
operator tooling and asserts a denylist (`.git`, `src/`, secrets, download module).

## Tarball / zip install (customer)

**Ship only release packages** (`package:release` or the panel zip from `package:download`).
Never give customers this git checkout, your `.env`, or `data/licenses/`.

```bash
# from tarball
tar -xzf guartrix-1.0.0-YYYYMMDD.tar.gz
cd guartrix-1.0.0-YYYYMMDD

# or from panel zip
unzip guartrix-panel-1.0.0.zip
cd guartrix-panel-1.0.0

cp .env.example .env   # fill secrets / PUBLIC_* / DATABASE_URL / LICENSE_*
npm install
npm run db:generate && bash scripts/db-migrate.sh
bash scripts/start.sh
```

Each customer needs a **license key** (set quotas / features on your side first).
Put `LICENSE_SERVER_URL` + `LICENSE_KEY` in their `.env` (default server URL is
`https://license.guartrix.com`).

`install-panel.sh` / `install-daemon.sh` detect a prebuilt release (no `src/`) and skip compile.

## Files

| Path | Role |
|------|------|
| `scripts/build-out.sh` | Compile → stage into `./build` + `build/start.sh` |
| `scripts/esbuild-release.mjs` | Bundle + minify api / daemon |
| `scripts/lib-stage-release.sh` | Shared staging (no sources) for `build/` and tarballs |
| `scripts/package-release.sh` | Typecheck → release build → stage → `.tar.gz` |
| `scripts/package-download-bundle.sh` | Component zips + master zip → `data/downloads/` |

Do **not** commit `build/`, `dist-release/`, or `dist-download/` (gitignored).

For maintainer-level details about staging boundaries, publish flow, script roles, and the operator-only `/download` edge, see:

- [Build and release internals](build-and-release-internals.md)
- [Prod-web and downloads](prod-web-and-downloads.md)
