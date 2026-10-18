import {
  createRateLimiter,
  type CreateRateLimiterOptions,
  type RateLimitDecision,
  type RateLimitFailureReason,
} from '@rqg/core';
import type { Request, RequestHandler, Response } from 'express';

export type ExpressRateLimitIdentity = string | null | undefined;

export type ExpressIdentityResolver = (
  request: Request,
) => ExpressRateLimitIdentity | Promise<ExpressRateLimitIdentity>;

export type ExpressRateLimitFailureReason =
  RateLimitFailureReason | 'identity-resolution-failure';

export interface ExpressRateLimitFailure {
  readonly allowed: boolean;
  readonly reason: ExpressRateLimitFailureReason;
}

export interface RateLimitMiddlewareOptions extends CreateRateLimiterOptions {
  readonly identity: ExpressIdentityResolver;
  /** Observes operational failures without receiving identities or store errors. */
  readonly onFailure?: (failure: ExpressRateLimitFailure) => void;
}

/** Applies a core rate limiter and translates its decisions into HTTP behavior. */
export function rateLimit(options: RateLimitMiddlewareOptions): RequestHandler {
  validateAdapterOptions(options);
  const limiter = createRateLimiter(options);

  return async (request, response, next): Promise<void> => {
    let identity: unknown;
    try {
      identity = await options.identity(request);
    } catch {
      const allowed = options.failureMode === 'open';
      reportFailure(options, {
        allowed,
        reason: 'identity-resolution-failure',
      });
      if (allowed) next();
      else sendTerminal(response, 503, 'Service Unavailable');
      return;
    }

    const decision = await limiter.consume(identity);
    handleDecision(decision, response, next, options);
  };
}

function validateAdapterOptions(options: RateLimitMiddlewareOptions): void {
  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new TypeError('Rate limit middleware options must be an object');
  }

  if (typeof options.identity !== 'function') {
    throw new TypeError('Rate limit identity must be a function');
  }

  if (
    options.onFailure !== undefined &&
    typeof options.onFailure !== 'function'
  ) {
    throw new TypeError('Rate limit onFailure must be a function');
  }
}

function handleDecision(
  decision: RateLimitDecision,
  response: Response,
  next: () => void,
  options: RateLimitMiddlewareOptions,
): void {
  if (decision.reason === 'within-limit') {
    setRateLimitHeaders(
      response,
      decision.limit,
      decision.remaining,
      decision.resetAfterMs,
    );
    next();
    return;
  }

  if (decision.reason === 'limit-exceeded') {
    setRateLimitHeaders(response, decision.limit, 0, decision.resetAfterMs);
    response.setHeader(
      'Retry-After',
      millisecondsToSeconds(decision.retryAfterMs),
    );
    sendTerminal(response, 429, 'Too Many Requests');
    return;
  }

  if (
    decision.reason === 'store-failure' ||
    decision.reason === 'capacity-exceeded'
  ) {
    reportFailure(options, {
      allowed: decision.allowed,
      reason: decision.reason,
    });
    if (decision.allowed) next();
    else sendTerminal(response, 503, 'Service Unavailable');
    return;
  }

  sendTerminal(response, 400, 'Rate Limit Identity Required');
}

function setRateLimitHeaders(
  response: Response,
  limit: number,
  remaining: number,
  resetAfterMs: number,
): void {
  response.setHeader('RateLimit-Limit', String(limit));
  response.setHeader('RateLimit-Remaining', String(remaining));
  response.setHeader('RateLimit-Reset', millisecondsToSeconds(resetAfterMs));
}

function millisecondsToSeconds(milliseconds: number): string {
  return String(Math.max(1, Math.ceil(milliseconds / 1_000)));
}

function sendTerminal(
  response: Response,
  statusCode: number,
  message: string,
): void {
  if (response.headersSent || response.writableEnded || response.destroyed)
    return;
  response.status(statusCode).type('text/plain').send(message);
}

function reportFailure(
  options: RateLimitMiddlewareOptions,
  failure: ExpressRateLimitFailure,
): void {
  if (options.onFailure === undefined) return;
  try {
    options.onFailure(Object.freeze(failure));
  } catch {
    // Failure reporting must not alter the configured availability policy.
  }
}
