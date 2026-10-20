import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';

import { RQG_MODULE_REGISTRATION } from './tokens.js';

/** Validates application-local dynamic module ownership after DI resolves. */
@Injectable()
export class RqgRegistrationValidator implements OnApplicationBootstrap {
  constructor(private readonly discovery: DiscoveryService) {}

  onApplicationBootstrap(): void {
    const registrations = new Set<object>();

    for (const provider of this.discovery.getProviders()) {
      if (provider.token !== RQG_MODULE_REGISTRATION) continue;

      const registration: unknown = provider.instance;
      if (
        (typeof registration !== 'object' &&
          typeof registration !== 'function') ||
        registration === null
      ) {
        throw new Error('RqgModule registration identity is unavailable');
      }
      registrations.add(registration);
      if (registrations.size > 1) {
        throw new Error(
          'Conflicting RqgModule root registrations detected; register exactly one configuration owner',
        );
      }
    }
  }
}
