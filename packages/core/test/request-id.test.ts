import { describe, expect, it, vi } from 'vitest';

import {
  createRequestId,
  isRequestId,
  resolveRequestId,
  type RequestIdGenerator,
} from '../src/index.js';

const VALID_ID = '018f1f70-7b8a-4f9f-8ad4-5a6f8872a621';
const GENERATED_ID = '9a7d7f16-1f5c-47c7-b299-61f48f7658aa';

function fixedGenerator(value = GENERATED_ID): RequestIdGenerator {
  return () => value;
}

describe('isRequestId', () => {
  it('accepts canonical lowercase UUID v4 values', () => {
    expect(isRequestId(VALID_ID)).toBe(true);
  });

  it.each([
    undefined,
    null,
    42,
    true,
    {},
    [],
    '',
    '018f1f70-7b8a-4f9f-8ad4-5a6f8872a62',
    '018f1f70-7b8a-4f9f-8ad4-5a6f8872a6210',
    '018F1F70-7B8A-4F9F-8AD4-5A6F8872A621',
    '00000000-0000-0000-0000-000000000000',
    '018f1f70-7b8a-3f9f-8ad4-5a6f8872a621',
    '018f1f70-7b8a-4f9f-7ad4-5a6f8872a621',
    '018f1f70-7b8a-4f9f-cad4-5a6f8872a621',
    ' 018f1f70-7b8a-4f9f-8ad4-5a6f8872a621',
    '018f1f70-7b8a-4f9f-8ad4-5a6f8872a621\r\nX-Injected: true',
    '018f1f70–7b8a–4f9f–8ad4–5a6f8872a621',
  ])('rejects invalid or non-canonical input: %j', (value) => {
    expect(isRequestId(value)).toBe(false);
  });

  it('does not coerce hostile objects', () => {
    const value = {
      toString: vi.fn(() => {
        throw new Error('must not be called');
      }),
    };

    expect(isRequestId(value)).toBe(false);
    expect(value.toString).not.toHaveBeenCalled();
  });

  it('rejects oversized input without unsafe pattern matching', () => {
    expect(isRequestId('a'.repeat(1_000_000))).toBe(false);
  });
});

describe('createRequestId', () => {
  it('uses native UUID generation by default', () => {
    const ids = new Set(Array.from({ length: 1_000 }, () => createRequestId()));

    expect(ids).toHaveLength(1_000);
    for (const id of ids) {
      expect(isRequestId(id)).toBe(true);
    }
  });

  it('supports deterministic generator injection', () => {
    expect(createRequestId(fixedGenerator())).toBe(GENERATED_ID);
  });

  it.each([
    '',
    'not-a-uuid',
    '018f1f70-7b8a-1f9f-8ad4-5a6f8872a621',
    '018F1F70-7B8A-4F9F-8AD4-5A6F8872A621',
  ])('rejects invalid injected generator output: %j', (value) => {
    expect(() => createRequestId(fixedGenerator(value))).toThrow(TypeError);
  });

  it('rejects a non-function generator at runtime', () => {
    expect(() =>
      createRequestId(null as unknown as RequestIdGenerator),
    ).toThrow(new TypeError('Request ID generator must be a function'));
  });
});

describe('resolveRequestId', () => {
  it('rejects incoming IDs by default, including valid IDs', () => {
    expect(resolveRequestId(VALID_ID, { generator: fixedGenerator() })).toBe(
      GENERATED_ID,
    );
  });

  it('accepts a valid incoming ID only when explicitly enabled', () => {
    const generator = vi.fn(fixedGenerator());

    expect(
      resolveRequestId(VALID_ID, { acceptIncoming: true, generator }),
    ).toBe(VALID_ID);
    expect(generator).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    ['018f1f70-7b8a-4f9f-8ad4-5a6f8872a621'],
    'not-a-uuid',
    '018f1f70-7b8a-4f9f-8ad4-5a6f8872a621\r\nX-Injected: true',
  ])('generates a fresh ID for missing or invalid input: %j', (incomingId) => {
    const generator = vi.fn(fixedGenerator());

    expect(
      resolveRequestId(incomingId, { acceptIncoming: true, generator }),
    ).toBe(GENERATED_ID);
    expect(generator).toHaveBeenCalledOnce();
  });

  it('does not inspect untrusted incoming objects', () => {
    const incomingId = new Proxy(
      {},
      {
        get() {
          throw new Error('must not access properties');
        },
      },
    );

    expect(resolveRequestId(incomingId, { generator: fixedGenerator() })).toBe(
      GENERATED_ID,
    );
  });

  it.each([null, [], { acceptIncoming: 'true' }, { generator: 'random' }])(
    'rejects invalid runtime configuration: %j',
    (options) => {
      expect(() => resolveRequestId(undefined, options as never)).toThrow(
        TypeError,
      );
    },
  );
});
