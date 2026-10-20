import { assertRateLimitPolicy, RateLimitCapacityError, RateLimitPolicyConflictError, } from './rate-limit.js';
const DEFAULT_MAX_ENTRIES = 10_000;
const DEFAULT_CLEANUP_EVERY = 100;
/** A bounded, process-local fixed-window store with synchronous atomic updates. */
export class MemoryRateLimitStore {
    #entries = new Map();
    #maxEntries;
    #cleanupEvery;
    #operationsSinceCleanup = 0;
    #earliestResetAtMs = Number.POSITIVE_INFINITY;
    constructor(options = {}) {
        assertOptions(options);
        this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
        this.#cleanupEvery = options.cleanupEvery ?? DEFAULT_CLEANUP_EVERY;
    }
    get size() {
        return this.#entries.size;
    }
    clear() {
        this.#entries.clear();
        this.#operationsSinceCleanup = 0;
        this.#earliestResetAtMs = Number.POSITIVE_INFINITY;
    }
    consume(key, policy, nowMs) {
        assertStoreInput(key, policy, nowMs);
        this.#runScheduledCleanup(nowMs);
        let entry = this.#entries.get(key);
        if (entry !== undefined && nowMs >= entry.resetAtMs) {
            this.#entries.delete(key);
            if (entry.resetAtMs === this.#earliestResetAtMs) {
                this.#refreshEarliestReset();
            }
            entry = undefined;
        }
        if (entry === undefined) {
            this.#ensureCapacity(nowMs);
            const resetAtMs = nowMs + policy.windowMs;
            if (!Number.isFinite(resetAtMs) || resetAtMs <= nowMs) {
                throw new RangeError('Rate limit reset boundary must be finite and advance');
            }
            this.#entries.set(key, {
                count: 1,
                max: policy.max,
                windowMs: policy.windowMs,
                resetAtMs,
            });
            this.#earliestResetAtMs = Math.min(this.#earliestResetAtMs, resetAtMs);
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
    #runScheduledCleanup(nowMs) {
        this.#operationsSinceCleanup += 1;
        if (this.#operationsSinceCleanup >= this.#cleanupEvery) {
            if (nowMs >= this.#earliestResetAtMs)
                this.#deleteExpired(nowMs);
            this.#operationsSinceCleanup = 0;
        }
    }
    #ensureCapacity(nowMs) {
        if (this.#entries.size < this.#maxEntries)
            return;
        // When the earliest boundary is still in the future, a full scan cannot
        // free capacity. This keeps identity flooding O(1) between cleanups.
        if (nowMs >= this.#earliestResetAtMs)
            this.#deleteExpired(nowMs);
        if (this.#entries.size >= this.#maxEntries) {
            throw new RateLimitCapacityError();
        }
    }
    #deleteExpired(nowMs) {
        let earliestResetAtMs = Number.POSITIVE_INFINITY;
        for (const [key, entry] of this.#entries) {
            if (nowMs >= entry.resetAtMs)
                this.#entries.delete(key);
            else
                earliestResetAtMs = Math.min(earliestResetAtMs, entry.resetAtMs);
        }
        this.#earliestResetAtMs = earliestResetAtMs;
    }
    #refreshEarliestReset() {
        let earliestResetAtMs = Number.POSITIVE_INFINITY;
        for (const entry of this.#entries.values()) {
            earliestResetAtMs = Math.min(earliestResetAtMs, entry.resetAtMs);
        }
        this.#earliestResetAtMs = earliestResetAtMs;
    }
}
function freezeResult(consumed, count, resetAtMs) {
    return Object.freeze({ consumed, count, resetAtMs });
}
function assertStoreInput(key, policy, nowMs) {
    if (typeof key !== 'string' || key.length === 0) {
        throw new TypeError('Rate limit store key must be a nonempty string');
    }
    assertRateLimitPolicy(policy);
    if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) {
        throw new TypeError('Rate limit store nowMs must be a finite number');
    }
}
function assertOptions(options) {
    if (typeof options !== 'object' ||
        options === null ||
        Array.isArray(options)) {
        throw new TypeError('Memory rate limit store options must be an object');
    }
    assertPositiveSafeInteger(options.maxEntries, 'maxEntries');
    assertPositiveSafeInteger(options.cleanupEvery, 'cleanupEvery');
}
function assertPositiveSafeInteger(value, name) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) {
        throw new TypeError(`${name} must be a positive safe integer`);
    }
}
//# sourceMappingURL=memory-rate-limit-store.js.map