import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JsonTree } from './JsonTree';
import type { BsonDocument } from '../api/types';

describe('JsonTree', () => {
  it('renders every extended BSON type with its badge', () => {
    const doc: BsonDocument = {
      _id: { $oid: '507f1f77bcf86cd799439011' },
      when: { $date: '2026-01-01T00:00:00Z' },
      whenMs: { $date: { $numberLong: '253402300800000' } },
      big: { $numberLong: '9000000000' },
      precise: { $numberDouble: '2.5' },
      money: { $numberDecimal: '19.99' },
    };
    render(<JsonTree doc={doc} />);
    expect(screen.getByText('ObjectId')).toBeTruthy();
    expect(screen.getByText('507f1f77bcf86cd799439011')).toBeTruthy();
    expect(screen.getAllByText('Date')).toHaveLength(2);
    expect(screen.getByText('2026-01-01T00:00:00Z')).toBeTruthy();
    expect(screen.getByText('253402300800000 ms')).toBeTruthy();
    expect(screen.getByText('Long')).toBeTruthy();
    expect(screen.getByText('Double')).toBeTruthy();
    expect(screen.getByText('Decimal128')).toBeTruthy();
    expect(screen.getByText('19.99')).toBeTruthy();
  });

  it('renders scalars: string, number, boolean, null', () => {
    render(<JsonTree doc={{ s: 'text', n: 42, b: true, z: null }} />);
    expect(screen.getByText('"text"')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('true')).toBeTruthy();
    expect(screen.getByText('null')).toBeTruthy();
  });

  it('renders containers with size hints and nested values at depth < 1 open', () => {
    render(<JsonTree doc={{ arr: [1, 2], sub: { inner: 'v' } }} />);
    expect(screen.getByText('[2]')).toBeTruthy();
    expect(screen.getByText('{1}')).toBeTruthy();
    // Depth-0 containers default open, so children are visible.
    expect(screen.getByText('"v"')).toBeTruthy();
  });

  it('a plain single-key object is NOT mistaken for a wrapper', () => {
    render(<JsonTree doc={{ thing: { custom: 1 } }} />);
    expect(screen.getByText('{1}')).toBeTruthy();
    expect(screen.queryByText('ObjectId')).toBeNull();
  });
});
