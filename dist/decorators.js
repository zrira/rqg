import { createParamDecorator, SetMetadata, } from '@nestjs/common';
import { getNestRequestId } from './context.js';
import { RQG_RATE_LIMIT_METADATA } from './tokens.js';
export function RateLimit(policy) {
    assertPolicy(policy);
    return SetMetadata(RQG_RATE_LIMIT_METADATA, Object.freeze({
        kind: 'policy',
        policy: Object.freeze({ max: policy.max, windowMs: policy.windowMs }),
    }));
}
export function SkipRateLimit() {
    return SetMetadata(RQG_RATE_LIMIT_METADATA, Object.freeze({ kind: 'skip' }));
}
export const RequestId = createParamDecorator((_data, context) => getNestRequestId(context.switchToHttp().getResponse()));
function assertPolicy(policy) {
    if (typeof policy !== 'object' ||
        policy === null ||
        Array.isArray(policy) ||
        !Number.isSafeInteger(policy.max) ||
        policy.max <= 0 ||
        typeof policy.windowMs !== 'number' ||
        !Number.isFinite(policy.windowMs) ||
        policy.windowMs <= 0) {
        throw new TypeError('RateLimit requires a valid max and windowMs');
    }
}
//# sourceMappingURL=decorators.js.map