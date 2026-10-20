declare const requestIdBrand: unique symbol;
/** A canonical lowercase RFC 4122 UUID v4 that has passed rqg validation. */
export type RequestId = string & {
    readonly [requestIdBrand]: true;
};
/** Produces a request ID candidate. The returned value is validated before use. */
export type RequestIdGenerator = () => string;
export interface ResolveRequestIdOptions {
    /** Trust a valid incoming request ID. Defaults to `false`. */
    readonly acceptIncoming?: boolean;
    /** Override UUID generation, primarily for deterministic tests. */
    readonly generator?: RequestIdGenerator;
}
/** Returns whether a value is a canonical lowercase RFC 4122 UUID v4. */
export declare function isRequestId(value: unknown): value is RequestId;
/** Generates and validates a new request ID. */
export declare function createRequestId(generator?: RequestIdGenerator): RequestId;
/**
 * Resolves a request ID at a trust boundary.
 *
 * Incoming values are ignored unless acceptance is explicitly enabled and the
 * value passes strict validation. Otherwise, a fresh ID is generated.
 */
export declare function resolveRequestId(incomingId: unknown, options?: ResolveRequestIdOptions): RequestId;
export {};
//# sourceMappingURL=request-id.d.ts.map