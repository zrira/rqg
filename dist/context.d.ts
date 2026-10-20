import { type RequestId } from '@rqg/core';
import type { Response } from 'express';
export interface RqgRequestContext {
    readonly requestId: RequestId;
}
export interface InternalRqgContext {
    readonly requestId: RequestId;
    observing: boolean;
}
export declare function getRequestId(response: Response): RequestId | undefined;
export declare function ensureContext(response: Response, requestId?: RequestId): InternalRqgContext;
export declare function getInternalContext(response: Response): InternalRqgContext | undefined;
//# sourceMappingURL=context.d.ts.map