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
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { fade, pop } from '../lib/motion';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group?: string;
  icon?: ReactNode;
  run: () => void;
}

// Subsequence match ("dc" matches "documents collection"). Empty query matches.
export function fuzzyMatch(query: string, text: string): boolean {
  if (query.length === 0) return true;
  let i = 0;
  for (const ch of text) {
    if (ch === query[i]) i += 1;
    if (i === query.length) return true;
  }
  return false;
}

export function filterCommands(commands: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  return commands.filter(
    (c) =>
      fuzzyMatch(q, c.label.toLowerCase()) ||
      (c.hint ? fuzzyMatch(q, c.hint.toLowerCase()) : false),
  );
}

// ⌘/Ctrl-K palette for jumping to collections and running actions.
export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      // focus after the enter animation begins
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[selected];
      if (cmd) {
        onClose();
        cmd.run();
      }
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-[2px]"
          variants={fade}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
        >
          <motion.div
            className="w-[34rem] max-w-[90vw] overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900 shadow-[var(--shadow-pop)]"
            variants={pop}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search collections and actions…"
              className="w-full border-b border-zinc-800 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-zinc-600"
            />
            <div className="max-h-80 overflow-y-auto p-1.5">
              {filtered.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-zinc-500">No matches</div>
              )}
              {filtered.map((c, i) => (
                <button
                  key={c.id}
                  onMouseMove={() => setSelected(i)}
                  onClick={() => {
                    onClose();
                    c.run();
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm ${
                    i === selected ? 'bg-amber-600/15 text-amber-300' : 'text-zinc-200'
                  }`}
                >
                  {c.icon && <span className="shrink-0 text-zinc-500">{c.icon}</span>}
                  <span className="flex-1 truncate">{c.label}</span>
                  {c.group && <span className="text-xs text-zinc-600">{c.group}</span>}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
