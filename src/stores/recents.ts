// Recent-connections persistence in localStorage. (The Tauri webview's
// localStorage lives in appData, which satisfies the persistence goal
// without pulling in the fs plugin.)
import type { RecentConnection } from '../api/types';

const KEY = 'prairie.recentConnections';
const MAX = 8;

export async function loadRecents(): Promise<RecentConnection[]> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RecentConnection[]) : [];
  } catch {
    return [];
  }
}

export async function saveRecent(entry: RecentConnection): Promise<void> {
  const all = await loadRecents();
  const rest = all.filter((r) => !(r.kind === entry.kind && r.label === entry.label));
  rest.unshift(entry);
  localStorage.setItem(KEY, JSON.stringify(rest.slice(0, MAX)));
}
