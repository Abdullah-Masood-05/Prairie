# Prairie — a desktop GUI client for BisonDB, in the spirit of MongoDB Compass

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

This build has been tested and verified against the following BisonDB version:
- **BisonDB Commit**: [69bc41b](https://github.com/Abdullah-Masood-05/Bisondb/commit/69bc41ba59346ccfb5f9d92efb1de14ca5529fbf) (`feat: add integration tests for createCollection and dbStats methods`)
