# NestJS guards, interceptors, and rqg

## Rate-limit guard

`RqgRateLimitGuard` is registered through Nest's `APP_GUARD` token. It is a singleton and runs for every HTTP route, but immediately allows requests when no global or route policy applies.

For an active policy it:

1. resolves an identity synchronously or asynchronously;
2. retrieves a cached core limiter from the singleton registry;
3. consumes exactly once;
4. writes normal quota headers;
5. returns `true` or throws a Nest HTTP exception.

Nest stops controller execution when the guard throws.

## HTTP mapping

| Core result                    | Guard behavior                      |
| ------------------------------ | ----------------------------------- |
| Within limit                   | Return `true` with quota headers    |
| Limit exceeded                 | Throw HTTP 429 with `Retry-After`   |
| Missing/invalid identity       | Throw HTTP 400                      |
| Store/capacity failure, closed | Throw HTTP 503                      |
| Store/capacity failure, open   | Return `true` without quota headers |
| Resolver failure, closed/open  | 503 or continue according to mode   |

Operational callbacks receive only `{ allowed, reason }`, never identities or underlying errors.

`RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` are emitted only when the store supplied valid state. `Retry-After` is emitted only for known quota exhaustion. Milliseconds are rounded upward to integer seconds.

## Why no rate-limit interceptor

A guard is the natural enforcement point: it runs before pipes and controllers and can prevent route execution. An interceptor would begin later and could allow expensive guard or pipe work before rejecting. It could also accidentally consume twice if combined with a guard.

Interceptors remain useful for application concerns unrelated to rqg transport completion. rqg deliberately avoids a general interceptor framework.

## Global and route-level use

Global behavior comes from module configuration. Decorators change policy metadata:

```ts
@RateLimit({ max: 20, windowMs: 60_000 })
@Controller('accounts')
export class AccountsController {
  @RateLimit({ max: 5, windowMs: 60_000 })
  @Post('login')
  login() {}

  @SkipRateLimit()
  @Get('health')
  health() {}
}
```

The same guard handles global and decorated routes. `global: false` disables the fallback policy while retaining decorated policies and a shared resolver/store configuration.

## Reverse proxies

The identity resolver owns client identity. With the Express platform, `request.ip` reflects Express's `trust proxy` setting. rqg never reads `X-Forwarded-For` itself. Configure proxy trust against actual ingress addresses and ensure trusted proxies replace attacker-supplied forwarding headers.
