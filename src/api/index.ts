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
import { invoke } from '@tauri-apps/api/core';
import type {
  AuthInfo,
  BsonDocument,
  ConnectionInfo,
  DbStats,
  ExplainPlan,
  ExportFormat,
  FindResult,
  ImportSummary,
  TlsOptions,
  UserRow,
} from './types';

function requireNonEmpty(value: string, what: string): void {
  if (!value || value.trim().length === 0) {
    throw new Error(`${what} must not be empty`);
  }
}

function requireValidJson(text: string, what: string): void {
  try {
    JSON.parse(text);
  } catch (e) {
    throw new Error(`${what} is not valid JSON: ${(e as Error).message}`);
  }
}

export const api = {
  connectRemote: (host: string, port: number, tls?: TlsOptions): Promise<ConnectionInfo> => {
    requireNonEmpty(host, 'host');
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('port must be an integer in 1..65535');
    }
    if (tls?.enabled && tls.mode === 'pin' && !/^[0-9a-fA-F:]{64,}$/.test(tls.pin ?? '')) {
      throw new Error('pin must be a 64-character SHA-256 hex fingerprint');
    }
    return invoke('connect_remote', { host, port, tls: tls ?? null });
  },
  openLocal: (path: string, createIfMissing: boolean): Promise<ConnectionInfo> => {
    requireNonEmpty(path, 'path');
    return invoke('open_local', { path, createIfMissing });
  },
  disconnect: (connId: number): Promise<void> => invoke('disconnect', { connId }),

  // ── authentication & user management ──────────────────────────────────────
  authenticate: (connId: number, username: string, password: string): Promise<AuthInfo> => {
    requireNonEmpty(username, 'username');
    requireNonEmpty(password, 'password');
    return invoke('authenticate', { connId, username, password });
  },
  bootstrapAdmin: (
    connId: number,
    bootstrapToken: string,
    username: string,
    password: string,
  ): Promise<AuthInfo> => {
    requireNonEmpty(bootstrapToken, 'bootstrap token');
    requireNonEmpty(username, 'username');
    requireNonEmpty(password, 'password');
    return invoke('bootstrap_admin', { connId, bootstrapToken, username, password });
  },
  logout: (connId: number): Promise<void> => invoke('logout', { connId }),
  listUsers: (connId: number): Promise<UserRow[]> => invoke('list_users', { connId }),
  createUser: (
    connId: number,
    username: string,
    password: string,
    roles: string[],
  ): Promise<void> => {
    requireNonEmpty(username, 'username');
    requireNonEmpty(password, 'password');
    if (roles.length === 0) throw new Error('select at least one role');
    return invoke('create_user', { connId, username, password, roles });
  },
  dropUser: (connId: number, username: string): Promise<boolean> =>
    invoke('drop_user', { connId, username }),
  changePassword: (
    connId: number,
    newPassword: string,
    oldPassword?: string,
    username?: string,
  ): Promise<void> => {
    requireNonEmpty(newPassword, 'new password');
    return invoke('change_password', {
      connId,
      newPassword,
      oldPassword: oldPassword ?? null,
      username: username ?? null,
    });
  },

  listCollections: (connId: number): Promise<string[]> => invoke('list_collections', { connId }),
  dbStats: (connId: number): Promise<DbStats> => invoke('db_stats', { connId }),
  createCollection: (connId: number, name: string): Promise<boolean> => {
    requireNonEmpty(name, 'collection name');
    return invoke('create_collection', { connId, name });
  },
  dropCollection: (connId: number, name: string): Promise<boolean> =>
    invoke('drop_collection', { connId, name }),

  find: (
    connId: number,
    coll: string,
    filterJson: string,
    limit: number,
    skip: number,
  ): Promise<FindResult> => {
    requireValidJson(filterJson, 'filter');
    return invoke('find', { connId, coll, filterJson, limit, skip });
  },
  count: (connId: number, coll: string, filterJson: string): Promise<number> => {
    requireValidJson(filterJson, 'filter');
    return invoke('count', { connId, coll, filterJson });
  },
  insert: (connId: number, coll: string, docsJson: string): Promise<string[]> => {
    requireValidJson(docsJson, 'document');
    return invoke('insert', { connId, coll, docsJson });
  },
  updateOne: (
    connId: number,
    coll: string,
    filterJson: string,
    setJson: string,
  ): Promise<boolean> => {
    requireValidJson(filterJson, 'filter');
    requireValidJson(setJson, '$set document');
    return invoke('update_one', { connId, coll, filterJson, setJson });
  },
  deleteMany: (connId: number, coll: string, filterJson: string): Promise<number> => {
    requireValidJson(filterJson, 'filter');
    return invoke('delete_many', { connId, coll, filterJson });
  },
  deleteById: (connId: number, coll: string, oidHex: string): Promise<number> => {
    if (!/^[0-9a-fA-F]{24}$/.test(oidHex)) {
      throw new Error('oid must be 24 hex characters');
    }
    return invoke('delete_by_id', { connId, coll, oidHex });
  },

  createIndex: (connId: number, coll: string, field: string): Promise<number> => {
    requireNonEmpty(field, 'field');
    return invoke('create_index', { connId, coll, field });
  },
  dropIndex: (connId: number, coll: string, field: string): Promise<void> =>
    invoke('drop_index', { connId, coll, field }),
  listIndexes: (connId: number, coll: string): Promise<string[]> =>
    invoke('list_indexes', { connId, coll }),
  explain: (
    connId: number,
    coll: string,
    filterJson: string,
    limit: number,
  ): Promise<ExplainPlan> => {
    requireValidJson(filterJson, 'filter');
    return invoke('explain', { connId, coll, filterJson, limit });
  },
  compact: (connId: number, coll: string): Promise<void> => invoke('compact', { connId, coll }),

  importFile: (connId: number, coll: string, path: string): Promise<ImportSummary> =>
    invoke('import_file', { connId, coll, path }),
  exportFile: (
    connId: number,
    coll: string,
    filterJson: string,
    path: string,
    format: ExportFormat,
  ): Promise<number> => {
    requireValidJson(filterJson, 'filter');
    return invoke('export_file', { connId, coll, filterJson, path, format });
  },
};

// Edit-modal helper: computes the changed top-level fields between the
// original and edited documents. Removed keys are reported separately so the
// UI can refuse them (the wire protocol only supports $set).
export function computeSetDiff(
  original: BsonDocument,
  edited: BsonDocument,
): { set: BsonDocument; removedKeys: string[] } {
  const set: BsonDocument = {};
  const removedKeys: string[] = [];
  for (const key of Object.keys(edited)) {
    if (key === '_id') {
      continue;
    }
    if (JSON.stringify(original[key]) !== JSON.stringify(edited[key])) {
      set[key] = edited[key];
    }
  }
  for (const key of Object.keys(original)) {
    if (key !== '_id' && !(key in edited)) {
      removedKeys.push(key);
    }
  }
  return { set, removedKeys };
}
