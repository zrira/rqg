import type { RateLimitPolicy } from '@rqg/core';
export type RateLimitMetadata = {
    readonly kind: 'policy';
    readonly policy: RateLimitPolicy;
} | {
    readonly kind: 'skip';
};
export declare function RateLimit(policy: RateLimitPolicy): MethodDecorator & ClassDecorator;
export declare function SkipRateLimit(): MethodDecorator & ClassDecorator;
export declare const RequestId: (...dataOrPipes: unknown[]) => ParameterDecorator;
//# sourceMappingURL=decorators.d.ts.map