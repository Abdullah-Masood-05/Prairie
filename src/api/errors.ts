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
// Maps server error strings ("E[Code] message") and TLS errors to clear,
// actionable messages for toasts and inline errors.

const HINTS: Record<string, string> = {
  AuthRequired: 'Authentication required — please log in.',
  AuthFailed: 'Authentication failed — check your username and password.',
  Forbidden: 'Your role does not permit this action.',
  TokenExpired: 'Your session expired — please log in again.',
  BadRequest: 'The server rejected the request.',
  DuplicateKey: 'A document with that _id already exists.',
};

export function rawErrorString(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Extracts the server error code from an "E[Code] message" string, if any. */
export function errorCode(e: unknown): string | null {
  const m = /^E\[([A-Za-z]+)\]/.exec(rawErrorString(e));
  return m ? m[1] : null;
}

/** A friendly, single-line description for display. */
export function describeError(e: unknown): string {
  const raw = rawErrorString(e);
  const code = errorCode(e);
  if (code && HINTS[code]) {
    return HINTS[code];
  }
  if (raw.includes('TLS error') || raw.includes('TLS handshake')) {
    return raw.replace(/^.*TLS (error|handshake[^:]*):?\s*/, 'TLS: ');
  }
  // Strip the "E[Code] " prefix for a cleaner message when no hint exists.
  return raw.replace(/^E\[[A-Za-z]+\]\s*/, '');
}
