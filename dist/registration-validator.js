var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { RQG_MODULE_REGISTRATION } from './tokens.js';
/** Validates application-local dynamic module ownership after DI resolves. */
let RqgRegistrationValidator = class RqgRegistrationValidator {
    discovery;
    constructor(discovery) {
        this.discovery = discovery;
    }
    onApplicationBootstrap() {
        const registrations = new Set();
        for (const provider of this.discovery.getProviders()) {
            if (provider.token !== RQG_MODULE_REGISTRATION)
                continue;
            const registration = provider.instance;
            if ((typeof registration !== 'object' &&
                typeof registration !== 'function') ||
                registration === null) {
                throw new Error('RqgModule registration identity is unavailable');
            }
            registrations.add(registration);
            if (registrations.size > 1) {
                throw new Error('Conflicting RqgModule root registrations detected; register exactly one configuration owner');
            }
        }
    }
};
RqgRegistrationValidator = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DiscoveryService])
], RqgRegistrationValidator);
export { RqgRegistrationValidator };
//# sourceMappingURL=registration-validator.js.map