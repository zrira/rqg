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

## Guides

- [Request identification](../../docs/concepts/request-identification.md)
- [Operation timing](../../docs/concepts/operation-timing.md)
- [Structured logging and request observability](../../docs/concepts/structured-logging.md)
