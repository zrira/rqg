# NestJS dependency injection and rqg

## Dynamic module registration

`RqgModule` is a global dynamic module. `forRoot()` registers one validated options object and singleton middleware, guard, and limiter-registry providers:

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

Nest modules group providers and define visibility. Dynamic modules add providers based on registration arguments. rqg uses symbol injection tokens so application class names cannot collide with internal configuration providers.

`RqgModule` should be registered once at the application root. Repeated imports with the same options object are tested and do not double-consume quota. Distinct active registrations are detected through request-local state and fail closed with HTTP 500 without exposing configuration details. Detection cannot safely use process-global state because independent Nest applications may coexist, so the error occurs when a request activates both global guards rather than during static module construction.

## Asynchronous configuration

`forRootAsync()` supports an injected factory:

```ts
RqgModule.forRootAsync<readonly [ConfigService]>({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: async (config) => ({
    rateLimit: {
      max: config.getOrThrow<number>('RATE_LIMIT_MAX'),
      windowMs: 60_000,
      identity: (request) => request.ip,
    },
  }),
});
```

The factory may return options or a promise. This phase supports the conventional `useFactory` and `inject` pattern only; class- and existing-provider configuration strategies would add API surface without changing rqg's behavior.

## Provider scopes

rqg providers use Nest's default singleton scope:

- module options are immutable application configuration;
- `RqgMiddleware` is stateless apart from validated options;
- `RqgRateLimitGuard` delegates mutable quota state;
- `RqgRateLimitRegistry` owns one store and cached core limiter instances.

A request-scoped registry would create a new in-memory store for every request and make rate limiting ineffective. Request-specific state instead lives under a private symbol on the Node response object and is released with that request.

Transient providers are also inappropriate because they would duplicate guards and stores. No process-global mutable singleton is used: each Nest application receives its own DI-owned registry.

## Request ID injection

Controllers can use the parameter decorator:

```ts
@Get()
get(@RequestId() requestId: string | undefined) {
  return { requestId };
}
```

The decorator reads the symbol-backed response context through Nest's `ExecutionContext`. It does not augment Express's global request type or use `AsyncLocalStorage`.

## Dependency direction

`@rqg/nestjs` imports core contracts and Nest APIs. Core imports no Nest package. Nest, RxJS, and reflection libraries remain peer dependencies so the application owns a compatible framework installation.

Official references:

- [NestJS modules](https://docs.nestjs.com/modules)
- [NestJS custom providers](https://docs.nestjs.com/fundamentals/custom-providers)
- [NestJS injection scopes](https://docs.nestjs.com/fundamentals/injection-scopes)
- [NestJS dynamic modules](https://docs.nestjs.com/fundamentals/dynamic-modules)
