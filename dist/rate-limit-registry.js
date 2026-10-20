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
import { createRateLimiter, MemoryRateLimitStore, } from '@rqg/core';
import { Inject, Injectable } from '@nestjs/common';
import { RQG_MODULE_OPTIONS } from './tokens.js';
let RqgRateLimitRegistry = class RqgRateLimitRegistry {
    #configuration;
    #store;
    #limiters = new Map();
    #scopeIds = new WeakMap();
    #nextScopeId = 1;
    constructor(options) {
        const configured = options.rateLimit;
        if (configured === undefined || configured === false)
            return;
        if (typeof configured.identity !== 'function') {
            throw new TypeError('NestJS rate limit identity must be a function');
        }
        if (configured.onFailure !== undefined &&
            typeof configured.onFailure !== 'function') {
            throw new TypeError('NestJS rate limit onFailure must be a function');
        }
        if (configured.global !== undefined &&
            typeof configured.global !== 'boolean') {
            throw new TypeError('NestJS rate limit global must be a boolean');
        }
        this.#store = configured.store ?? new MemoryRateLimitStore();
        this.#configuration = configured;
        this.getLimiter('configuration', configured);
    }
    get configuration() {
        return this.#configuration;
    }
    getLimiter(scope, policy) {
        const configuration = this.#configuration;
        const store = this.#store;
        if (configuration === undefined || store === undefined) {
            throw new Error('Rqg rate limiting is not configured');
        }
        const scopeKey = typeof scope === 'string' ? scope : `object:${this.#getScopeId(scope)}`;
        const key = `${scopeKey}:${policy.max}:${policy.windowMs}`;
        const existing = this.#limiters.get(key);
        if (existing !== undefined)
            return existing;
        const scopedStore = new NamespacedStore(store, key);
        const limiter = createRateLimiter({
            max: policy.max,
            windowMs: policy.windowMs,
            store: scopedStore,
            ...(configuration.clock === undefined
                ? {}
                : { clock: configuration.clock }),
            ...(configuration.missingIdentity === undefined
                ? {}
                : { missingIdentity: configuration.missingIdentity }),
            ...(configuration.failureMode === undefined
                ? {}
                : { failureMode: configuration.failureMode }),
        });
        this.#limiters.set(key, limiter);
        return limiter;
    }
    #getScopeId(scope) {
        const existing = this.#scopeIds.get(scope);
        if (existing !== undefined)
            return existing;
        const id = this.#nextScopeId;
        this.#nextScopeId += 1;
        this.#scopeIds.set(scope, id);
        return id;
    }
};
RqgRateLimitRegistry = __decorate([
    Injectable(),
    __param(0, Inject(RQG_MODULE_OPTIONS)),
    __metadata("design:paramtypes", [Object])
], RqgRateLimitRegistry);
export { RqgRateLimitRegistry };
class NamespacedStore {
    store;
    namespace;
    constructor(store, namespace) {
        this.store = store;
        this.namespace = namespace;
    }
    consume(key, policy, nowMs) {
        return this.store.consume(`${this.namespace.length}:${this.namespace}:${key.length}:${key}`, policy, nowMs);
    }
}
//# sourceMappingURL=rate-limit-registry.js.map