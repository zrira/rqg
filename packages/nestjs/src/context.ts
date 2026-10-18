import { createRequestId, type RequestId as CoreRequestId } from '@rqg/core';

import type { NestHttpResponse } from './types.js';

const contextKey = Symbol('rqg.nest-context');

interface NestRequestContext {
  readonly requestId: CoreRequestId;
  observing: boolean;
}

type ContextResponse = NestHttpResponse & {
  [contextKey]?: NestRequestContext;
};

export function getNestRequestId(
  response: NestHttpResponse,
): CoreRequestId | undefined {
  return getContext(response)?.requestId;
}

export function ensureContext(
  response: NestHttpResponse,
  requestId?: CoreRequestId,
): NestRequestContext {
  const existing = getContext(response);
  if (existing !== undefined) return existing;

  const context: NestRequestContext = {
    requestId: requestId ?? createRequestId(),
    observing: false,
  };
  Object.defineProperty(response, contextKey, {
    configurable: false,
    enumerable: false,
    value: context,
    writable: false,
  });
  return context;
}

function getContext(
  response: NestHttpResponse,
): NestRequestContext | undefined {
  return (response as ContextResponse)[contextKey];
}
