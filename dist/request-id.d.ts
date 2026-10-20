import { type RequestIdGenerator } from '@rqg/core';
import type { RequestHandler } from 'express';
export interface RequestIdMiddlewareOptions {
    /** Request and response header name. Defaults to `x-request-id`. */
    readonly headerName?: string;
    /** Trust a valid incoming ID. Defaults to `false`. */
    readonly acceptIncoming?: boolean;
    /** Override generation, primarily for deterministic tests. */
    readonly generator?: RequestIdGenerator;
}
/** Adds one validated request ID to rqg context and the response. */
export declare function requestId(options?: RequestIdMiddlewareOptions): RequestHandler;
//# sourceMappingURL=request-id.d.ts.map