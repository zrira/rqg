import type { RateLimitPolicy, RequestId as CoreRequestId } from '@rqg/core';
import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';

import { getNestRequestId } from './context.js';
import { RQG_RATE_LIMIT_METADATA } from './tokens.js';
import type { NestHttpResponse } from './types.js';

export type RateLimitMetadata =
  | { readonly kind: 'policy'; readonly policy: RateLimitPolicy }
  | { readonly kind: 'skip' };

export function RateLimit(
  policy: RateLimitPolicy,
): MethodDecorator & ClassDecorator {
  assertPolicy(policy);
  return SetMetadata(
    RQG_RATE_LIMIT_METADATA,
    Object.freeze({
      kind: 'policy',
      policy: Object.freeze({ max: policy.max, windowMs: policy.windowMs }),
    } satisfies RateLimitMetadata),
  );
}

export function SkipRateLimit(): MethodDecorator & ClassDecorator {
  return SetMetadata(
    RQG_RATE_LIMIT_METADATA,
    Object.freeze({ kind: 'skip' } satisfies RateLimitMetadata),
  );
}

export const RequestId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CoreRequestId | undefined =>
    getNestRequestId(context.switchToHttp().getResponse<NestHttpResponse>()),
);

function assertPolicy(policy: RateLimitPolicy): void {
  if (
    typeof policy !== 'object' ||
    policy === null ||
    Array.isArray(policy) ||
    !Number.isSafeInteger(policy.max) ||
    policy.max <= 0 ||
    typeof policy.windowMs !== 'number' ||
    !Number.isFinite(policy.windowMs) ||
    policy.windowMs <= 0
  ) {
    throw new TypeError('RateLimit requires a valid max and windowMs');
  }
}
