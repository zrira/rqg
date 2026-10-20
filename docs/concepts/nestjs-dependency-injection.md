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

`RqgModule` has one configuration-owner contract. Repeated imports created from the same `forRoot()` options object are equivalent and do not double-consume quota. Separately allocated options objects represent distinct owners even when their properties appear equivalent. rqg does not stringify or deeply compare functions, stores, loggers, or secrets.

Each dynamic module has local providers because Nest derives its module token from the dynamic metadata. rqg includes a per-call opaque marker so Nest cannot collapse distinct owners whose functions or collaborator objects happen to serialize alike. Distinct registrations therefore remain visible as separate module instances, configuration providers, and `APP_GUARD` providers. Repeated calls using the same options object retain one owner identity; the request guard claims that identity once so equivalent duplicate guards cannot consume quota twice.

`RqgRegistrationValidator` implements Nest's application-bootstrap lifecycle. It uses `DiscoveryService` to examine every active `RQG_MODULE_REGISTRATION` provider after dependency injection has resolved all modules. More than one identity throws a configuration-only startup error, causing `app.init()` and consequently `listen()` to reject. The existing response-local identity check remains as defense in depth. No process-global registry is used, so independent Nest application containers remain isolated.

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

The factory may return options or a promise. Async options are resolved before application-bootstrap validation. Reimporting the same async registration options object uses one owner identity; different async options objects conflict, including sync/async mixtures. This phase supports the conventional `useFactory` and `inject` pattern only; class- and existing-provider configuration strategies would add API surface without changing rqg's behavior.

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
- [NestJS lifecycle events](https://docs.nestjs.com/fundamentals/lifecycle-events)
- [NestJS discovery service](https://docs.nestjs.com/fundamentals/discovery-service)
