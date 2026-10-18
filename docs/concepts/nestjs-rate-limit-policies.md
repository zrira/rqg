# NestJS rate-limit policies

## Precedence

rqg uses one metadata value that is either a policy or skip marker. Precedence is explicit:

1. Method `@RateLimit()` or `@SkipRateLimit()`
2. Controller `@RateLimit()` or `@SkipRateLimit()`
3. Module global policy when `global !== false`
4. No limit

Because method metadata wins, a method policy can protect one route inside a skipped controller, and a method skip can exempt one route inside a limited controller.

There is no partial merge. An override supplies both `max` and `windowMs`; identity, store, clock, missing-identity behavior, and failure mode come from module configuration.

## Policy isolation

The Phase 3 memory store rejects one active key used with conflicting policies. Nest routes therefore cannot send raw identities directly to one shared store namespace.

`RqgRateLimitRegistry` wraps the configured store with a scope namespace:

- global policy: one quota shared across globally limited routes;
- controller policy: one quota shared by that controller's inherited routes;
- method policy: one isolated quota for that handler.

The registry cache key also includes `max` and `windowMs`. Core limiter and store objects are created once per active policy scope, not per request.

Controller and method scope names use Nest controller and handler names. Applications using a future distributed store should ensure those names are stable and unique across deployed code. Distributed storage remains outside the current implementation.

## Examples

Global rate limiting:

```ts
RqgModule.forRoot({
  rateLimit: {
    max: 100,
    windowMs: 60_000,
    identity: (request) => request.ip,
  },
});
```

Route-only policies:

```ts
RqgModule.forRoot({
  rateLimit: {
    global: false,
    max: 100,
    windowMs: 60_000,
    identity: (request) => request.ip,
    store: customStore,
    onFailure(failure) {
      recordProtectionHealth(failure.reason, failure.allowed);
    },
  },
});
```

The base `max` and `windowMs` are still required because they validate shared rate-limiter configuration and provide a complete fallback policy if global behavior is enabled later.

## Security tradeoffs

- Controller-wide quotas intentionally let one route consume allowance used by another route in that controller.
- Method quotas isolate sensitive endpoints such as login.
- Skips are explicit metadata and should be reviewed like authorization exclusions.
- Random per-request identities are never generated.
- Rate limiting is application-level mitigation, not complete DDoS protection.
