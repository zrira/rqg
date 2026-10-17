# Request identification

Request IDs correlate events that belong to one request. They are useful in log records, error reports, and response headers, but they are not credentials and must not authorize access.

## Public API

```ts
import {
  createRequestId,
  isRequestId,
  resolveRequestId,
  type RequestId,
  type RequestIdGenerator,
  type ResolveRequestIdOptions,
} from '@rqg/core';
```

### Generate an ID

```ts
const requestId = createRequestId();
// canonical lowercase UUID v4, for example:
// "9a7d7f16-1f5c-47c7-b299-61f48f7658aa"
```

`createRequestId()` uses Node.js [`crypto.randomUUID()`](https://nodejs.org/api/crypto.html#cryptorandomuuidoptions). Node generates the UUID from a cryptographically secure pseudorandom source. rqg validates the result so an injected generator cannot accidentally introduce malformed IDs.

### Resolve an untrusted incoming value

```ts
const incomingHeader: unknown = getHeaderFromTransport();

// Secure default: ignore even a syntactically valid incoming value.
const internalId = resolveRequestId(incomingHeader);

// Opt in only when preserving upstream correlation is intentional.
const propagatedId = resolveRequestId(incomingHeader, {
  acceptIncoming: true,
});
```

When incoming acceptance is disabled, or when the value is missing or invalid, rqg generates a new ID. The input type is `unknown` deliberately: framework adapters can pass raw header values without converting arrays, objects, or other malformed data to strings.

### Deterministic testing

```ts
const generator: RequestIdGenerator = () =>
  '9a7d7f16-1f5c-47c7-b299-61f48f7658aa';

const requestId = resolveRequestId(undefined, { generator });
```

Generator output still has to be a valid canonical UUID v4. Dependency injection is per call, so there is no mutable global generator to leak between tests or applications.

### Validate a value

```ts
if (isRequestId(value)) {
  // value is narrowed to RequestId
}
```

`RequestId` is a branded string type. Branding records successful validation in TypeScript, but it adds no runtime protection and can be bypassed with a type assertion. Runtime data must still enter through `isRequestId`, `createRequestId`, or `resolveRequestId`.

## Validation rules

Accepted incoming IDs must be exactly 36 ASCII characters in canonical lowercase UUID v4 form:

```text
xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
```

rqg rejects:

- uppercase or whitespace-padded UUIDs;
- UUID versions other than version 4;
- invalid RFC 4122 variant bits;
- arrays and other non-string header representations;
- control characters and header-injection payloads;
- objects, without calling coercion methods such as `toString()`;
- oversized strings before regular-expression matching.

Strict canonical validation avoids ambiguous representations and makes values safe to place in structured logs and, through a future adapter, response headers. It does not prove who supplied an ID.

## Trust boundary

An incoming request ID is attacker-controlled unless deployment infrastructure establishes otherwise. Accepting it can let a caller choose log-correlation keys, create deliberate collisions across requests, or confuse incident investigation. Therefore `acceptIncoming` defaults to `false` and must be enabled explicitly.

Even in a trusted proxy deployment, configure the edge to replace external request-ID headers rather than merely forwarding them. Validation limits shape; it is not authentication. Never use a request ID as a session ID, CSRF token, idempotency key, or access-control decision.

## Request IDs versus distributed trace IDs

A request ID is a single opaque correlation value. A distributed trace carries trace and parent/span relationships across services, usually with sampling flags and strict propagation rules. The interoperable [W3C Trace Context](https://www.w3.org/TR/trace-context/) format uses `traceparent` and `tracestate`; it is not a UUID request-ID protocol.

rqg does not derive trace IDs from request IDs or treat one as a substitute for the other. Applications may log both. A future tracing integration should use an OpenTelemetry or W3C-compatible implementation rather than extending this request-ID API.

## Architectural decisions

- Native `crypto.randomUUID()` avoids an extra UUID dependency.
- Canonical UUID v4 is the only accepted format, keeping the API predictable.
- Validation operates on `unknown` and never coerces input.
- A length check precedes a fixed, anchored regular expression.
- Incoming trust is explicit and defaults to rejection.
- Generator injection enables deterministic tests without hidden global state.
- Invalid configuration and invalid generated output throw `TypeError`; invalid incoming data does not throw because it is expected at a network boundary.
