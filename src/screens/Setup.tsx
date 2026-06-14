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
import { KeyRound, Wand2 } from 'lucide-react';
import { api } from '../api';
import { describeError } from '../api/errors';
import { useConnectionStore } from '../stores/connection';

// Shown when the server is in first-run setup mode (no users yet). The operator
// pastes the one-time bootstrap token bisond printed to its terminal and
// creates the first admin.
export default function SetupScreen() {
  const { connection, setAuth, setConnection } = useConnectionStore();
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!connection) return null;

  const create = async () => {
    if (password !== confirm) {
      setError('passwords do not match');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const auth = await api.bootstrapAdmin(connection.conn_id, token.trim(), username, password);
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
        <Wand2 className="text-amber-500" size={20} /> First-run setup
      </div>
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="mb-3 text-sm text-zinc-400">
          The server at <span className="font-mono text-zinc-300">{connection.label}</span> has no
          users yet. It printed a one-time <b>bootstrap token</b> to its terminal — paste it here to
          create the first administrator.
        </p>
        <label className="mb-1 flex items-center gap-1 text-xs text-zinc-400">
          <KeyRound size={12} /> Bootstrap token
        </label>
        <input
          autoFocus
          className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-xs"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <label className="mb-1 block text-xs text-zinc-400">Admin username</label>
        <input
          className="mb-2 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <div className="mb-2 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Password</label>
            <input
              type="password"
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Confirm</label>
            <input
              type="password"
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </div>
        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
        <button
          className="w-full rounded bg-amber-600 py-1.5 text-sm font-medium hover:bg-amber-500 disabled:opacity-50"
          disabled={busy}
          onClick={create}
        >
          Create admin &amp; continue
        </button>
        <button className="mt-2 w-full text-xs text-zinc-500 hover:text-zinc-300" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
