import { type NestMiddleware } from '@nestjs/common';
import type { NestHttpRequest, NestHttpResponse, RqgModuleOptions } from './types.js';
export declare class RqgMiddleware implements NestMiddleware {
    #private;
    private readonly registration;
    constructor(options: RqgModuleOptions, registration: object);
    use(request: NestHttpRequest, response: NestHttpResponse, next: () => void): void;
}
//# sourceMappingURL=rqg.middleware.d.ts.map