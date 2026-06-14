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
import { useState } from 'react';
import { Lock, LogIn, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { api } from '../api';
import { describeError } from '../api/errors';
import type { TlsState } from '../api/types';
import { useConnectionStore } from '../stores/connection';
import { saveRecent } from '../stores/recents';

function TlsBadge({ tls }: { tls: TlsState }) {
  if (tls === 'verified') {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-400">
        <ShieldCheck size={13} /> encrypted &amp; verified
      </span>
    );
  }
  if (tls === 'unverified') {
    return (
      <span className="flex items-center gap-1 text-xs text-amber-400">
        <ShieldAlert size={13} /> encrypted, unverified
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-red-400">
      <ShieldX size={13} /> not encrypted
    </span>
  );
}

// Shown after connecting to a server that requires authentication.
export default function LoginScreen() {
  const { connection, setAuth, setConnection } = useConnectionStore();
  const [username, setUsername] = useState(connection?.username ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(Boolean(connection?.username));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!connection) return null;

  const login = async () => {
    setBusy(true);
    setError('');
    try {
      const auth = await api.authenticate(connection.conn_id, username, password);
      if (remember && connection.label) {
        // Remember the username only — never the password.
        const [host, port] = connection.label.split(':');
        await saveRecent({
          kind: 'remote',
          label: connection.label,
          host,
          port: Number(port) || undefined,
          username,
          lastUsed: Date.now(),
        });
      }
      setAuth(auth);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    try {
      await api.disconnect(connection.conn_id);
    } finally {
      setConnection(null);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <Lock className="text-amber-500" size={20} /> Sign in
      </div>
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="truncate font-mono text-sm text-zinc-300">{connection.label}</span>
          <TlsBadge tls={connection.tls} />
        </div>
        {connection.tls === 'unverified' && (
          <p className="mb-3 rounded border border-amber-700/50 bg-amber-950/40 p-2 text-xs text-amber-300">
            This connection is encrypted but the server certificate was NOT verified. You could be
            talking to an impostor. Only continue on a network you trust.
          </p>
        )}
        <label className="mb-1 block text-xs text-zinc-400">Username</label>
        <input
          autoFocus
          className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <label className="mb-1 block text-xs text-zinc-400">Password</label>
        <input
          type="password"
          className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && login()}
        />
        <label className="mb-3 flex items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember username
        </label>
        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
        <button
          className="flex w-full items-center justify-center gap-1.5 rounded bg-amber-600 py-1.5 text-sm font-medium hover:bg-amber-500 disabled:opacity-50"
          disabled={busy}
          onClick={login}
        >
          <LogIn size={15} /> Log in
        </button>
        <button className="mt-2 w-full text-xs text-zinc-500 hover:text-zinc-300" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
