import { type RateLimitPolicy, type RateLimitStore, type RateLimitStoreResult } from './rate-limit.js';
export interface MemoryRateLimitStoreOptions {
    /** Maximum number of active identity entries. Defaults to 10,000. */
    readonly maxEntries?: number;
    /** Run an expiry scan after this many consume operations. Defaults to 100. */
    readonly cleanupEvery?: number;
}
/** A bounded, process-local fixed-window store with synchronous atomic updates. */
export declare class MemoryRateLimitStore implements RateLimitStore {
    #private;
    constructor(options?: MemoryRateLimitStoreOptions);
    get size(): number;
    clear(): void;
    consume(key: string, policy: RateLimitPolicy, nowMs: number): RateLimitStoreResult;
}
//# sourceMappingURL=memory-rate-limit-store.d.ts.map