import { rateLimit } from './rate-limit.js';
import { requestId } from './request-id.js';
import { requestObservability, } from './request-observability.js';
/** Composes enabled rqg middleware in ID, observability, rate-limit order. */
export function rqg(options) {
    if (typeof options !== 'object' ||
        options === null ||
        Array.isArray(options)) {
        throw new TypeError('rqg middleware options must be an object');
    }
    const middleware = [];
    if (options.requestId !== undefined && options.requestId !== false) {
        middleware.push(requestId(options.requestId));
    }
    if (options.observability !== undefined && options.observability !== false) {
        middleware.push(requestObservability(options.observability));
    }
    if (options.rateLimit !== undefined && options.rateLimit !== false) {
        middleware.push(rateLimit(options.rateLimit));
    }
    if (middleware.length === 0) {
        middleware.push((request, response, next) => {
            void request;
            void response;
            next();
        });
    }
    return middleware;
}
//# sourceMappingURL=rqg.js.map