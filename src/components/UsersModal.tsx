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
import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Trash2, UserPlus } from 'lucide-react';
import { api } from '../api';
import { describeError } from '../api/errors';
import type { Role, UserRow } from '../api/types';
import { Modal } from './Modal';
import { toastError, toastSuccess } from './Toast';

const ROLES: Role[] = ['read', 'readWrite', 'admin'];

interface Props {
  connId: number;
  currentUser: string | null;
  open: boolean;
  onClose: () => void;
}

// Admin-only user management. Gated by the caller on the admin role.
export function UsersModal({ connId, currentUser, open, onClose }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newRole, setNewRole] = useState<Role>('read');
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dropConfirm, setDropConfirm] = useState('');
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPass, setResetPass] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await api.listUsers(connId));
    } catch (e) {
      toastError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, [connId]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const create = async () => {
    try {
      await api.createUser(connId, newName, newPass, [newRole]);
      toastSuccess(`created user "${newName}"`);
      setNewName('');
      setNewPass('');
      setNewRole('read');
      await refresh();
    } catch (e) {
      toastError(describeError(e));
    }
  };

  const drop = async () => {
    if (!dropTarget) return;
    try {
      await api.dropUser(connId, dropTarget);
      toastSuccess(`dropped user "${dropTarget}"`);
      setDropTarget(null);
      setDropConfirm('');
      await refresh();
    } catch (e) {
      toastError(describeError(e));
    }
  };

  const resetPassword = async () => {
    if (!resetFor) return;
    try {
      await api.changePassword(connId, resetPass, undefined, resetFor);
      toastSuccess(`reset password for "${resetFor}"`);
      setResetFor(null);
      setResetPass('');
    } catch (e) {
      toastError(describeError(e));
    }
  };

  return (
    <Modal open={open} title="Users" onClose={onClose}>
      <div className="w-[28rem] max-w-full">
        <div className="mb-3 max-h-56 overflow-y-auto rounded border border-zinc-800">
          {loading && <div className="p-3 text-xs text-zinc-500">loading…</div>}
          {!loading && users.length === 0 && (
            <div className="p-3 text-xs text-zinc-500">no users</div>
          )}
          {users.map((u) => (
            <div
              key={u.username}
              className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5 text-sm last:border-0"
            >
              <span className="flex items-center gap-2">
                <span className="font-medium">{u.username}</span>
                {u.username === currentUser && (
                  <span className="rounded bg-zinc-700 px-1 text-[10px] text-zinc-200">you</span>
                )}
                {u.disabled && <span className="text-[10px] text-red-400">disabled</span>}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">{u.roles.join(', ') || '—'}</span>
                <button
                  title="Reset password"
                  className="text-zinc-500 hover:text-amber-400"
                  onClick={() => {
                    setResetFor(u.username);
                    setResetPass('');
                  }}
                >
                  <KeyRound size={13} />
                </button>
                <button
                  title="Drop user"
                  className="text-zinc-500 hover:text-red-400 disabled:opacity-30"
                  disabled={u.username === currentUser}
                  onClick={() => {
                    setDropTarget(u.username);
                    setDropConfirm('');
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          ))}
        </div>

        {/* reset-password inline panel */}
        {resetFor && (
          <div className="mb-3 rounded border border-zinc-800 bg-zinc-950/60 p-2">
            <div className="mb-1 text-xs text-zinc-400">New password for {resetFor}</div>
            <div className="flex gap-2">
              <input
                type="password"
                autoFocus
                className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
                value={resetPass}
                onChange={(e) => setResetPass(e.target.value)}
              />
              <button
                className="rounded bg-amber-600 px-2 py-1 text-xs hover:bg-amber-500 disabled:opacity-40"
                disabled={!resetPass}
                onClick={resetPassword}
              >
                Reset
              </button>
              <button
                className="text-xs text-zinc-500 hover:text-zinc-300"
                onClick={() => setResetFor(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* create user */}
        <div className="rounded border border-zinc-800 p-2">
          <div className="mb-1 flex items-center gap-1 text-xs text-zinc-400">
            <UserPlus size={12} /> Create user
          </div>
          <div className="flex gap-2">
            <input
              className="w-28 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
              placeholder="username"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              type="password"
              className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
              placeholder="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
            />
            <select
              className="rounded border border-zinc-700 bg-zinc-950 px-1 py-1 text-xs"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              className="rounded bg-amber-600 px-2 py-1 text-xs hover:bg-amber-500 disabled:opacity-40"
              disabled={!newName || !newPass}
              onClick={create}
            >
              Add
            </button>
          </div>
        </div>

        {/* drop confirmation */}
        {dropTarget && (
          <div className="mt-3 rounded border border-red-900/60 bg-red-950/30 p-2">
            <div className="mb-1 text-xs text-red-300">
              Type <b>{dropTarget}</b> to drop this user.
            </div>
            <div className="flex gap-2">
              <input
                autoFocus
                className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
                value={dropConfirm}
                onChange={(e) => setDropConfirm(e.target.value)}
              />
              <button
                className="rounded bg-red-700 px-2 py-1 text-xs hover:bg-red-600 disabled:opacity-40"
                disabled={dropConfirm !== dropTarget}
                onClick={drop}
              >
                Drop
              </button>
              <button
                className="text-xs text-zinc-500 hover:text-zinc-300"
                onClick={() => setDropTarget(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
