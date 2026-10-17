import { describe, expect, it, vi } from 'vitest';

import {
  createRequestObserver,
  resolveRequestId,
  type Logger,
  type MonotonicClock,
  type RequestCompletionInput,
  type RequestMetadata,
} from '../src/index.js';

const REQUEST_ID = resolveRequestId(undefined, {
  generator: () => '018f1f70-7b8a-4f9f-8ad4-5a6f8872a621',
});
const METADATA: RequestMetadata = {
  requestId: REQUEST_ID,
  method: 'GET',
  path: '/users/:id',
};

function sequenceClock(...readings: readonly number[]): MonotonicClock {
  let index = 0;
  return () => {
    const reading = readings[index];
    index += 1;
    if (reading === undefined) throw new Error('Clock sequence exhausted');
    return reading;
  };
}

function fakeLogger() {
  const log = vi.fn<Logger['log']>();
  return { logger: { log } satisfies Logger, log };
}

describe('createRequestObserver', () => {
  it('logs allowlisted request metadata and completion information', async () => {
    const { logger, log } = fakeLogger();
    const observer = createRequestObserver(METADATA, {
      logger,
      clock: sequenceClock(100, 112.5),
    });

    const result = await observer.complete({
      outcome: 'completed',
      statusCode: 204,
    });

    expect(result.completion).toEqual({
      outcome: 'completed',
      statusCode: 204,
      durationMs: 12.5,
    });
    expect(result.record).toEqual({
      level: 'info',
      message: 'request finished',
      context: {
        requestId: REQUEST_ID,
        method: 'GET',
        path: '/users/:id',
        statusCode: 204,
        durationMs: 12.5,
        outcome: 'completed',
      },
    });
    expect(log).toHaveBeenCalledOnce();
    expect(result.logResult).toEqual({ ok: true });
  });

  it.each([
    ['completed', 200, 'info'],
    ['failed', null, 'error'],
    ['aborted', null, 'warn'],
  ] as const)(
    'maps %s outcomes to %s records',
    async (outcome, statusCode, level) => {
      const { logger } = fakeLogger();
      const observer = createRequestObserver(METADATA, {
        logger,
        clock: sequenceClock(0, 1),
      });

      const result = await observer.complete({ outcome, statusCode });

      expect(result.record.level).toBe(level);
      expect(result.record.context?.outcome).toBe(outcome);
    },
  );

  it.each([100, 200, 399, 404, 500, 599])(
    'accepts HTTP status code %i without deriving the outcome',
    async (statusCode) => {
      const { logger } = fakeLogger();
      const observer = createRequestObserver(METADATA, {
        logger,
        clock: sequenceClock(0, 1),
      });

      const result = await observer.complete({
        outcome: 'completed',
        statusCode,
      });

      expect(result.completion.outcome).toBe('completed');
      expect(result.record.level).toBe('info');
    },
  );

  it.each([99, 600, 200.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid HTTP status code %s',
    (statusCode) => {
      const { logger, log } = fakeLogger();
      const observer = createRequestObserver(METADATA, {
        logger,
        clock: sequenceClock(0),
      });

      expect(() =>
        observer.complete({ outcome: 'completed', statusCode }),
      ).toThrow(TypeError);
      expect(log).not.toHaveBeenCalled();
    },
  );

  it('requires a status code for completed requests', () => {
    const { logger } = fakeLogger();
    const observer = createRequestObserver(METADATA, {
      logger,
      clock: sequenceClock(0),
    });

    expect(() =>
      observer.complete({ outcome: 'completed', statusCode: null }),
    ).toThrow(new TypeError('Completed requests must include a status code'));
  });

  it('allows a known status on failed or aborted requests', async () => {
    const { logger } = fakeLogger();
    const observer = createRequestObserver(METADATA, {
      logger,
      clock: sequenceClock(0, 1),
    });

    const result = await observer.complete({
      outcome: 'aborted',
      statusCode: 200,
    });

    expect(result.completion.statusCode).toBe(200);
  });

  it('never reports a negative duration', async () => {
    const { logger } = fakeLogger();
    const observer = createRequestObserver(METADATA, {
      logger,
      clock: sequenceClock(100, 90),
    });

    const result = await observer.complete({
      outcome: 'failed',
      statusCode: null,
    });

    expect(result.completion.durationMs).toBe(0);
  });

  it('exposes nonterminal elapsed reads', () => {
    const { logger } = fakeLogger();
    const observer = createRequestObserver(METADATA, {
      logger,
      clock: sequenceClock(10, 15),
    });

    expect(observer.elapsed()).toBe(5);
  });

  it('uses the first completion and log write for every repeated call', async () => {
    const { logger, log } = fakeLogger();
    const observer = createRequestObserver(METADATA, {
      logger,
      clock: sequenceClock(0, 5),
    });
    const first = observer.complete({ outcome: 'completed', statusCode: 200 });
    const duplicate = observer.complete({
      outcome: 'aborted',
      statusCode: null,
    });

    expect(duplicate).toBe(first);
    await expect(duplicate).resolves.toMatchObject({
      completion: { outcome: 'completed', statusCode: 200 },
    });
    expect(log).toHaveBeenCalledOnce();
  });

  it('reports logger failures without rejecting completion', async () => {
    const error = new Error('sink unavailable');
    const logger: Logger = { log: () => Promise.reject(error) };
    const observer = createRequestObserver(METADATA, {
      logger,
      clock: sequenceClock(0, 1),
    });

    await expect(
      observer.complete({ outcome: 'completed', statusCode: 200 }),
    ).resolves.toMatchObject({ logResult: { ok: false, error } });
  });

  it('does not copy sensitive or unknown properties into records', async () => {
    const { logger } = fakeLogger();
    const metadata = {
      ...METADATA,
      authorization: 'Bearer secret',
      cookie: 'session=secret',
      body: { password: 'secret' },
      query: { accessToken: 'secret' },
    };
    const observer = createRequestObserver(metadata, {
      logger,
      clock: sequenceClock(0, 1),
    });

    const { record } = await observer.complete({
      outcome: 'completed',
      statusCode: 200,
    });

    expect(record.context).toEqual({
      requestId: REQUEST_ID,
      method: 'GET',
      path: '/users/:id',
      statusCode: 200,
      durationMs: 1,
      outcome: 'completed',
    });
  });

  it.each([
    null,
    {},
    { ...METADATA, requestId: 'not-a-request-id' },
    { ...METADATA, method: '' },
    { ...METADATA, method: 'GET\r\nInjected' },
    { ...METADATA, path: '' },
    { ...METADATA, path: '/users?token=secret' },
    { ...METADATA, path: '/users#fragment' },
  ])('rejects invalid request metadata %#', (metadata) => {
    const { logger } = fakeLogger();

    expect(() =>
      createRequestObserver(metadata as never as RequestMetadata, { logger }),
    ).toThrow(TypeError);
  });

  it.each([
    null,
    [],
    { outcome: 'unknown', statusCode: 200 },
    { outcome: 'completed' },
  ])('rejects invalid completion input %#', (completion) => {
    const { logger } = fakeLogger();
    const observer = createRequestObserver(METADATA, {
      logger,
      clock: sequenceClock(0),
    });

    expect(() =>
      observer.complete(completion as never as RequestCompletionInput),
    ).toThrow(TypeError);
  });

  it.each([null, {}, { logger: {} }, { logger: { log: 'stdout' } }])(
    'rejects invalid observer configuration %#',
    (options) => {
      expect(() => createRequestObserver(METADATA, options as never)).toThrow(
        TypeError,
      );
    },
  );
});
