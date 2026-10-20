import { type Logger, type LogRecord, type LogWriteResult } from './logging.js';
import { type RequestId } from './request-id.js';
import { type MonotonicClock } from './timer.js';
export type RequestOutcome = 'completed' | 'failed' | 'aborted';
export interface RequestMetadata {
    readonly requestId: RequestId;
    readonly method: string;
    /** A path or route template without query parameters or fragments. */
    readonly path: string;
}
export interface RequestCompletionInput {
    /** A valid HTTP status code, or `null` when no status is available. */
    readonly statusCode: number | null;
    readonly outcome: RequestOutcome;
}
export interface RequestCompletion extends RequestCompletionInput {
    readonly durationMs: number;
}
export interface CreateRequestObserverOptions {
    readonly logger: Logger;
    readonly clock?: MonotonicClock;
}
export interface RequestObservationResult {
    readonly completion: RequestCompletion;
    readonly record: LogRecord;
    readonly logResult: LogWriteResult;
}
export interface RequestObserver {
    /** Reads elapsed time without completing the observation. */
    readonly elapsed: () => number;
    /** Completes and logs once. The first call wins and its promise is reused. */
    readonly complete: (completion: RequestCompletionInput) => Promise<RequestObservationResult>;
}
/** Composes request metadata, operation timing, and structured logging. */
export declare function createRequestObserver(metadata: RequestMetadata, options: CreateRequestObserverOptions): RequestObserver;
//# sourceMappingURL=request-observability.d.ts.map