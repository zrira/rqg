import { type RateLimiter, type RateLimitPolicy } from '@rqg/core';
import type { NestRateLimitOptions, RqgModuleOptions } from './types.js';
export declare class RqgRateLimitRegistry {
    #private;
    constructor(options: RqgModuleOptions);
    get configuration(): NestRateLimitOptions | undefined;
    getLimiter(scope: string | object, policy: RateLimitPolicy): RateLimiter;
}
//# sourceMappingURL=rate-limit-registry.d.ts.map