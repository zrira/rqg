import { describe, expect, it, vi } from 'vitest';

import {
  createRateLimiter,
  MemoryRateLimitStore,
  RateLimitCapacityError,
  type CreateRateLimiterOptions,
  type MonotonicClock,
  type RateLimitStore,
  type RateLimitStoreResult,
} from '../src/index.js';

function sequenceClock(...readings: readonly number[]): MonotonicClock {
  let index = 0;
  return () => {
    const reading = readings[index];
    index += 1;
    if (reading === undefined) throw new Error('Clock sequence exhausted');
    return reading;
  };
}

describe('createRateLimiter', () => {
  it('allows operations through the configured limit', async () => {
    const limiter = createRateLimiter({
      max: 3,
      windowMs: 100,
      clock: () => 0,
    });

    await expect(limiter.consume('client')).resolves.toMatchObject({
      allowed: true,
      remaining: 2,
    });
    await expect(limiter.consume('client')).resolves.toMatchObject({
      allowed: true,
      remaining: 1,
    });
    await expect(limiter.consume('client')).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
  });

  it('rejects the first and subsequent attempts above the limit', async () => {
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 100,
      clock: () => 10,
    });
    await limiter.consume('client');

    const first = await limiter.consume('client');
    const subsequent = await limiter.consume('client');

    expect(first).toEqual({
      allowed: false,
      reason: 'limit-exceeded',
      limit: 1,
      remaining: 0,
      resetAfterMs: 100,
      retryAfterMs: 100,
    });
    expect(subsequent).toEqual(first);
  });

  it('reports deterministic reset and retry durations', async () => {
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 100,
      clock: sequenceClock(10, 40),
    });

    await expect(limiter.consume('client')).resolves.toMatchObject({
      resetAfterMs: 100,
      retryAfterMs: null,
    });
    await expect(limiter.consume('client')).resolves.toMatchObject({
      resetAfterMs: 70,
      retryAfterMs: 70,
    });
  });

  it('resets at the exact anchored window boundary', async () => {
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 100,
      clock: sequenceClock(10, 109.999, 110),
    });

    expect((await limiter.consume('client')).allowed).toBe(true);
    expect((await limiter.consume('client')).allowed).toBe(false);
    await expect(limiter.consume('client')).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
      resetAfterMs: 100,
    });
  });

  it('keeps identities independent', async () => {
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 100,
      clock: () => 0,
    });

    expect((await limiter.consume('a')).allowed).toBe(true);
    expect((await limiter.consume('a')).allowed).toBe(false);
    expect((await limiter.consume('b')).allowed).toBe(true);
  });

  it('does not move effective time backward', async () => {
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 100,
      clock: sequenceClock(50, 40),
    });

    await limiter.consume('client');
    await expect(limiter.consume('client')).resolves.toMatchObject({
      resetAfterMs: 100,
    });
  });

  it('supports the largest safe integer limit without overflow', async () => {
    const limiter = createRateLimiter({
      max: Number.MAX_SAFE_INTEGER,
      windowMs: 1,
      clock: () => 0,
    });

    await expect(limiter.consume('client')).resolves.toMatchObject({
      remaining: Number.MAX_SAFE_INTEGER - 1,
    });
  });

  it('handles concurrent consumption atomically for one identity', async () => {
    const limiter = createRateLimiter({
      max: 10,
      windowMs: 100,
      clock: () => 0,
    });

    const decisions = await Promise.all(
      Array.from({ length: 100 }, () => limiter.consume('client')),
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(10);
    expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(90);
  });

  it('handles concurrent consumption independently across identities', async () => {
    const limiter = createRateLimiter({
      max: 2,
      windowMs: 100,
      clock: () => 0,
    });

    const decisions = await Promise.all(
      ['a', 'a', 'a', 'b', 'b', 'b'].map((identity) =>
        limiter.consume(identity),
      ),
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(4);
  });

  it('injects a custom atomic store', async () => {
    const consume = vi.fn<RateLimitStore['consume']>(() => ({
      consumed: true,
      count: 1,
      resetAtMs: 100,
    }));
    const store: RateLimitStore = { consume };
    const limiter = createRateLimiter({
      max: 2,
      windowMs: 100,
      store,
      clock: () => 0,
    });

    await limiter.consume('client');

    expect(consume).toHaveBeenCalledWith(
      'client',
      { max: 2, windowMs: 100 },
      0,
    );
  });

  it('rejects missing identities by default without touching storage', async () => {
    const consume = vi.fn<RateLimitStore['consume']>();
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 100,
      store: { consume },
    });

    await expect(limiter.consume(undefined)).resolves.toEqual({
      allowed: false,
      reason: 'missing-identity',
      limit: 1,
      remaining: null,
      resetAfterMs: null,
      retryAfterMs: null,
    });
    expect(consume).not.toHaveBeenCalled();
  });

  it.each([null, ''])('treats %j as a missing identity', async (identity) => {
    const limiter = createRateLimiter({ max: 1, windowMs: 100 });

    await expect(limiter.consume(identity)).resolves.toMatchObject({
      allowed: false,
      reason: 'missing-identity',
    });
  });

  it('uses one explicit shared identity for missing values', async () => {
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 100,
      clock: () => 0,
      missingIdentity: { behavior: 'use-shared', identity: 'anonymous' },
    });

    expect((await limiter.consume(undefined)).allowed).toBe(true);
    await expect(limiter.consume(null)).resolves.toMatchObject({
      allowed: false,
      reason: 'limit-exceeded',
    });
  });

  it('accepts an identity at the maximum length boundary', async () => {
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 100,
      clock: () => 0,
    });

    await expect(limiter.consume('a'.repeat(256))).resolves.toMatchObject({
      allowed: true,
      reason: 'within-limit',
    });
  });

  it.each([
    42,
    {},
    [],
    ' client',
    'client ',
    'client\nforged',
    'a'.repeat(257),
  ])('rejects malformed identity %# without coercion', async (identity) => {
    const limiter = createRateLimiter({ max: 1, windowMs: 100 });

    await expect(limiter.consume(identity)).resolves.toMatchObject({
      allowed: false,
      reason: 'invalid-identity',
    });
  });

  it('does not inspect hostile identity objects', async () => {
    const identity = new Proxy(
      {},
      {
        get() {
          throw new Error('must not inspect');
        },
      },
    );
    const limiter = createRateLimiter({ max: 1, windowMs: 100 });

    await expect(limiter.consume(identity)).resolves.toMatchObject({
      reason: 'invalid-identity',
    });
  });

  it('fails closed when the store throws synchronously', async () => {
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 100,
      clock: () => 0,
      store: {
        consume() {
          throw new Error('database unavailable');
        },
      },
    });

    await expect(limiter.consume('client')).resolves.toMatchObject({
      allowed: false,
      reason: 'store-failure',
      remaining: null,
    });
  });

  it('fails closed when the store rejects asynchronously', async () => {
    const store: RateLimitStore = {
      consume: () => Promise.reject(new Error('database unavailable')),
    };
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 100,
      clock: () => 0,
      store,
    });

    await expect(limiter.consume('client')).resolves.toMatchObject({
      allowed: false,
      reason: 'store-failure',
    });
  });

  it('supports an explicit fail-open policy', async () => {
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 100,
      clock: () => 0,
      failureMode: 'open',
      store: {
        consume() {
          throw new Error('database unavailable');
        },
      },
    });

    await expect(limiter.consume('client')).resolves.toEqual({
      allowed: true,
      reason: 'store-failure',
      limit: 1,
      remaining: null,
      resetAfterMs: null,
      retryAfterMs: null,
    });
  });

  it('reports bounded store exhaustion without exposing identities', async () => {
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 100,
      clock: () => 0,
      store: new MemoryRateLimitStore({ maxEntries: 1 }),
    });
    await limiter.consume('first-client');

    await expect(limiter.consume('secret-client')).resolves.toEqual({
      allowed: false,
      reason: 'capacity-exceeded',
      limit: 1,
      remaining: null,
      resetAfterMs: null,
      retryAfterMs: null,
    });
  });

  it('recognizes typed capacity errors from custom stores', async () => {
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 100,
      clock: () => 0,
      store: {
        consume() {
          throw new RateLimitCapacityError();
        },
      },
    });

    await expect(limiter.consume('client')).resolves.toMatchObject({
      reason: 'capacity-exceeded',
    });
  });

  it.each([
    null,
    {},
    { consumed: true, count: 0, resetAtMs: 100 },
    { consumed: true, count: 2, resetAtMs: 100 },
    { consumed: false, count: 0, resetAtMs: 100 },
    { consumed: true, count: 1, resetAtMs: 0 },
    { consumed: true, count: 1, resetAtMs: 101 },
    { consumed: true, count: 1, resetAtMs: Number.NaN },
  ])('handles invalid store result %# as a failure', async (result) => {
    const store: RateLimitStore = {
      consume: () => result as RateLimitStoreResult,
    };
    const limiter = createRateLimiter({
      max: 1,
      windowMs: 100,
      clock: () => 0,
      store,
    });

    await expect(limiter.consume('client')).resolves.toMatchObject({
      allowed: false,
      reason: 'store-failure',
    });
  });

  it.each([
    null,
    {},
    { max: 0, windowMs: 100 },
    { max: 1.5, windowMs: 100 },
    { max: Number.MAX_SAFE_INTEGER + 1, windowMs: 100 },
    { max: 1, windowMs: 0 },
    { max: 1, windowMs: Number.NaN },
    { max: 1, windowMs: Number.POSITIVE_INFINITY },
    { max: 1, windowMs: 100, store: {} },
    { max: 1, windowMs: 100, clock: 1 },
    { max: 1, windowMs: 100, failureMode: 'maybe' },
    { max: 1, windowMs: 100, missingIdentity: {} },
    {
      max: 1,
      windowMs: 100,
      missingIdentity: { behavior: 'use-shared', identity: '' },
    },
  ])('rejects invalid configuration %#', (options) => {
    expect(() =>
      createRateLimiter(options as never as CreateRateLimiterOptions),
    ).toThrow(TypeError);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 'now'])(
    'rejects invalid runtime clock reading %s',
    async (reading) => {
      const limiter = createRateLimiter({
        max: 1,
        windowMs: 100,
        clock: (() => reading) as never,
      });

      await expect(limiter.consume('client')).rejects.toThrow(TypeError);
    },
  );
});
