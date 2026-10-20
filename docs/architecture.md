# Architecture

## Dependency direction

```text
@rqg/express ──┐
               ├──> @rqg/core
@rqg/nestjs ──┘
```

`@rqg/core` contains framework-independent algorithms, configuration validation, storage contracts, clocks, and errors. It must not depend on Express or NestJS. Integration packages translate framework request lifecycles into calls to core APIs.

Examples are private workspace applications. They demonstrate public APIs and must not become dependencies of publishable packages.

## Package responsibilities

### `@rqg/core`

- Define small framework-neutral APIs.
- Use native Node.js APIs where they are sufficient.
- Accept injectable collaborators such as clocks and identity resolvers when determinism or deployment-specific behavior matters.
- Never read framework-specific request or response objects.

### `@rqg/express`

- Expose typed middleware factories.
- Map Express request, response, completion, abortion, and error events to core behavior.
- Keep Express as a peer dependency so applications own the framework version.

### `@rqg/nestjs`

- Expose an `RqgModule` and lifecycle adapters suited to each concern.
- Use NestJS dependency injection for configuration and replaceable collaborators.
- Keep NestJS, RxJS, and reflection support as peer dependencies.

## Request identification

Request identification is implemented entirely in `@rqg/core`. The core receives an `unknown` incoming value rather than an HTTP request or header abstraction. This keeps parsing and framework lifecycle concerns in future adapters while putting validation and trust policy in one reusable place.

Incoming IDs are rejected by default. Explicit acceptance is an application trust decision, not an implication that a syntactically valid ID is authentic. Generation uses Node.js cryptography, and generator injection is scoped to an API call rather than stored globally.

Request IDs remain separate from distributed tracing. rqg does not model spans, propagation flags, sampling, or W3C Trace Context in the request-identification API.

## Timing and structured logging

Phase 2 separates three layers:

1. `createTimer()` measures any operation with an injectable monotonic clock.
2. `createLogRecord()` and `writeLog()` validate JSON-compatible records and isolate logger runtime failures without requiring request metadata.
3. `createRequestObserver()` composes those primitives with an allowlisted request metadata and completion model.

Core never listens to request or response events. Future adapters decide which framework lifecycle signal means completed, failed, or aborted and pass plain values into core. This preserves generic timing and logging use outside HTTP while keeping lifecycle policy reusable.

Logger configuration and record shape errors throw synchronously as programmer errors. Backend throws and promise rejections become explicit `LogWriteResult` failures. Request completion is idempotent: the first call fixes the outcome and duration, and all repeated calls share its result.

Request logging excludes headers, bodies, query values, and errors by construction. The path contract excludes query strings and fragments, but applications should still prefer redacted route templates because sensitive values can appear in path segments.

## Fixed-window rate limiting

Phase 3 separates rate limiting into policy, algorithm, and storage:

- `RateLimitPolicy` defines a positive safe-integer limit and positive finite window duration.
- `createRateLimiter()` validates identity and configuration, reads an injected monotonic clock, invokes one atomic store operation, and maps state or failure into a structured decision.
- `RateLimitStore` owns atomic fixed-window state transitions. `MemoryRateLimitStore` is a bounded process-local implementation.

Windows are anchored to an identity's first consumption and expire when `nowMs >= resetAtMs`. Counters saturate at the policy maximum. The in-memory transition is synchronous and atomic only within one event-loop context and store instance; it does not coordinate workers, processes, or deployments.

Identity extraction belongs to adapters and applications. Core accepts an opaque validated string, rejects missing identity by default, and never reads forwarding headers. Storage failure is closed by default, with explicit opt-in fail-open behavior. Memory capacity is bounded, expired entries are lazily removed, and active entries are never evicted to admit attacker-controlled identities. The store tracks its earliest reset boundary so capacity pressure does not trigger a futile full scan before any entry can expire.

## Express adapter

`@rqg/express` translates Express 5 and Node.js HTTP behavior into existing core calls. It depends inward on `@rqg/core`; core has no Express import.

Standalone factories cover request identification, lifecycle observability, and rate limiting. `rqg()` composes those same factories in request-ID, observability, rate-limit order so terminal rate-limit responses are identified and observed. There is no parallel combined implementation. Registering the same rate-limit middleware object repeatedly consumes once per request; separately constructed limiters remain independent policies.

Request state is attached to the response under a module-private symbol and exposed through `getRequestId()`. This avoids global Express type augmentation, `res.locals` collisions, and process-global mutable state.

The adapter owns HTTP-only policy: validated header names, lifecycle event listeners, safe route-template fallback, response status mapping, and rate-limit headers. Core continues to own UUID trust, timing, log records, fixed-window decisions, and storage.

Express remains a peer dependency. Type declarations are compiled against `@types/express`, while consuming TypeScript applications install the Express types appropriate to their framework version.

## NestJS adapter

`@rqg/nestjs` is a DI-managed adapter over core. `RqgModule` registers singleton configuration, middleware, guard, limiter-registry, and registration-validator providers. Request-specific state remains attached to the Node response under a package-private symbol rather than creating request-scoped providers.

Distinct dynamic metadata gives Nest distinct module and provider graphs. During application bootstrap, the validator uses Nest's `DiscoveryService` to inspect all application-local registration providers after asynchronous factories resolve. More than one configuration-owner identity aborts `app.init()` before listening. Reimports using the same sync or async registration object remain equivalent. Identity comparison avoids unsafe serialization of functions and collaborators, while container-local discovery avoids process-global state.

Middleware owns request identification and transport lifecycle observation because it runs before guards and pipes. `RqgRateLimitGuard` owns quota enforcement and Nest HTTP exceptions. RxJS interceptor completion is intentionally not used as a transport-completion signal.

Rate-limit metadata follows method, controller, then global precedence. A registry caches core limiters and wraps the one shared store with global/controller/method namespaces, preventing incompatible policies from colliding. Application-local object identity distinguishes same-named controllers and handlers, while length-framed keys prevent namespace/identity delimiter collisions.

Phase 5 supports and tests NestJS 11's Express platform. Fastify is not claimed. Applications select either the NestJS or Express rqg adapter for a request pipeline; cross-package private context coupling was rejected.

## Security boundaries

Node.js owns HTTP wire parsing. Reverse proxies own trusted forwarding metadata and should reject malformed or oversized traffic before Node. Express or NestJS parsers own request body consumption. rqg validates its configuration, generated/request-controlled values, and collaborator outputs without introducing a second HTTP or body parser.

Parser-native body limits protect JSON and URL-encoded requests, including chunked input; multipart and streaming handlers require format-specific limits. The in-memory limiter cannot coordinate processes or replicas and does not prevent bandwidth, socket, TLS, or proxy exhaustion.

See [Security](security.md), [Deployment security](deployment-security.md), and [HTTP request size limits](concepts/http-request-size-limits.md).

## Build and module model

The repository uses npm workspaces rather than an additional monorepo orchestrator. TypeScript project references express build order and package boundaries. Packages compile as ESM with `NodeNext` module resolution and publish JavaScript, source maps, and declarations from `dist/`.

Package export maps are the public boundary. Consumers cannot rely on undeclared internal paths. `main` and `types` are retained for compatibility with tooling that does not fully understand conditional exports.

## Design constraints

- Dependency flow is inward toward core.
- Public state is explicit; there are no hidden mutable singletons.
- Configuration is validated at runtime at API boundaries.
- Framework adapters compose core services instead of inheriting from them.
- Examples and tests consume public package APIs when those APIs exist.
- Generated output is ignored and never committed.
