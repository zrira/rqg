import { request as httpRequest } from 'node:http';

import express, { type Request, type Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { LogRecord, Logger, MonotonicClock } from '@rqg/core';

import { requestObservability } from '../src/index.js';
import { get, withServer } from './http-test-utils.js';

function collectingLogger() {
  const records: LogRecord[] = [];
  const logger: Logger = {
    log(record) {
      records.push(record);
    },
  };
  return { logger, records };
}

function sequenceClock(...readings: readonly number[]): MonotonicClock {
  let index = 0;
  return () => {
    const reading = readings[index];
    index += 1;
    if (reading === undefined) throw new Error('Clock sequence exhausted');
    return reading;
  };
}

async function waitForRecord(
  records: readonly LogRecord[],
): Promise<LogRecord> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const record = records[0];
    if (record !== undefined) return record;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('Timed out waiting for a log record');
}

describe('requestObservability', () => {
  it('logs a successful response with deterministic duration', async () => {
    const { logger, records } = collectingLogger();
    const app = express();
    app.use(requestObservability({ logger, clock: sequenceClock(100, 112.5) }));
    app.get('/users/:id', (_request, response) => response.sendStatus(204));

    await withServer(app, async (origin) => {
      await get(origin, '/users/secret?token=hidden');
      const record = await waitForRecord(records);

      expect(record).toMatchObject({
        level: 'info',
        context: {
          method: 'GET',
          path: '/users/:id',
          statusCode: 204,
          durationMs: 12.5,
          outcome: 'completed',
        },
      });
      expect(JSON.stringify(record)).not.toContain('secret');
      expect(JSON.stringify(record)).not.toContain('hidden');
    });
  });

  it('logs an unmatched 404 with a conservative path', async () => {
    const { logger, records } = collectingLogger();
    const app = express();
    app.use(requestObservability({ logger }));

    await withServer(app, async (origin) => {
      await get(origin, '/private-value?password=secret');
      const record = await waitForRecord(records);

      expect(record.context).toMatchObject({
        path: '<unmatched>',
        statusCode: 404,
        outcome: 'completed',
      });
    });
  });

  it.each([
    ['synchronous', false],
    ['asynchronous', true],
  ] as const)(
    'logs a completed 500 from a %s route error',
    async (_name, asyncError) => {
      const { logger, records } = collectingLogger();
      const app = express();
      app.use(requestObservability({ logger }));
      if (asyncError) {
        app.get('/failure', async () => Promise.reject(new Error('secret')));
      } else {
        app.get('/failure', () => {
          throw new Error('secret');
        });
      }
      app.use(
        (
          _error: unknown,
          _request: Request,
          response: Response,
          _next: express.NextFunction,
        ) => {
          void _next;
          response.status(500).send('failed');
        },
      );

      await withServer(app, async (origin) => {
        const response = await get(origin, '/failure');
        const record = await waitForRecord(records);

        expect(response.statusCode).toBe(500);
        expect(record.context).toMatchObject({
          path: '/failure',
          statusCode: 500,
          outcome: 'completed',
        });
        expect(JSON.stringify(record)).not.toContain('secret');
      });
    },
  );

  it('does not duplicate observers or completion records', async () => {
    const { logger, records } = collectingLogger();
    const app = express();
    app.use(requestObservability({ logger }));
    app.use(requestObservability({ logger }));
    app.get('/', (_request, response) => response.send('ok'));

    await withServer(app, async (origin) => {
      await get(origin);
      await waitForRecord(records);
      expect(records).toHaveLength(1);
    });
  });

  it.each(['throw', 'reject'] as const)(
    'contains logger %s failures and reports them',
    async (failure) => {
      const error = new Error('logger failed');
      const onError = vi.fn();
      const logger: Logger = {
        log() {
          if (failure === 'throw') throw error;
          return Promise.reject(error);
        },
      };
      const app = express();
      app.use(requestObservability({ logger, onError }));
      app.get('/', (_request, response) => response.send('ok'));

      await withServer(app, async (origin) => {
        const response = await get(origin);
        for (
          let attempt = 0;
          attempt < 20 && onError.mock.calls.length === 0;
          attempt += 1
        ) {
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
        expect(response.statusCode).toBe(200);
        expect(onError).toHaveBeenCalledWith(error);
      });
    },
  );

  it('removes lifecycle listeners after completion', async () => {
    const { logger } = collectingLogger();
    const app = express();
    let capturedRequest: Request | undefined;
    let capturedResponse: Response | undefined;
    let registeredCounts: readonly number[] = [];
    app.use(requestObservability({ logger }));
    app.use((request, response, next) => {
      capturedRequest = request;
      capturedResponse = response;
      registeredCounts = [
        response.listenerCount('finish'),
        response.listenerCount('close'),
        response.listenerCount('error'),
        request.listenerCount('aborted'),
        request.listenerCount('error'),
      ];
      next();
    });
    app.get('/', (_request, response) => response.send('ok'));

    await withServer(app, async (origin) => {
      await get(origin);
      expect(capturedResponse?.listenerCount('finish')).toBeLessThan(
        registeredCounts[0] ?? 0,
      );
      expect(capturedResponse?.listenerCount('close')).toBeLessThan(
        registeredCounts[1] ?? 0,
      );
      expect(capturedResponse?.listenerCount('error')).toBeLessThan(
        registeredCounts[2] ?? 0,
      );
      expect(capturedRequest?.listenerCount('aborted')).toBeLessThan(
        registeredCounts[3] ?? 0,
      );
      expect(capturedRequest?.listenerCount('error')).toBeLessThan(
        registeredCounts[4] ?? 0,
      );
    });
  });

  it('records a client-aborted request once', async () => {
    const { logger, records } = collectingLogger();
    const app = express();
    let markRouteStarted: (() => void) | undefined;
    const routeStarted = new Promise<void>((resolve) => {
      markRouteStarted = resolve;
    });
    app.use(requestObservability({ logger }));
    app.get('/slow', () => {
      markRouteStarted?.();
    });

    await withServer(app, async (origin) => {
      const requestClosed = new Promise<void>((resolve) => {
        const request = httpRequest(`${origin}/slow`);
        request.once('error', () => resolve());
        request.once('close', resolve);
        request.end();
        void routeStarted.then(() => request.destroy());
      });
      await requestClosed;

      const record = await waitForRecord(records);
      expect(record.context).toMatchObject({ outcome: 'aborted' });
      expect(records).toHaveLength(1);
    });
  });

  it('records a response stream error as failed without duplication', async () => {
    const { logger, records } = collectingLogger();
    const app = express();
    app.use(requestObservability({ logger }));
    app.get('/stream-error', (_request, response) => {
      response.emit('error', new Error('transport failed'));
      response.send('recovered');
    });

    await withServer(app, async (origin) => {
      const response = await get(origin, '/stream-error');
      const record = await waitForRecord(records);
      expect(response.statusCode).toBe(200);
      expect(record.context).toMatchObject({
        path: '/stream-error',
        statusCode: null,
        outcome: 'failed',
      });
      expect(records).toHaveLength(1);
    });
  });

  it('records premature response destruction as aborted', async () => {
    const { logger, records } = collectingLogger();
    const app = express();
    app.use(requestObservability({ logger }));
    app.get('/broken', (_request, response) => {
      response.write('partial');
      response.destroy();
    });

    await withServer(app, async (origin) => {
      await expect(get(origin, '/broken')).rejects.toThrow();
      const record = await waitForRecord(records);
      expect(record.context).toMatchObject({
        path: '/broken',
        outcome: 'aborted',
      });
      expect(records).toHaveLength(1);
    });
  });

  it.each([null, {}, { logger: {} }, { logger: { log() {} }, clock: 1 }])(
    'rejects invalid configuration %#',
    (options) => {
      expect(() => requestObservability(options as never)).toThrow(TypeError);
    },
  );
});
