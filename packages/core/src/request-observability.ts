import {
  assertLogger,
  createLogRecord,
  writeLog,
  type Logger,
  type LogLevel,
  type LogRecord,
  type LogWriteResult,
} from './logging.js';
import { isRequestId, type RequestId } from './request-id.js';
import {
  createTimer,
  type MonotonicClock,
  type OperationTimer,
} from './timer.js';

export type RequestOutcome = 'completed' | 'failed' | 'aborted';

export interface RequestMetadata {
  readonly requestId: RequestId;
  readonly method: string;
  /** A path or route template without query parameters or fragments. */
  readonly path: string;
}

export interface RequestCompletionInput {
  /** A valid HTTP status code, or `null` when no status is available. */
  readonly statusCode: number | null;
  readonly outcome: RequestOutcome;
}

export interface RequestCompletion extends RequestCompletionInput {
  readonly durationMs: number;
}

export interface CreateRequestObserverOptions {
  readonly logger: Logger;
  readonly clock?: MonotonicClock;
}

export interface RequestObservationResult {
  readonly completion: RequestCompletion;
  readonly record: LogRecord;
  readonly logResult: LogWriteResult;
}

export interface RequestObserver {
  /** Reads elapsed time without completing the observation. */
  readonly elapsed: () => number;
  /** Completes and logs once. The first call wins and its promise is reused. */
  readonly complete: (
    completion: RequestCompletionInput,
  ) => Promise<RequestObservationResult>;
}

const REQUEST_OUTCOMES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'aborted',
]);
const HTTP_METHOD_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;

/** Composes request metadata, operation timing, and structured logging. */
export function createRequestObserver(
  metadata: RequestMetadata,
  options: CreateRequestObserverOptions,
): RequestObserver {
  const validatedMetadata = validateMetadata(metadata);
  const { logger, timer } = createDependencies(options);
  let completionPromise: Promise<RequestObservationResult> | undefined;

  return Object.freeze({
    elapsed: timer.elapsed,
    complete(
      completionInput: RequestCompletionInput,
    ): Promise<RequestObservationResult> {
      if (completionPromise !== undefined) {
        return completionPromise;
      }

      const validatedInput = validateCompletionInput(completionInput);
      const completion: RequestCompletion = Object.freeze({
        ...validatedInput,
        durationMs: timer.stop(),
      });
      const record = createCompletionRecord(validatedMetadata, completion);

      completionPromise = writeLog(logger, record).then((logResult) =>
        Object.freeze({ completion, record, logResult }),
      );
      return completionPromise;
    },
  });
}

function createDependencies(options: CreateRequestObserverOptions): {
  readonly logger: Logger;
  readonly timer: OperationTimer;
} {
  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new TypeError('Request observer options must be an object');
  }

  assertLogger(options.logger);
  const timer =
    options.clock === undefined
      ? createTimer()
      : createTimer({ clock: options.clock });
  return { logger: options.logger, timer };
}

function validateMetadata(metadata: RequestMetadata): RequestMetadata {
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    Array.isArray(metadata)
  ) {
    throw new TypeError('Request metadata must be an object');
  }

  if (!isRequestId(metadata.requestId)) {
    throw new TypeError('Request metadata must contain a valid request ID');
  }

  if (
    typeof metadata.method !== 'string' ||
    !HTTP_METHOD_PATTERN.test(metadata.method)
  ) {
    throw new TypeError('Request method must be a nonempty HTTP token');
  }

  if (
    typeof metadata.path !== 'string' ||
    metadata.path.length === 0 ||
    hasUnsafePathCharacter(metadata.path)
  ) {
    throw new TypeError(
      'Request path must be nonempty and exclude query, fragment, and control characters',
    );
  }

  return Object.freeze({
    requestId: metadata.requestId,
    method: metadata.method,
    path: metadata.path,
  });
}

function hasUnsafePathCharacter(path: string): boolean {
  for (const character of path) {
    const code = character.charCodeAt(0);
    if (character === '?' || character === '#' || code <= 31 || code === 127) {
      return true;
    }
  }

  return false;
}

function validateCompletionInput(
  completion: RequestCompletionInput,
): RequestCompletionInput {
  if (
    typeof completion !== 'object' ||
    completion === null ||
    Array.isArray(completion)
  ) {
    throw new TypeError('Request completion must be an object');
  }

  if (
    typeof completion.outcome !== 'string' ||
    !REQUEST_OUTCOMES.has(completion.outcome)
  ) {
    throw new TypeError(
      'Request outcome must be completed, failed, or aborted',
    );
  }

  if (
    completion.statusCode !== null &&
    (!Number.isInteger(completion.statusCode) ||
      completion.statusCode < 100 ||
      completion.statusCode > 599)
  ) {
    throw new TypeError(
      'Request status code must be an integer from 100 to 599',
    );
  }

  if (completion.outcome === 'completed' && completion.statusCode === null) {
    throw new TypeError('Completed requests must include a status code');
  }

  return Object.freeze({
    outcome: completion.outcome,
    statusCode: completion.statusCode,
  });
}

function createCompletionRecord(
  metadata: RequestMetadata,
  completion: RequestCompletion,
): LogRecord {
  return createLogRecord({
    level: outcomeLevel(completion.outcome),
    message: 'request finished',
    context: {
      requestId: metadata.requestId,
      method: metadata.method,
      path: metadata.path,
      statusCode: completion.statusCode,
      durationMs: completion.durationMs,
      outcome: completion.outcome,
    },
  });
}

function outcomeLevel(outcome: RequestOutcome): LogLevel {
  switch (outcome) {
    case 'completed':
      return 'info';
    case 'failed':
      return 'error';
    case 'aborted':
      return 'warn';
  }
}
