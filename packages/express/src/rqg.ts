import type { RequestHandler } from 'express';

import { rateLimit, type RateLimitMiddlewareOptions } from './rate-limit.js';
import { requestId, type RequestIdMiddlewareOptions } from './request-id.js';
import {
  requestObservability,
  type RequestObservabilityOptions,
} from './request-observability.js';

export interface RqgMiddlewareOptions {
  readonly requestId?: RequestIdMiddlewareOptions | false;
  readonly observability?: RequestObservabilityOptions | false;
  readonly rateLimit?: RateLimitMiddlewareOptions | false;
}

/** Composes enabled rqg middleware in ID, observability, rate-limit order. */
export function rqg(options: RqgMiddlewareOptions): RequestHandler[] {
  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new TypeError('rqg middleware options must be an object');
  }

  const middleware: RequestHandler[] = [];
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
