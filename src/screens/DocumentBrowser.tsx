/*
 * Prairie - a desktop GUI client for BisonDB
 * Copyright (C) 2026 Abdullah Masood
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FilePlus2,
  Pencil,
  Play,
  RotateCcw,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import { api, computeSetDiff } from '../api';
import type { BsonDocument, ExportFormat } from '../api/types';
import { canWrite, useConnectionStore } from '../stores/connection';
import { useFiltersStore } from '../stores/filters';
import { motion } from 'framer-motion';
import { JsonTree, CopyDocButton } from '../components/JsonTree';
import { Modal } from '../components/Modal';
import { toastError, toastSuccess } from '../components/Toast';
import { listItem } from '../lib/motion';

// Skeleton placeholders shaped like document cards, shown while a find runs.
function DocSkeletons() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <div className="skeleton mb-2 h-3 w-1/3" />
          <div className="skeleton mb-1.5 h-3 w-2/3" />
          <div className="skeleton h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

const PAGE = 20;

// Normalizes @tauri-apps/plugin-dialog results: depending on version, open()
// resolves to a string path, a FileResponse object ({ path, ... }), or an
// array of either. null = cancelled.
function dialogPath(result: unknown): string | null {
  if (typeof result === 'string') return result;
  if (Array.isArray(result)) return result.length > 0 ? dialogPath(result[0]) : null;
  if (result !== null && typeof result === 'object' && 'path' in result) {
    const p = (result as { path: unknown }).path;
    return typeof p === 'string' ? p : null;
  }
  return null;
}

function oidOf(doc: BsonDocument): string {
  const id = doc._id;
  if (id !== null && typeof id === 'object' && '$oid' in (id as object)) {
    return (id as { $oid: string }).$oid;
  }
  return '';
}

function validJson(text: string): string | null {
  try {
    JSON.parse(text);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export default function DocumentBrowser({ coll }: { coll: string }) {
  const connId = useConnectionStore((s) => s.connection!.conn_id);
  const writable = canWrite(useConnectionStore((s) => s.connection!.roles));
  const writeTip = 'requires write access';
  const filters = useFiltersStore();
  const state = filters.get(coll);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'documents' | 'indexes' | 'io'>('documents');
  const [draftFilter, setDraftFilter] = useState(state.filter);
  const [editorDoc, setEditorDoc] = useState<BsonDocument | null>(null); // null = closed
  const [editorText, setEditorText] = useState('');
  const [editorError, setEditorError] = useState('');
  const [insertOpen, setInsertOpen] = useState(false);
  const [deleteDoc, setDeleteDoc] = useState<BsonDocument | null>(null);
  const [deleteManyOpen, setDeleteManyOpen] = useState(false);
  const [deleteManyText, setDeleteManyText] = useState('');
  const [importProgress, setImportProgress] = useState<number | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('jsonl');
  const [exportScope, setExportScope] = useState<'filter' | 'all'>('all');

  const filterError = validJson(state.filter);
  const draftError = validJson(draftFilter);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['find', connId, coll] });
    queryClient.invalidateQueries({ queryKey: ['count', connId, coll] });
    queryClient.invalidateQueries({ queryKey: ['dbStats', connId] });
    queryClient.invalidateQueries({ queryKey: ['indexes', connId, coll] });
  };

  const result = useQuery({
    queryKey: ['find', connId, coll, state.filter, state.page],
    queryFn: () => api.find(connId, coll, state.filter, PAGE, state.page * PAGE),
    enabled: !filterError && !state.explainMode,
  });
  const total = useQuery({
    queryKey: ['count', connId, coll, state.filter],
    queryFn: () => api.count(connId, coll, state.filter),
    enabled: !filterError,
  });
  const plan = useQuery({
    queryKey: ['explain', connId, coll, state.filter],
    queryFn: () => api.explain(connId, coll, state.filter, 0),
    enabled: !filterError && state.explainMode,
  });
  const indexes = useQuery({
    queryKey: ['indexes', connId, coll],
    queryFn: () => api.listIndexes(connId, coll),
  });

  const filterFields = useMemo(() => {
    try {
      const f = JSON.parse(state.filter) as Record<string, unknown>;
      return Object.keys(f).filter((k) => !k.startsWith('$'));
    } catch {
      return [];
    }
  }, [state.filter]);

  const run = () => filters.setFilter(coll, draftFilter);
  const reset = () => {
    setDraftFilter('{}');
    filters.reset(coll);
  };

  const insertMut = useMutation({
    mutationFn: (text: string) => api.insert(connId, coll, text),
    onSuccess: (ids) => {
      toastSuccess(`inserted ${ids.length} document${ids.length === 1 ? '' : 's'}`);
      setInsertOpen(false);
      setEditorError('');
      invalidate();
    },
    onError: (e) => setEditorError(String(e instanceof Error ? e.message : e)),
  });

  const saveEdit = async () => {
    if (!editorDoc) return;
    const err = validJson(editorText);
    if (err) {
      setEditorError(err);
      return;
    }
    const edited = JSON.parse(editorText) as BsonDocument;
    const { set, removedKeys } = computeSetDiff(editorDoc, edited);
    if (removedKeys.length > 0) {
      setEditorError(
        `removing top-level fields is not supported (the protocol only has $set): ${removedKeys.join(', ')}`,
      );
      return;
    }
    if (Object.keys(set).length === 0) {
      setEditorDoc(null);
      return;
    }
    try {
      await api.updateOne(
        connId,
        coll,
        JSON.stringify({ _id: editorDoc._id }),
        JSON.stringify(set),
      );
      toastSuccess(`updated ${Object.keys(set).length} field(s)`);
      setEditorDoc(null);
      setEditorError('');
      invalidate();
    } catch (e) {
      setEditorError(String(e instanceof Error ? e.message : e));
    }
  };

  const doDelete = async () => {
    if (!deleteDoc) return;
    try {
      await api.deleteById(connId, coll, oidOf(deleteDoc));
      toastSuccess('document deleted');
      setDeleteDoc(null);
      invalidate();
    } catch (e) {
      toastError(e);
    }
  };

  const doDeleteMany = async () => {
    try {
      const n = await api.deleteMany(connId, coll, state.filter);
      toastSuccess(`deleted ${n} documents`);
      setDeleteManyOpen(false);
      setDeleteManyText('');
      invalidate();
    } catch (e) {
      toastError(e);
    }
  };

  const doImport = async () => {
    let path: string | null = null;
    try {
      const result = await openDialog({
        filters: [{ name: 'Data', extensions: ['bson', 'json', 'jsonl'] }],
      });
      if (result === null) return; // cancelled
      path = dialogPath(result);
      if (path === null) {
        toastError(`unexpected file dialog result: ${JSON.stringify(result)}`);
        return;
      }
    } catch (e) {
      toastError(e); // e.g. missing dialog capability
      return;
    }
    if (path === null) return;
    setImportProgress(0);
    const unlisten = await listen<{ done: number; total: number }>('import-progress', (e) =>
      setImportProgress(e.payload.total ? e.payload.done / e.payload.total : 0),
    );
    try {
      const summary = await api.importFile(connId, coll, path);
      toastSuccess(
        `imported ${summary.inserted}, skipped ${summary.skipped}` +
          (summary.errors.length ? ` (${summary.errors[0]})` : ''),
      );
      invalidate();
    } catch (e) {
      toastError(e);
    } finally {
      unlisten();
      setImportProgress(null);
    }
  };

  const doExport = async () => {
    let path: string | null = null;
    try {
      const result = await saveDialog({ defaultPath: `${coll}.${exportFormat}` });
      if (result === null) return; // cancelled
      path = dialogPath(result);
      if (path === null) {
        toastError(`unexpected save dialog result: ${JSON.stringify(result)}`);
        return;
      }
    } catch (e) {
      toastError(e);
      return;
    }
    if (path === null) return;
    try {
      const filter = exportScope === 'filter' ? state.filter : '{}';
      const n = await api.exportFile(connId, coll, filter, path, exportFormat);
      toastSuccess(`exported ${n} documents to ${path}`);
    } catch (e) {
      toastError(e);
    }
  };

  const totalPages = total.data !== undefined ? Math.max(1, Math.ceil(total.data / PAGE)) : 1;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-2">
        <h1 className="font-medium">{coll}</h1>
        <nav className="flex gap-1 text-sm">
          {(['documents', 'indexes', 'io'] as const).map((t) => (
            <button
              key={t}
              className={`rounded px-2 py-1 ${tab === t ? 'bg-zinc-800 text-amber-400' : 'text-zinc-400 hover:text-zinc-100'}`}
              onClick={() => setTab(t)}
            >
              {t === 'io' ? 'Import / Export' : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <button
          className="flex items-center gap-1 rounded bg-amber-600 px-2 py-1 text-sm hover:bg-amber-500 disabled:opacity-40"
          disabled={!writable}
          title={writable ? 'Insert document' : writeTip}
          onClick={() => {
            setEditorText('{\n  \n}');
            setEditorError('');
            setInsertOpen(true);
          }}
        >
          <FilePlus2 size={14} /> Insert document
        </button>
      </div>

      {tab === 'documents' && (
        <>
          <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2">
            <div className="min-w-0 flex-1 rounded border border-zinc-700">
              <CodeMirror
                value={draftFilter}
                onChange={setDraftFilter}
                extensions={[json()]}
                theme="dark"
                basicSetup={{ lineNumbers: false, foldGutter: false }}
                maxHeight="80px"
                placeholder='{ field: { "$gt": ... } }'
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!draftError) run();
                  }
                }}
              />
            </div>
            <button
              className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-40"
              disabled={!!draftError}
              title={draftError ?? 'Run (Enter)'}
              onClick={run}
            >
              <Play size={13} /> Run
            </button>
            <button
              className="rounded px-2 py-1.5 text-sm text-zinc-400 hover:text-zinc-100"
              onClick={reset}
              title="Reset"
            >
              <RotateCcw size={13} />
            </button>
            <button
              className={`flex items-center gap-1 rounded px-2 py-1.5 text-sm ${state.explainMode ? 'bg-amber-700' : 'bg-zinc-800 hover:bg-zinc-700'}`}
              onClick={() => filters.setExplainMode(coll, !state.explainMode)}
            >
              <Zap size={13} /> Explain
            </button>
            {writable && (
              <button
                className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-1.5 text-sm text-red-300 hover:bg-zinc-700"
                onClick={() => setDeleteManyOpen(true)}
              >
                <Trash2 size={13} /> Delete matching
              </button>
            )}
          </div>
          {draftError && <div className="px-4 py-1 text-xs text-red-400">{draftError}</div>}

          <div className="flex-1 overflow-y-auto px-4 py-2">
            {state.explainMode ? (
              plan.isLoading ? (
                <p className="text-sm text-zinc-500">explaining…</p>
              ) : plan.data ? (
                <div className="space-y-2 text-sm">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                      plan.data.plan === 'scan'
                        ? 'bg-red-900 text-red-200'
                        : 'bg-emerald-900 text-emerald-200'
                    }`}
                  >
                    {plan.data.plan}
                    {plan.data.index ? ` on "${plan.data.index}"` : ''}
                  </span>
                  <p>
                    examined <b>{plan.data.docsExamined}</b> · returned{' '}
                    <b>{plan.data.docsReturned}</b>
                  </p>
                  {plan.data.plan === 'scan' && filterFields.length === 1 && (
                    <p className="text-amber-400">
                      Hint: create an index on "{filterFields[0]}" to speed this up (Indexes tab).
                    </p>
                  )}
                </div>
              ) : null
            ) : result.isLoading ? (
              <DocSkeletons />
            ) : result.data && result.data.docs.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-500">
                <p>No documents{state.filter !== '{}' ? ' match this filter' : ' yet'}.</p>
                {writable && (
                  <button
                    className="rounded bg-amber-600 px-3 py-1.5 text-sm text-zinc-50 hover:bg-amber-500"
                    onClick={() => {
                      setEditorText('{\n  \n}');
                      setInsertOpen(true);
                    }}
                  >
                    Insert your first document
                  </button>
                )}
              </div>
            ) : (
              result.data?.docs.map((doc, i) => (
                <motion.div
                  key={oidOf(doc) || i}
                  variants={listItem}
                  initial="hidden"
                  animate="visible"
                  custom={i}
                  className="group mb-2 rounded-lg border border-zinc-800 bg-zinc-900 p-2"
                >
                  <div className="mb-1 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100">
                    <CopyDocButton doc={doc} />
                    {writable && (
                      <>
                        <button
                          title="Edit"
                          className="text-zinc-500 hover:text-amber-400"
                          onClick={() => {
                            setEditorDoc(doc);
                            setEditorText(JSON.stringify(doc, null, 2));
                            setEditorError('');
                          }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          title="Delete"
                          className="text-zinc-500 hover:text-red-400"
                          onClick={() => setDeleteDoc(doc)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                  <JsonTree doc={doc} />
                </motion.div>
              ))
            )}
          </div>

          {!state.explainMode && (
            <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-1.5 text-xs text-zinc-400">
              <span>
                {result.data
                  ? `returned ${result.data.count} in ${result.data.ms.toFixed(1)} ms`
                  : ''}
                {total.data !== undefined ? ` · ${total.data} total` : ''}
              </span>
              <span className="flex items-center gap-2">
                <button
                  disabled={state.page === 0}
                  onClick={() => filters.setPage(coll, state.page - 1)}
                  className="disabled:opacity-30"
                >
                  <ChevronLeft size={14} />
                </button>
                page {state.page + 1} / {totalPages}
                <button
                  disabled={state.page + 1 >= totalPages}
                  onClick={() => filters.setPage(coll, state.page + 1)}
                  className="disabled:opacity-30"
                >
                  <ChevronRight size={14} />
                </button>
              </span>
            </div>
          )}
        </>
      )}

      {tab === 'indexes' && (
        <IndexesTab
          connId={connId}
          coll={coll}
          indexes={indexes.data ?? []}
          writable={writable}
          onChanged={invalidate}
        />
      )}

      {tab === 'io' && (
        <div className="space-y-6 p-4 text-sm">
          <div>
            <h2 className="mb-2 flex items-center gap-1 font-medium">
              <Upload size={14} /> Import
            </h2>
            <button
              className="rounded bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700 disabled:opacity-40"
              disabled={!writable}
              title={writable ? undefined : writeTip}
              onClick={doImport}
            >
              Choose file (.bson / .json / .jsonl)…
            </button>
            {importProgress !== null && (
              <div className="mt-2 h-2 w-64 overflow-hidden rounded bg-zinc-800">
                <div
                  className="h-full bg-amber-500"
                  style={{ width: `${Math.round(importProgress * 100)}%` }}
                />
              </div>
            )}
          </div>
          <div>
            <h2 className="mb-2 flex items-center gap-1 font-medium">
              <Download size={14} /> Export
            </h2>
            <div className="mb-2 flex gap-3">
              {(['json', 'jsonl', 'bson', 'csv'] as const).map((f) => (
                <label key={f} className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={exportFormat === f}
                    onChange={() => setExportFormat(f)}
                  />{' '}
                  {f}
                </label>
              ))}
            </div>
            <div className="mb-2 flex gap-3">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={exportScope === 'all'}
                  onChange={() => setExportScope('all')}
                />{' '}
                all documents
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={exportScope === 'filter'}
                  onChange={() => setExportScope('filter')}
                />{' '}
                current filter
              </label>
            </div>
            <button
              className="rounded bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700"
              onClick={doExport}
            >
              Export…
            </button>
          </div>
        </div>
      )}

      <Modal
        open={insertOpen || editorDoc !== null}
        title={editorDoc ? 'Edit document' : 'Insert document(s)'}
        wide
        onClose={() => {
          setInsertOpen(false);
          setEditorDoc(null);
        }}
      >
        {editorDoc && (
          <p className="mb-2 text-xs text-zinc-400">
            Changed top-level fields are sent as $set. Removing top-level fields is not supported.
          </p>
        )}
        <div className="mb-2 rounded border border-zinc-700">
          <CodeMirror
            value={editorText}
            onChange={setEditorText}
            extensions={[json()]}
            theme="dark"
            minHeight="200px"
          />
        </div>
        {editorError && <p className="mb-2 text-xs text-red-400">{editorError}</p>}
        <button
          className="rounded bg-amber-600 px-3 py-1.5 text-sm hover:bg-amber-500 disabled:opacity-40"
          disabled={!!validJson(editorText)}
          onClick={() => (editorDoc ? saveEdit() : insertMut.mutate(editorText))}
        >
          {editorDoc ? 'Save changes' : 'Insert'}
        </button>
      </Modal>

      <Modal open={deleteDoc !== null} title="Delete document?" onClose={() => setDeleteDoc(null)}>
        <p className="mb-3 break-all font-mono text-xs text-zinc-400">
          _id: {deleteDoc ? oidOf(deleteDoc) : ''}
        </p>
        <button
          className="rounded bg-red-700 px-3 py-1.5 text-sm hover:bg-red-600"
          onClick={doDelete}
        >
          Delete
        </button>
      </Modal>

      <Modal
        open={deleteManyOpen}
        title="Delete matching documents?"
        onClose={() => setDeleteManyOpen(false)}
      >
        <p className="mb-1 text-sm text-zinc-400">Filter:</p>
        <pre className="mb-2 rounded bg-zinc-950 p-2 font-mono text-xs">{state.filter}</pre>
        <p className="mb-2 text-sm">
          Matches <b>{total.data ?? '…'}</b> document(s).
          {state.filter.replace(/\s/g, '') === '{}' && (
            <span className="text-red-400"> Empty filter — this deletes ALL documents!</span>
          )}
        </p>
        <p className="mb-1 text-xs text-zinc-400">Type DELETE to confirm:</p>
        <input
          className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
          value={deleteManyText}
          onChange={(e) => setDeleteManyText(e.target.value)}
        />
        <button
          className="rounded bg-red-700 px-3 py-1.5 text-sm hover:bg-red-600 disabled:opacity-40"
          disabled={deleteManyText !== 'DELETE'}
          onClick={doDeleteMany}
        >
          Delete {total.data ?? ''} documents
        </button>
      </Modal>
    </div>
  );
}

function IndexesTab({
  connId,
  coll,
  indexes,
  writable,
  onChanged,
}: {
  connId: number;
  coll: string;
  indexes: string[];
  writable: boolean;
  onChanged: () => void;
}) {
  const [field, setField] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const create = async () => {
    if (!field.trim()) return;
    try {
      const n = await api.createIndex(connId, coll, field.trim());
      toastSuccess(`index built: ${n} documents indexed`);
      setField('');
      onChanged();
    } catch (e) {
      toastError(e);
    }
  };

  const drop = async () => {
    if (!dropTarget) return;
    try {
      await api.dropIndex(connId, coll, dropTarget);
      toastSuccess(`dropped index on "${dropTarget}"`);
      setDropTarget(null);
      onChanged();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="p-4 text-sm">
      <table className="mb-4 w-full max-w-md">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
            <th className="py-1">Field</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {indexes.map((f) => (
            <tr key={f} className="border-b border-zinc-900">
              <td className="py-1.5 font-mono">{f}</td>
              <td className="py-1.5 text-right">
                {f !== '_id' && writable && (
                  <button
                    className="text-zinc-500 hover:text-red-400"
                    onClick={() => setDropTarget(f)}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {writable ? (
        <div className="flex max-w-md gap-2">
          <input
            className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5"
            placeholder="field name (dotted paths allowed)"
            value={field}
            onChange={(e) => setField(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <button className="rounded bg-amber-600 px-3 py-1.5 hover:bg-amber-500" onClick={create}>
            Create index
          </button>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">Read-only — index changes require write access.</p>
      )}
      <Modal
        open={dropTarget !== null}
        title={`Drop index on "${dropTarget}"?`}
        onClose={() => setDropTarget(null)}
      >
        <button className="rounded bg-red-700 px-3 py-1.5 text-sm hover:bg-red-600" onClick={drop}>
          Drop index
        </button>
      </Modal>
    </div>
  );
}
