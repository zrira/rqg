/** Indicates that a bounded store cannot safely track another active key. */
export class RateLimitCapacityError extends Error {
    name = 'RateLimitCapacityError';
    constructor() {
        super('Rate limit store capacity exhausted');
    }
}
/** Indicates that one store key was reused with a different policy. */
export class RateLimitPolicyConflictError extends Error {
    name = 'RateLimitPolicyConflictError';
    constructor() {
        super('Rate limit store key has conflicting policies');
    }
}
export function assertRateLimitPolicy(policy) {
    if (typeof policy !== 'object' || policy === null || Array.isArray(policy)) {
        throw new TypeError('Rate limit policy must be an object');
    }
    if (!Number.isSafeInteger(policy.max) || policy.max <= 0) {
        throw new TypeError('Rate limit max must be a positive safe integer');
    }
    if (typeof policy.windowMs !== 'number' ||
        !Number.isFinite(policy.windowMs) ||
        policy.windowMs <= 0) {
        throw new TypeError('Rate limit windowMs must be a positive finite number');
    }
}
//# sourceMappingURL=rate-limit.js.map