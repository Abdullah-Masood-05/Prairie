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
import { create } from 'zustand';
import type { ConnectionInfo } from '../api/types';

interface ConnectionState {
  connection: ConnectionInfo | null;
  selectedCollection: string | null;
  setConnection: (c: ConnectionInfo | null) => void;
  selectCollection: (name: string | null) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connection: null,
  selectedCollection: null,
  setConnection: (connection) => set({ connection, selectedCollection: null }),
  selectCollection: (selectedCollection) => set({ selectedCollection }),
}));
