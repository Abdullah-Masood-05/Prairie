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
import { beforeEach, describe, expect, it } from 'vitest';
import { canWrite, isAdmin, useConnectionStore } from './connection';
import type { ConnectionInfo } from '../api/types';

const conn = (roles: string[]): ConnectionInfo => ({
  conn_id: 1,
  label: 'localhost:27027',
  server_version: '1.2.0',
  local: false,
  protocol_version: 2,
  protocol_supported: true,
  auth_required: true,
  setup_mode: false,
  authenticated: false,
  username: null,
  roles,
  tls: 'verified',
});

describe('role helpers', () => {
  it('canWrite is true only for readWrite/admin', () => {
    expect(canWrite(['read'])).toBe(false);
    expect(canWrite(['readWrite'])).toBe(true);
    expect(canWrite(['admin'])).toBe(true);
    expect(canWrite([])).toBe(false);
  });
  it('isAdmin is true only for admin', () => {
    expect(isAdmin(['admin'])).toBe(true);
    expect(isAdmin(['readWrite'])).toBe(false);
  });
});

describe('connection store setAuth', () => {
  beforeEach(() => useConnectionStore.setState({ connection: null, selectedCollection: null }));

  it('marks authenticated and records user + roles', () => {
    useConnectionStore.getState().setConnection(conn([]));
    useConnectionStore.getState().setAuth({ username: 'admin', roles: ['admin'] });
    const c = useConnectionStore.getState().connection;
    expect(c?.authenticated).toBe(true);
    expect(c?.username).toBe('admin');
    expect(c?.roles).toEqual(['admin']);
  });

  it('is a no-op when there is no connection', () => {
    useConnectionStore.getState().setAuth({ username: 'x', roles: ['read'] });
    expect(useConnectionStore.getState().connection).toBeNull();
  });
});
