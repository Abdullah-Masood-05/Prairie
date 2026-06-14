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
import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Database, FolderOpen, Lock, Plug, Plus } from 'lucide-react';
import { api } from '../api';
import { describeError } from '../api/errors';
import type { RecentConnection, TlsMode, TlsOptions, TlsPrefs } from '../api/types';
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

  // TLS form state.
  const [useTls, setUseTls] = useState(false);
  const [tlsMode, setTlsMode] = useState<TlsMode>('system');
  const [caFile, setCaFile] = useState('');
  const [pin, setPin] = useState('');
  const [tlsHostname, setTlsHostname] = useState('');

  useEffect(() => {
    loadRecents()
      .then(setRecents)
      .catch(() => setRecents([]));
  }, []);

  const buildTls = (): TlsOptions | undefined =>
    useTls
      ? {
          enabled: true,
          mode: tlsMode,
          ca_file: caFile || undefined,
          pin: pin || undefined,
          hostname: tlsHostname || undefined,
        }
      : undefined;

  const tlsPrefs = (): TlsPrefs | undefined =>
    useTls
      ? { enabled: true, mode: tlsMode, caFile: caFile || undefined, pin: pin || undefined, hostname: tlsHostname || undefined }
      : undefined;

  const connectRemote = async (h: string, p: number, tls?: TlsOptions, prefs?: TlsPrefs) => {
    setBusy(true);
    setRemoteError('');
    try {
      const info = await api.connectRemote(h, p, tls);
      await saveRecent({ kind: 'remote', label: `${h}:${p}`, host: h, port: p, tls: prefs, lastUsed: Date.now() });
      setConnection(info);
    } catch (e) {
      setRemoteError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const applyRecentAndConnect = (r: RecentConnection) => {
    if (r.kind === 'remote') {
      const t = r.tls;
      setHost(r.host ?? '127.0.0.1');
      setPort(String(r.port ?? 27027));
      setUseTls(Boolean(t?.enabled));
      setTlsMode(t?.mode ?? 'system');
      setCaFile(t?.caFile ?? '');
      setPin(t?.pin ?? '');
      setTlsHostname(t?.hostname ?? '');
      const tls: TlsOptions | undefined = t?.enabled
        ? { enabled: true, mode: t.mode, ca_file: t.caFile, pin: t.pin, hostname: t.hostname }
        : undefined;
      void connectRemote(r.host ?? '127.0.0.1', r.port ?? 27027, tls, t);
    } else {
      void openLocal(r.path ?? '', false);
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
      setLocalError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const pickFolder = async (create: boolean) => {
    try {
      const result = await open({
        directory: true,
        title: create ? 'Create database folder' : 'Open database folder',
      });
      const folder =
        typeof result === 'string'
          ? result
          : result !== null && typeof result === 'object' && 'path' in result
            ? String((result as { path: string }).path)
            : null;
      if (folder !== null) {
        await openLocal(folder, create);
      }
    } catch (e) {
      setLocalError(describeError(e));
    }
  };

  const pickCaFile = async () => {
    try {
      const result = await open({
        multiple: false,
        title: 'Select CA / certificate (PEM)',
        filters: [{ name: 'Certificate', extensions: ['pem', 'crt', 'cert', 'cer'] }],
      });
      const file =
        typeof result === 'string'
          ? result
          : result !== null && typeof result === 'object' && 'path' in result
            ? String((result as { path: string }).path)
            : null;
      if (file) setCaFile(file);
    } catch (e) {
      setRemoteError(describeError(e));
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

          {/* TLS section */}
          <label className="mb-2 flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={useTls} onChange={(e) => setUseTls(e.target.checked)} />
            <Lock size={12} /> Use TLS (encrypt the connection)
          </label>
          {useTls && (
            <div className="mb-3 space-y-2 rounded border border-zinc-800 bg-zinc-950/60 p-2">
              <select
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
                value={tlsMode}
                onChange={(e) => setTlsMode(e.target.value as TlsMode)}
              >
                <option value="system">Verify against system trust store</option>
                <option value="ca">Trust a CA / self-signed cert (file)</option>
                <option value="pin">Pin certificate fingerprint (SHA-256)</option>
                <option value="insecure">Skip verification (insecure)</option>
              </select>
              {tlsMode === 'ca' && (
                <div className="flex items-center gap-2">
                  <button
                    className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                    onClick={pickCaFile}
                  >
                    Choose PEM…
                  </button>
                  <span className="truncate text-xs text-zinc-500">{caFile || 'no file chosen'}</span>
                </div>
              )}
              {tlsMode === 'pin' && (
                <input
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-[11px]"
                  placeholder="64-char SHA-256 fingerprint"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
              )}
              {tlsMode === 'insecure' && (
                <p className="rounded border border-red-800/60 bg-red-950/40 p-2 text-[11px] text-red-300">
                  ⚠ Verification is OFF. The connection is encrypted but you cannot be sure who you
                  are talking to — a man-in-the-middle could impersonate the server. Use only for
                  local development on a trusted machine.
                </p>
              )}
              <input
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
                placeholder="hostname override (optional; defaults to host)"
                value={tlsHostname}
                onChange={(e) => setTlsHostname(e.target.value)}
              />
            </div>
          )}

          <button
            className="w-full rounded bg-amber-600 py-1.5 text-sm font-medium hover:bg-amber-500 disabled:opacity-50"
            disabled={busy}
            onClick={() => connectRemote(host, Number(port), buildTls(), tlsPrefs())}
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
            Runs a bundled bisond on a private port (encrypted with a pinned self-signed cert; no
            login needed).
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
                className="flex items-center gap-1 rounded-full border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-800"
                disabled={busy}
                onClick={() => applyRecentAndConnect(r)}
              >
                {r.kind === 'remote' ? '🌐 ' : '📁 '}
                {r.label}
                {r.tls?.enabled && <Lock size={10} className="text-emerald-400" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
