import { createRateLimiter, } from '@rqg/core';
const APPLIED_RATE_LIMITERS = Symbol('rqg.appliedRateLimiters');
/** Applies a core rate limiter and translates its decisions into HTTP behavior. */
export function rateLimit(options) {
    validateAdapterOptions(options);
    const limiter = createRateLimiter(options);
    const registration = Object.freeze({});
    return async (request, response, next) => {
        if (!claimRegistration(response, registration)) {
            next();
            return;
        }
        let identity;
        try {
            identity = await options.identity(request);
        }
        catch {
            const allowed = options.failureMode === 'open';
            reportFailure(options, {
                allowed,
                reason: 'identity-resolution-failure',
            });
            if (allowed)
                next();
            else
                sendTerminal(response, 503, 'Service Unavailable');
            return;
        }
        const decision = await limiter.consume(identity);
        handleDecision(decision, response, next, options);
    };
}
function claimRegistration(response, registration) {
    const target = response;
    const registrations = target[APPLIED_RATE_LIMITERS] ??
        (target[APPLIED_RATE_LIMITERS] = new Set());
    if (registrations.has(registration))
        return false;
    registrations.add(registration);
    return true;
}
function validateAdapterOptions(options) {
    if (typeof options !== 'object' ||
        options === null ||
        Array.isArray(options)) {
        throw new TypeError('Rate limit middleware options must be an object');
    }
    if (typeof options.identity !== 'function') {
        throw new TypeError('Rate limit identity must be a function');
    }
    if (options.onFailure !== undefined &&
        typeof options.onFailure !== 'function') {
        throw new TypeError('Rate limit onFailure must be a function');
    }
}
function handleDecision(decision, response, next, options) {
    if (decision.reason === 'within-limit') {
        setRateLimitHeaders(response, decision.limit, decision.remaining, decision.resetAfterMs);
        next();
        return;
    }
    if (decision.reason === 'limit-exceeded') {
        setRateLimitHeaders(response, decision.limit, 0, decision.resetAfterMs);
        response.setHeader('Retry-After', millisecondsToSeconds(decision.retryAfterMs));
        sendTerminal(response, 429, 'Too Many Requests');
        return;
    }
    if (decision.reason === 'store-failure' ||
        decision.reason === 'capacity-exceeded') {
        reportFailure(options, {
            allowed: decision.allowed,
            reason: decision.reason,
        });
        if (decision.allowed)
            next();
        else
            sendTerminal(response, 503, 'Service Unavailable');
        return;
    }
    sendTerminal(response, 400, 'Rate Limit Identity Required');
}
function setRateLimitHeaders(response, limit, remaining, resetAfterMs) {
    response.setHeader('RateLimit-Limit', String(limit));
    response.setHeader('RateLimit-Remaining', String(remaining));
    response.setHeader('RateLimit-Reset', millisecondsToSeconds(resetAfterMs));
}
function millisecondsToSeconds(milliseconds) {
    return String(Math.max(1, Math.ceil(milliseconds / 1_000)));
}
function sendTerminal(response, statusCode, message) {
    if (response.headersSent || response.writableEnded || response.destroyed)
        return;
    response.status(statusCode).type('text/plain').send(message);
}
function reportFailure(options, failure) {
    if (options.onFailure === undefined)
        return;
    try {
        options.onFailure(Object.freeze(failure));
    }
    catch {
        // Failure reporting must not alter the configured availability policy.
    }
}
//# sourceMappingURL=rate-limit.js.map