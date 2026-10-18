import { createRequestId, type RequestId } from '@rqg/core';
import type { Response } from 'express';

const contextKey = Symbol('rqg.context');

export interface RqgRequestContext {
  readonly requestId: RequestId;
}

export interface InternalRqgContext {
  readonly requestId: RequestId;
  observing: boolean;
}

type ContextResponse = Response & {
  [contextKey]?: InternalRqgContext;
};

export function getRequestId(response: Response): RequestId | undefined {
  return getInternalContext(response)?.requestId;
}

export function ensureContext(
  response: Response,
  requestId?: RequestId,
): InternalRqgContext {
  const existing = getInternalContext(response);
  if (existing !== undefined) return existing;

  const context: InternalRqgContext = {
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

export function getInternalContext(
  response: Response,
): InternalRqgContext | undefined {
  return (response as ContextResponse)[contextKey];
}
