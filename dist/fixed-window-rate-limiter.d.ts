import { type RateLimitPolicy, type RateLimitStore } from './rate-limit.js';
import type { MonotonicClock } from './timer.js';
export type RateLimitFailureMode = 'closed' | 'open';
export type MissingIdentityPolicy = {
    readonly behavior: 'reject';
} | {
    readonly behavior: 'use-shared';
    readonly identity: string;
};
export interface CreateRateLimiterOptions extends RateLimitPolicy {
    readonly store?: RateLimitStore;
    readonly clock?: MonotonicClock;
    /** Defaults to rejecting operations without an identity. */
    readonly missingIdentity?: MissingIdentityPolicy;
    /** Defaults to `closed`. */
    readonly failureMode?: RateLimitFailureMode;
}
interface RateLimitDecisionBase {
    readonly allowed: boolean;
    readonly limit: number;
}
export interface RateLimitAllowedDecision extends RateLimitDecisionBase {
    readonly allowed: true;
    readonly reason: 'within-limit';
    readonly remaining: number;
    readonly resetAfterMs: number;
    readonly retryAfterMs: null;
}
export interface RateLimitExceededDecision extends RateLimitDecisionBase {
    readonly allowed: false;
    readonly reason: 'limit-exceeded';
    readonly remaining: 0;
    readonly resetAfterMs: number;
    readonly retryAfterMs: number;
}
export type RateLimitFailureReason = 'store-failure' | 'capacity-exceeded';
export type RateLimitUnavailableReason = 'missing-identity' | 'invalid-identity' | RateLimitFailureReason;
export interface RateLimitFailOpenDecision extends RateLimitDecisionBase {
    readonly allowed: true;
    readonly reason: RateLimitFailureReason;
    readonly remaining: null;
    readonly resetAfterMs: null;
    readonly retryAfterMs: null;
}
export interface RateLimitUnavailableRejectedDecision extends RateLimitDecisionBase {
    readonly allowed: false;
    readonly reason: RateLimitUnavailableReason;
    readonly remaining: null;
    readonly resetAfterMs: null;
    readonly retryAfterMs: null;
}
export type RateLimitUnavailableDecision = RateLimitFailOpenDecision | RateLimitUnavailableRejectedDecision;
export type RateLimitDecision = RateLimitAllowedDecision | RateLimitExceededDecision | RateLimitUnavailableDecision;
export interface RateLimiter {
    /** Resolves after one atomic store consumption or a defensive rejection. */
    readonly consume: (identity: unknown) => Promise<RateLimitDecision>;
}
/** Creates a framework-independent, anchored fixed-window rate limiter. */
export declare function createRateLimiter(options: CreateRateLimiterOptions): RateLimiter;
export {};
//# sourceMappingURL=fixed-window-rate-limiter.d.ts.map