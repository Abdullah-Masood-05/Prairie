import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Database, FolderOpen, Plug, Plus } from 'lucide-react';
import { api } from '../api';
import type { RecentConnection } from '../api/types';
import { useConnectionStore } from '../stores/connection';
import { loadRecents, saveRecent } from '../stores/recents';

export default function ConnectionScreen() {
  const setConnection = useConnectionStore((s) => s.setConnection);
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('27027');
  const [remoteError, setRemoteError] = useState('');
  const [localError, setLocalError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recents, setRecents] = useState<RecentConnection[]>([]);

  useEffect(() => {
    loadRecents().then(setRecents).catch(() => setRecents([]));
  }, []);

  const connectRemote = async (h: string, p: number) => {
    setBusy(true);
    setRemoteError('');
    try {
      const info = await api.connectRemote(h, p);
      await saveRecent({ kind: 'remote', label: `${h}:${p}`, host: h, port: p, lastUsed: Date.now() });
      setConnection(info);
    } catch (e) {
      setRemoteError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const openLocal = async (path: string, create: boolean) => {
    setBusy(true);
    setLocalError('');
    try {
      const info = await api.openLocal(path, create);
      await saveRecent({ kind: 'local', label: path, path, lastUsed: Date.now() });
      setConnection(info);
    } catch (e) {
      setLocalError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const pickFolder = async (create: boolean) => {
    const folder = await open({ directory: true, title: create ? 'Create database folder' : 'Open database folder' });
    if (typeof folder === 'string') {
      await openLocal(folder, create);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <div className="flex items-center gap-3 text-2xl font-semibold">
        <Database className="text-amber-500" /> BisonDB Prairie
      </div>
      <div className="grid w-full max-w-3xl grid-cols-2 gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-3 flex items-center gap-2 font-medium">
            <Plug size={16} /> Connect to server
          </h2>
          <label className="mb-1 block text-xs text-zinc-400">Host</label>
          <input
            className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
            value={host}
            onChange={(e) => setHost(e.target.value)}
          />
          <label className="mb-1 block text-xs text-zinc-400">Port</label>
          <input
            className="mb-3 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
            value={port}
            onChange={(e) => setPort(e.target.value)}
          />
          <button
            className="w-full rounded bg-amber-600 py-1.5 text-sm font-medium hover:bg-amber-500 disabled:opacity-50"
            disabled={busy}
            onClick={() => connectRemote(host, Number(port))}
          >
            Connect
          </button>
          {remoteError && <p className="mt-2 text-xs text-red-400">{remoteError}</p>}
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-3 flex items-center gap-2 font-medium">
            <FolderOpen size={16} /> Local database
          </h2>
          <p className="mb-3 text-xs text-zinc-400">
            Runs a bundled bisond on a private port for the chosen folder.
          </p>
          <button
            className="mb-2 w-full rounded border border-zinc-700 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50"
            disabled={busy}
            onClick={() => pickFolder(false)}
          >
            Open existing folder
          </button>
          <button
            className="flex w-full items-center justify-center gap-1 rounded border border-zinc-700 py-1.5 text-sm hover:bg-zinc-800 disabled:opacity-50"
            disabled={busy}
            onClick={() => pickFolder(true)}
          >
            <Plus size={14} /> Create new database
          </button>
          {localError && <p className="mt-2 text-xs text-red-400">{localError}</p>}
        </div>
      </div>
      {recents.length > 0 && (
        <div className="w-full max-w-3xl">
          <h3 className="mb-2 text-sm text-zinc-400">Recent connections</h3>
          <div className="flex flex-wrap gap-2">
            {recents.map((r) => (
              <button
                key={r.kind + r.label}
                className="rounded-full border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-800"
                disabled={busy}
                onClick={() =>
                  r.kind === 'remote'
                    ? connectRemote(r.host ?? '127.0.0.1', r.port ?? 27027)
                    : openLocal(r.path ?? '', false)
                }
              >
                {r.kind === 'remote' ? '🌐 ' : '📁 '}
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
