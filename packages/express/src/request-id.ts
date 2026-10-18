import { validateHeaderName } from 'node:http';

import {
  resolveRequestId,
  type RequestIdGenerator,
  type ResolveRequestIdOptions,
} from '@rqg/core';
import type { Request, RequestHandler } from 'express';

import { ensureContext, getInternalContext } from './context.js';

export interface RequestIdMiddlewareOptions {
  /** Request and response header name. Defaults to `x-request-id`. */
  readonly headerName?: string;
  /** Trust a valid incoming ID. Defaults to `false`. */
  readonly acceptIncoming?: boolean;
  /** Override generation, primarily for deterministic tests. */
  readonly generator?: RequestIdGenerator;
}

const DEFAULT_HEADER_NAME = 'x-request-id';

/** Adds one validated request ID to rqg context and the response. */
export function requestId(
  options: RequestIdMiddlewareOptions = {},
): RequestHandler {
  const configuration = validateOptions(options);

  return (request, response, next): void => {
    const existing = getInternalContext(response);
    const context =
      existing ??
      ensureContext(
        response,
        resolveRequestId(readSingleHeader(request, configuration.headerName), {
          acceptIncoming: configuration.acceptIncoming,
          ...(configuration.generator === undefined
            ? {}
            : { generator: configuration.generator }),
        }),
      );

    response.setHeader(configuration.headerName, context.requestId);
    next();
  };
}

interface ValidatedOptions extends ResolveRequestIdOptions {
  readonly headerName: string;
  readonly acceptIncoming: boolean;
}

function validateOptions(
  options: RequestIdMiddlewareOptions,
): ValidatedOptions {
  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new TypeError('Request ID middleware options must be an object');
  }

  const headerName = options.headerName ?? DEFAULT_HEADER_NAME;
  if (typeof headerName !== 'string') {
    throw new TypeError('Request ID headerName must be a string');
  }
  validateHeaderName(headerName);

  const acceptIncoming = options.acceptIncoming ?? false;
  if (typeof acceptIncoming !== 'boolean') {
    throw new TypeError('Request ID acceptIncoming must be a boolean');
  }

  if (
    options.generator !== undefined &&
    typeof options.generator !== 'function'
  ) {
    throw new TypeError('Request ID generator must be a function');
  }

  return Object.freeze({
    headerName,
    acceptIncoming,
    ...(options.generator === undefined
      ? {}
      : { generator: options.generator }),
  });
}

function readSingleHeader(request: Request, headerName: string): unknown {
  let value: string | undefined;
  let matches = 0;

  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const name = request.rawHeaders[index];
    if (name?.toLowerCase() !== headerName.toLowerCase()) continue;

    matches += 1;
    value = request.rawHeaders[index + 1];
    if (matches > 1) return undefined;
  }

  return value;
}
