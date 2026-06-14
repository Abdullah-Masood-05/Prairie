# Prairie manual test checklist

Setup: build the engine, `bun run copy-sidecar`, `bun run tauri dev`.

## v1.0.0 release walk — 2026-06-13

Automated layers all pass on this machine against bisond v1.0.0
(mingw-release build):

- [x] `bun run test` — 18/18 Vitest
- [x] `bun run lint` — clean
- [x] `bun run build` — TypeScript strict + Vite clean
- [x] `cargo test` — 6/6 (framing, truncated find, converters incl. CSV)
- [x] Engine suite — 171/171 (includes createCollection/dbStats/protocolVersion)

The interactive items below must be walked by hand in `tauri dev` before
tagging; mark each box. Previously verified during development: import/export
(json/jsonl/bson + csv export), explain scan→index_range flip on zips,
delete confirmations.

## Sidecar lifecycle (release-blocking)
- [ ] Open a local database; confirm a bisond.exe child appears in Task Manager
- [ ] Disconnect: the child exits
- [ ] Open a local database again, then close the app WINDOW (X button): the
      child exits within ~2s (RunEvent::Exit reaper)
- [ ] Open a local database, quit via the app menu/Alt-F4: child exits

## Protocol mismatch (release-blocking)
- [ ] Connect to a pre-1.0 bisond (or one with protocolVersion patched != 1):
      a blocking "Incompatible server protocol" screen appears instead of the
      workspace; Disconnect returns to the connection screen
- [ ] Connect to bisond v1.0.0: workspace loads normally

## Recents storage
- [ ] Recent connections survive an app restart
- [ ] `recent-connections.json` exists under the OS appData dir (e.g.
      %APPDATA%\com.bisondb.prairie on Windows) — NOT in webview localStorage

## Connection
- [ ] Connect to a running bisond (host/port) — banner shows label + version
- [ ] Wrong port shows an inline error on the card (not a crash)
- [ ] Open existing local folder spawns sidecar and connects
- [ ] Create new database makes the folder and connects
- [ ] Recent connections appear and reconnect with one click
- [ ] Disconnect returns to this screen and kills the local sidecar (check Task Manager)

## Workspace / sidebar
- [ ] Collections list with live counts; refresh button updates
- [ ] "+ New collection": invalid name shows inline error; valid name appears in list
- [ ] Drop requires typing the collection name; mismatched text keeps button disabled
- [ ] Compact shows a success toast

## Documents
- [ ] Pagination: 20/page, pager total matches count
- [ ] JsonTree: $oid/$date/$numberDecimal badges render; expand/collapse works
- [ ] Copy-document puts pretty JSON on the clipboard
- [ ] Insert modal: invalid JSON disables Insert; array inserts multiple; DuplicateKey shows in-modal
- [ ] Edit: changing a field saves via $set; REMOVING a top-level key is rejected with the hint
- [ ] Per-doc delete confirms with the _id
- [ ] Delete matching: shows filter + match count, requires typing DELETE; `{}` warns ALL documents
- [ ] Empty collection shows the "Insert your first document" CTA

## Query bar
- [ ] Invalid JSON disables Run with the lint message
- [ ] Enter runs; Reset restores {}
- [ ] Filter is preserved per collection when switching collections
- [ ] Explain toggle: scan vs index_range badge, examined/returned numbers
- [ ] Single-field scan filter shows the "create an index" hint; after creating the index the plan flips

## Indexes
- [ ] Create index toasts docsIndexed; appears in table
- [ ] Drop index confirms; _id row has no drop button

## Import / Export
- [ ] Import .bson/.json/.jsonl shows progress bar and summary toast
- [ ] Export json/jsonl/bson with "all" and "current filter"; file exists and reimports

## Robustness
- [ ] Kill bisond mid-session: next action shows a network error toast, no crash
- [ ] Server error codes render as red toasts with the code badge

## v1.2.0 — authentication, TLS, roles, motion (release walk 2026-06-14)

Automated layers pass on this machine:
- [x] `bun run lint` clean · `bun run build` (tsc strict + Vite) clean · `bunx prettier --check` clean
- [x] `bun run test` — 33/33 Vitest (palette filter, error mapping, role helpers/auth state, + prior)
- [x] `cargo test` — client framing/typed-errors/token-expiry; TLS+auth e2e passes with `PRAIRIE_E2E=1` against a real bisond
- [x] Engine `--auth --tls` end-to-end proven from the Rust client (protocol v2, login, CRUD, AuthFailed)

Set up a secured server to walk the interactive items:
`bisonc tls gen-cert --out-dir ./tls` then
`BISONDB_ADMIN_PASSWORD=secret bisond --dir data/db --tls --tls-cert ./tls/cert.pem --tls-key ./tls/key.pem --init-admin admin`.

### TLS / connection
- [ ] Connect with **Use TLS → Trust a CA file** (`cert.pem`), host `localhost`: workspace lock shows 🔒 verified
- [ ] Connect with **Pin** (paste the printed fingerprint): verified; a wrong pin fails with a TLS error
- [ ] **Insecure** toggle shows the inline warning; connecting marks the lock ⚠ unverified
- [ ] Plaintext client vs TLS server (uncheck Use TLS): clear error hinting to add `--tls`
- [ ] **Local database**: opens with no login and shows 🔒 verified (sidecar self-signed + pinned)

### Authentication
- [ ] Wrong password → `AuthFailed` toast/inline ("check your username and password")
- [ ] Successful login → workspace; header shows the username + role
- [ ] Fresh server with no users → **Setup** screen; paste bootstrap token → first admin created → workspace
- [ ] Token expiry (short `--token-ttl`): a command after expiry transparently re-auths (password) and succeeds
- [ ] No token/password in localStorage or sessionStorage (DevTools → Application → Storage is empty of secrets)

### Roles
- [ ] Log in as a `read` user: insert/edit/delete/index/import controls are hidden or disabled ("requires write access")
- [ ] `readWrite` user: data writes allowed, no Users panel
- [ ] `admin`: Users panel — create (with role) / reset password / drop (typed confirm); self-drop disabled

### Motion & accessibility
- [ ] Modals fade+scale in/out; toasts slide+fade; route changes cross-fade; document cards stagger (capped, not a long cascade)
- [ ] Skeletons (not spinners) show while the sidebar and documents load
- [ ] OS "reduce motion" ON → all of the above is instant (no animation), app still fully usable
- [ ] No console errors during any of the above

### Command palette
- [ ] ⌘/Ctrl-K opens; typing filters collections + actions; ↑/↓ navigate, Enter runs, Esc closes
