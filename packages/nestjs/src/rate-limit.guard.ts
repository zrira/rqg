import type { RateLimitDecision, RateLimitPolicy } from '@rqg/core';
import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { RateLimitMetadata } from './decorators.js';
import { RqgRateLimitRegistry } from './rate-limit-registry.js';
import { RQG_MODULE_OPTIONS, RQG_RATE_LIMIT_METADATA } from './tokens.js';
import type {
  NestHttpRequest,
  NestHttpResponse,
  NestRateLimitFailure,
  RqgModuleOptions,
} from './types.js';

@Injectable()
export class RqgRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly registry: RqgRateLimitRegistry,
    @Inject(RQG_MODULE_OPTIONS) private readonly options: RqgModuleOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const selection = this.selectPolicy(context);
    if (selection === undefined) return true;

    const configuration = this.registry.configuration;
    if (configuration === undefined) {
      throw new Error(
        'RateLimit decorator requires module rateLimit configuration',
      );
    }

    const request = context.switchToHttp().getRequest<NestHttpRequest>();
    const response = context.switchToHttp().getResponse<NestHttpResponse>();
    let identity: unknown;
    try {
      identity = await configuration.identity(request);
    } catch {
      const allowed = configuration.failureMode === 'open';
      reportFailure(configuration.onFailure, {
        allowed,
        reason: 'identity-resolution-failure',
      });
      if (allowed) return true;
      throw new ServiceUnavailableException();
    }

    const decision = await this.registry
      .getLimiter(selection.scope, selection.policy)
      .consume(identity);
    return handleDecision(decision, response, configuration.onFailure);
  }

  private selectPolicy(
    context: ExecutionContext,
  ):
    | { readonly scope: string | object; readonly policy: RateLimitPolicy }
    | undefined {
    const method = this.reflector.get<RateLimitMetadata | undefined>(
      RQG_RATE_LIMIT_METADATA,
      context.getHandler(),
    );
    if (method !== undefined) {
      if (method.kind === 'skip') return undefined;
      return { scope: context.getHandler(), policy: method.policy };
    }

    const controller = this.reflector.get<RateLimitMetadata | undefined>(
      RQG_RATE_LIMIT_METADATA,
      context.getClass(),
    );
    if (controller !== undefined) {
      if (controller.kind === 'skip') return undefined;
      return { scope: context.getClass(), policy: controller.policy };
    }

    const configured = this.options.rateLimit;
    if (
      configured === undefined ||
      configured === false ||
      configured.global === false
    ) {
      return undefined;
    }
    return { scope: 'global', policy: configured };
  }
}

function handleDecision(
  decision: RateLimitDecision,
  response: NestHttpResponse,
  onFailure: ((failure: NestRateLimitFailure) => void) | undefined,
): true {
  if (decision.reason === 'within-limit') {
    setHeaders(
      response,
      decision.limit,
      decision.remaining,
      decision.resetAfterMs,
    );
    return true;
  }

  if (decision.reason === 'limit-exceeded') {
    setHeaders(response, decision.limit, 0, decision.resetAfterMs);
    response.setHeader('Retry-After', toSeconds(decision.retryAfterMs));
    throw new HttpException('Too Many Requests', 429);
  }

  if (
    decision.reason === 'store-failure' ||
    decision.reason === 'capacity-exceeded'
  ) {
    reportFailure(onFailure, {
      allowed: decision.allowed,
      reason: decision.reason,
    });
    if (decision.allowed) return true;
    throw new ServiceUnavailableException();
  }

  throw new BadRequestException('Rate Limit Identity Required');
}

function setHeaders(
  response: NestHttpResponse,
  limit: number,
  remaining: number,
  resetAfterMs: number,
): void {
  response.setHeader('RateLimit-Limit', String(limit));
  response.setHeader('RateLimit-Remaining', String(remaining));
  response.setHeader('RateLimit-Reset', toSeconds(resetAfterMs));
}

function toSeconds(milliseconds: number): string {
  return String(Math.max(1, Math.ceil(milliseconds / 1_000)));
}

function reportFailure(
  callback: ((failure: NestRateLimitFailure) => void) | undefined,
  failure: NestRateLimitFailure,
): void {
  if (callback === undefined) return;
  try {
    callback(Object.freeze(failure));
  } catch {
    // Reporting must not alter the configured failure policy.
  }
}
