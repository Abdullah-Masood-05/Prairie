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

// Per-collection query-bar state: switching collections preserves each
// collection's filter, page, and explain toggle.
export interface FilterState {
  filter: string;
  page: number;
  explainMode: boolean;
}

const DEFAULT: FilterState = { filter: '{}', page: 0, explainMode: false };

interface FiltersStore {
  byCollection: Record<string, FilterState>;
  get: (coll: string) => FilterState;
  setFilter: (coll: string, filter: string) => void;
  setPage: (coll: string, page: number) => void;
  setExplainMode: (coll: string, on: boolean) => void;
  reset: (coll: string) => void;
}

export const useFiltersStore = create<FiltersStore>((set, get) => ({
  byCollection: {},
  get: (coll) => get().byCollection[coll] ?? DEFAULT,
  setFilter: (coll, filter) =>
    set((s) => ({
      byCollection: {
        ...s.byCollection,
        // A new filter resets pagination.
        [coll]: { ...(s.byCollection[coll] ?? DEFAULT), filter, page: 0 },
      },
    })),
  setPage: (coll, page) =>
    set((s) => ({
      byCollection: { ...s.byCollection, [coll]: { ...(s.byCollection[coll] ?? DEFAULT), page } },
    })),
  setExplainMode: (coll, explainMode) =>
    set((s) => ({
      byCollection: {
        ...s.byCollection,
        [coll]: { ...(s.byCollection[coll] ?? DEFAULT), explainMode },
      },
    })),
  reset: (coll) =>
    set((s) => ({ byCollection: { ...s.byCollection, [coll]: { ...DEFAULT } } })),
}));
