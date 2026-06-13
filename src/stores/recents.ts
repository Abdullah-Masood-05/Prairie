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
// Recent-connections persistence in the tauri appData directory
// (recent-connections.json), via the load_recents/save_recents commands —
// survives webview storage clears, unlike localStorage.
import { invoke } from '@tauri-apps/api/core';
import type { RecentConnection } from '../api/types';

const MAX = 8;

export async function loadRecents(): Promise<RecentConnection[]> {
  try {
    const raw = await invoke<unknown>('load_recents');
    return Array.isArray(raw) ? (raw as RecentConnection[]) : [];
  } catch {
    return [];
  }
}

export async function saveRecent(entry: RecentConnection): Promise<void> {
  const all = await loadRecents();
  const rest = all.filter((r) => !(r.kind === entry.kind && r.label === entry.label));
  rest.unshift(entry);
  await invoke('save_recents', { recents: rest.slice(0, MAX) });
}
