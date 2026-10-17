import { performance } from 'node:perf_hooks';

/** Returns a finite monotonic clock reading in milliseconds. */
export type MonotonicClock = () => number;

export interface CreateTimerOptions {
  /** Clock used for start and elapsed readings. Defaults to `performance.now`. */
  readonly clock?: MonotonicClock;
}

export interface OperationTimer {
  /** Returns the greatest nonnegative elapsed duration observed so far. */
  readonly elapsed: () => number;
  /** Stops the timer and returns its frozen elapsed duration. */
  readonly stop: () => number;
}

const performanceClock: MonotonicClock = () => performance.now();

/** Creates a running operation timer without scheduling background work. */
export function createTimer(options: CreateTimerOptions = {}): OperationTimer {
  assertValidOptions(options);

  const clock = options.clock ?? performanceClock;
  const startedAtMs = readClock(clock);
  let greatestElapsedMs = 0;
  let stoppedElapsedMs: number | undefined;

  function sample(): number {
    const elapsedMs = readClock(clock) - startedAtMs;
    greatestElapsedMs = Math.max(greatestElapsedMs, elapsedMs, 0);
    return greatestElapsedMs;
  }

  return Object.freeze({
    elapsed(): number {
      return stoppedElapsedMs ?? sample();
    },
    stop(): number {
      stoppedElapsedMs ??= sample();
      return stoppedElapsedMs;
    },
  });
}

function readClock(clock: MonotonicClock): number {
  const reading: unknown = clock();

  if (typeof reading !== 'number' || !Number.isFinite(reading)) {
    throw new TypeError('Monotonic clock must return a finite number');
  }

  return reading;
}

function assertValidOptions(options: CreateTimerOptions): void {
  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new TypeError('Timer options must be an object');
  }

  if (options.clock !== undefined && typeof options.clock !== 'function') {
    throw new TypeError('Timer clock must be a function');
  }
}
