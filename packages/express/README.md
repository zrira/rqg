# `@rqg/express`

Express 5 middleware adapters for `@rqg/core`.

## Install

```bash
npm install @rqg/core @rqg/express express
npm install --save-dev @types/express
```

Express remains a peer dependency so the application controls its framework version.

## Request identification

```ts
import express from 'express';
import { getRequestId, requestId } from '@rqg/express';

const app = express();
app.use(requestId({ acceptIncoming: false }));
app.get('/', (_request, response) => {
  response.json({ requestId: getRequestId(response) });
});
```

## Request observability

```ts
app.use(requestObservability({ logger }));
```

The middleware records method, safe route template, status, duration, request ID, and `completed`, `failed`, or `aborted` outcome. It never logs headers, bodies, raw URLs, query values, or error objects.

## Rate limiting

```ts
app.use(
  rateLimit({
    max: 100,
    windowMs: 60_000,
    identity: (request) => request.ip,
  }),
);
```

Exceeded requests receive HTTP 429, `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset`. Missing identity receives 400; unavailable protection in fail-closed mode receives 503 without misleading quota headers.

Configure Express `trust proxy` correctly before treating `req.ip` as an original-client identity.

## Combined middleware

```ts
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

Execution order is request ID, observability, then rate limiting. Every feature can be omitted or set to `false`.

## Documentation

- [Express middleware](../../docs/concepts/express-middleware.md)
- [Node.js HTTP lifecycle](../../docs/concepts/node-http-lifecycle.md)
- [Reverse proxies and client identity](../../docs/concepts/reverse-proxies-and-client-identity.md)
- [Runnable Express example](../../examples/express-app)
