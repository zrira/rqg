# Resource exhaustion

## In-memory quota state

`MemoryRateLimitStore` defaults to 10,000 active identities. Lookup and counter updates are O(1) average-case Map operations. Counters saturate at the configured maximum, so rejected requests do not increase numeric state.

Entries expire lazily. The store tracks the earliest reset boundary, avoiding a full scan when no entry can yet expire. When cleanup is eligible, a scan is O(n), bounded by `maxEntries`. Cleanup schedules no timer and cannot reset an active entry. Capacity failure never evicts active identities.

At capacity, a new identity produces a capacity decision. Fail-closed adapters return 503; fail-open adapters continue without quota headers. Existing identities remain enforceable.

## Identity flooding

An attacker who can choose many valid identities can fill the store. Bounds prevent unlimited retention but cannot make attack traffic cheap. Choose identities that attackers cannot manufacture freely, apply edge controls, monitor capacity, and select `maxEntries` based on heap and legitimate active cardinality.

Random per-request identities are especially dangerous: they defeat quotas and maximize retention. A 256-character identity limit bounds individual key size but does not replace a total-entry bound.

## NestJS policy registry

The Nest registry creates one limiter per static global, controller, or method policy encountered. Object-identity scope IDs prevent same-named classes or handlers from colliding. Length-framed store keys prevent delimiter ambiguity between namespaces and attacker-controlled identities.

The registry grows with application route-policy metadata, not request identity values. Nest route metadata is static under the supported model, so the number of limiter objects is bounded by decorated routes/controllers plus the global policy. Dynamically replacing metadata at runtime is unsupported.

All policy namespaces share the configured store capacity. A busy method policy can therefore consume entry capacity needed by another policy even though their counters do not collide.

## Other retained resources

Lifecycle adapters register five one-shot Node event listeners per observed request and remove all of them after the first terminal event. A never-ending request retains its normal request/response state and listeners until the server or application timeout terminates it. Configure header, request, keep-alive, and application timeouts appropriate to the deployment.

rqg creates no workers, intervals, or background cleanup tasks. Logger backpressure and buffering belong to the configured logging backend and should be monitored independently.
