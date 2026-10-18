# Defensive programming

TypeScript types disappear at runtime. Public rqg factories therefore validate values received from JavaScript, configuration systems, dependency injection, and custom collaborators.

## Fail early on configuration

Configuration validation rejects wrong container types, invalid callback types, non-finite numbers, unsafe integers, nonpositive limits, invalid header names, invalid stores, and unsupported policy values. It does not coerce strings into numbers or booleans. Programmer errors should surface during construction or application initialization.

Runtime collaborator output is also validated. Examples include generated request IDs, clock readings, logger records, identities, and custom store results. A type assertion by a consumer cannot bypass runtime checks safely.

## Constrain failure effects

- Logger throws and promise rejections become explicit results and cannot fail a response.
- Completion is idempotent; terminal event races produce one record.
- Rate-limit storage uses one atomic operation.
- Operational limiter failures follow an explicit open/closed policy.
- Failure callbacks cannot override that policy by throwing.
- Internal store and identity-resolver errors are not returned to clients.

Catching every error is not defensive. Invalid setup should fail visibly, while failures covered by a documented availability policy should become bounded decisions.

## Parse at the correct boundary

Node parses HTTP syntax, frameworks parse routing and bodies, trusted proxies establish network identity, rqg validates the values it consumes, and applications own authentication and authorization. Reimplementing another layer's parser creates disagreement and can increase request-smuggling risk.

For this reason rqg validates custom header names but does not parse raw HTTP, and it recommends parser-native body limits rather than reading streams itself.

## Safe metadata

Observability reads route templates through own data properties and falls back to conservative placeholders. It does not serialize arbitrary route objects, errors, headers, raw URLs, or bodies. Status values are checked before logging.

## Regression testing

Useful security tests reproduce externally visible behavior: bounded capacity, malformed collaborator results, duplicate headers, chunked oversized bodies, exact reset boundaries, concurrent quota use, abort races, duplicate middleware, and same-named Nest controllers. Injected clocks avoid sleeps and make boundary behavior deterministic.
