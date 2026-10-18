import {
  createRateLimiter,
  MemoryRateLimitStore,
  type RateLimiter,
  type RateLimitPolicy,
  type RateLimitStore,
} from '@rqg/core';
import { Inject, Injectable } from '@nestjs/common';

import { RQG_MODULE_OPTIONS } from './tokens.js';
import type { NestRateLimitOptions, RqgModuleOptions } from './types.js';

@Injectable()
export class RqgRateLimitRegistry {
  readonly #configuration: NestRateLimitOptions | undefined;
  readonly #store: RateLimitStore | undefined;
  readonly #limiters = new Map<string, RateLimiter>();

  constructor(@Inject(RQG_MODULE_OPTIONS) options: RqgModuleOptions) {
    const configured = options.rateLimit;
    if (configured === undefined || configured === false) return;
    if (typeof configured.identity !== 'function') {
      throw new TypeError('NestJS rate limit identity must be a function');
    }
    if (
      configured.onFailure !== undefined &&
      typeof configured.onFailure !== 'function'
    ) {
      throw new TypeError('NestJS rate limit onFailure must be a function');
    }
    if (
      configured.global !== undefined &&
      typeof configured.global !== 'boolean'
    ) {
      throw new TypeError('NestJS rate limit global must be a boolean');
    }

    this.#store = configured.store ?? new MemoryRateLimitStore();
    this.#configuration = configured;
    this.getLimiter('configuration', configured);
  }

  get configuration(): NestRateLimitOptions | undefined {
    return this.#configuration;
  }

  getLimiter(scope: string, policy: RateLimitPolicy): RateLimiter {
    const configuration = this.#configuration;
    const store = this.#store;
    if (configuration === undefined || store === undefined) {
      throw new Error('Rqg rate limiting is not configured');
    }

    const key = `${scope}:${policy.max}:${policy.windowMs}`;
    const existing = this.#limiters.get(key);
    if (existing !== undefined) return existing;

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
}

class NamespacedStore implements RateLimitStore {
  constructor(
    private readonly store: RateLimitStore,
    private readonly namespace: string,
  ) {}

  consume(
    key: string,
    policy: RateLimitPolicy,
    nowMs: number,
  ): ReturnType<RateLimitStore['consume']> {
    return this.store.consume(`${this.namespace}:${key}`, policy, nowMs);
  }
}
