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
// Typed mirror of the Rust #[tauri::command] surface. No `any`.

export interface ConnectionInfo {
  conn_id: number;
  label: string;
  server_version: string;
  local: boolean;
  // Wire-protocol revision reported by serverStatus (0 = pre-1.0 server
  // that does not report one). Prairie blocks the workspace on mismatch.
  protocol_version: number;
  protocol_supported: boolean;
}

export type BsonScalar = string | number | boolean | null;

// Relaxed Extended JSON value as produced by the Rust side.
export type BsonValue =
  | BsonScalar
  | { $oid: string }
  | { $date: string | { $numberLong: string } }
  | { $numberLong: string }
  | { $numberDouble: string }
  | { $numberDecimal: string }
  | BsonValue[]
  | { [key: string]: BsonValue };

export type BsonDocument = { [key: string]: BsonValue };

export interface FindResult {
  docs: BsonDocument[];
  count: number;
  ms: number;
}

export interface CollectionStats {
  name: string;
  count: number;
  fileSizeBytes: number;
  indexes: string[];
}

export interface DbStats {
  collections: CollectionStats[];
}

export interface ExplainPlan {
  plan: 'index_range' | 'index_point' | 'scan';
  index?: string;
  docsExamined: number;
  docsReturned: number;
}

export interface ImportSummary {
  inserted: number;
  skipped: number;
  errors: string[];
}

// csv is export-only (top-level fields become columns).
export type ExportFormat = 'json' | 'jsonl' | 'bson' | 'csv';

export interface RecentConnection {
  kind: 'remote' | 'local';
  label: string;
  host?: string;
  port?: number;
  path?: string;
  lastUsed: number;
}
