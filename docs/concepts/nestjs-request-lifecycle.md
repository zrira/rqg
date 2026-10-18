# NestJS request lifecycle and observability

A simplified Nest request passes through middleware, guards, interceptors, pipes, the controller, outbound interceptors, and exception filters. The exact order matters when choosing an observability hook.

## Why rqg uses middleware

Global rqg middleware runs before guards and pipes. It can therefore register Node HTTP lifecycle listeners even when:

- a rate-limit guard rejects the request;
- another guard denies access;
- a pipe rejects input;
- a controller throws;
- an exception filter converts an exception to a response;
- a controller handles the response manually with `@Res()`.

An interceptor starts too late to cover earlier guard rejection. RxJS `finalize()` reports observable termination, not completion of HTTP transmission. A streaming observable or manual response can outlive handler execution.

rqg does not add an interceptor in Phase 5 because it would not improve transport correctness.

## Transport outcomes

The middleware uses the same Node.js semantics as the Express adapter:

- response `finish` → `completed`;
- response `close` before finish → `aborted`;
- request `aborted` → `aborted`;
- request or response `error` → `failed`.

A Nest exception that becomes a fully sent 400 or 500 response is completed transport. Handler failure and transport failure are different dimensions.

The first event wins, all rqg listeners are removed, and the core observer is also idempotent. Logger throws and promise rejections cannot fail the HTTP request; optional `onError` receives them through a guarded callback.

## Safe route names

On the tested Express platform, the route template is available at response completion. rqg logs `/users/:id`, not `/users/123?token=...`. The Nest middleware wildcard `/{*path}` is recognized as unmatched and logged as `<unmatched>`. Complex non-string route definitions become `<route>`.

Raw URL, query parameters, request bodies, headers, credentials, and arbitrary exception objects are never logged.

## Middleware, guards, pipes, filters, and interceptors

- **Middleware** works at the HTTP pipeline boundary and registers transport state.
- **Guards** decide whether controller execution is allowed; rqg uses one for quotas.
- **Pipes** transform and validate handler arguments; their 400 responses remain observable.
- **Interceptors** wrap handler observables and are useful for handler-level concerns, but not final transport completion.
- **Exception filters** translate exceptions into responses. A finished filtered response is completed.

## Adapter support

Phase 5 is tested with NestJS 11's Express platform. The implementation uses Node `IncomingMessage` and `ServerResponse` lifecycle APIs plus an Express-style route-template property available through that platform.

Fastify compatibility is not claimed. Fastify wraps lifecycle and route metadata differently; it requires dedicated integration tests before support can be promised.

Official references:

- [NestJS request lifecycle](https://docs.nestjs.com/faq/request-lifecycle)
- [NestJS middleware](https://docs.nestjs.com/middleware)
- [NestJS interceptors](https://docs.nestjs.com/interceptors)
- [NestJS exception filters](https://docs.nestjs.com/exception-filters)
- [Node.js HTTP](https://nodejs.org/api/http.html)
