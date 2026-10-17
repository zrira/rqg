# `@rqg/core`

Framework-independent HTTP request protection primitives for rqg.

## Request identification

```ts
import { resolveRequestId } from '@rqg/core';

const requestId = resolveRequestId(rawIncomingHeader, {
  // Disabled by default. Enable only when the upstream value is trusted.
  acceptIncoming: true,
});
```

The package generates canonical lowercase UUID v4 request IDs with Node.js cryptography. Invalid, missing, or untrusted incoming values are replaced with newly generated IDs.

See the repository's [request-identification guide](../../docs/concepts/request-identification.md) for validation rules, deterministic generator injection, and security considerations.
