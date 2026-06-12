import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

import { api, computeSetDiff } from './index';

describe('computeSetDiff', () => {
  it('reports only changed top-level fields, never _id', () => {
    const original = { _id: { $oid: 'a'.repeat(24) }, name: 'ada', age: 36, tags: ['x'] };
    const edited = { _id: { $oid: 'a'.repeat(24) }, name: 'ada', age: 37, tags: ['x', 'y'] };
    const { set, removedKeys } = computeSetDiff(original, edited);
    expect(set).toEqual({ age: 37, tags: ['x', 'y'] });
    expect(removedKeys).toEqual([]);
  });

  it('flags removed top-level keys instead of including them', () => {
    const { set, removedKeys } = computeSetDiff(
      { _id: { $oid: 'a'.repeat(24) }, keep: 1, gone: 2 },
      { _id: { $oid: 'a'.repeat(24) }, keep: 1 },
    );
    expect(set).toEqual({});
    expect(removedKeys).toEqual(['gone']);
  });

  it('treats nested changes as a whole-field $set', () => {
    const { set } = computeSetDiff(
      { _id: { $oid: 'a'.repeat(24) }, loc: { x: 1, y: 2 } },
      { _id: { $oid: 'a'.repeat(24) }, loc: { x: 1, y: 3 } },
    );
    expect(set).toEqual({ loc: { x: 1, y: 3 } });
  });

  it('returns empty diff for identical documents', () => {
    const doc = { _id: { $oid: 'a'.repeat(24) }, v: 1 };
    const { set, removedKeys } = computeSetDiff(doc, { ...doc });
    expect(set).toEqual({});
    expect(removedKeys).toEqual([]);
  });
});

describe('api argument validation', () => {
  it('rejects invalid ports', () => {
    expect(() => api.connectRemote('localhost', 0)).toThrow(/port/);
    expect(() => api.connectRemote('localhost', 70000)).toThrow(/port/);
    expect(() => api.connectRemote('localhost', 1.5)).toThrow(/port/);
  });

  it('rejects empty host / collection / field names', () => {
    expect(() => api.connectRemote('', 27027)).toThrow(/host/);
    expect(() => api.createCollection(1, '  ')).toThrow(/collection name/);
    expect(() => api.createIndex(1, 'c', '')).toThrow(/field/);
  });

  it('rejects malformed JSON before invoking', () => {
    expect(() => api.find(1, 'c', '{nope', 0, 0)).toThrow(/filter is not valid JSON/);
    expect(() => api.insert(1, 'c', '{"a":')).toThrow(/document is not valid JSON/);
    expect(() => api.deleteMany(1, 'c', 'not json')).toThrow(/filter/);
  });

  it('rejects malformed ObjectIds for deleteById', () => {
    expect(() => api.deleteById(1, 'c', 'xyz')).toThrow(/24 hex/);
    expect(() => api.deleteById(1, 'c', 'a'.repeat(23))).toThrow(/24 hex/);
  });

  it('passes well-formed arguments through to invoke', async () => {
    await expect(api.find(1, 'c', '{}', 10, 0)).resolves.toBeUndefined();
  });
});
