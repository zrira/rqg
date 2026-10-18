import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { LogRecord, Logger } from '@rqg/core';

import { getRequestId, rqg } from '../src/index.js';
import { get, withServer } from './http-test-utils.js';

const REQUEST_ID = '018f1f70-7b8a-4f9f-8ad4-5a6f8872a621';

async function waitForRecords(
  records: readonly LogRecord[],
  count: number,
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (records.length >= count) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('Timed out waiting for log records');
}

describe('rqg', () => {
  it('shares one request ID and observes rate-limit rejections once', async () => {
    const records: LogRecord[] = [];
    const logger: Logger = { log: (record) => void records.push(record) };
    const app = express();
    app.use(
      rqg({
        requestId: { generator: () => REQUEST_ID },
        observability: { logger },
        rateLimit: {
          max: 1,
          windowMs: 1_000,
          clock: () => 0,
          identity: () => 'client',
        },
      }),
    );
    app.get('/', (_request, response) => {
      response.send(getRequestId(response));
    });

    await withServer(app, async (origin) => {
      const allowed = await get(origin);
      const rejected = await get(origin);
      await waitForRecords(records, 2);

      expect(allowed.body).toBe(REQUEST_ID);
      expect(allowed.headers['x-request-id']).toBe(REQUEST_ID);
      expect(rejected.statusCode).toBe(429);
      expect(rejected.headers['x-request-id']).toBe(REQUEST_ID);
      expect(records).toHaveLength(2);
      expect(records[0]?.context?.requestId).toBe(REQUEST_ID);
      expect(records[1]?.context).toMatchObject({
        requestId: REQUEST_ID,
        statusCode: 429,
        outcome: 'completed',
      });
    });
  });

  it('allows every feature to be disabled independently', async () => {
    const logger = { log: vi.fn() } satisfies Logger;
    const app = express();
    app.use(
      rqg({
        requestId: false,
        observability: false,
        rateLimit: false,
      }),
    );
    app.get('/', (_request, response) => response.send('ok'));

    await withServer(app, async (origin) => {
      const response = await get(origin);
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-request-id']).toBeUndefined();
      expect(logger.log).not.toHaveBeenCalled();
    });
  });

  it('supports observability without exposing an ID response header', async () => {
    const records: LogRecord[] = [];
    const app = express();
    app.use(
      rqg({
        observability: {
          logger: { log: (record) => void records.push(record) },
        },
      }),
    );
    app.get('/', (_request, response) => response.send('ok'));

    await withServer(app, async (origin) => {
      const response = await get(origin);
      await waitForRecords(records, 1);
      expect(response.headers['x-request-id']).toBeUndefined();
      expect(records[0]?.context?.requestId).toEqual(expect.any(String));
    });
  });

  it('propagates unexpected middleware errors to Express error handling', async () => {
    const app = express();
    app.use(
      rqg({
        requestId: {
          generator() {
            throw new Error('generation failed');
          },
        },
      }),
    );
    app.get('/', (_request, response) => response.send('unreachable'));
    app.use(
      (
        error: unknown,
        _request: Request,
        response: Response,
        next: NextFunction,
      ) => {
        void next;
        expect(error).toBeInstanceOf(Error);
        response.status(500).send('handled');
      },
    );

    await withServer(app, async (origin) => {
      const response = await get(origin);
      expect(response.statusCode).toBe(500);
      expect(response.body).toBe('handled');
    });
  });

  it.each([null, [], 'options'])(
    'rejects invalid composition options %#',
    (options) => {
      expect(() => rqg(options as never)).toThrow(TypeError);
    },
  );
});
