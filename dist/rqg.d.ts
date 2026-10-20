import type { RequestHandler } from 'express';
import { type RateLimitMiddlewareOptions } from './rate-limit.js';
import { type RequestIdMiddlewareOptions } from './request-id.js';
import { type RequestObservabilityOptions } from './request-observability.js';
export interface RqgMiddlewareOptions {
    readonly requestId?: RequestIdMiddlewareOptions | false;
    readonly observability?: RequestObservabilityOptions | false;
    readonly rateLimit?: RateLimitMiddlewareOptions | false;
}
/** Composes enabled rqg middleware in ID, observability, rate-limit order. */
export declare function rqg(options: RqgMiddlewareOptions): RequestHandler[];
//# sourceMappingURL=rqg.d.ts.map