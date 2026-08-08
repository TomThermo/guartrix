# Changelog

All notable changes to Guartrix are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [1.4.12] — 2026-08-08

### Fixed
- Remote create stuck on BusyBox/`tar`: republish daemon bundle with portable tar extract flags (`packages/node-agent` safe-archive).
- Failed async create no longer deletes the server row so Console can show `ERROR`.
- `install-daemon-bundle.zip` selection uses semver-correct zip pick (and can force-republish).

## [1.4.11] — 2026-08-08

### Changed
- Panel create/import returns immediately (`CREATING`) and opens the server Console with live install progress instead of blocking on the create page.

## [1.4.10] — 2026-08-08

### Fixed
- Node transfer stuck on Validate 0% (`Transfer: starting…`): run moves inline in the API instead of BullMQ (in-memory job + fixed jobId silent no-op). Unlock stuck `TRANSFERRING` servers on restart / retry.

## [1.4.9] — 2026-08-08

### Fixed
- Server deploy on remote nodes with BusyBox/`tar` that rejects GNU-only `--no-absolute-filenames` (and related long options): detect GNU tar via `--version` and use portable extract flags otherwise.

## [1.4.1] — 2026-08-08

- Public repo: drop operator/dev-only scripts and tooling from git (kept locally via `.gitignore`); keep install/run scripts for users.

## [1.4.0] — 2026-08-07

- Fresh repository baseline on `main` (history reset). Current Guartrix panel release tree as of this tag.
