import {
  type DynamicModule,
  Global,
  Inject,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD, DiscoveryModule } from '@nestjs/core';

import { RqgRateLimitGuard } from './rate-limit.guard.js';
import { RqgRegistrationValidator } from './registration-validator.js';
import { RqgRateLimitRegistry } from './rate-limit-registry.js';
import { RqgMiddleware } from './rqg.middleware.js';
import {
  RQG_ASYNC_MODULE_OPTIONS,
  RQG_MODULE_OPTIONS,
  RQG_MODULE_REGISTRATION,
} from './tokens.js';
import type { RqgModuleAsyncOptions, RqgModuleOptions } from './types.js';

@Global()
@Module({})
export class RqgModule implements NestModule {
  constructor(
    @Inject(RQG_MODULE_OPTIONS) private readonly options: RqgModuleOptions,
  ) {}

  static forRoot(options: RqgModuleOptions): DynamicModule {
    validateRootOptions(options);
    return createDynamicModule([
      { provide: RQG_MODULE_OPTIONS, useValue: Object.freeze({ ...options }) },
      { provide: RQG_MODULE_REGISTRATION, useValue: options },
    ]);
  }

  static forRootAsync<TDependencies extends readonly unknown[]>(
    options: RqgModuleAsyncOptions<TDependencies>,
  ): DynamicModule {
    if (
      typeof options !== 'object' ||
      options === null ||
      Array.isArray(options)
    ) {
      throw new TypeError('RqgModule async options must be an object');
    }
    if (typeof options.useFactory !== 'function') {
      throw new TypeError('RqgModule async useFactory must be a function');
    }

    return createDynamicModule(
      [
        {
          provide: RQG_ASYNC_MODULE_OPTIONS,
          inject: [...(options.inject ?? [])],
          useFactory: options.useFactory,
        },
        {
          provide: RQG_MODULE_OPTIONS,
          inject: [RQG_ASYNC_MODULE_OPTIONS],
          useFactory: (resolved: RqgModuleOptions) => {
            validateRootOptions(resolved);
            return Object.freeze({ ...resolved });
          },
        },
        {
          provide: RQG_MODULE_REGISTRATION,
          useValue: options,
        },
      ],
      options.imports,
    );
  }

  configure(consumer: MiddlewareConsumer): void {
    if (
      (this.options.requestId === false ||
        this.options.requestId === undefined) &&
      (this.options.observability === false ||
        this.options.observability === undefined)
    ) {
      return;
    }
    consumer
      .apply(RqgMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}

function createDynamicModule(
  optionProviders: DynamicModule['providers'],
  imports: DynamicModule['imports'] = [],
): DynamicModule {
  return {
    module: RqgModule,
    global: true,
    imports: [DiscoveryModule, ...(imports ?? [])],
    providers: [
      ...(optionProviders ?? []),
      RqgRegistrationValidator,
      RqgMiddleware,
      RqgRateLimitRegistry,
      RqgRateLimitGuard,
      { provide: APP_GUARD, useExisting: RqgRateLimitGuard },
    ],
    exports: [RQG_MODULE_OPTIONS, RqgRateLimitRegistry, RqgRateLimitGuard],
  };
}

function validateRootOptions(options: RqgModuleOptions): void {
  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new TypeError('RqgModule options must be an object');
  }
}
