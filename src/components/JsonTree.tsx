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
import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy } from 'lucide-react';
import type { BsonDocument, BsonValue } from '../api/types';
import { toastSuccess } from './Toast';

// Recognizes Extended JSON wrappers so they render as typed badges.
function wrapperOf(v: BsonValue): { badge: string; text: string } | null {
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    const keys = Object.keys(v);
    if (keys.length === 1) {
      const o = v as Record<string, BsonValue>;
      if (keys[0] === '$oid') return { badge: 'ObjectId', text: String(o.$oid) };
      if (keys[0] === '$date') {
        const d = o.$date;
        const text =
          typeof d === 'string' ? d : String((d as { $numberLong: string }).$numberLong) + ' ms';
        return { badge: 'Date', text };
      }
      if (keys[0] === '$numberDecimal') return { badge: 'Decimal128', text: String(o.$numberDecimal) };
      if (keys[0] === '$numberLong') return { badge: 'Long', text: String(o.$numberLong) };
      if (keys[0] === '$numberDouble') return { badge: 'Double', text: String(o.$numberDouble) };
    }
  }
  return null;
}

function Leaf({ value }: { value: BsonValue }) {
  const wrapper = wrapperOf(value);
  if (wrapper) {
    return (
      <span>
        <span className="mr-1 rounded bg-zinc-800 px-1 py-0.5 text-[10px] uppercase text-zinc-400">
          {wrapper.badge}
        </span>
        <span className="text-zinc-400">{wrapper.text}</span>
      </span>
    );
  }
  if (value === null) return <span className="text-fuchsia-400">null</span>;
  switch (typeof value) {
    case 'string': return <span className="text-emerald-400">"{value}"</span>;
    case 'number': return <span className="text-amber-300">{String(value)}</span>;
    case 'boolean': return <span className="text-fuchsia-400">{String(value)}</span>;
    default: return null;
  }
}

function Node({ name, value, depth, forceOpen }: {
  name: string;
  value: BsonValue;
  depth: number;
  forceOpen: boolean | null;
}) {
  const [openState, setOpen] = useState(depth < 1);
  const open = forceOpen ?? openState;
  const isContainer =
    value !== null && typeof value === 'object' && wrapperOf(value) === null;

  return (
    <div style={{ paddingLeft: depth * 16 }} className="leading-6">
      {isContainer ? (
        <>
          <button className="inline-flex items-center gap-1" onClick={() => setOpen(!open)}>
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span className="text-cyan-400">{name}</span>
            <span className="text-zinc-500">
              {Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`}
            </span>
          </button>
          {open &&
            (Array.isArray(value)
              ? value.map((v, i) => (
                  <Node key={i} name={String(i)} value={v} depth={depth + 1} forceOpen={forceOpen} />
                ))
              : Object.entries(value).map(([k, v]) => (
                  <Node key={k} name={k} value={v} depth={depth + 1} forceOpen={forceOpen} />
                )))}
        </>
      ) : (
        <span>
          <span className="text-cyan-400">{name}</span>
          <span className="text-zinc-500">: </span>
          <Leaf value={value} />
        </span>
      )}
    </div>
  );
}

export function JsonTree({ doc, forceOpen = null }: { doc: BsonDocument; forceOpen?: boolean | null }) {
  return (
    <div className="font-mono text-xs">
      {Object.entries(doc).map(([k, v]) => (
        <Node key={k} name={k} value={v} depth={0} forceOpen={forceOpen} />
      ))}
    </div>
  );
}

export function CopyDocButton({ doc }: { doc: BsonDocument }) {
  return (
    <button
      title="Copy document"
      className="text-zinc-500 hover:text-zinc-200"
      onClick={() => {
        navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
        toastSuccess('copied to clipboard');
      }}
    >
      <Copy size={13} />
    </button>
  );
}
