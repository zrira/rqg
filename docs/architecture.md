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
