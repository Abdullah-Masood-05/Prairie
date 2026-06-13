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
import { X } from 'lucide-react';

export interface Toast {
  id: number;
  kind: 'success' | 'error';
  message: string;
  code?: string; // server error code badge
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
      t.kind === 'error' ? 8000 : 4000,
    );
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export function toastSuccess(message: string) {
  useToastStore.getState().push({ kind: 'success', message });
}

// Server errors arrive as "E[Code] message" strings from the Rust layer.
export function toastError(raw: unknown) {
  const text = raw instanceof Error ? raw.message : String(raw);
  const match = /^E\[(\w+)\]\s*(.*)$/s.exec(text);
  useToastStore.getState().push({
    kind: 'error',
    code: match?.[1],
    message: match?.[2] ?? text,
  });
}

export function ToastHost() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-96 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-2 rounded-lg border p-3 text-sm shadow-lg ${
            t.kind === 'error'
              ? 'border-red-800 bg-red-950 text-red-200'
              : 'border-emerald-800 bg-emerald-950 text-emerald-200'
          }`}
        >
          {t.code && (
            <span className="rounded bg-red-800 px-1.5 py-0.5 text-xs font-semibold">
              {t.code}
            </span>
          )}
          <span className="flex-1 break-words">{t.message}</span>
          <button onClick={() => dismiss(t.id)} aria-label="dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
