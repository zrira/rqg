import { createRequestId, type RequestId as CoreRequestId } from '@rqg/core';

import type { NestHttpResponse } from './types.js';

const contextKey = Symbol('rqg.nest-context');
const registrationKey = Symbol('rqg.nest-registration');

interface NestRequestContext {
  readonly requestId: CoreRequestId;
  observing: boolean;
}

type ContextResponse = NestHttpResponse & {
  [contextKey]?: NestRequestContext;
  [registrationKey]?: object;
};

export function assertSingleRegistration(
  response: NestHttpResponse,
  registration: object,
): void {
  const target = response as ContextResponse;
  const existing = target[registrationKey];
  if (existing !== undefined && existing !== registration) {
    throw new Error('RqgModule must be registered exactly once');
  }
  if (existing === undefined) {
    Object.defineProperty(target, registrationKey, {
      configurable: false,
      enumerable: false,
      value: registration,
      writable: false,
    });
  }
}

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
