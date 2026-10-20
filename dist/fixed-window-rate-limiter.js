import { performance } from 'node:perf_hooks';
import { MemoryRateLimitStore } from './memory-rate-limit-store.js';
import { assertRateLimitPolicy, RateLimitCapacityError, } from './rate-limit.js';
const MAX_IDENTITY_LENGTH = 256;
const DEFAULT_MISSING_IDENTITY = Object.freeze({
    behavior: 'reject',
});
/** Creates a framework-independent, anchored fixed-window rate limiter. */
export function createRateLimiter(options) {
    const configuration = validateOptions(options);
    let greatestNowMs = Number.NEGATIVE_INFINITY;
    return Object.freeze({
        async consume(identity) {
            const resolvedIdentity = resolveIdentity(identity, configuration.missingIdentity);
            if (!resolvedIdentity.valid) {
                return rejectedUnavailableDecision(resolvedIdentity.reason, configuration.policy.max);
            }
            const clockReading = readClock(configuration.clock);
            greatestNowMs = Math.max(greatestNowMs, clockReading);
            const nowMs = greatestNowMs;
            let storeResult;
            try {
                storeResult = await configuration.store.consume(resolvedIdentity.identity, configuration.policy, nowMs);
                validateStoreResult(storeResult, configuration.policy, nowMs);
            }
            catch (error) {
                const reason = error instanceof RateLimitCapacityError
                    ? 'capacity-exceeded'
                    : 'store-failure';
                return configuration.failureMode === 'open'
                    ? failOpenDecision(reason, configuration.policy.max)
                    : rejectedUnavailableDecision(reason, configuration.policy.max);
            }
            const resetAfterMs = storeResult.resetAtMs - nowMs;
            if (!storeResult.consumed) {
                return Object.freeze({
                    allowed: false,
                    reason: 'limit-exceeded',
                    limit: configuration.policy.max,
                    remaining: 0,
                    resetAfterMs,
                    retryAfterMs: resetAfterMs,
                });
            }
            return Object.freeze({
                allowed: true,
                reason: 'within-limit',
                limit: configuration.policy.max,
                remaining: configuration.policy.max - storeResult.count,
                resetAfterMs,
                retryAfterMs: null,
            });
        },
    });
}
function validateOptions(options) {
    if (typeof options !== 'object' ||
        options === null ||
        Array.isArray(options)) {
        throw new TypeError('Rate limiter options must be an object');
    }
    assertRateLimitPolicy(options);
    const store = options.store ?? new MemoryRateLimitStore();
    if ((typeof store !== 'object' && typeof store !== 'function') ||
        store === null ||
        typeof store.consume !== 'function') {
        throw new TypeError('Rate limit store must provide a consume function');
    }
    const clock = options.clock ?? (() => performance.now());
    if (typeof clock !== 'function') {
        throw new TypeError('Rate limiter clock must be a function');
    }
    const missingIdentity = options.missingIdentity ?? DEFAULT_MISSING_IDENTITY;
    validateMissingIdentityPolicy(missingIdentity);
    const failureMode = options.failureMode ?? 'closed';
    if (failureMode !== 'closed' && failureMode !== 'open') {
        throw new TypeError('Rate limit failureMode must be closed or open');
    }
    return Object.freeze({
        policy: Object.freeze({ max: options.max, windowMs: options.windowMs }),
        store,
        clock,
        missingIdentity,
        failureMode,
    });
}
function validateMissingIdentityPolicy(policy) {
    if (typeof policy !== 'object' || policy === null || Array.isArray(policy)) {
        throw new TypeError('Missing identity policy must be an object');
    }
    if (policy.behavior === 'reject')
        return;
    if (policy.behavior === 'use-shared') {
        const identity = validateIdentity(policy.identity);
        if (!identity.valid) {
            throw new TypeError('Shared rate limit identity must be valid');
        }
        return;
    }
    throw new TypeError('Missing identity behavior must be reject or use-shared');
}
function resolveIdentity(identity, missingPolicy) {
    if (identity === undefined || identity === null || identity === '') {
        if (missingPolicy.behavior === 'use-shared') {
            return { valid: true, identity: missingPolicy.identity };
        }
        return { valid: false, reason: 'missing-identity' };
    }
    return validateIdentity(identity);
}
function validateIdentity(identity) {
    if (typeof identity !== 'string' ||
        identity.length === 0 ||
        identity.length > MAX_IDENTITY_LENGTH ||
        identity.trim() !== identity ||
        hasControlCharacter(identity)) {
        return { valid: false, reason: 'invalid-identity' };
    }
    return { valid: true, identity };
}
function hasControlCharacter(value) {
    for (const character of value) {
        const code = character.charCodeAt(0);
        if (code <= 31 || code === 127)
            return true;
    }
    return false;
}
function readClock(clock) {
    const reading = clock();
    if (typeof reading !== 'number' || !Number.isFinite(reading)) {
        throw new TypeError('Rate limiter clock must return a finite number');
    }
    return reading;
}
function validateStoreResult(result, policy, nowMs) {
    if (typeof result !== 'object' || result === null || Array.isArray(result)) {
        throw new TypeError('Rate limit store must return an object');
    }
    if (typeof result.consumed !== 'boolean') {
        throw new TypeError('Rate limit store consumed must be a boolean');
    }
    if (!Number.isSafeInteger(result.count) ||
        result.count < 1 ||
        result.count > policy.max ||
        (!result.consumed && result.count !== policy.max)) {
        throw new TypeError('Rate limit store count is invalid');
    }
    const maximumResetAtMs = nowMs + policy.windowMs;
    if (typeof result.resetAtMs !== 'number' ||
        !Number.isFinite(result.resetAtMs) ||
        result.resetAtMs <= nowMs ||
        result.resetAtMs > maximumResetAtMs) {
        throw new TypeError('Rate limit store reset boundary is invalid');
    }
}
function failOpenDecision(reason, limit) {
    return Object.freeze({
        allowed: true,
        reason,
        limit,
        remaining: null,
        resetAfterMs: null,
        retryAfterMs: null,
    });
}
function rejectedUnavailableDecision(reason, limit) {
    return Object.freeze({
        allowed: false,
        reason,
        limit,
        remaining: null,
        resetAfterMs: null,
        retryAfterMs: null,
    });
}
//# sourceMappingURL=fixed-window-rate-limiter.js.map