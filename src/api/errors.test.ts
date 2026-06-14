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
import { describeError, errorCode } from './errors';

describe('errorCode', () => {
  it('extracts the server error code', () => {
    expect(errorCode('E[Forbidden] insufficient privileges')).toBe('Forbidden');
    expect(errorCode(new Error('E[TokenExpired] expired'))).toBe('TokenExpired');
    expect(errorCode('plain message')).toBeNull();
  });
});

describe('describeError', () => {
  it('maps known auth codes to actionable hints', () => {
    expect(describeError('E[Forbidden] x')).toMatch(/role/i);
    expect(describeError('E[AuthFailed] x')).toMatch(/username|password/i);
    expect(describeError('E[TokenExpired] x')).toMatch(/session|log in/i);
  });
  it('surfaces TLS errors with a TLS: prefix', () => {
    expect(describeError('TLS error: certificate verification failed')).toMatch(/^TLS:/);
  });
  it('strips the E[Code] prefix when there is no specific hint', () => {
    expect(describeError('E[Weird] something specific')).toBe('something specific');
  });
  it('passes through a plain message', () => {
    expect(describeError('just words')).toBe('just words');
  });
});
