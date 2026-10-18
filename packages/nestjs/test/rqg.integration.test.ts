import 'reflect-metadata';

import { request as httpRequest, type ServerResponse } from 'node:http';

import {
  MemoryRateLimitStore,
  type LogRecord,
  type Logger,
  type RateLimitStore,
} from '@rqg/core';
import {
  Controller,
  Get,
  Global,
  Module,
  Param,
  ParseIntPipe,
  Res,
  type INestApplication,
  type Type,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RateLimit,
  RequestId,
  RqgModule,
  SkipRateLimit,
  type NestHttpRequest,
  type RqgModuleOptions,
} from '../src/index.js';
import { get, listen } from './http-test-utils.js';

const GENERATED_ID = '018f1f70-7b8a-4f9f-8ad4-5a6f8872a621';
const INCOMING_ID = 'c908e7fb-98e8-42de-97d7-f9bd586b14d0';
const applications: INestApplication[] = [];
let notifySlowRoute = (): void => {};

@Controller()
class BasicController {
  @Get('id')
  id(@RequestId() requestId: string | undefined) {
    return { requestId };
  }

  @Get('items/:id')
  item(@Param('id') id: string) {
    return { id };
  }

  @Get('number/:id')
  number(@Param('id', ParseIntPipe) id: number) {
    return { id };
  }

  @Get('failure')
  failure(): Promise<never> {
    return Promise.reject(new Error('private failure'));
  }

  @Get('stream')
  stream(@Res() response: ServerResponse): void {
    response.write('streamed');
    response.end();
  }

  @Get('broken')
  broken(@Res() response: ServerResponse): void {
    response.write('partial');
    response.destroy();
  }

  @Get('slow')
  slow(): Promise<never> {
    notifySlowRoute();
    return new Promise<never>(() => undefined);
  }
}

@RateLimit({ max: 2, windowMs: 1_000 })
@Controller('policy')
class PolicyController {
  @Get('shared-a')
  sharedA() {
    return { ok: true };
  }

  @Get('shared-b')
  sharedB() {
    return { ok: true };
  }

  @RateLimit({ max: 1, windowMs: 1_000 })
  @Get('strict')
  strict() {
    return { ok: true };
  }

  @SkipRateLimit()
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}

@SkipRateLimit()
@Controller('skipped')
class SkippedController {
  @Get('open')
  open() {
    return { ok: true };
  }

  @RateLimit({ max: 1, windowMs: 1_000 })
  @Get('protected')
  protectedRoute() {
    return { ok: true };
  }
}

async function createApplication(
  options: RqgModuleOptions,
  controllers: readonly Type<unknown>[] = [BasicController],
): Promise<INestApplication> {
  const testingModule = await Test.createTestingModule({
    imports: [RqgModule.forRoot(options)],
    controllers: [...controllers],
  }).compile();
  const app = testingModule.createNestApplication();
  applications.push(app);
  return app;
}

function identity(request: NestHttpRequest): string | undefined {
  const value = request.headers['x-client-id'];
  return typeof value === 'string' ? value : undefined;
}

async function waitForRecords(
  records: readonly LogRecord[],
  count: number,
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (records.length >= count) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('Timed out waiting for records');
}

afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe('RqgModule integration', () => {
  it('generates a response ID and exposes it through the parameter decorator', async () => {
    const app = await createApplication({
      requestId: { generator: () => GENERATED_ID },
    });
    const origin = await listen(app);

    const response = await get(origin, '/id');

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe(GENERATED_ID);
    expect(JSON.parse(response.body)).toEqual({ requestId: GENERATED_ID });
  });

  it('preserves only explicitly trusted incoming IDs', async () => {
    const app = await createApplication({
      requestId: {
        acceptIncoming: true,
        generator: () => GENERATED_ID,
      },
    });
    const origin = await listen(app);

    const trusted = await get(origin, '/id', { 'x-request-id': INCOMING_ID });
    const invalid = await get(origin, '/id', { 'x-request-id': 'invalid' });

    expect(trusted.headers['x-request-id']).toBe(INCOMING_ID);
    expect(invalid.headers['x-request-id']).toBe(GENERATED_ID);
  });

  it('supports custom request ID headers and independent requests', async () => {
    let index = 0;
    const values = [GENERATED_ID, INCOMING_ID];
    const app = await createApplication({
      requestId: {
        headerName: 'x-correlation-id',
        generator: () => values[index++] ?? GENERATED_ID,
      },
    });
    const origin = await listen(app);

    const first = await get(origin, '/id');
    const second = await get(origin, '/id');

    expect(first.headers['x-correlation-id']).toBe(GENERATED_ID);
    expect(second.headers['x-correlation-id']).toBe(INCOMING_ID);
  });

  it('observes routes, 404s, pipe failures, exceptions, and streams', async () => {
    const records: LogRecord[] = [];
    const logger: Logger = { log: (record) => void records.push(record) };
    const app = await createApplication({
      requestId: { generator: () => GENERATED_ID },
      observability: { logger },
    });
    const origin = await listen(app);

    await get(origin, '/items/private?token=hidden');
    await get(origin, '/missing?password=hidden');
    await get(origin, '/number/not-a-number');
    await get(origin, '/failure');
    await get(origin, '/stream');
    await waitForRecords(records, 5);

    expect(records.map((record) => record.context?.statusCode)).toEqual([
      200, 404, 400, 500, 200,
    ]);
    expect(records[0]?.context?.path).toBe('/items/:id');
    expect(records[1]?.context?.path).toBe('<unmatched>');
    expect(
      records.every((record) => record.context?.outcome === 'completed'),
    ).toBe(true);
    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain('private');
    expect(serialized).not.toContain('hidden');
    expect(serialized).not.toContain('not-a-number');
  });

  it('contains synchronous and asynchronous logger failures', async () => {
    const errors: unknown[] = [];
    let writes = 0;
    const app = await createApplication({
      observability: {
        logger: {
          log() {
            writes += 1;
            if (writes === 1) throw new Error('sync');
            return Promise.reject(new Error('async'));
          },
        },
        onError: (error) => void errors.push(error),
      },
    });
    const origin = await listen(app);

    expect((await get(origin, '/id')).statusCode).toBe(200);
    expect((await get(origin, '/id')).statusCode).toBe(200);
    for (let attempt = 0; attempt < 20 && errors.length < 2; attempt += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    expect(errors).toHaveLength(2);
  });

  it('records client abortion and premature response termination once', async () => {
    const records: LogRecord[] = [];
    const app = await createApplication({
      observability: { logger: { log: (record) => void records.push(record) } },
    });
    const origin = await listen(app);

    await expect(get(origin, '/broken')).rejects.toThrow();
    let markStarted: (() => void) | undefined;
    const routeStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    notifySlowRoute = () => markStarted?.();
    const request = httpRequest(`${origin}/slow`);
    const closed = new Promise<void>((resolve) => {
      request.once('error', resolve);
      request.once('close', resolve);
    });
    request.end();
    await routeStarted;
    request.destroy();
    await closed;
    notifySlowRoute = (): void => {};
    await waitForRecords(records, 2);

    expect(records.map((record) => record.context?.outcome)).toEqual([
      'aborted',
      'aborted',
    ]);
  });

  it('applies global limits and observes guard rejection', async () => {
    const records: LogRecord[] = [];
    const app = await createApplication({
      observability: { logger: { log: (record) => void records.push(record) } },
      rateLimit: {
        max: 1,
        windowMs: 1_001,
        clock: () => 0,
        identity,
      },
    });
    const origin = await listen(app);

    const allowed = await get(origin, '/id', { 'x-client-id': 'a' });
    const rejected = await get(origin, '/id', { 'x-client-id': 'a' });
    await waitForRecords(records, 2);

    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers['ratelimit-remaining']).toBe('0');
    expect(rejected.statusCode).toBe(429);
    expect(rejected.headers['retry-after']).toBe('2');
    expect(records[1]?.context?.statusCode).toBe(429);
  });

  it('supports controller policies, method overrides, skips, and isolation', async () => {
    const app = await createApplication(
      {
        rateLimit: {
          max: 10,
          windowMs: 1_000,
          clock: () => 0,
          identity,
        },
      },
      [PolicyController, SkippedController],
    );
    const origin = await listen(app);
    const headers = { 'x-client-id': 'same-client' };

    expect((await get(origin, '/policy/shared-a', headers)).statusCode).toBe(
      200,
    );
    expect((await get(origin, '/policy/shared-b', headers)).statusCode).toBe(
      200,
    );
    expect((await get(origin, '/policy/shared-a', headers)).statusCode).toBe(
      429,
    );
    expect((await get(origin, '/policy/strict', headers)).statusCode).toBe(200);
    expect((await get(origin, '/policy/strict', headers)).statusCode).toBe(429);
    expect((await get(origin, '/policy/health', headers)).statusCode).toBe(200);
    expect((await get(origin, '/policy/health', headers)).statusCode).toBe(200);
    expect((await get(origin, '/skipped/open', headers)).statusCode).toBe(200);
    expect((await get(origin, '/skipped/protected', headers)).statusCode).toBe(
      200,
    );
    expect((await get(origin, '/skipped/protected', headers)).statusCode).toBe(
      429,
    );
  });

  it('maps missing identity and operational failures without leaking errors', async () => {
    const failingStore: RateLimitStore = {
      consume: () => Promise.reject(new Error('private storage detail')),
    };
    const missingApp = await createApplication({
      rateLimit: { max: 1, windowMs: 100, identity },
    });
    const failingApp = await createApplication({
      rateLimit: {
        max: 1,
        windowMs: 100,
        identity: () => 'client',
        store: failingStore,
      },
    });
    const missingOrigin = await listen(missingApp);
    const failingOrigin = await listen(failingApp);

    expect((await get(missingOrigin, '/id')).statusCode).toBe(400);
    const failed = await get(failingOrigin, '/id');
    expect(failed.statusCode).toBe(503);
    expect(failed.body).not.toContain('private');
    expect(failed.headers['ratelimit-limit']).toBeUndefined();
  });

  it('maps bounded store capacity exhaustion to 503', async () => {
    const app = await createApplication({
      rateLimit: {
        max: 1,
        windowMs: 100,
        clock: () => 0,
        identity,
        store: new MemoryRateLimitStore({ maxEntries: 1 }),
      },
    });
    const origin = await listen(app);

    expect(
      (await get(origin, '/id', { 'x-client-id': 'first' })).statusCode,
    ).toBe(200);
    expect(
      (await get(origin, '/id', { 'x-client-id': 'second' })).statusCode,
    ).toBe(503);
  });

  it('supports fail-open and asynchronous identity resolution', async () => {
    const onFailure = vi.fn();
    const app = await createApplication({
      rateLimit: {
        max: 1,
        windowMs: 100,
        failureMode: 'open',
        identity: async () => Promise.reject(new Error('resolver')),
        onFailure,
      },
    });
    const origin = await listen(app);

    const response = await get(origin, '/id');
    expect(response.statusCode).toBe(200);
    expect(response.headers['ratelimit-limit']).toBeUndefined();
    expect(onFailure).toHaveBeenCalledWith({
      allowed: true,
      reason: 'identity-resolution-failure',
    });
  });

  it('enforces exact limits under concurrent HTTP requests', async () => {
    const app = await createApplication({
      rateLimit: {
        max: 5,
        windowMs: 100,
        clock: () => 0,
        identity: () => 'client',
      },
    });
    const origin = await listen(app);

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => get(origin, '/id')),
    );
    expect(
      responses.filter((response) => response.statusCode === 200),
    ).toHaveLength(5);
    expect(
      responses.filter((response) => response.statusCode === 429),
    ).toHaveLength(15);
  });

  it('can disable all features', async () => {
    const app = await createApplication({
      requestId: false,
      observability: false,
      rateLimit: false,
    });
    const origin = await listen(app);

    const response = await get(origin, '/id');
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBeUndefined();
  });
});

const CONFIG = Symbol('CONFIG');

@Global()
@Module({
  providers: [{ provide: CONFIG, useValue: { max: 1 } }],
  exports: [CONFIG],
})
class ConfigModule {}

@Controller('async')
class AsyncController {
  @Get()
  get() {
    return { ok: true };
  }
}

describe('RqgModule configuration', () => {
  it('keeps repeated imports predictable without double consumption', async () => {
    const options: RqgModuleOptions = {
      rateLimit: {
        max: 1,
        windowMs: 100,
        clock: () => 0,
        identity: () => 'client',
      },
    };
    const testingModule = await Test.createTestingModule({
      imports: [RqgModule.forRoot(options), RqgModule.forRoot(options)],
      controllers: [AsyncController],
    }).compile();
    const app = testingModule.createNestApplication();
    applications.push(app);
    const origin = await listen(app);

    expect((await get(origin, '/async')).statusCode).toBe(200);
    expect((await get(origin, '/async')).statusCode).toBe(429);
  });

  it('supports injected asynchronous factory configuration', async () => {
    const testingModule = await Test.createTestingModule({
      imports: [
        RqgModule.forRootAsync<readonly [{ readonly max: number }]>({
          imports: [ConfigModule],
          inject: [CONFIG],
          useFactory: async (config) =>
            Promise.resolve({
              requestId: { generator: () => GENERATED_ID },
              rateLimit: {
                max: config.max,
                windowMs: 100,
                clock: () => 0,
                identity: () => 'client',
              },
            }),
        }),
      ],
      controllers: [AsyncController],
    }).compile();
    const app = testingModule.createNestApplication();
    applications.push(app);
    const origin = await listen(app);

    expect((await get(origin, '/async')).statusCode).toBe(200);
    expect((await get(origin, '/async')).statusCode).toBe(429);
  });

  it.each([null, [], { rateLimit: { max: 0 } }])(
    'rejects invalid root configuration %#',
    async (options) => {
      if (options === null || Array.isArray(options)) {
        expect(() => RqgModule.forRoot(options as never)).toThrow(TypeError);
        return;
      }

      await expect(
        Test.createTestingModule({
          imports: [RqgModule.forRoot(options as never)],
        }).compile(),
      ).rejects.toThrow();
    },
  );
});
