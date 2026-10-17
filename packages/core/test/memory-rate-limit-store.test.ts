import { describe, expect, it } from 'vitest';

import {
  MemoryRateLimitStore,
  RateLimitCapacityError,
  RateLimitPolicyConflictError,
  type MemoryRateLimitStoreOptions,
  type RateLimitPolicy,
} from '../src/index.js';

const POLICY: RateLimitPolicy = { max: 2, windowMs: 100 };

describe('MemoryRateLimitStore', () => {
  it('creates and atomically updates an entry', () => {
    const store = new MemoryRateLimitStore();

    expect(store.consume('client', POLICY, 10)).toEqual({
      consumed: true,
      count: 1,
      resetAtMs: 110,
    });
    expect(store.consume('client', POLICY, 20)).toEqual({
      consumed: true,
      count: 2,
      resetAtMs: 110,
    });
  });

  it('saturates rejected counters without overflow', () => {
    const store = new MemoryRateLimitStore();
    store.consume('client', POLICY, 0);
    store.consume('client', POLICY, 1);

    expect(store.consume('client', POLICY, 2)).toEqual({
      consumed: false,
      count: 2,
      resetAtMs: 100,
    });
    expect(store.consume('client', POLICY, 3)).toEqual({
      consumed: false,
      count: 2,
      resetAtMs: 100,
    });
  });

  it('starts a new anchored window at the exact expiry boundary', () => {
    const store = new MemoryRateLimitStore();
    store.consume('client', POLICY, 10);

    expect(store.consume('client', POLICY, 109.999)).toMatchObject({
      count: 2,
    });
    expect(store.consume('client', POLICY, 110)).toEqual({
      consumed: true,
      count: 1,
      resetAtMs: 210,
    });
  });

  it('keeps identities independent', () => {
    const store = new MemoryRateLimitStore();

    expect(store.consume('a', POLICY, 0).count).toBe(1);
    expect(store.consume('b', POLICY, 0).count).toBe(1);
    expect(store.size).toBe(2);
  });

  it('removes expired entries during scheduled cleanup', () => {
    const store = new MemoryRateLimitStore({
      maxEntries: 2,
      cleanupEvery: 1,
    });
    store.consume('expired', POLICY, 0);

    store.consume('current', POLICY, 100);

    expect(store.size).toBe(1);
  });

  it('cleans expired entries before reporting capacity exhaustion', () => {
    const store = new MemoryRateLimitStore({
      maxEntries: 1,
      cleanupEvery: 1_000,
    });
    store.consume('expired', POLICY, 0);

    expect(store.consume('replacement', POLICY, 100).consumed).toBe(true);
    expect(store.size).toBe(1);
  });

  it('never evicts an active entry to admit a new identity', () => {
    const store = new MemoryRateLimitStore({ maxEntries: 1 });
    store.consume('active', POLICY, 0);

    expect(() => store.consume('attacker', POLICY, 1)).toThrow(
      RateLimitCapacityError,
    );
    expect(store.consume('active', POLICY, 2).count).toBe(2);
    expect(store.size).toBe(1);
  });

  it('remains bounded under identity flooding', () => {
    const store = new MemoryRateLimitStore({ maxEntries: 3 });

    for (let index = 0; index < 100; index += 1) {
      try {
        store.consume(`client-${index}`, POLICY, 0);
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(RateLimitCapacityError);
      }
    }

    expect(store.size).toBe(3);
  });

  it('clears state explicitly', () => {
    const store = new MemoryRateLimitStore();
    store.consume('client', POLICY, 0);

    store.clear();

    expect(store.size).toBe(0);
    expect(store.consume('client', POLICY, 1).count).toBe(1);
  });

  it('isolates independent store instances', () => {
    const first = new MemoryRateLimitStore();
    const second = new MemoryRateLimitStore();
    first.consume('client', POLICY, 0);
    first.consume('client', POLICY, 1);

    expect(second.consume('client', POLICY, 1).count).toBe(1);
  });

  it('rejects conflicting policies for an active key', () => {
    const store = new MemoryRateLimitStore();
    store.consume('client', POLICY, 0);

    expect(() => store.consume('client', { max: 3, windowMs: 100 }, 1)).toThrow(
      RateLimitPolicyConflictError,
    );
  });

  it('permits a different policy after the previous window expires', () => {
    const store = new MemoryRateLimitStore();
    store.consume('client', POLICY, 0);

    expect(
      store.consume('client', { max: 3, windowMs: 200 }, 100),
    ).toMatchObject({ consumed: true, count: 1, resetAtMs: 300 });
  });

  it('handles concurrent calls without exceeding the limit', async () => {
    const store = new MemoryRateLimitStore();

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        Promise.resolve().then(() =>
          store.consume('client', { max: 5, windowMs: 100 }, 0),
        ),
      ),
    );

    expect(results.filter((result) => result.consumed)).toHaveLength(5);
    expect(results.filter((result) => !result.consumed)).toHaveLength(15);
  });

  it.each([
    [null],
    [[]],
    [{ maxEntries: 0 }],
    [{ maxEntries: 1.5 }],
    [{ cleanupEvery: 0 }],
  ])('rejects invalid options %#', (args) => {
    expect(
      () =>
        new MemoryRateLimitStore(args as never as MemoryRateLimitStoreOptions),
    ).toThrow(TypeError);
  });

  it.each([
    ['', POLICY, 0],
    ['client', { max: 0, windowMs: 100 }, 0],
    ['client', { max: 1, windowMs: 0 }, 0],
    ['client', POLICY, Number.NaN],
    ['client', POLICY, Number.POSITIVE_INFINITY],
  ] as const)('rejects invalid consume input %#', (key, policy, nowMs) => {
    const store = new MemoryRateLimitStore();

    expect(() => store.consume(key, policy, nowMs)).toThrow(TypeError);
  });

  it('rejects reset boundaries that overflow', () => {
    const store = new MemoryRateLimitStore();

    expect(() =>
      store.consume(
        'client',
        { max: 1, windowMs: Number.MAX_VALUE },
        Number.MAX_VALUE,
      ),
    ).toThrow(RangeError);
  });
});
