# `@rqg/core`

Framework-independent request-protection and observability primitives for rqg.

## Request identification

```ts
import { resolveRequestId } from '@rqg/core';

const requestId = resolveRequestId(rawIncomingHeader, {
  // Disabled by default. Enable only when the upstream value is trusted.
  acceptIncoming: true,
});
```

The package generates canonical lowercase UUID v4 request IDs with Node.js cryptography. Invalid, missing, or untrusted incoming values are replaced with newly generated IDs.

## Operation timing

```ts
import { createTimer } from '@rqg/core';

const timer = createTimer();
await performOperation();
const durationMs = timer.stop();
```

Timers use Node.js's monotonic `performance.now()` clock, support deterministic clock injection, and schedule no background work.

## Structured logging

```ts
import { createLogRecord, writeLog, type Logger } from '@rqg/core';

const logger: Logger = {
  log(record) {
    process.stdout.write(`${JSON.stringify(record)}\n`);
  },
};

const record = createLogRecord({
  level: 'info',
  message: 'operation finished',
  context: { durationMs: 2.5 },
});

const result = await writeLog(logger, record);
```

rqg validates JSON-compatible records but does not choose a logging backend. Logger throws and rejections are returned as failure results rather than interrupting the observed operation.

## Request observability

```ts
import { createRequestId, createRequestObserver } from '@rqg/core';

const observer = createRequestObserver(
  {
    requestId: createRequestId(),
    method: 'GET',
    path: '/health',
  },
  { logger },
);

await observer.complete({ outcome: 'completed', statusCode: 200 });
```

Core models plain request metadata and completion values; it does not depend on HTTP framework objects or lifecycle events.

## Fixed-window rate limiting

```ts
import { createRateLimiter, MemoryRateLimitStore } from '@rqg/core';

const limiter = createRateLimiter({
  max: 100,
  windowMs: 60_000,
  store: new MemoryRateLimitStore({ maxEntries: 10_000 }),
});

const decision = await limiter.consume('tenant-123');
if (!decision.allowed && decision.reason === 'limit-exceeded') {
  const retryAfterSeconds = Math.ceil(decision.retryAfterMs / 1_000);
  console.log(`Retry after ${retryAfterSeconds} seconds`);
}
```

Windows are anchored to each identity's first consumption. Missing identities and storage failures are rejected by default. Core returns structured decisions and never sends HTTP responses or reads proxy headers.

The memory store is bounded, lazily cleans expired entries, and never evicts an active entry to admit a new identity. Its state and atomicity are local to one store instance and Node.js event-loop context.

## Guides

- [Request identification](../../docs/concepts/request-identification.md)
- [Operation timing](../../docs/concepts/operation-timing.md)
- [Structured logging and request observability](../../docs/concepts/structured-logging.md)
- [Fixed-window rate limiting](../../docs/concepts/fixed-window-rate-limiting.md)
- [Rate-limit storage](../../docs/concepts/rate-limit-storage.md)
- [Concurrency and atomicity](../../docs/concepts/concurrency-and-atomicity.md)
