import { type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RqgRateLimitRegistry } from './rate-limit-registry.js';
import type { RqgModuleOptions } from './types.js';
export declare class RqgRateLimitGuard implements CanActivate {
    private readonly reflector;
    private readonly registry;
    private readonly options;
    private readonly registration;
    constructor(reflector: Reflector, registry: RqgRateLimitRegistry, options: RqgModuleOptions, registration: object);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private selectPolicy;
}
//# sourceMappingURL=rate-limit.guard.d.ts.map