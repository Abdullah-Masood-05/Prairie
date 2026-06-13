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
import { AlertTriangle } from 'lucide-react';
import { api } from './api';
import { useConnectionStore } from './stores/connection';
import ConnectionScreen from './screens/Connection';
import Workspace from './screens/Workspace';
import { ToastHost } from './components/Toast';

// Blocking screen for servers speaking a different wire-protocol revision —
// every command after this point could misbehave, so nothing else renders.
function ProtocolMismatch() {
  const { connection, setConnection } = useConnectionStore();
  if (!connection) return null;
  const disconnect = async () => {
    try {
      await api.disconnect(connection.conn_id);
    } finally {
      setConnection(null);
    }
  };
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle size={40} className="text-amber-500" />
      <h1 className="text-xl font-semibold">Incompatible server protocol</h1>
      <p className="max-w-lg text-sm text-zinc-400">
        The server at <span className="font-mono">{connection.label}</span> (BisonDB{' '}
        {connection.server_version}) reports wire-protocol version{' '}
        <b>{connection.protocol_version === 0 ? 'none (pre-1.0)' : connection.protocol_version}</b>
        , but this build of Prairie requires version <b>1</b>. Continuing could fail
        unpredictably, so the workspace is disabled.
      </p>
      <p className="max-w-lg text-sm text-zinc-400">
        Upgrade the server to BisonDB 1.0.0 (or use a matching Prairie release), then reconnect.
      </p>
      <button
        className="rounded bg-amber-600 px-4 py-1.5 text-sm hover:bg-amber-500"
        onClick={disconnect}
      >
        Disconnect
      </button>
    </div>
  );
}

export default function App() {
  const connection = useConnectionStore((s) => s.connection);
  return (
    <div className="h-screen overflow-hidden">
      {connection ? (
        connection.protocol_supported ? (
          <Workspace />
        ) : (
          <ProtocolMismatch />
        )
      ) : (
        <ConnectionScreen />
      )}
      <ToastHost />
    </div>
  );
}
