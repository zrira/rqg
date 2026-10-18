import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';

const configuredPort = Number(process.env.PORT ?? 3000);
if (
  !Number.isInteger(configuredPort) ||
  configuredPort < 0 ||
  configuredPort > 65_535
) {
  throw new TypeError('PORT must be an integer from 0 to 65535');
}

const app = await NestFactory.create<NestExpressApplication>(AppModule);
// Nest's Express parser enforces decoded JSON and URL-encoded body limits.
// Multipart and streaming routes require limits in their own middleware.
app.useBodyParser('json', { limit: '100kb' });
app.useBodyParser('urlencoded', { extended: false, limit: '100kb' });
await app.listen(configuredPort, '127.0.0.1');
process.stdout.write(`rqg NestJS example listening at ${await app.getUrl()}\n`);
