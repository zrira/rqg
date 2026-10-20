export interface RateLimitPolicy {
    /** Maximum successful consumptions in one window. */
    readonly max: number;
    /** Window duration in milliseconds. */
    readonly windowMs: number;
}
export interface RateLimitStoreResult {
    /** Whether this attempt consumed one allowance. */
    readonly consumed: boolean;
    /** Saturated number of allowances consumed in the current window. */
    readonly count: number;
    /** Monotonic clock boundary at which the current window expires. */
    readonly resetAtMs: number;
}
export interface RateLimitStore {
    /** Atomically evaluates and updates one fixed-window counter. */
    readonly consume: (key: string, policy: RateLimitPolicy, nowMs: number) => RateLimitStoreResult | Promise<RateLimitStoreResult>;
}
/** Indicates that a bounded store cannot safely track another active key. */
export declare class RateLimitCapacityError extends Error {
    readonly name = "RateLimitCapacityError";
    constructor();
}
/** Indicates that one store key was reused with a different policy. */
export declare class RateLimitPolicyConflictError extends Error {
    readonly name = "RateLimitPolicyConflictError";
    constructor();
}
export declare function assertRateLimitPolicy(policy: RateLimitPolicy): void;
//# sourceMappingURL=rate-limit.d.ts.map