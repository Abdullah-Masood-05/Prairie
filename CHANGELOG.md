# Changelog

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
