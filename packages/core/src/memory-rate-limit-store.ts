import {
  assertRateLimitPolicy,
  RateLimitCapacityError,
  RateLimitPolicyConflictError,
  type RateLimitPolicy,
  type RateLimitStore,
  type RateLimitStoreResult,
} from './rate-limit.js';

export interface MemoryRateLimitStoreOptions {
  /** Maximum number of active identity entries. Defaults to 10,000. */
  readonly maxEntries?: number;
  /** Run an expiry scan after this many consume operations. Defaults to 100. */
  readonly cleanupEvery?: number;
}

interface MemoryEntry {
  count: number;
  readonly max: number;
  readonly windowMs: number;
  readonly resetAtMs: number;
}

const DEFAULT_MAX_ENTRIES = 10_000;
const DEFAULT_CLEANUP_EVERY = 100;

/** A bounded, process-local fixed-window store with synchronous atomic updates. */
export class MemoryRateLimitStore implements RateLimitStore {
  readonly #entries = new Map<string, MemoryEntry>();
  readonly #maxEntries: number;
  readonly #cleanupEvery: number;
  #operationsSinceCleanup = 0;

  constructor(options: MemoryRateLimitStoreOptions = {}) {
    assertOptions(options);
    this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.#cleanupEvery = options.cleanupEvery ?? DEFAULT_CLEANUP_EVERY;
  }

  get size(): number {
    return this.#entries.size;
  }

  clear(): void {
    this.#entries.clear();
    this.#operationsSinceCleanup = 0;
  }

  consume(
    key: string,
    policy: RateLimitPolicy,
    nowMs: number,
  ): RateLimitStoreResult {
    assertStoreInput(key, policy, nowMs);
    this.#runScheduledCleanup(nowMs);

    let entry = this.#entries.get(key);
    if (entry !== undefined && nowMs >= entry.resetAtMs) {
      this.#entries.delete(key);
      entry = undefined;
    }

    if (entry === undefined) {
      this.#ensureCapacity(nowMs);
      const resetAtMs = nowMs + policy.windowMs;
      if (!Number.isFinite(resetAtMs) || resetAtMs <= nowMs) {
        throw new RangeError(
          'Rate limit reset boundary must be finite and advance',
        );
      }

      this.#entries.set(key, {
        count: 1,
        max: policy.max,
        windowMs: policy.windowMs,
        resetAtMs,
      });
      return freezeResult(true, 1, resetAtMs);
    }

    if (entry.max !== policy.max || entry.windowMs !== policy.windowMs) {
      throw new RateLimitPolicyConflictError();
    }

    if (entry.count >= policy.max) {
      return freezeResult(false, policy.max, entry.resetAtMs);
    }

    entry.count += 1;
    return freezeResult(true, entry.count, entry.resetAtMs);
  }

  #runScheduledCleanup(nowMs: number): void {
    this.#operationsSinceCleanup += 1;
    if (this.#operationsSinceCleanup >= this.#cleanupEvery) {
      this.#deleteExpired(nowMs);
      this.#operationsSinceCleanup = 0;
    }
  }

  #ensureCapacity(nowMs: number): void {
    if (this.#entries.size < this.#maxEntries) return;

    this.#deleteExpired(nowMs);
    if (this.#entries.size >= this.#maxEntries) {
      throw new RateLimitCapacityError();
    }
  }

  #deleteExpired(nowMs: number): void {
    for (const [key, entry] of this.#entries) {
      if (nowMs >= entry.resetAtMs) this.#entries.delete(key);
    }
  }
}

function freezeResult(
  consumed: boolean,
  count: number,
  resetAtMs: number,
): RateLimitStoreResult {
  return Object.freeze({ consumed, count, resetAtMs });
}

function assertStoreInput(
  key: string,
  policy: RateLimitPolicy,
  nowMs: number,
): void {
  if (typeof key !== 'string' || key.length === 0) {
    throw new TypeError('Rate limit store key must be a nonempty string');
  }

  assertRateLimitPolicy(policy);

  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) {
    throw new TypeError('Rate limit store nowMs must be a finite number');
  }
}

function assertOptions(options: MemoryRateLimitStoreOptions): void {
  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new TypeError('Memory rate limit store options must be an object');
  }

  assertPositiveSafeInteger(options.maxEntries, 'maxEntries');
  assertPositiveSafeInteger(options.cleanupEvery, 'cleanupEvery');
}

function assertPositiveSafeInteger(
  value: number | undefined,
  name: string,
): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
}
