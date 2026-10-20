import { createRequestId } from '@rqg/core';
const contextKey = Symbol('rqg.nest-context');
const registrationKey = Symbol('rqg.nest-registration');
const rateLimitRegistrationsKey = Symbol('rqg.nest-rate-limit-registrations');
export function assertSingleRegistration(response, registration) {
    const target = response;
    const existing = target[registrationKey];
    if (existing !== undefined && existing !== registration) {
        throw new Error('RqgModule must be registered exactly once');
    }
    if (existing === undefined) {
        Object.defineProperty(target, registrationKey, {
            configurable: false,
            enumerable: false,
            value: registration,
            writable: false,
        });
    }
}
export function claimRateLimitRegistration(response, registration) {
    const target = response;
    const registrations = target[rateLimitRegistrationsKey] ??
        (target[rateLimitRegistrationsKey] = new Set());
    if (registrations.has(registration))
        return false;
    registrations.add(registration);
    return true;
}
export function getNestRequestId(response) {
    return getContext(response)?.requestId;
}
export function ensureContext(response, requestId) {
    const existing = getContext(response);
    if (existing !== undefined)
        return existing;
    const context = {
        requestId: requestId ?? createRequestId(),
        observing: false,
    };
    Object.defineProperty(response, contextKey, {
        configurable: false,
        enumerable: false,
        value: context,
        writable: false,
    });
    return context;
}
function getContext(response) {
    return response[contextKey];
}
//# sourceMappingURL=context.js.map