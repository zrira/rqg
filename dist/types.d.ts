import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CreateRateLimiterOptions, Logger, MonotonicClock, RateLimitFailureReason, RateLimitPolicy, RequestIdGenerator } from '@rqg/core';
import type { DynamicModule, InjectionToken, ModuleMetadata } from '@nestjs/common';
export interface NestHttpRequest extends IncomingMessage {
    readonly ip?: string;
    readonly route?: unknown;
}
export type NestHttpResponse = ServerResponse;
export interface NestRequestIdOptions {
    readonly headerName?: string;
    readonly acceptIncoming?: boolean;
    readonly generator?: RequestIdGenerator;
}
export interface NestObservabilityOptions {
    readonly logger: Logger;
    readonly clock?: MonotonicClock;
    readonly onError?: (error: unknown) => void;
}
export type NestRateLimitIdentity = string | null | undefined;
export type NestIdentityResolver = (request: NestHttpRequest) => NestRateLimitIdentity | Promise<NestRateLimitIdentity>;
export type NestRateLimitFailureReason = RateLimitFailureReason | 'identity-resolution-failure';
export interface NestRateLimitFailure {
    readonly allowed: boolean;
    readonly reason: NestRateLimitFailureReason;
}
export interface NestRateLimitOptions extends CreateRateLimiterOptions {
    readonly identity: NestIdentityResolver;
    /** Register the guard as an application-wide policy. Defaults to `true`. */
    readonly global?: boolean;
    readonly onFailure?: (failure: NestRateLimitFailure) => void;
}
export interface RqgModuleOptions {
    readonly requestId?: NestRequestIdOptions | false;
    readonly observability?: NestObservabilityOptions | false;
    readonly rateLimit?: NestRateLimitOptions | false;
}
export interface RqgModuleAsyncOptions<TDependencies extends readonly unknown[] = readonly unknown[]> extends Pick<ModuleMetadata, 'imports'> {
    readonly inject?: readonly InjectionToken[];
    readonly useFactory: (...dependencies: TDependencies) => RqgModuleOptions | Promise<RqgModuleOptions>;
}
export type NestRateLimitPolicy = RateLimitPolicy;
export type RqgDynamicModule = DynamicModule;
//# sourceMappingURL=types.d.ts.map