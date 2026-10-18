# `@rqg/nestjs`

NestJS 11 integration for `@rqg/core`, tested with the Express platform adapter.

## Registration

```ts
@Module({
  imports: [
    RqgModule.forRoot({
      requestId: { acceptIncoming: false },
      observability: { logger },
      rateLimit: {
        max: 100,
        windowMs: 60_000,
        identity: (request) => request.ip,
      },
    }),
  ],
})
export class AppModule {}
```

`forRootAsync({ imports, inject, useFactory })` is also supported. Register exactly one `forRoot()` or `forRootAsync()` call in the root application module. Conflicting registrations can create multiple global guards and are unsupported. This contract avoids process-global registration state and keeps separate Nest applications isolated.

## Controller APIs

```ts
@Controller('users')
@RateLimit({ max: 20, windowMs: 60_000 })
export class UsersController {
  @Get(':id')
  get(@RequestId() requestId: string | undefined) {
    return { requestId };
  }

  @RateLimit({ max: 5, windowMs: 60_000 })
  @Post('login')
  login() {}

  @SkipRateLimit()
  @Get('health')
  health() {}
}
```

Method metadata overrides controller metadata, which overrides the module global policy. Route scopes are namespaced by application-local controller/handler identity before entering the shared store, so distinct same-named classes do not share counters.

## HTTP behavior

Known quota exhaustion returns 429 with quota headers and `Retry-After`. Missing identity returns 400. Fail-closed operational failure returns 503 without quota headers; fail-open continues and can be observed through `onFailure`.

Observability uses Node response events rather than RxJS completion, so guard, pipe, exception-filter, streaming, and manually handled responses are covered.

## Request body limits

For the supported Express platform, configure Nest's parser before listening:

```ts
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.useBodyParser('json', { limit: '100kb' });
app.useBodyParser('urlencoded', { extended: false, limit: '100kb' });
```

Multipart, raw, custom-parser, and streaming endpoints require their own limits. rqg does not inspect `Content-Length` or consume the request stream.

## Compatibility

- NestJS 11 Express platform: supported and integration tested.
- Fastify: not currently supported or claimed.
- `@rqg/express` in the same request pipeline: unsupported; choose one adapter to avoid duplicate IDs, observers, and quota consumption.

## Guides

- [Dependency injection](../../docs/concepts/nestjs-dependency-injection.md)
- [Request lifecycle](../../docs/concepts/nestjs-request-lifecycle.md)
- [Guards and interceptors](../../docs/concepts/nestjs-guards-and-interceptors.md)
- [Rate-limit policies](../../docs/concepts/nestjs-rate-limit-policies.md)
- [Request size limits](../../docs/concepts/http-request-size-limits.md)
- [Deployment security](../../docs/deployment-security.md)
- [Runnable example](../../examples/nestjs-app)
