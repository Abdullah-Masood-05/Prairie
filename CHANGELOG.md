# Changelog

## v1.1.0 — 2026-06-14

Sync with BisonDB v1.1.0+ (tested against v1.2.0): **authentication and TLS**. Prairie now
speaks **wire protocol v2** and requires a BisonDB 1.1.0-or-newer server.

### Added

- **TLS transport.** Connect over TLS with the server's verification modes — system trust,
  a CA / self-signed cert file, a SHA-256 fingerprint pin, or an explicit (and loudly
  flagged) insecure skip. A lock indicator in the workspace header shows
  encrypted&verified / encrypted-unverified / plaintext. Local databases run the bundled
  sidecar over a self-signed cert whose fingerprint is pinned automatically, so they are
  encrypted **and** verified with no login.
- **Authentication.** A login step appears when the server requires auth; a first-run setup
  screen bootstraps the first admin. Session tokens are held only in the Rust backend
  (never in web-accessible storage); the client transparently re-authenticates on token
  expiry.
- **User management (admin).** A Users panel to list, create (with role), reset passwords,
  and drop users.
- **Role-aware UI.** Read-only users have insert/edit/delete/index/import controls hidden
  or disabled.

### Changed

- Wire protocol bumped to **v2**; the version-mismatch screen now expects it. Recent
  connections remember username and TLS preferences — **never** passwords or tokens.

## v1.0.3 — 2026-06-13

### Changed
- **Relicensed from MIT to GNU GPL v3.0-or-later.** Prairie now matches the BisonDB
  engine's copyleft license; `LICENSE` holds the full GPLv3 text and every source file
  carries the standard GPL notice header.

### Added
- The installer now ships the bundled engine's GPLv3 license text as `LICENSE-bisond.txt`
  alongside `bisond` in the install directory.

## v1.0.2 — 2026-06-13

Bugfix release.

### Fixed
- Opening a local database popped a visible `bisond.exe` console window on
  Windows. The sidecar is now spawned with `CREATE_NO_WINDOW`, so it runs
  silently in the background as intended.

## v1.0.1 — 2026-06-13

Bugfix release.

### Fixed
- Local database ("Open folder" / "Create new database") failed with
  *"bisond binary not found"* because the sidecar resolver only checked a
  working-directory-relative path. It now searches the Tauri resource
  directory (the correct location in installed builds) and several
  executable-relative paths, so local databases work in both `tauri dev`
  and the packaged app. When the binary genuinely can't be found, the
  error now lists every path that was searched.

## v1.0.0 — 2026-06-13

First stable release, matching BisonDB v1.0.0 (wire protocol v1).

### Features
- Connection screen: remote bisond servers and local database folders
  (bundled bisond sidecar on an ephemeral port), recent connections
  persisted in the OS appData directory.
- Workspace: collection sidebar with live document counts, create/drop
  (type-the-name confirmation) and compact.
- Document browser: paginated JSON tree with Extended-JSON type badges,
  CodeMirror filter bar with linting, explain plans (scan / index_range /
  index_point) with an index hint, per-collection filter memory.
- Mutations: insert (single or array), edit via computed `$set` diff,
  per-document delete, filtered deleteMany with typed DELETE confirmation
  and an all-documents warning.
- Indexes tab: create (dotted paths supported) and drop.
- Import (.bson / .json / .jsonl with progress) and export
  (json / jsonl / bson / csv).
- Wire-protocol version check on connect with a blocking mismatch screen.
- Sidecar processes are reaped on disconnect and on app exit, including
  window close.

### Known limitations
- Edits send `$set` of changed top-level fields; removing top-level keys
  is not supported (no removal operator in protocol v1).
- find results cap at 10,000 documents client-side.
- No authentication or TLS — BisonDB is a localhost/trusted-network tool.
