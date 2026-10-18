import express from 'express';
import { describe, expect, it, vi } from 'vitest';

import { MemoryRateLimitStore, type RateLimitStore } from '@rqg/core';

import { rateLimit } from '../src/index.js';
import { get, withServer } from './http-test-utils.js';

function createApp(
  options: Partial<Parameters<typeof rateLimit>[0]> = {},
  onHandled = vi.fn(),
) {
  const app = express();
  app.use(
    rateLimit({
      max: 2,
      windowMs: 10_000,
      clock: () => 0,
      identity: (request) => request.get('x-client-id'),
      ...options,
    }),
  );
  app.get('/', (_request, response) => {
    onHandled();
    response.send('ok');
  });
  return { app, onHandled };
}

describe('rateLimit', () => {
  it('allows requests through the limit and sets rate-limit headers', async () => {
    const { app } = createApp();

    await withServer(app, async (origin) => {
      const first = await get(origin, '/', { 'x-client-id': 'a' });
      const second = await get(origin, '/', { 'x-client-id': 'a' });

      expect(first.statusCode).toBe(200);
      expect(first.headers['ratelimit-limit']).toBe('2');
      expect(first.headers['ratelimit-remaining']).toBe('1');
      expect(first.headers['ratelimit-reset']).toBe('10');
      expect(second.headers['ratelimit-remaining']).toBe('0');
    });
  });

  it('returns 429 with ceiling-rounded Retry-After above the limit', async () => {
    const { app, onHandled } = createApp({
      max: 1,
      windowMs: 1_001,
    });

    await withServer(app, async (origin) => {
      await get(origin, '/', { 'x-client-id': 'a' });
      const rejected = await get(origin, '/', { 'x-client-id': 'a' });
      const later = await get(origin, '/', { 'x-client-id': 'a' });

      expect(rejected.statusCode).toBe(429);
      expect(rejected.headers['retry-after']).toBe('2');
      expect(rejected.headers['ratelimit-limit']).toBe('1');
      expect(rejected.headers['ratelimit-remaining']).toBe('0');
      expect(rejected.headers['ratelimit-reset']).toBe('2');
      expect(later.statusCode).toBe(429);
      expect(onHandled).toHaveBeenCalledOnce();
    });
  });

  it('resets the allowance at the deterministic window boundary', async () => {
    let nowMs = 0;
    const { app } = createApp({
      max: 1,
      windowMs: 100,
      clock: () => nowMs,
    });

    await withServer(app, async (origin) => {
      expect((await get(origin, '/', { 'x-client-id': 'a' })).statusCode).toBe(
        200,
      );
      expect((await get(origin, '/', { 'x-client-id': 'a' })).statusCode).toBe(
        429,
      );
      nowMs = 100;
      expect((await get(origin, '/', { 'x-client-id': 'a' })).statusCode).toBe(
        200,
      );
    });
  });

  it('limits independent identities separately', async () => {
    const { app } = createApp({ max: 1 });

    await withServer(app, async (origin) => {
      expect((await get(origin, '/', { 'x-client-id': 'a' })).statusCode).toBe(
        200,
      );
      expect((await get(origin, '/', { 'x-client-id': 'b' })).statusCode).toBe(
        200,
      );
    });
  });

  it.each([
    [undefined, 400],
    ['', 400],
    [' client ', 400],
    ['client\nforged', 400],
  ] as const)(
    'handles identity %j with status %i',
    async (identity, statusCode) => {
      const { app } = createApp({ identity: () => identity });

      await withServer(app, async (origin) => {
        const response = await get(origin);
        expect(response.statusCode).toBe(statusCode);
        expect(response.headers['ratelimit-limit']).toBeUndefined();
      });
    },
  );

  it('supports asynchronous identity resolution', async () => {
    const { app } = createApp({
      identity: async (request) => Promise.resolve(request.get('x-client-id')),
    });

    await withServer(app, async (origin) => {
      const response = await get(origin, '/', {
        'x-client-id': 'async-client',
      });
      expect(response.statusCode).toBe(200);
    });
  });

  it('fails closed with 503 when identity resolution fails', async () => {
    const onFailure = vi.fn();
    const { app, onHandled } = createApp({
      identity: async () => Promise.reject(new Error('secret')),
      onFailure,
    });

    await withServer(app, async (origin) => {
      const response = await get(origin);
      expect(response.statusCode).toBe(503);
      expect(response.body).not.toContain('secret');
      expect(onHandled).not.toHaveBeenCalled();
      expect(onFailure).toHaveBeenCalledWith({
        allowed: false,
        reason: 'identity-resolution-failure',
      });
    });
  });

  it('fails open without quota headers when identity resolution fails', async () => {
    const { app, onHandled } = createApp({
      failureMode: 'open',
      identity: () => {
        throw new Error('unavailable');
      },
    });

    await withServer(app, async (origin) => {
      const response = await get(origin);
      expect(response.statusCode).toBe(200);
      expect(response.headers['ratelimit-limit']).toBeUndefined();
      expect(onHandled).toHaveBeenCalledOnce();
    });
  });

  it.each([
    ['closed', 503, false],
    ['open', 200, true],
  ] as const)(
    'maps %s store failure to status %i',
    async (failureMode, statusCode, handled) => {
      const store: RateLimitStore = {
        consume: () => Promise.reject(new Error('secret store failure')),
      };
      const onFailure = vi.fn();
      const { app, onHandled } = createApp({ store, failureMode, onFailure });

      await withServer(app, async (origin) => {
        const response = await get(origin, '/', { 'x-client-id': 'a' });
        expect(response.statusCode).toBe(statusCode);
        expect(response.body).not.toContain('secret');
        expect(response.headers['ratelimit-limit']).toBeUndefined();
        expect(onHandled.mock.calls.length > 0).toBe(handled);
        expect(onFailure).toHaveBeenCalledWith({
          allowed: handled,
          reason: 'store-failure',
        });
      });
    },
  );

  it('returns 503 for bounded-store capacity exhaustion', async () => {
    const { app } = createApp({
      max: 1,
      store: new MemoryRateLimitStore({ maxEntries: 1 }),
    });

    await withServer(app, async (origin) => {
      await get(origin, '/', { 'x-client-id': 'first' });
      const response = await get(origin, '/', { 'x-client-id': 'second' });
      expect(response.statusCode).toBe(503);
      expect(response.headers['ratelimit-limit']).toBeUndefined();
    });
  });

  it('respects the configured limit under concurrent HTTP requests', async () => {
    const { app, onHandled } = createApp({ max: 5 });

    await withServer(app, async (origin) => {
      const responses = await Promise.all(
        Array.from({ length: 20 }, () =>
          get(origin, '/', { 'x-client-id': 'concurrent' }),
        ),
      );

      expect(
        responses.filter((response) => response.statusCode === 200),
      ).toHaveLength(5);
      expect(
        responses.filter((response) => response.statusCode === 429),
      ).toHaveLength(15);
      expect(onHandled).toHaveBeenCalledTimes(5);
    });
  });

  it.each([
    null,
    {},
    { max: 1, windowMs: 100 },
    { max: 1, windowMs: 100, identity: 1 },
  ])('rejects invalid configuration %#', (options) => {
    expect(() => rateLimit(options as never)).toThrow(TypeError);
  });
});
