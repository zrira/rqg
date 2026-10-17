# Structured logging and request observability

`@rqg/core` defines a logging boundary; it is not a logging backend. Applications can adapt Pino, Winston, OpenTelemetry, a test double, or a custom destination without adding those dependencies to rqg.

## Create a structured record

```ts
import { createLogRecord } from '@rqg/core';

const record = createLogRecord({
  level: 'info',
  message: 'cache lookup finished',
  context: {
    cache: 'users',
    hit: true,
    durationMs: 1.25,
  },
});
```

Levels are `debug`, `info`, `warn`, and `error`. Context values must be JSON-compatible: finite numbers, strings, booleans, null, dense arrays, and plain objects. rqg rejects cycles, accessors, symbols, class instances, `undefined`, `bigint`, functions, non-finite numbers, sparse arrays, and excessive nesting.

Records are validated, copied, and frozen. Snapshotting prevents a caller from mutating metadata after record creation and changing what an asynchronous logger eventually observes.

## Provide a logger

```ts
import { writeLog, type Logger } from '@rqg/core';

const logger: Logger = {
  log(record) {
    process.stdout.write(`${JSON.stringify(record)}\n`);
  },
};

const result = await writeLog(logger, {
  level: 'info',
  message: 'worker ready',
  context: { workerId: 4 },
});

if (!result.ok) {
  // Send the failure to a non-recursive fallback, metric, or health signal.
  console.error('Log destination failed', result.error);
}
```

A backend adapter should translate the rqg record into its native API rather than passing the logger directly when signatures differ.

## Synchronous and asynchronous logging

`Logger.log()` may return `void` or `Promise<void>`. Synchronous logging is simple but slow destinations can block the event loop. Asynchronous logging avoids direct blocking but introduces buffering, ordering, shutdown, and failure-handling concerns owned by the backend.

`writeLog()` returns a promise that always resolves for logger runtime failures:

- `{ ok: true }` when the logger succeeds;
- `{ ok: false, error }` when it throws or rejects.

The rejection handler is attached immediately, so ignoring the returned promise does not create an unhandled rejection. Callers should still inspect the result when log delivery affects health monitoring. rqg does not retry or recursively log failures because either behavior can amplify an outage.

Malformed records and invalid logger configuration are programmer errors and throw synchronously before logging. This distinction allows configuration defects to fail early while keeping a transient logging outage from interrupting the observed operation.

## Observe a request without a framework

```ts
import { createRequestId, createRequestObserver, type Logger } from '@rqg/core';

const logger: Logger = {
  log(record) {
    process.stdout.write(`${JSON.stringify(record)}\n`);
  },
};

const observer = createRequestObserver(
  {
    requestId: createRequestId(),
    method: 'GET',
    path: '/users/:id', // Prefer a route template, never a raw query string.
  },
  { logger },
);

try {
  await handleRequest();
  await observer.complete({ outcome: 'completed', statusCode: 200 });
} catch (error: unknown) {
  await observer.complete({ outcome: 'failed', statusCode: null });
  throw error;
}
```

The observer composes a generic timer and logger. It does not listen to HTTP events. A future framework adapter will decide when response completion, transport failure, or abortion occurs and call `complete()`.

The first completion wins. Every repeated call returns the same promise and cannot emit another record, including calls made while an asynchronous logger is pending.

## Request lifecycle semantics

- `completed`: the response transport completed normally. A status code is required. A 4xx or 5xx response is still completed because status semantics do not imply transport failure.
- `failed`: an application or transport error prevented normal completion. A status can be supplied if known, otherwise it is `null`.
- `aborted`: the client or transport ended the exchange early. A status can be supplied if headers were established, otherwise it is `null`.

Request records use levels `info`, `error`, and `warn` respectively. They contain only `requestId`, `method`, `path`, `statusCode`, `durationMs`, and `outcome`.

## Security and data ownership

rqg never accepts a request object for logging and does not automatically serialize errors, headers, bodies, cookies, query values, sessions, or credentials. Request paths containing `?`, fragments, or control characters are rejected. Prefer a low-cardinality route template such as `/users/:id`; even a path segment can contain personal or secret data.

Generic context is intentionally extensible because an application knows its domain. The application is responsible for allowlisting custom fields and redacting secrets before calling `createLogRecord()` or `writeLog()`. JSON compatibility is a serialization safety property, not a sensitivity detector. Key-name blacklists were rejected because secrets can appear under arbitrary names and a blacklist creates false confidence.

Error objects are excluded by default. If error details are needed, select safe scalar fields explicitly; do not spread or serialize an arbitrary error.

## Architectural boundaries and rejected alternatives

- Generic timing has no request fields.
- Generic logging has no HTTP metadata requirement.
- Request observation composes both and adds one explicit lifecycle state.
- Clocks and loggers are injected; no process-global state is changed.
- Framework adapters, not core, own event listeners and request/response objects.

rqg does not provide console configuration, transports, formatting pipelines, retry queues, distributed tracing, or automatic request inspection. Those features belong to established logging and telemetry systems.
