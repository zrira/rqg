import { validateHeaderName } from 'node:http';

import {
  createRequestObserver,
  createTimer,
  resolveRequestId,
  type RequestOutcome,
} from '@rqg/core';
import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';

import { ensureContext, getNestRequestId } from './context.js';
import { RQG_MODULE_OPTIONS } from './tokens.js';
import type {
  NestHttpRequest,
  NestHttpResponse,
  NestObservabilityOptions,
  NestRequestIdOptions,
  RqgModuleOptions,
} from './types.js';

@Injectable()
export class RqgMiddleware implements NestMiddleware {
  readonly #requestId: ValidatedRequestIdOptions | undefined;
  readonly #observability: NestObservabilityOptions | undefined;

  constructor(@Inject(RQG_MODULE_OPTIONS) options: RqgModuleOptions) {
    this.#requestId = validateRequestId(options.requestId);
    this.#observability = validateObservability(options.observability);
  }

  use(
    request: NestHttpRequest,
    response: NestHttpResponse,
    next: () => void,
  ): void {
    const requestIdOptions = this.#requestId;
    const existingRequestId = getNestRequestId(response);
    const context =
      requestIdOptions !== undefined && existingRequestId === undefined
        ? ensureContext(
            response,
            resolveRequestId(
              readSingleHeader(request, requestIdOptions.headerName),
              {
                acceptIncoming: requestIdOptions.acceptIncoming,
                ...(requestIdOptions.generator === undefined
                  ? {}
                  : { generator: requestIdOptions.generator }),
              },
            ),
          )
        : ensureContext(response, existingRequestId);
    if (requestIdOptions !== undefined) {
      response.setHeader(requestIdOptions.headerName, context.requestId);
    }

    if (this.#observability !== undefined && !context.observing) {
      context.observing = true;
      observe(request, response, context.requestId, this.#observability);
    }
    next();
  }
}

interface ValidatedRequestIdOptions extends NestRequestIdOptions {
  readonly headerName: string;
  readonly acceptIncoming: boolean;
}

function validateRequestId(
  options: NestRequestIdOptions | false | undefined,
): ValidatedRequestIdOptions | undefined {
  if (options === false || options === undefined) return undefined;
  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new TypeError('NestJS requestId options must be an object');
  }
  const headerName = options.headerName ?? 'x-request-id';
  if (typeof headerName !== 'string') {
    throw new TypeError('NestJS request ID headerName must be a string');
  }
  validateHeaderName(headerName);
  const acceptIncoming = options.acceptIncoming ?? false;
  if (typeof acceptIncoming !== 'boolean') {
    throw new TypeError('NestJS request ID acceptIncoming must be a boolean');
  }
  if (
    options.generator !== undefined &&
    typeof options.generator !== 'function'
  ) {
    throw new TypeError('NestJS request ID generator must be a function');
  }
  return Object.freeze({ ...options, headerName, acceptIncoming });
}

function validateObservability(
  options: NestObservabilityOptions | false | undefined,
): NestObservabilityOptions | undefined {
  if (options === false || options === undefined) return undefined;
  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options) ||
    (typeof options.logger !== 'object' &&
      typeof options.logger !== 'function') ||
    options.logger === null ||
    typeof options.logger.log !== 'function'
  ) {
    throw new TypeError('NestJS observability requires a logger');
  }
  if (options.clock !== undefined && typeof options.clock !== 'function') {
    throw new TypeError('NestJS observability clock must be a function');
  }
  if (options.onError !== undefined && typeof options.onError !== 'function') {
    throw new TypeError('NestJS observability onError must be a function');
  }
  return Object.freeze({ ...options });
}

function readSingleHeader(
  request: NestHttpRequest,
  headerName: string,
): unknown {
  let value: string | undefined;
  let matches = 0;
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() !== headerName.toLowerCase()) {
      continue;
    }
    matches += 1;
    value = request.rawHeaders[index + 1];
    if (matches > 1) return undefined;
  }
  return value;
}

function observe(
  request: NestHttpRequest,
  response: NestHttpResponse,
  requestId: NonNullable<ReturnType<typeof getNestRequestId>>,
  options: NestObservabilityOptions,
): void {
  const timer =
    options.clock === undefined
      ? createTimer()
      : createTimer({ clock: options.clock });
  let settled = false;

  const cleanup = (): void => {
    response.removeListener('finish', onFinish);
    response.removeListener('close', onClose);
    response.removeListener('error', onResponseError);
    request.removeListener('aborted', onAborted);
    request.removeListener('error', onRequestError);
  };
  const settle = (outcome: RequestOutcome): void => {
    if (settled) return;
    settled = true;
    cleanup();
    try {
      const durationMs = timer.stop();
      let reads = 0;
      const observer = createRequestObserver(
        {
          requestId,
          method: request.method ?? 'UNKNOWN',
          path: safeRoutePath(request),
        },
        {
          logger: options.logger,
          clock: () => (++reads === 1 ? 0 : durationMs),
        },
      );
      void observer
        .complete({
          outcome,
          statusCode: completionStatus(response, outcome),
        })
        .then(
          ({ logResult }) => {
            if (!logResult.ok) reportObservationError(options, logResult.error);
          },
          (error: unknown) => reportObservationError(options, error),
        );
    } catch (error: unknown) {
      reportObservationError(options, error);
    }
  };
  function onFinish(): void {
    settle('completed');
  }
  function onClose(): void {
    settle('aborted');
  }
  function onAborted(): void {
    settle('aborted');
  }
  function onRequestError(): void {
    settle('failed');
  }
  function onResponseError(): void {
    settle('failed');
  }

  response.once('finish', onFinish);
  response.once('close', onClose);
  response.once('error', onResponseError);
  request.once('aborted', onAborted);
  request.once('error', onRequestError);
}

function safeRoutePath(request: NestHttpRequest): string {
  const route = request.route;
  if (typeof route !== 'object' || route === null || Array.isArray(route)) {
    return '<unmatched>';
  }
  const path: unknown = Object.getOwnPropertyDescriptor(route, 'path')?.value;
  if (path === '/{*path}') return '<unmatched>';
  if (typeof path !== 'string' || path.length === 0) return '<route>';
  for (const character of path) {
    const code = character.charCodeAt(0);
    if (character === '?' || character === '#' || code <= 31 || code === 127) {
      return '<route>';
    }
  }
  return path;
}

function completionStatus(
  response: NestHttpResponse,
  outcome: RequestOutcome,
): number | null {
  const status = response.statusCode;
  const valid = Number.isInteger(status) && status >= 100 && status <= 599;
  if (outcome === 'completed') return valid ? status : 500;
  return response.headersSent && valid ? status : null;
}

function reportObservationError(
  options: NestObservabilityOptions,
  error: unknown,
): void {
  if (options.onError === undefined) return;
  try {
    options.onError(error);
  } catch {
    /* prevent recursive failure */
  }
}
