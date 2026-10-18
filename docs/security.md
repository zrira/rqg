# Security

rqg provides application-layer request identification, lifecycle observation, and fixed-window rate limiting. It is one control in a defense-in-depth deployment, not a web application firewall, authentication system, body parser, request-smuggling defense, or complete DDoS service.

## Threat model and trust boundaries

rqg treats request headers and identity-resolver output as untrusted. It assumes:

- Node.js parses the HTTP wire protocol and rejects invalid header syntax;
- the selected framework parses request bodies;
- trusted reverse proxies sanitize forwarding headers;
- the application authenticates users and chooses meaningful quota identities;
- a custom logger and `RateLimitStore` are privileged application collaborators.

A reverse proxy must enforce connection, header, request-line, and preferably body limits before requests consume application resources. Node and the proxy must use compatible HTTP parsing rules to reduce request-smuggling risk. rqg does not reinterpret raw HTTP messages.

## Request IDs

Incoming IDs are rejected by default. When explicitly trusted, only one canonical lowercase UUID v4 value is accepted. Duplicate, comma-joined, oversized, Unicode-confusable, non-v4, and control-character values are replaced. Custom header names are validated with Node's HTTP API before startup.

A valid request ID provides correlation, not authentication or authorization. Only trust upstream IDs if every ingress path passes through a component that replaces untrusted values.

## Rate-limit identities

Identity strings are limited to 256 characters, cannot have surrounding whitespace or control characters, and are never included in rqg decisions, failure callbacks, or logs. Prefer stable, non-secret user, tenant, or API-key identifiers. Never use a raw API key, bearer token, session cookie, or password as the identity.

IP limiting can combine unrelated users behind NAT and can be bypassed by rotating IPv6 or proxy addresses. It is often unsuitable as the only policy. Never generate a random per-request identity: it bypasses quota while consuming storage.

## Failure policy

Fail-closed is the default. Storage, capacity, and identity-resolver failures become HTTP 503 in adapters. Fail-open is an explicit availability choice and continues without quota headers. Missing or malformed identity is rejected regardless of failure mode.

Monitor `onFailure`, HTTP 503 rates, capacity exhaustion, and store latency. Do not expose collaborator exceptions to clients.

## Configuration

Public factories reject malformed runtime configuration rather than coercing values. Nest applications must register one root `RqgModule`. Distinct registrations are detected per request and fail closed with a generic HTTP 500; this avoids ambiguous multiple guards without process-global state leaking across independent applications. Identical repeated imports are deduplicated, but should not be used as a registration strategy.

## Resource bounds

`MemoryRateLimitStore` retains at most 10,000 active keys by default. It never evicts active entries to admit a new identity. At capacity it cleans only when an expiry can exist and otherwise fails predictably. Periodic cleanup is lazy and request-driven; there are no timers.

The capacity is shared across NestJS policy namespaces when one store is configured. Increasing it trades memory for identity cardinality. The appropriate value depends on traffic, identity choice, window duration, and available heap. Edge controls should constrain identity-flooding traffic before it reaches Node.

The in-memory store coordinates only one store instance in one JavaScript process. Workers and replicas each enforce independent quotas. Use a purpose-built atomic distributed store or edge limiter when a deployment-wide guarantee is required.

## Request body sizes

rqg deliberately does not consume request streams or implement a body parser. `Content-Length` inspection alone is not enforcement: the value can be absent or inaccurate, and chunked requests have no declared total.

Configure limits in the parser that actually consumes the body:

```ts
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
```

For Express-backed NestJS:

```ts
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.useBodyParser('json', { limit: '100kb' });
app.useBodyParser('urlencoded', { extended: false, limit: '100kb' });
```

These limits reject oversized decoded parser input with HTTP 413, including chunked input. Multipart, compressed bodies, raw parsers, and streaming endpoints need limits in their own parser or upload middleware. Also configure proxy limits and consider expansion ratios for compressed input.

## Logging

rqg logs only allowlisted metadata: request ID, method, safe route template, status, duration, and transport outcome. It excludes raw URLs, query strings, headers, bodies, identity values, and error objects.

Applications can still leak secrets through custom route templates, custom loggers, surrounding middleware, or `onError`. Apply retention, access, redaction, and transport controls to logs.

## Reporting

Before public publication, report suspected vulnerabilities privately to the project maintainers rather than opening an issue containing exploit details. This repository does not yet publish a formal support or embargo policy.
