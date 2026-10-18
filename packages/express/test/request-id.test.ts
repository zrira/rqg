import express from 'express';
import { describe, expect, it } from 'vitest';

import { getRequestId, requestId } from '../src/index.js';
import { get, withServer } from './http-test-utils.js';

const INCOMING_ID = '018f1f70-7b8a-4f9f-8ad4-5a6f8872a621';
const GENERATED_ID = '9a7d7f16-1f5c-47c7-b299-61f48f7658aa';

function createApp(options: Parameters<typeof requestId>[0] = {}) {
  const app = express();
  app.use(requestId({ generator: () => GENERATED_ID, ...options }));
  app.get('/', (_request, response) => {
    response.send(getRequestId(response));
  });
  return app;
}

describe('requestId', () => {
  it('generates an ID and exposes it downstream', async () => {
    await withServer(createApp(), async (origin) => {
      const response = await get(origin);

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-request-id']).toBe(GENERATED_ID);
      expect(response.body).toBe(GENERATED_ID);
    });
  });

  it('rejects valid incoming IDs by default', async () => {
    await withServer(createApp(), async (origin) => {
      const response = await get(origin, '/', { 'x-request-id': INCOMING_ID });

      expect(response.headers['x-request-id']).toBe(GENERATED_ID);
    });
  });

  it('preserves explicitly trusted incoming IDs', async () => {
    await withServer(createApp({ acceptIncoming: true }), async (origin) => {
      const response = await get(origin, '/', { 'x-request-id': INCOMING_ID });

      expect(response.headers['x-request-id']).toBe(INCOMING_ID);
      expect(response.body).toBe(INCOMING_ID);
    });
  });

  it('replaces invalid and injection-shaped IDs', async () => {
    await withServer(createApp({ acceptIncoming: true }), async (origin) => {
      const response = await get(origin, '/', { 'x-request-id': 'not-a-uuid' });

      expect(response.headers['x-request-id']).toBe(GENERATED_ID);
    });
  });

  it('rejects comma-joined multi-value headers as ambiguous', async () => {
    await withServer(createApp({ acceptIncoming: true }), async (origin) => {
      const response = await get(origin, '/', {
        'x-request-id': `${INCOMING_ID}, ${INCOMING_ID}`,
      });

      expect(response.headers['x-request-id']).toBe(GENERATED_ID);
    });
  });

  it('rejects repeated header fields regardless of casing', async () => {
    await withServer(createApp({ acceptIncoming: true }), async (origin) => {
      const response = await get(origin, '/', [
        'Host',
        new URL(origin).host,
        'X-Request-Id',
        INCOMING_ID,
        'x-request-id',
        INCOMING_ID,
      ]);

      expect(response.headers['x-request-id']).toBe(GENERATED_ID);
    });
  });

  it.each(['x'.repeat(1_024), `018f1f70-7b8a-4f9f-8ad4-5a6f8872a62é`])(
    'replaces oversized or Unicode input',
    async (value) => {
      await withServer(createApp({ acceptIncoming: true }), async (origin) => {
        const response = await get(origin, '/', { 'x-request-id': value });

        expect(response.headers['x-request-id']).toBe(GENERATED_ID);
      });
    },
  );

  it('relies on Node to reject CRLF before middleware execution', async () => {
    await withServer(createApp({ acceptIncoming: true }), async (origin) => {
      await expect(
        get(origin, '/', { 'x-request-id': `${INCOMING_ID}\r\nforged: yes` }),
      ).rejects.toThrow();
    });
  });

  it('supports a custom validated header name', async () => {
    await withServer(
      createApp({ headerName: 'x-correlation-id' }),
      async (origin) => {
        const response = await get(origin);

        expect(response.headers['x-correlation-id']).toBe(GENERATED_ID);
        expect(response.headers['x-request-id']).toBeUndefined();
      },
    );
  });

  it('preserves one ID when middleware is installed twice', async () => {
    const app = express();
    app.use(requestId({ generator: () => GENERATED_ID }));
    app.use(
      requestId({
        generator: () => 'c908e7fb-98e8-42de-97d7-f9bd586b14d0',
      }),
    );
    app.get('/', (_request, response) => response.send(getRequestId(response)));

    await withServer(app, async (origin) => {
      const response = await get(origin);
      expect(response.body).toBe(GENERATED_ID);
      expect(response.headers['x-request-id']).toBe(GENERATED_ID);
    });
  });

  it('creates independent IDs for separate requests', async () => {
    let sequence = 0;
    const ids = [
      '018f1f70-7b8a-4f9f-8ad4-5a6f8872a621',
      'c908e7fb-98e8-42de-97d7-f9bd586b14d0',
    ];
    const app = express();
    app.use(requestId({ generator: () => ids[sequence++] ?? GENERATED_ID }));
    app.get('/', (_request, response) => response.sendStatus(204));

    await withServer(app, async (origin) => {
      const first = await get(origin);
      const second = await get(origin);
      expect(first.headers['x-request-id']).not.toBe(
        second.headers['x-request-id'],
      );
    });
  });

  it.each([null, [], { headerName: 'bad header' }, { acceptIncoming: 'yes' }])(
    'rejects invalid configuration %#',
    (options) => {
      expect(() => requestId(options as never)).toThrow();
    },
  );
});
