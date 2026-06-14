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
import { describe, expect, it } from 'vitest';
import { type Command, filterCommands, fuzzyMatch } from './CommandPalette';

const cmd = (id: string, label: string, hint?: string): Command => ({
  id,
  label,
  hint,
  run: () => {},
});

describe('fuzzyMatch', () => {
  it('matches subsequences in order', () => {
    expect(fuzzyMatch('dc', 'documents collection')).toBe(true);
    expect(fuzzyMatch('user', 'manage users')).toBe(true);
    expect(fuzzyMatch('zzz', 'users')).toBe(false);
    expect(fuzzyMatch('cd', 'documents collection')).toBe(false); // wrong order
  });
  it('treats an empty query as a match', () => {
    expect(fuzzyMatch('', 'anything')).toBe(true);
  });
});

describe('filterCommands', () => {
  const cmds = [cmd('a', 'orders'), cmd('b', 'users'), cmd('c', 'New collection', 'create')];

  it('returns everything for an empty query', () => {
    expect(filterCommands(cmds, '')).toHaveLength(3);
    expect(filterCommands(cmds, '   ')).toHaveLength(3);
  });
  it('filters by label, case-insensitively', () => {
    expect(filterCommands(cmds, 'USERS').map((c) => c.id)).toEqual(['b']);
  });
  it('also matches the hint', () => {
    expect(filterCommands(cmds, 'create').map((c) => c.id)).toEqual(['c']);
  });
  it('returns nothing when no command matches', () => {
    expect(filterCommands(cmds, 'zzzzz')).toHaveLength(0);
  });
});
