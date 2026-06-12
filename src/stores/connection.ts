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
