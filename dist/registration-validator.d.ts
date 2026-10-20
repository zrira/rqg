import { type OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
/** Validates application-local dynamic module ownership after DI resolves. */
export declare class RqgRegistrationValidator implements OnApplicationBootstrap {
    private readonly discovery;
    constructor(discovery: DiscoveryService);
    onApplicationBootstrap(): void;
}
//# sourceMappingURL=registration-validator.d.ts.map