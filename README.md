<div align="center">
  <img src="assets/logo.png" alt="BisonDB Prairie logo" width="120" height="120" />
  <h1>BisonDB Prairie</h1>
  <p><strong>The desktop GUI for BisonDB, in the spirit of MongoDB Compass.</strong></p>
  <p>
    <a href="https://github.com/Abdullah-Masood-05/Prairie/actions/workflows/ci.yml"><img src="https://github.com/Abdullah-Masood-05/Prairie/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPLv3-blue.svg" alt="License: GPLv3" /></a>
    <img src="https://img.shields.io/badge/Tauri-2-FFC131.svg" alt="Tauri 2" />
  </p>
  <p>
    <a href="https://github.com/Abdullah-Masood-05/Bisondb">BisonDB engine</a> ·
    <a href="https://abdullah-masood-05.github.io/bisondb-site/">Documentation</a>
  </p>
</div>

Prairie is a modern, responsive cross-platform desktop GUI database client designed specifically for BisonDB.

## Prerequisites

To run this application locally, you must first build the [BisonDB](https://github.com/Abdullah-Masood-05/Bisondb) database server.
The local Tauri application utilizes `bisond` (or `bisond.exe` on Windows) as a local sidecar database engine.

1. Clone and build the database engine from the [BisonDB Repository](https://github.com/Abdullah-Masood-05/Bisondb).
2. Configure the build directory path so the build script can copy the sidecar executable into the Tauri resources:
   - You can set the environment variable `BISONDB_BUILD_DIR` to your BisonDB build folder (e.g. `../Bisondb/build/mingw-release` or similar).
   - Alternatively, create a `.env.local` file in the root of the Prairie project containing:
     ```env
     BISONDB_BUILD_DIR=/path/to/Bisondb/build/mingw-release
     ```
   - Alternatively, you can copy the built `bisond` / `bisond.exe` binary manually into `src-tauri/bin/`.

## Tested Version

This build is tested and verified against:

- **BisonDB v1.0.0** (wire protocol **v1** — Prairie checks `serverStatus.protocolVersion` on
  connect and blocks the workspace with a clear mismatch screen if it differs).

## Develop & test

```bat
bun install
bun run copy-sidecar     # needs BISONDB_BUILD_DIR (env or .env.local)
bun run tauri dev
```

`bun run test` (Vitest: JsonTree, filter store, $set-diff, api validation), `bun run lint`
(ESLint), `cargo test` in `src-tauri/` (wire framing, truncated-find reassembly,
import/export converters incl. CSV). CI runs all of these plus a tag-triggered
(`v*`) Windows job that runs the full `bun run tauri build` and attaches the installer to a
GitHub Release.

Screenshots and a full feature tour live in the
[documentation site](https://abdullah-masood-05.github.io/bisondb-site/guide/prairie).

## Known limitations

- **Edits are `$set`-only.** The edit modal computes changed top-level fields and sends
  `updateOne` with `$set`; removing a top-level key is rejected with a hint (wire protocol v1
  has no removal operator).
- **find caps at 10,000 documents** client-side to protect the UI.
- **No authentication, no TLS** — BisonDB binds to loopback by default and Prairie is a
  localhost/trusted-network tool. Do not expose bisond to untrusted networks.
- Recent connections are stored unencrypted in the OS appData directory
  (`recent-connections.json`).

## License

Prairie is free software under the **GNU General Public License v3.0 (or later)** — see
[LICENSE](LICENSE). Each source file carries the standard GPL notice; changes per release
are in [CHANGELOG.md](CHANGELOG.md).

The installer also bundles the BisonDB engine binary (`bisond`), itself GPLv3
([source](https://github.com/Abdullah-Masood-05/Bisondb)); its license text ships in the
install directory next to the binary as `LICENSE-bisond.txt`. The whole distribution is
GPLv3 — if you redistribute it, you must pass on the same freedoms and make the source
available.
