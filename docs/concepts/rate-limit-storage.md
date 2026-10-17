# Rate-limit storage

The fixed-window policy defines `max` and `windowMs`. The limiter validates identity and turns store state into a decision. The store owns one atomic state transition.

## Atomic contract

```ts
interface RateLimitStore {
  consume(
    key: string,
    policy: RateLimitPolicy,
    nowMs: number,
  ): RateLimitStoreResult | Promise<RateLimitStoreResult>;
}
```

For one call, a store must atomically:

1. expire the old window when `nowMs >= resetAtMs`;
2. create an anchored window if none exists;
3. check whether `count < max`;
4. increment only when allowance is available;
5. return `consumed`, the saturated `count`, and `resetAtMs`.

A separate asynchronous `get()` followed by `set()` is not sufficient. Two callers can both read the same count and both write the same increment, permitting more operations than intended.

Store errors propagate to the limiter, which applies its configured open/closed failure policy. Invalid store results are treated as store failures. A result must have a safe positive count no greater than `max`, a consistent `consumed` flag, and a finite future reset boundary within the configured window.

## In-memory store

```ts
import { MemoryRateLimitStore, createRateLimiter } from '@rqg/core';

const store = new MemoryRateLimitStore({
  maxEntries: 25_000,
  cleanupEvery: 100,
});

const limiter = createRateLimiter({
  max: 100,
  windowMs: 60_000,
  store,
});
```

The store uses a JavaScript `Map`. A map keeps strong references to keys and values; garbage collection cannot reclaim an entry while the map retains it. Expired records therefore require explicit deletion.

Cleanup has no background timer:

- the current key is expired on access;
- every `cleanupEvery` consumptions, the store scans for expired entries;
- before reporting full capacity, it always scans for expired entries;
- `clear()` explicitly removes all state.

The common path is O(1). A cleanup scan is O(n), and memory is O(n), where `n <= maxEntries`. Changing cleanup frequency trades occasional CPU work against retention of expired entries.

## Capacity exhaustion

```ts
const store = new MemoryRateLimitStore({ maxEntries: 1 });
const limiter = createRateLimiter({
  max: 10,
  windowMs: 60_000,
  store,
});

await limiter.consume('first');
const decision = await limiter.consume('second');

if (decision.reason === 'capacity-exceeded') {
  // Fail closed by default; alert or shed load without logging raw identities.
}
```

The store never evicts an active entry to admit a new identity. Active eviction would let an attacker cycle identities and repeatedly reset quotas. After removing expired entries, a full store throws `RateLimitCapacityError`; the limiter converts it into the configured failure decision.

Choose capacity from expected simultaneously active identities and available memory. The bound is a safety control, not an estimate of exact byte usage. JavaScript engine overhead, key lengths, and object representation vary.

`size` is exposed for diagnostics, and `clear()` is the only lifecycle operation. There is no timer to stop.

## Custom store example

```ts
import {
  MemoryRateLimitStore,
  createRateLimiter,
  type RateLimitStore,
} from '@rqg/core';

const backingStore = new MemoryRateLimitStore();

const customStore: RateLimitStore = {
  async consume(key, policy, nowMs) {
    // Instrumentation can wrap an atomic backend operation.
    return backingStore.consume(key, policy, nowMs);
  },
};

const limiter = createRateLimiter({
  max: 10,
  windowMs: 1_000,
  store: customStore,
});
```

A shared custom store must scope keys when several logical limiters use different policies. `MemoryRateLimitStore` rejects reuse of one active key with conflicting policies rather than silently resetting or weakening it.

## Distributed-store requirements

A future Redis-style implementation would need one server-side script or transactional command to perform expiry, comparison, increment, and returned state atomically. It must also define whose clock establishes reset boundaries. `performance.now()` origins differ between processes, so process-relative monotonic readings cannot be compared as shared distributed timestamps without an explicit time design.

This phase deliberately provides no Redis abstractions, connection management, serialization protocol, or distributed lease behavior.
