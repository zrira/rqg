import { Controller, Get } from '@nestjs/common';

import { RateLimit, RequestId, SkipRateLimit } from '@rqg/nestjs';
@Controller()
export class AppController {
  @Get()
  index(@RequestId() requestId: string | undefined) {
    return { requestId, message: 'rqg NestJS example' };
  }

  @RateLimit({ max: 2, windowMs: 60_000 })
  @Get('limited')
  limited() {
    return { ok: true, policy: 'two requests per minute' };
  }

  @SkipRateLimit()
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('error')
  error(): never {
    throw new Error('Example route failure');
  }
}
