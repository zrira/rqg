import { createRequestId } from '@rqg/core';
const contextKey = Symbol('rqg.context');
export function getRequestId(response) {
    return getInternalContext(response)?.requestId;
}
export function ensureContext(response, requestId) {
    const existing = getInternalContext(response);
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
export function getInternalContext(response) {
    return response[contextKey];
}
//# sourceMappingURL=context.js.map