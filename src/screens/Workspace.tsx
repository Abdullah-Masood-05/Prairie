import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, LogOut, Plus, RefreshCw, Trash2, Wrench } from 'lucide-react';
import { api } from '../api';
import { useConnectionStore } from '../stores/connection';
import { toastError, toastSuccess } from '../components/Toast';
import { Modal } from '../components/Modal';
import DocumentBrowser from './DocumentBrowser';

export default function Workspace() {
  const { connection, selectedCollection, selectCollection, setConnection } =
    useConnectionStore();
  const queryClient = useQueryClient();
  const [newCollOpen, setNewCollOpen] = useState(false);
  const [newCollName, setNewCollName] = useState('');
  const [newCollError, setNewCollError] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dropConfirm, setDropConfirm] = useState('');

  const connId = connection!.conn_id;
  const stats = useQuery({
    queryKey: ['dbStats', connId],
    queryFn: () => api.dbStats(connId),
    refetchInterval: 10_000,
  });

  const refreshAll = () => queryClient.invalidateQueries({ queryKey: ['dbStats', connId] });

  const createCollection = async () => {
    if (!/^[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$/.test(newCollName)) {
      setNewCollError('letters, digits, _ or - (must not start with -)');
      return;
    }
    try {
      const created = await api.createCollection(connId, newCollName);
      toastSuccess(created ? `created "${newCollName}"` : `"${newCollName}" already exists`);
      setNewCollOpen(false);
      setNewCollName('');
      setNewCollError('');
      refreshAll();
    } catch (e) {
      setNewCollError(String(e instanceof Error ? e.message : e));
    }
  };

  const dropCollection = async () => {
    if (!dropTarget) return;
    try {
      await api.dropCollection(connId, dropTarget);
      toastSuccess(`dropped "${dropTarget}"`);
      if (selectedCollection === dropTarget) selectCollection(null);
      setDropTarget(null);
      setDropConfirm('');
      refreshAll();
    } catch (e) {
      toastError(e);
    }
  };

  const compact = async (name: string) => {
    try {
      await api.compact(connId, name);
      toastSuccess(`compacted "${name}"`);
      refreshAll();
    } catch (e) {
      toastError(e);
    }
  };

  const disconnect = async () => {
    try {
      await api.disconnect(connId);
    } finally {
      setConnection(null);
    }
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-64 flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="flex items-center gap-2 border-b border-zinc-800 p-3 text-sm">
          <Database size={16} className="shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{connection!.label}</div>
            <div className="text-xs text-zinc-500">v{connection!.server_version}</div>
          </div>
          <button title="Disconnect" onClick={disconnect} className="text-zinc-400 hover:text-zinc-100">
            <LogOut size={15} />
          </button>
        </div>
        <div className="flex items-center justify-between p-2 text-xs text-zinc-400">
          <span>COLLECTIONS</span>
          <span className="flex gap-1">
            <button title="Refresh" onClick={refreshAll}>
              <RefreshCw size={13} />
            </button>
            <button title="New collection" onClick={() => setNewCollOpen(true)}>
              <Plus size={14} />
            </button>
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {stats.isLoading && <div className="p-3 text-xs text-zinc-500">loading…</div>}
          {stats.data?.collections.map((c) => (
            <div
              key={c.name}
              className={`group flex cursor-pointer items-center justify-between px-3 py-1.5 text-sm hover:bg-zinc-800 ${
                selectedCollection === c.name ? 'bg-zinc-800 text-amber-400' : ''
              }`}
              onClick={() => selectCollection(c.name)}
            >
              <span className="truncate">{c.name}</span>
              <span className="flex items-center gap-1">
                <span className="text-xs text-zinc-500">{c.count}</span>
                <button
                  title="Compact"
                  className="hidden text-zinc-500 hover:text-zinc-200 group-hover:inline"
                  onClick={(e) => {
                    e.stopPropagation();
                    compact(c.name);
                  }}
                >
                  <Wrench size={12} />
                </button>
                <button
                  title="Drop collection"
                  className="hidden text-zinc-500 hover:text-red-400 group-hover:inline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDropTarget(c.name);
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </span>
            </div>
          ))}
          {stats.data && stats.data.collections.length === 0 && (
            <div className="p-3 text-xs text-zinc-500">No collections yet.</div>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden">
        {selectedCollection ? (
          <DocumentBrowser key={selectedCollection} coll={selectedCollection} />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-500">
            Select a collection
          </div>
        )}
      </main>

      <Modal open={newCollOpen} title="New collection" onClose={() => setNewCollOpen(false)}>
        <input
          autoFocus
          className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
          placeholder="collection name"
          value={newCollName}
          onChange={(e) => setNewCollName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createCollection()}
        />
        {newCollError && <p className="mb-2 text-xs text-red-400">{newCollError}</p>}
        <button
          className="rounded bg-amber-600 px-3 py-1.5 text-sm hover:bg-amber-500"
          onClick={createCollection}
        >
          Create
        </button>
      </Modal>

      <Modal open={dropTarget !== null} title={`Drop "${dropTarget}"?`} onClose={() => setDropTarget(null)}>
        <p className="mb-2 text-sm text-zinc-400">
          This permanently deletes the collection and its indexes. Type the collection name to
          confirm.
        </p>
        <input
          autoFocus
          className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
          value={dropConfirm}
          onChange={(e) => setDropConfirm(e.target.value)}
        />
        <button
          className="rounded bg-red-700 px-3 py-1.5 text-sm hover:bg-red-600 disabled:opacity-40"
          disabled={dropConfirm !== dropTarget}
          onClick={dropCollection}
        >
          Drop collection
        </button>
      </Modal>
    </div>
  );
}
