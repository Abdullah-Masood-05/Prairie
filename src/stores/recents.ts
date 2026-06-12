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
