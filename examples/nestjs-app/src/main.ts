import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

const configuredPort = Number(process.env.PORT ?? 3000);
if (
  !Number.isInteger(configuredPort) ||
  configuredPort < 0 ||
  configuredPort > 65_535
) {
  throw new TypeError('PORT must be an integer from 0 to 65535');
}

const app = await NestFactory.create(AppModule);
await app.listen(configuredPort, '127.0.0.1');
process.stdout.write(`rqg NestJS example listening at ${await app.getUrl()}\n`);
