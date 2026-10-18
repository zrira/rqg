import { Module } from '@nestjs/common';

import { RqgModule } from '@rqg/nestjs';

import { AppController } from './app.controller.js';

const logger = {
  log(record: unknown): void {
    process.stdout.write(`${JSON.stringify(record)}\n`);
  },
};

@Module({
  imports: [
    RqgModule.forRootAsync({
      useFactory: async () =>
        Promise.resolve({
          requestId: { acceptIncoming: false },
          observability: { logger },
          rateLimit: {
            max: 5,
            windowMs: 60_000,
            // The Express platform leaves trust proxy disabled by default.
            identity: (request) => request.ip,
          },
        }),
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
