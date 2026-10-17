import { describe, expect, it, vi } from 'vitest';

import {
  createLogRecord,
  writeLog,
  type JsonObject,
  type LogLevel,
  type Logger,
  type LogRecord,
} from '../src/index.js';

const levels: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

describe('createLogRecord', () => {
  it.each(levels)('creates a structured %s record', (level) => {
    expect(createLogRecord({ level, message: 'operation finished' })).toEqual({
      level,
      message: 'operation finished',
    });
  });

  it('snapshots and freezes contextual metadata', () => {
    const context = { operation: 'cache-read', attempt: 2, tags: ['fast'] };
    const record = createLogRecord({
      level: 'info',
      message: 'operation finished',
      context,
    });

    context.operation = 'changed';
    expect(record.context).toEqual({
      operation: 'cache-read',
      attempt: 2,
      tags: ['fast'],
    });
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.context)).toBe(true);
    expect(Object.isFrozen(record.context?.tags)).toBe(true);
  });

  it('supports JSON-compatible primitive, array, and object values', () => {
    const context: JsonObject = {
      string: 'value',
      number: 1.5,
      boolean: true,
      null: null,
      array: [1, 'two', false],
      object: { nested: 'value' },
    };

    expect(
      JSON.stringify(
        createLogRecord({ level: 'debug', message: 'record', context }),
      ),
    ).toBe(
      '{"level":"debug","message":"record","context":{"string":"value","number":1.5,"boolean":true,"null":null,"array":[1,"two",false],"object":{"nested":"value"}}}',
    );
  });

  it.each([
    { level: 'trace', message: 'record' },
    { level: 'info', message: '' },
    { level: 'info', message: 'record', context: [] },
    { level: 'info', message: 'record', context: { value: undefined } },
    { level: 'info', message: 'record', context: { value: Number.NaN } },
    { level: 'info', message: 'record', context: { value: 1n } },
    { level: 'info', message: 'record', context: { value: new Date() } },
    { level: 'info', message: 'record', context: { value: () => undefined } },
  ])('rejects malformed record %#', (record) => {
    expect(() => createLogRecord(record as never as LogRecord)).toThrow(
      TypeError,
    );
  });

  it('rejects circular metadata', () => {
    const context: Record<string, unknown> = {};
    context.self = context;

    expect(() =>
      createLogRecord({
        level: 'info',
        message: 'record',
        context: context as JsonObject,
      }),
    ).toThrow(
      new TypeError('Log context must not contain circular references'),
    );
  });

  it('rejects metadata accessors without invoking them', () => {
    const getter = vi.fn(() => 'secret');
    const context = Object.defineProperty({}, 'authorization', {
      enumerable: true,
      get: getter,
    });

    expect(() =>
      createLogRecord({
        level: 'info',
        message: 'record',
        context,
      }),
    ).toThrow(TypeError);
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects excessively nested metadata', () => {
    const root: Record<string, unknown> = {};
    let current = root;
    for (let depth = 0; depth < 33; depth += 1) {
      const child: Record<string, unknown> = {};
      current.child = child;
      current = child;
    }

    expect(() =>
      createLogRecord({
        level: 'info',
        message: 'record',
        context: root as JsonObject,
      }),
    ).toThrow(/must not exceed/u);
  });
});

describe('writeLog', () => {
  const record: LogRecord = { level: 'info', message: 'operation finished' };

  it('injects a synchronous logger and reports success', async () => {
    const log = vi.fn();

    await expect(writeLog({ log }, record)).resolves.toEqual({ ok: true });
    expect(log).toHaveBeenCalledWith(record);
  });

  it('supports an asynchronous logger', async () => {
    const logger: Logger = { log: async () => Promise.resolve() };

    await expect(writeLog(logger, record)).resolves.toEqual({ ok: true });
  });

  it('supports logger implementations with prototype methods', async () => {
    class CustomLogger implements Logger {
      log(): void {}
    }

    await expect(writeLog(new CustomLogger(), record)).resolves.toEqual({
      ok: true,
    });
  });

  it('captures a synchronous logger failure', async () => {
    const error = new Error('logger unavailable');
    const logger: Logger = {
      log() {
        throw error;
      },
    };

    await expect(writeLog(logger, record)).resolves.toEqual({
      ok: false,
      error,
    });
  });

  it('captures an asynchronous logger rejection', async () => {
    const error = new Error('logger unavailable');
    const logger: Logger = { log: () => Promise.reject(error) };

    await expect(writeLog(logger, record)).resolves.toEqual({
      ok: false,
      error,
    });
  });

  it.each([null, {}, { log: 'console' }])(
    'throws synchronously for invalid logger configuration: %j',
    (logger) => {
      expect(() => writeLog(logger as never as Logger, record)).toThrow(
        new TypeError('Logger must provide a log function'),
      );
    },
  );

  it('throws synchronously for a malformed record', () => {
    const logger: Logger = { log: vi.fn() };

    expect(() =>
      writeLog(logger, { level: 'info', message: '', context: {} }),
    ).toThrow(TypeError);
    expect(logger.log).not.toHaveBeenCalled();
  });
});
