import { randomUUID } from 'node:crypto';

declare const requestIdBrand: unique symbol;

/** A canonical lowercase RFC 4122 UUID v4 that has passed rqg validation. */
export type RequestId = string & { readonly [requestIdBrand]: true };

/** Produces a request ID candidate. The returned value is validated before use. */
export type RequestIdGenerator = () => string;

export interface ResolveRequestIdOptions {
  /** Trust a valid incoming request ID. Defaults to `false`. */
  readonly acceptIncoming?: boolean;
  /** Override UUID generation, primarily for deterministic tests. */
  readonly generator?: RequestIdGenerator;
}

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** Returns whether a value is a canonical lowercase RFC 4122 UUID v4. */
export function isRequestId(value: unknown): value is RequestId {
  return (
    typeof value === 'string' &&
    value.length === 36 &&
    REQUEST_ID_PATTERN.test(value)
  );
}

/** Generates and validates a new request ID. */
export function createRequestId(
  generator: RequestIdGenerator = randomUUID,
): RequestId {
  if (typeof generator !== 'function') {
    throw new TypeError('Request ID generator must be a function');
  }

  const generated: unknown = generator();

  if (!isRequestId(generated)) {
    throw new TypeError(
      'Request ID generator must return a canonical lowercase UUID v4',
    );
  }

  return generated;
}

/**
 * Resolves a request ID at a trust boundary.
 *
 * Incoming values are ignored unless acceptance is explicitly enabled and the
 * value passes strict validation. Otherwise, a fresh ID is generated.
 */
export function resolveRequestId(
  incomingId: unknown,
  options: ResolveRequestIdOptions = {},
): RequestId {
  assertValidOptions(options);

  if (options.acceptIncoming === true && isRequestId(incomingId)) {
    return incomingId;
  }

  return createRequestId(options.generator);
}

function assertValidOptions(options: ResolveRequestIdOptions): void {
  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new TypeError('Request ID options must be an object');
  }

  if (
    options.acceptIncoming !== undefined &&
    typeof options.acceptIncoming !== 'boolean'
  ) {
    throw new TypeError('acceptIncoming must be a boolean');
  }

  if (
    options.generator !== undefined &&
    typeof options.generator !== 'function'
  ) {
    throw new TypeError('Request ID generator must be a function');
  }
}
