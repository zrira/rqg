import { type RequestId as CoreRequestId } from '@rqg/core';
import type { NestHttpResponse } from './types.js';
interface NestRequestContext {
    readonly requestId: CoreRequestId;
    observing: boolean;
}
export declare function assertSingleRegistration(response: NestHttpResponse, registration: object): void;
export declare function claimRateLimitRegistration(response: NestHttpResponse, registration: object): boolean;
export declare function getNestRequestId(response: NestHttpResponse): CoreRequestId | undefined;
export declare function ensureContext(response: NestHttpResponse, requestId?: CoreRequestId): NestRequestContext;
export {};
//# sourceMappingURL=context.d.ts.map