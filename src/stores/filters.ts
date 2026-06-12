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
