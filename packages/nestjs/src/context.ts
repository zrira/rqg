import { createRequestId, type RequestId as CoreRequestId } from '@rqg/core';

import type { NestHttpResponse } from './types.js';

const contextKey = Symbol('rqg.nest-context');
const registrationKey = Symbol('rqg.nest-registration');
const rateLimitRegistrationsKey = Symbol('rqg.nest-rate-limit-registrations');

interface NestRequestContext {
  readonly requestId: CoreRequestId;
  observing: boolean;
}

type ContextResponse = NestHttpResponse & {
  [contextKey]?: NestRequestContext;
  [registrationKey]?: object;
  [rateLimitRegistrationsKey]?: Set<object>;
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

export function claimRateLimitRegistration(
  response: NestHttpResponse,
  registration: object,
): boolean {
  const target = response as ContextResponse;
  const registrations =
    target[rateLimitRegistrationsKey] ??
    (target[rateLimitRegistrationsKey] = new Set());
  if (registrations.has(registration)) return false;
  registrations.add(registration);
  return true;
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
