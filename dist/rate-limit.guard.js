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
import { BadRequestException, HttpException, Inject, Injectable, ServiceUnavailableException, } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { assertSingleRegistration, claimRateLimitRegistration, } from './context.js';
import { RqgRateLimitRegistry } from './rate-limit-registry.js';
import { RQG_MODULE_OPTIONS, RQG_MODULE_REGISTRATION, RQG_RATE_LIMIT_METADATA, } from './tokens.js';
let RqgRateLimitGuard = class RqgRateLimitGuard {
    reflector;
    registry;
    options;
    registration;
    constructor(reflector, registry, options, registration) {
        this.reflector = reflector;
        this.registry = registry;
        this.options = options;
        this.registration = registration;
    }
    async canActivate(context) {
        const response = context.switchToHttp().getResponse();
        assertSingleRegistration(response, this.registration);
        if (!claimRateLimitRegistration(response, this.registration))
            return true;
        const selection = this.selectPolicy(context);
        if (selection === undefined)
            return true;
        const configuration = this.registry.configuration;
        if (configuration === undefined) {
            throw new Error('RateLimit decorator requires module rateLimit configuration');
        }
        const request = context.switchToHttp().getRequest();
        let identity;
        try {
            identity = await configuration.identity(request);
        }
        catch {
            const allowed = configuration.failureMode === 'open';
            reportFailure(configuration.onFailure, {
                allowed,
                reason: 'identity-resolution-failure',
            });
            if (allowed)
                return true;
            throw new ServiceUnavailableException();
        }
        const decision = await this.registry
            .getLimiter(selection.scope, selection.policy)
            .consume(identity);
        return handleDecision(decision, response, configuration.onFailure);
    }
    selectPolicy(context) {
        const method = this.reflector.get(RQG_RATE_LIMIT_METADATA, context.getHandler());
        if (method !== undefined) {
            if (method.kind === 'skip')
                return undefined;
            return { scope: context.getHandler(), policy: method.policy };
        }
        const controller = this.reflector.get(RQG_RATE_LIMIT_METADATA, context.getClass());
        if (controller !== undefined) {
            if (controller.kind === 'skip')
                return undefined;
            return { scope: context.getClass(), policy: controller.policy };
        }
        const configured = this.options.rateLimit;
        if (configured === undefined ||
            configured === false ||
            configured.global === false) {
            return undefined;
        }
        return { scope: 'global', policy: configured };
    }
};
RqgRateLimitGuard = __decorate([
    Injectable(),
    __param(2, Inject(RQG_MODULE_OPTIONS)),
    __param(3, Inject(RQG_MODULE_REGISTRATION)),
    __metadata("design:paramtypes", [Reflector,
        RqgRateLimitRegistry, Object, Object])
], RqgRateLimitGuard);
export { RqgRateLimitGuard };
function handleDecision(decision, response, onFailure) {
    if (decision.reason === 'within-limit') {
        setHeaders(response, decision.limit, decision.remaining, decision.resetAfterMs);
        return true;
    }
    if (decision.reason === 'limit-exceeded') {
        setHeaders(response, decision.limit, 0, decision.resetAfterMs);
        response.setHeader('Retry-After', toSeconds(decision.retryAfterMs));
        throw new HttpException('Too Many Requests', 429);
    }
    if (decision.reason === 'store-failure' ||
        decision.reason === 'capacity-exceeded') {
        reportFailure(onFailure, {
            allowed: decision.allowed,
            reason: decision.reason,
        });
        if (decision.allowed)
            return true;
        throw new ServiceUnavailableException();
    }
    throw new BadRequestException('Rate Limit Identity Required');
}
function setHeaders(response, limit, remaining, resetAfterMs) {
    response.setHeader('RateLimit-Limit', String(limit));
    response.setHeader('RateLimit-Remaining', String(remaining));
    response.setHeader('RateLimit-Reset', toSeconds(resetAfterMs));
}
function toSeconds(milliseconds) {
    return String(Math.max(1, Math.ceil(milliseconds / 1_000)));
}
function reportFailure(callback, failure) {
    if (callback === undefined)
        return;
    try {
        callback(Object.freeze(failure));
    }
    catch {
        // Reporting must not alter the configured failure policy.
    }
}
//# sourceMappingURL=rate-limit.guard.js.map