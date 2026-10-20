import { type CreateRateLimiterOptions, type RateLimitFailureReason } from '@rqg/core';
import type { Request, RequestHandler } from 'express';
export type ExpressRateLimitIdentity = string | null | undefined;
export type ExpressIdentityResolver = (request: Request) => ExpressRateLimitIdentity | Promise<ExpressRateLimitIdentity>;
export type ExpressRateLimitFailureReason = RateLimitFailureReason | 'identity-resolution-failure';
export interface ExpressRateLimitFailure {
    readonly allowed: boolean;
    readonly reason: ExpressRateLimitFailureReason;
}
export interface RateLimitMiddlewareOptions extends CreateRateLimiterOptions {
    readonly identity: ExpressIdentityResolver;
    /** Observes operational failures without receiving identities or store errors. */
    readonly onFailure?: (failure: ExpressRateLimitFailure) => void;
}
/** Applies a core rate limiter and translates its decisions into HTTP behavior. */
export declare function rateLimit(options: RateLimitMiddlewareOptions): RequestHandler;
//# sourceMappingURL=rate-limit.d.ts.map