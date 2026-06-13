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
import { useFiltersStore } from './filters';

describe('filters store', () => {
  beforeEach(() => {
    useFiltersStore.setState({ byCollection: {} });
  });

  it('returns the default state for unknown collections', () => {
    const s = useFiltersStore.getState().get('fresh');
    expect(s).toEqual({ filter: '{}', page: 0, explainMode: false });
  });

  it('keeps filter state per collection when switching', () => {
    const store = useFiltersStore.getState();
    store.setFilter('a', '{"x": 1}');
    store.setFilter('b', '{"y": 2}');
    expect(useFiltersStore.getState().get('a').filter).toBe('{"x": 1}');
    expect(useFiltersStore.getState().get('b').filter).toBe('{"y": 2}');
  });

  it('changing the filter resets pagination', () => {
    const store = useFiltersStore.getState();
    store.setPage('c', 4);
    expect(useFiltersStore.getState().get('c').page).toBe(4);
    store.setFilter('c', '{"v": 1}');
    expect(useFiltersStore.getState().get('c').page).toBe(0);
  });

  it('explain mode toggles independently of the filter', () => {
    const store = useFiltersStore.getState();
    store.setFilter('d', '{"v": 1}');
    store.setExplainMode('d', true);
    const s = useFiltersStore.getState().get('d');
    expect(s.explainMode).toBe(true);
    expect(s.filter).toBe('{"v": 1}');
  });

  it('reset restores the default state', () => {
    const store = useFiltersStore.getState();
    store.setFilter('e', '{"v": 1}');
    store.setExplainMode('e', true);
    store.reset('e');
    expect(useFiltersStore.getState().get('e')).toEqual({
      filter: '{}',
      page: 0,
      explainMode: false,
    });
  });
});
