import { request as httpRequest, type OutgoingHttpHeaders } from 'node:http';

import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express';
import { describe, expect, it } from 'vitest';

import { rqg } from '../src/index.js';
import { withServer } from './http-test-utils.js';

function createLimitedApp() {
  const app = express();
  app.use(rqg({ requestId: false, observability: false, rateLimit: false }));
  app.use(express.json({ limit: '32b' }));
  app.post('/', ((_request, response) => {
    response.sendStatus(204);
  }) satisfies RequestHandler);
  app.use(((error: unknown, _request, response, next) => {
    void next;
    const status = readStatus(error);
    response.sendStatus(status);
  }) satisfies ErrorRequestHandler);
  return app;
}

function readStatus(error: unknown): number {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return 500;
  }
  return typeof error.status === 'number' ? error.status : 500;
}

function post(
  origin: string,
  chunks: readonly string[],
  headers: OutgoingHttpHeaders = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      origin,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
      },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode ?? 0));
      },
    );
    request.once('error', reject);
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

describe('framework-native request size limits', () => {
  it('rejects an oversized JSON body with Content-Length', async () => {
    const body = JSON.stringify({ value: 'x'.repeat(64) });

    await withServer(createLimitedApp(), async (origin) => {
      await expect(
        post(origin, [body], { 'content-length': Buffer.byteLength(body) }),
      ).resolves.toBe(413);
    });
  });

  it('rejects an oversized chunked JSON body without Content-Length', async () => {
    const body = JSON.stringify({ value: 'x'.repeat(64) });

    await withServer(createLimitedApp(), async (origin) => {
      await expect(
        post(origin, [body.slice(0, 16), body.slice(16)]),
      ).resolves.toBe(413);
    });
  });
});
