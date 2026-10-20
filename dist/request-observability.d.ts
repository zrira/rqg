import { type Logger, type MonotonicClock } from '@rqg/core';
import type { RequestHandler } from 'express';
export interface RequestObservabilityOptions {
    readonly logger: Logger;
    readonly clock?: MonotonicClock;
    /** Receives logging or observation failures after the response lifecycle ends. */
    readonly onError?: (error: unknown) => void;
}
/** Observes one Express request lifecycle and emits at most one core record. */
export declare function requestObservability(options: RequestObservabilityOptions): RequestHandler;
//# sourceMappingURL=request-observability.d.ts.map