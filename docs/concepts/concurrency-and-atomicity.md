# Concurrency and atomicity

## Node.js event-loop execution

JavaScript in one Node.js event-loop context runs one synchronous segment to completion. Promise callbacks and I/O callbacks can interleave only after the current stack yields.

`MemoryRateLimitStore.consume()` performs its map lookup, expiry check, comparison, increment, and result creation synchronously and contains no `await`. Another call in the same event loop cannot observe the entry halfway through that transition. Calls started together with `Promise.all()` therefore receive exactly `max` successful consumptions.

The limiter may await a store because custom stores can be asynchronous. Atomicity is a requirement of the store's single `consume()` operation, not something the limiter can recreate around separate remote reads and writes.

## The read-modify-write race

This storage shape is unsafe:

```ts
const count = await store.get(key);
if (count < max) {
  await store.set(key, count + 1);
  return true;
}
```

Two operations may both read `count = 9`, both decide a limit of 10 allows them, and both write 10. Both callers proceed even though only one allowance remained. A mutex local to one process cannot fix races involving another process.

rqg instead requires one atomic consume command. A remote backend must enforce that command where the shared state lives.

## Scope of in-memory atomicity

The in-memory guarantee applies only to calls reaching the same `MemoryRateLimitStore` instance in one JavaScript execution context. It does not combine state across:

- Node.js cluster processes;
- worker threads with separate heaps;
- containers or virtual machines;
- horizontally scaled application instances;
- independently constructed store instances.

With four application instances, four independent stores can permit approximately four times the configured quota. Load-balancer affinity reduces movement but does not create correctness during failover, scaling, or restarts.

Worker threads do not normally share JavaScript `Map` objects. Sharing messages through a coordinator would create a different store architecture and bottleneck and is outside this phase.

## Asynchronous errors

A custom store may throw before returning or return a rejected promise. `RateLimiter.consume()` awaits that operation inside one error boundary and converts failure to a closed or open decision. This prevents the store rejection from escaping unexpectedly while keeping the security/availability choice explicit.

The limiter does not retry. Retrying an operation whose commit status is unknown can double-consume unless the store protocol is idempotent. Distributed implementations must address ambiguous outcomes explicitly.

## Memory and garbage collection

A `Map` offers expected constant-time lookup and update, but it strongly retains entries. Garbage collection only reclaims entry objects after deletion or clearing. Lazy expiry avoids timer overhead and idle wakeups, while the capacity limit provides a hard bound even when attackers continuously introduce active identities.

A cleanup scan temporarily adds O(n) work to one consumption. `cleanupEvery` controls frequency, and capacity checks always perform a final scan before failing. No active entry is silently evicted.

## Consistency expectations for a future distributed store

A compatible distributed store needs:

- atomic expiry/check/increment;
- one authoritative reset boundary;
- saturated counters;
- consistent handling at the exact boundary;
- bounded key expiration in the remote database;
- policy/key namespacing;
- documented behavior after timeout or partial failure.

These requirements are stronger than eventual consistency. Replicas that independently accept increments can temporarily exceed the configured limit unless the design deliberately accepts that tradeoff.
