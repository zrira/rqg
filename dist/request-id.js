import { randomUUID } from 'node:crypto';
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
/** Returns whether a value is a canonical lowercase RFC 4122 UUID v4. */
export function isRequestId(value) {
    return (typeof value === 'string' &&
        value.length === 36 &&
        REQUEST_ID_PATTERN.test(value));
}
/** Generates and validates a new request ID. */
export function createRequestId(generator = randomUUID) {
    if (typeof generator !== 'function') {
        throw new TypeError('Request ID generator must be a function');
    }
    const generated = generator();
    if (!isRequestId(generated)) {
        throw new TypeError('Request ID generator must return a canonical lowercase UUID v4');
    }
    return generated;
}
/**
 * Resolves a request ID at a trust boundary.
 *
 * Incoming values are ignored unless acceptance is explicitly enabled and the
 * value passes strict validation. Otherwise, a fresh ID is generated.
 */
export function resolveRequestId(incomingId, options = {}) {
    assertValidOptions(options);
    if (options.acceptIncoming === true && isRequestId(incomingId)) {
        return incomingId;
    }
    return createRequestId(options.generator);
}
function assertValidOptions(options) {
    if (typeof options !== 'object' ||
        options === null ||
        Array.isArray(options)) {
        throw new TypeError('Request ID options must be an object');
    }
    if (options.acceptIncoming !== undefined &&
        typeof options.acceptIncoming !== 'boolean') {
        throw new TypeError('acceptIncoming must be a boolean');
    }
    if (options.generator !== undefined &&
        typeof options.generator !== 'function') {
        throw new TypeError('Request ID generator must be a function');
    }
}
//# sourceMappingURL=request-id.js.map