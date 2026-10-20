# `@rqg/nestjs`

NestJS 11 integration for `@rqg/core`, tested with the Express platform adapter.

> Educational portfolio package; not actively maintained or recommended as a drop-in production security solution.

## Install

```bash
npm install --allow-git=all github:zrira/rqg#nestjs-v0.1.0 \
  @nestjs/common@^11 @nestjs/core@^11 @nestjs/platform-express@^11 \
  reflect-metadata@^0.2 rxjs@^7.8
```

The Git distribution pins its core dependency to `core-v0.1.0`.

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

`forRootAsync({ imports, inject, useFactory })` is also supported. Register one configuration owner with `forRoot()` or `forRootAsync()` in the root application module. Reimporting the same registration options object is equivalent and does not duplicate enforcement. Separately created options objects are distinct owners even when their fields look alike; rqg deliberately does not compare functions, stores, or loggers structurally.

After all synchronous or asynchronous providers resolve, an application-bootstrap validator discovers every active rqg registration. More than one owner rejects `app.init()` and prevents listening. A request-local check remains as defense in depth. Validation state belongs to Nest's application container, so separate applications remain isolated.

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
