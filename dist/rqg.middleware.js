var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { validateHeaderName } from 'node:http';
import { createRequestObserver, createTimer, resolveRequestId, } from '@rqg/core';
import { Inject, Injectable } from '@nestjs/common';
import { assertSingleRegistration, ensureContext, getNestRequestId, } from './context.js';
import { RQG_MODULE_OPTIONS, RQG_MODULE_REGISTRATION } from './tokens.js';
let RqgMiddleware = class RqgMiddleware {
    registration;
    #requestId;
    #observability;
    constructor(options, registration) {
        this.registration = registration;
        this.#requestId = validateRequestId(options.requestId);
        this.#observability = validateObservability(options.observability);
    }
    use(request, response, next) {
        assertSingleRegistration(response, this.registration);
        const requestIdOptions = this.#requestId;
        const existingRequestId = getNestRequestId(response);
        const context = requestIdOptions !== undefined && existingRequestId === undefined
            ? ensureContext(response, resolveRequestId(readSingleHeader(request, requestIdOptions.headerName), {
                acceptIncoming: requestIdOptions.acceptIncoming,
                ...(requestIdOptions.generator === undefined
                    ? {}
                    : { generator: requestIdOptions.generator }),
            }))
            : ensureContext(response, existingRequestId);
        if (requestIdOptions !== undefined) {
            response.setHeader(requestIdOptions.headerName, context.requestId);
        }
        if (this.#observability !== undefined && !context.observing) {
            context.observing = true;
            observe(request, response, context.requestId, this.#observability);
        }
        next();
    }
};
RqgMiddleware = __decorate([
    Injectable(),
    __param(0, Inject(RQG_MODULE_OPTIONS)),
    __param(1, Inject(RQG_MODULE_REGISTRATION)),
    __metadata("design:paramtypes", [Object, Object])
], RqgMiddleware);
export { RqgMiddleware };
function validateRequestId(options) {
    if (options === false || options === undefined)
        return undefined;
    if (typeof options !== 'object' ||
        options === null ||
        Array.isArray(options)) {
        throw new TypeError('NestJS requestId options must be an object');
    }
    const headerName = options.headerName ?? 'x-request-id';
    if (typeof headerName !== 'string') {
        throw new TypeError('NestJS request ID headerName must be a string');
    }
    validateHeaderName(headerName);
    const acceptIncoming = options.acceptIncoming ?? false;
    if (typeof acceptIncoming !== 'boolean') {
        throw new TypeError('NestJS request ID acceptIncoming must be a boolean');
    }
    if (options.generator !== undefined &&
        typeof options.generator !== 'function') {
        throw new TypeError('NestJS request ID generator must be a function');
    }
    return Object.freeze({ ...options, headerName, acceptIncoming });
}
function validateObservability(options) {
    if (options === false || options === undefined)
        return undefined;
    if (typeof options !== 'object' ||
        options === null ||
        Array.isArray(options) ||
        (typeof options.logger !== 'object' &&
            typeof options.logger !== 'function') ||
        options.logger === null ||
        typeof options.logger.log !== 'function') {
        throw new TypeError('NestJS observability requires a logger');
    }
    if (options.clock !== undefined && typeof options.clock !== 'function') {
        throw new TypeError('NestJS observability clock must be a function');
    }
    if (options.onError !== undefined && typeof options.onError !== 'function') {
        throw new TypeError('NestJS observability onError must be a function');
    }
    return Object.freeze({ ...options });
}
function readSingleHeader(request, headerName) {
    let value;
    let matches = 0;
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
        if (request.rawHeaders[index]?.toLowerCase() !== headerName.toLowerCase()) {
            continue;
        }
        matches += 1;
        value = request.rawHeaders[index + 1];
        if (matches > 1)
            return undefined;
    }
    return value;
}
function observe(request, response, requestId, options) {
    const timer = options.clock === undefined
        ? createTimer()
        : createTimer({ clock: options.clock });
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
            let reads = 0;
            const observer = createRequestObserver({
                requestId,
                method: request.method ?? 'UNKNOWN',
                path: safeRoutePath(request),
            }, {
                logger: options.logger,
                clock: () => (++reads === 1 ? 0 : durationMs),
            });
            void observer
                .complete({
                outcome,
                statusCode: completionStatus(response, outcome),
            })
                .then(({ logResult }) => {
                if (!logResult.ok)
                    reportObservationError(options, logResult.error);
            }, (error) => reportObservationError(options, error));
        }
        catch (error) {
            reportObservationError(options, error);
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
}
function safeRoutePath(request) {
    const route = request.route;
    if (typeof route !== 'object' || route === null || Array.isArray(route)) {
        return '<unmatched>';
    }
    const path = Object.getOwnPropertyDescriptor(route, 'path')?.value;
    if (path === '/{*path}')
        return '<unmatched>';
    if (typeof path !== 'string' || path.length === 0)
        return '<route>';
    for (const character of path) {
        const code = character.charCodeAt(0);
        if (character === '?' || character === '#' || code <= 31 || code === 127) {
            return '<route>';
        }
    }
    return path;
}
function completionStatus(response, outcome) {
    const status = response.statusCode;
    const valid = Number.isInteger(status) && status >= 100 && status <= 599;
    if (outcome === 'completed')
        return valid ? status : 500;
    return response.headersSent && valid ? status : null;
}
function reportObservationError(options, error) {
    if (options.onError === undefined)
        return;
    try {
        options.onError(error);
    }
    catch {
        /* prevent recursive failure */
    }
}
//# sourceMappingURL=rqg.middleware.js.map