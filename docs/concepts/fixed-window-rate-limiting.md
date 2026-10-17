# Fixed-window rate limiting

A fixed-window limiter permits at most `max` successful consumptions during one `windowMs` interval. rqg's implementation is framework-independent: an identity is an opaque string, and the result is data rather than an HTTP response.

## Create and consume

```ts
import { createRateLimiter } from '@rqg/core';

const limiter = createRateLimiter({
  max: 100,
  windowMs: 60_000,
});

const decision = await limiter.consume('tenant-123');
if (!decision.allowed) {
  console.log(decision.reason);
}
```

Each limiter gets a new in-memory store unless a store is explicitly supplied. There is no process-global quota state.

## Custom policy

```ts
const loginLimiter = createRateLimiter({
  max: 5,
  windowMs: 15 * 60_000,
});
```

`max` must be a positive safe integer. `windowMs` must be positive and finite. Counters saturate at `max`, so rejected attempts cannot overflow the counter or produce negative remaining values.

## Anchored windows

rqg anchors a window to an identity's first consumption:

```text
first consumption at t = 25 ms
windowMs = 100 ms
active interval = [25, 125)
next window starts when now >= 125 ms
```

The operation exactly at the reset boundary belongs to a new window. This differs from globally aligned windows such as every wall-clock minute. Anchoring avoids synchronizing every identity onto one global boundary and works naturally with a process-local monotonic clock.

Fixed windows still permit a boundary burst: a client may consume its entire allowance just before expiry and consume another allowance immediately after reset. Sliding windows reduce that effect by retaining more history. Token buckets model replenishing capacity and controlled bursts. Both alternatives require different state and semantics and are intentionally outside Phase 3.

## Deterministic clock injection

```ts
import { createRateLimiter, type MonotonicClock } from '@rqg/core';

let nowMs = 1_000;
const clock: MonotonicClock = () => nowMs;
const limiter = createRateLimiter({ max: 1, windowMs: 100, clock });

await limiter.consume('client');
nowMs = 1_100;
const nextWindow = await limiter.consume('client'); // allowed
```

The limiter uses the greatest clock reading it has observed, preventing a faulty injected clock from moving effective time backward. Readings are elapsed-time coordinates, not Unix timestamps. Invalid readings reject the consume promise with `TypeError` because the clock is invalid application configuration, not a store availability failure.

## Decisions

Successful quota evaluation produces one of two decision shapes:

- `within-limit`: allowed, with numeric `remaining` and `resetAfterMs`.
- `limit-exceeded`: rejected, with `remaining: 0`; `retryAfterMs` equals `resetAfterMs`.

Identity and store failures produce an unavailable decision. Its quota and reset fields are `null` rather than invented values. Decisions never include the raw identity or underlying storage error.

```ts
const decision = await limiter.consume('client');

if (!decision.allowed && decision.reason === 'limit-exceeded') {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(decision.retryAfterMs / 1_000),
  );
  console.log(`Retry after ${retryAfterSeconds} seconds`);
}
```

A future HTTP adapter can map `limit-exceeded` to status 429. Integer `Retry-After` uses seconds, so milliseconds must be rounded up. Rate-limit response headers may use different reset representations; adapters must follow the chosen header specification rather than copying millisecond values blindly.

## Identity handling

Core does not inspect requests, IP addresses, API keys, or proxy headers. An adapter or application resolves an identity before consumption.

Accepted identities are strings of at most 256 UTF-16 code units with no control characters or surrounding whitespace. Values are never coerced. Empty, null, and undefined identities are missing; the secure default rejects them without touching storage.

An explicit shared fallback is available:

```ts
const limiter = createRateLimiter({
  max: 20,
  windowMs: 60_000,
  missingIdentity: {
    behavior: 'use-shared',
    identity: 'anonymous',
  },
});

const decision = await limiter.consume(undefined);
```

All missing clients consume the same quota. rqg never creates a unique anonymous identity because that would bypass limiting. Shared fallback can reduce availability for unrelated users and should be chosen deliberately.

Do not trust `X-Forwarded-For` directly. Configure trusted proxies at the framework boundary and derive a canonical identity according to the deployment topology. IP addresses can be shared, rotated, or spoofed when proxy trust is wrong; API keys and user IDs have different risks.

## Failure modes

Fail closed is the default:

```ts
const limiter = createRateLimiter({
  max: 100,
  windowMs: 60_000,
  failureMode: 'closed',
});
```

A store error or capacity exhaustion yields `allowed: false` with reason `store-failure` or `capacity-exceeded`. This preserves protection but can deny legitimate traffic during a storage outage.

`failureMode: 'open'` returns `allowed: true` for those failures. The failure reason remains present so the application can increment a metric or raise a health alert. Fail open improves availability but can remove protection during an outage. Missing and malformed identities remain rejected in both modes.

Configuration errors throw when the limiter is created. Store throws, rejected promises, malformed store results, and capacity errors are converted to resolved decisions, preventing store rejection from becoming an unhandled rejection inside the limiter.

## Complexity and limitations

Normal in-memory consumption is expected O(1) time for a `Map` lookup/update and O(1) space per active identity. Periodic or capacity-triggered expiry scans are O(n), bounded by `maxEntries`.

Rate limiting reduces application-level abuse; it does not stop volumetric DDoS traffic that exhausts bandwidth, connections, TLS, proxy capacity, or upstream infrastructure before the application runs. Layered edge and network controls are still required.
