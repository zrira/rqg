import { type DynamicModule, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import type { RqgModuleAsyncOptions, RqgModuleOptions } from './types.js';
export declare class RqgModule implements NestModule {
    private readonly options;
    constructor(options: RqgModuleOptions);
    static forRoot(options: RqgModuleOptions): DynamicModule;
    static forRootAsync<TDependencies extends readonly unknown[]>(options: RqgModuleAsyncOptions<TDependencies>): DynamicModule;
    configure(consumer: MiddlewareConsumer): void;
}
//# sourceMappingURL=rqg.module.d.ts.map