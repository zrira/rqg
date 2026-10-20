import { createRequestObserver, createTimer, } from '@rqg/core';
import { ensureContext } from './context.js';
/** Observes one Express request lifecycle and emits at most one core record. */
export function requestObservability(options) {
    const configuration = validateOptions(options);
    return (request, response, next) => {
        const context = ensureContext(response);
        if (context.observing) {
            next();
            return;
        }
        context.observing = true;
        const timer = configuration.clock === undefined
            ? createTimer()
            : createTimer({ clock: configuration.clock });
        let settled = false;
        const cleanup = () => {
            response.removeListener('finish', onFinish);
            response.removeListener('close', onClose);
            response.removeListener('error', onResponseError);
            request.removeListener('aborted', onAborted);
            request.removeListener('error', onRequestError);
        };
        const settle = (outcome) => {
            if (settled)
                return;
            settled = true;
            cleanup();
            try {
                const durationMs = timer.stop();
                let clockReads = 0;
                const observer = createRequestObserver({
                    requestId: context.requestId,
                    method: request.method,
                    path: safeRoutePath(request),
                }, {
                    logger: configuration.logger,
                    clock: () => {
                        clockReads += 1;
                        return clockReads === 1 ? 0 : durationMs;
                    },
                });
                const completion = observer.complete({
                    outcome,
                    statusCode: completionStatus(response, outcome),
                });
                void completion.then(({ logResult }) => {
                    if (!logResult.ok)
                        reportError(configuration, logResult.error);
                }, (error) => reportError(configuration, error));
            }
            catch (error) {
                reportError(configuration, error);
            }
        };
        function onFinish() {
            settle('completed');
        }
        function onClose() {
            settle('aborted');
        }
        function onAborted() {
            settle('aborted');
        }
        function onRequestError() {
            settle('failed');
        }
        function onResponseError() {
            settle('failed');
        }
        response.once('finish', onFinish);
        response.once('close', onClose);
        response.once('error', onResponseError);
        request.once('aborted', onAborted);
        request.once('error', onRequestError);
        next();
    };
}
function validateOptions(options) {
    if (typeof options !== 'object' ||
        options === null ||
        Array.isArray(options)) {
        throw new TypeError('Request observability options must be an object');
    }
    if ((typeof options.logger !== 'object' &&
        typeof options.logger !== 'function') ||
        options.logger === null ||
        typeof options.logger.log !== 'function') {
        throw new TypeError('Request observability logger must provide log');
    }
    if (options.clock !== undefined && typeof options.clock !== 'function') {
        throw new TypeError('Request observability clock must be a function');
    }
    if (options.onError !== undefined && typeof options.onError !== 'function') {
        throw new TypeError('Request observability onError must be a function');
    }
    return Object.freeze({ ...options });
}
function safeRoutePath(request) {
    const route = request.route;
    if (typeof route !== 'object' || route === null || Array.isArray(route)) {
        return '<unmatched>';
    }
    const descriptor = Object.getOwnPropertyDescriptor(route, 'path');
    const path = descriptor?.value;
    return typeof path === 'string' && isSafePath(path) ? path : '<route>';
}
function isSafePath(path) {
    if (path.length === 0)
        return false;
    for (const character of path) {
        const code = character.charCodeAt(0);
        if (character === '?' || character === '#' || code <= 31 || code === 127) {
            return false;
        }
    }
    return true;
}
function completionStatus(response, outcome) {
    const statusCode = response.statusCode;
    const valid = Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599;
    if (outcome === 'completed')
        return valid ? statusCode : 500;
    return response.headersSent && valid ? statusCode : null;
}
function reportError(options, error) {
    if (options.onError === undefined)
        return;
    try {
        options.onError(error);
    }
    catch {
        // Error reporting must not create a recursive request failure.
    }
}
//# sourceMappingURL=request-observability.js.map