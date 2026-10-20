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
import { randomUUID } from 'node:crypto';
import { Global, Inject, Module, RequestMethod, } from '@nestjs/common';
import { APP_GUARD, DiscoveryModule } from '@nestjs/core';
import { RqgRateLimitGuard } from './rate-limit.guard.js';
import { RqgRegistrationValidator } from './registration-validator.js';
import { RqgRateLimitRegistry } from './rate-limit-registry.js';
import { RqgMiddleware } from './rqg.middleware.js';
import { RQG_ASYNC_MODULE_OPTIONS, RQG_MODULE_OPTIONS, RQG_MODULE_REGISTRATION, } from './tokens.js';
let RqgModule = class RqgModule {
    options;
    constructor(options) {
        this.options = options;
    }
    static forRoot(options) {
        validateRootOptions(options);
        return createDynamicModule([
            { provide: RQG_MODULE_OPTIONS, useValue: Object.freeze({ ...options }) },
            { provide: RQG_MODULE_REGISTRATION, useValue: options },
        ]);
    }
    static forRootAsync(options) {
        if (typeof options !== 'object' ||
            options === null ||
            Array.isArray(options)) {
            throw new TypeError('RqgModule async options must be an object');
        }
        if (typeof options.useFactory !== 'function') {
            throw new TypeError('RqgModule async useFactory must be a function');
        }
        return createDynamicModule([
            {
                provide: RQG_ASYNC_MODULE_OPTIONS,
                inject: [...(options.inject ?? [])],
                useFactory: options.useFactory,
            },
            {
                provide: RQG_MODULE_OPTIONS,
                inject: [RQG_ASYNC_MODULE_OPTIONS],
                useFactory: (resolved) => {
                    validateRootOptions(resolved);
                    return Object.freeze({ ...resolved });
                },
            },
            {
                provide: RQG_MODULE_REGISTRATION,
                useValue: options,
            },
        ], options.imports);
    }
    configure(consumer) {
        if ((this.options.requestId === false ||
            this.options.requestId === undefined) &&
            (this.options.observability === false ||
                this.options.observability === undefined)) {
            return;
        }
        consumer
            .apply(RqgMiddleware)
            .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
    }
};
RqgModule = __decorate([
    Global(),
    Module({}),
    __param(0, Inject(RQG_MODULE_OPTIONS)),
    __metadata("design:paramtypes", [Object])
], RqgModule);
export { RqgModule };
function createDynamicModule(optionProviders, imports = []) {
    // Nest hashes dynamic metadata to identify module instances. A unique token
    // prevents distinct registration owners with structurally similar options
    // from being collapsed before startup validation can inspect them.
    const dynamicModuleIdentity = Symbol(`rqg.dynamic-module.${randomUUID()}`);
    return {
        module: RqgModule,
        global: true,
        imports: [DiscoveryModule, ...(imports ?? [])],
        providers: [
            ...(optionProviders ?? []),
            { provide: dynamicModuleIdentity, useValue: true },
            RqgRegistrationValidator,
            RqgMiddleware,
            RqgRateLimitRegistry,
            RqgRateLimitGuard,
            { provide: APP_GUARD, useExisting: RqgRateLimitGuard },
        ],
        exports: [RQG_MODULE_OPTIONS, RqgRateLimitRegistry, RqgRateLimitGuard],
    };
}
function validateRootOptions(options) {
    if (typeof options !== 'object' ||
        options === null ||
        Array.isArray(options)) {
        throw new TypeError('RqgModule options must be an object');
    }
}
//# sourceMappingURL=rqg.module.js.map