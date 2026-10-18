# Express middleware integration

`@rqg/express` is a thin adapter over `@rqg/core`. It reads Express and Node.js HTTP state, invokes core primitives, and translates decisions into headers or terminal responses. It does not reimplement UUID validation, timing, logging, or rate-limit counters.

## Express middleware fundamentals

A normal middleware receives `req`, `res`, and `next`. Calling `next()` transfers control to the next matching middleware or route. Sending a response is terminal; middleware must not call `next()` afterward. Ordering therefore changes behavior.

Express 5 treats a rejected promise returned by an async middleware or route as `next(error)`. Synchronous throws are also forwarded. Error-handling middleware has four parameters and should be registered after routes:

```ts
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  res.status(500).send('Internal Server Error');
});
```

Global middleware runs for every later matching route. Route-level middleware limits its scope. See the official [Express middleware guide](https://expressjs.com/en/guide/using-middleware.html) and [error-handling guide](https://expressjs.com/en/guide/error-handling.html).

## Request IDs

```ts
import express from 'express';
import { getRequestId, requestId } from '@rqg/express';

const app = express();
app.use(
  requestId({
    headerName: 'x-request-id',
    acceptIncoming: false,
  }),
);

app.get('/', (_request, response) => {
  response.json({ requestId: getRequestId(response) });
});
```

Incoming IDs remain untrusted by default. When acceptance is enabled, duplicate, comma-joined, malformed, or noncanonical values are replaced. Header names are validated with Node.js `validateHeaderName()`, and validated UUIDs prevent response-header injection.

rqg stores context under a private symbol on the response. `getRequestId(res)` provides typed read access without mutating Express's global namespace, occupying `res.locals`, or using process-global state.

## Request observability

```ts
import { requestObservability } from '@rqg/express';

app.use(
  requestObservability({
    logger,
    onError(error) {
      // Send logger failures to a non-recursive metric or health channel.
      void error;
    },
  }),
);
```

The middleware starts a core timer immediately and registers lifecycle listeners before calling `next()`. On completion it resolves a safe route template, creates the core request observer, and emits one record. Installing the middleware twice does not create duplicate observers.

A global middleware cannot know the matched route when it begins. At completion rqg accepts only a string `req.route.path`. Unmatched requests use `<unmatched>` and complex route definitions use `<route>`. It never falls back to `originalUrl`, `url`, or `path`, because those may contain query values or sensitive path parameters. Mounted-router prefixes may not be present in `req.route.path`; applications needing a richer safe route name should provide logging outside this minimal adapter.

Logger failures never alter the HTTP response. They are passed to optional `onError`; without a callback they are intentionally dropped at the adapter boundary because recursively logging a logger failure is unsafe.

## Rate limiting

```ts
import { rateLimit } from '@rqg/express';

app.use(
  rateLimit({
    max: 100,
    windowMs: 60_000,
    identity: (request) => request.ip,
  }),
);
```

Identity resolvers may be synchronous or asynchronous. rqg never reads forwarding headers automatically. The resolver result is passed to the core limiter without generating anonymous identities.

Normal decisions set:

- `RateLimit-Limit`: configured maximum;
- `RateLimit-Remaining`: remaining successful consumptions;
- `RateLimit-Reset`: ceiling-rounded seconds until reset.

Exceeded decisions return HTTP 429 and add `Retry-After`, also rounded up to whole seconds. The field names follow the widely deployed RateLimit header convention; applications with a mandated header specification should verify syntax and semantics for that specification before exposing them through gateways.

Failure mapping is intentionally distinct:

| Condition                   | Closed mode | Open mode                      |
| --------------------------- | ----------- | ------------------------------ |
| Limit exceeded              | 429         | 429                            |
| Missing or invalid identity | 400         | 400                            |
| Store/capacity failure      | 503         | Continue without quota headers |
| Identity resolver failure   | 503         | Continue without quota headers |

Operational failures can be observed through `onFailure`, which receives only an allowed flag and reason—never an identity or store error. This prevents internal failures from being misrepresented as ordinary quota exhaustion.

## Combined middleware

```ts
import { rqg } from '@rqg/express';

app.use(
  rqg({
    requestId: { acceptIncoming: false },
    observability: { logger },
    rateLimit: {
      max: 100,
      windowMs: 60_000,
      identity: (request) => request.ip,
    },
  }),
);
```

`rqg()` returns an Express-compatible middleware array composed in this order:

1. request identification;
2. observability registration;
3. rate limiting.

A 429 or 503 generated by rate limiting is therefore observed once and carries the request ID when request identification is enabled. Set a feature to `false` or omit it to disable that feature. If every feature is disabled, the returned no-op middleware simply calls `next()`.

The combined API calls the standalone factories; it has no second implementation or hidden global state.

## Performance

Each request gets one small symbol-backed context and, when enabled, five one-shot lifecycle listeners. Listeners are removed as soon as an outcome wins. Request IDs and in-memory rate-limit operations are synchronous; asynchronous overhead appears only when an identity resolver or custom store is asynchronous. rqg does not serialize request objects or bodies.
