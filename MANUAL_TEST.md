# Prairie manual test checklist

Setup: build the engine, `bun run copy-sidecar`, `bun run tauri dev`.

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
