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
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, X } from 'lucide-react';
import { describeError, errorCode } from '../api/errors';
import { toastIn } from '../lib/motion';

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

// Server/TLS errors arrive as strings from the Rust layer; describeError turns
// the codes (AuthRequired/Forbidden/TokenExpired/TLS…) into actionable text.
export function toastError(raw: unknown) {
  useToastStore.getState().push({
    kind: 'error',
    code: errorCode(raw) ?? undefined,
    message: describeError(raw),
  });
}

export function ToastHost() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-96 flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            variants={toastIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`pointer-events-auto flex items-start gap-2 rounded-lg border p-3 text-sm shadow-[var(--shadow-pop)] ${
              t.kind === 'error'
                ? 'border-red-800/70 bg-red-950/90 text-red-100'
                : 'border-emerald-800/70 bg-emerald-950/90 text-emerald-100'
            }`}
          >
            {t.kind === 'success' ? (
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" />
            ) : t.code ? (
              <span className="mt-px shrink-0 rounded bg-red-800 px-1.5 py-0.5 text-xs font-semibold">
                {t.code}
              </span>
            ) : null}
            <span className="flex-1 break-words">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="dismiss"
              className="mt-0.5 opacity-60 transition-opacity hover:opacity-100"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
