# Reverse proxies and client identity

Rate limiting is only as reliable as its identity. A proxy changes which network peer connects directly to Node.js, and forwarded headers are ordinary attacker-controlled input unless a trusted intermediary replaces them.

## Express `trust proxy`

Express leaves `trust proxy` disabled by default. In that mode, `req.ip` is derived from the direct socket address. Behind a reverse proxy, that address is usually the proxy rather than the original client.

When `trust proxy` is enabled, Express uses `proxy-addr` and forwarding information to derive `req.ip` and `req.ips`. A blanket `true` setting trusts the left-most `X-Forwarded-For` value. It is safe only when the final trusted proxy removes attacker-supplied forwarding headers and every network path has the expected proxy chain.

Prefer an exact subnet, address list, hop-count policy with a fixed topology, or custom trust function:

```ts
const app = express();
app.set('trust proxy', ['loopback', '10.0.0.0/8']);

app.use(
  rateLimit({
    max: 100,
    windowMs: 60_000,
    identity: (request) => request.ip,
  }),
);
```

Review the official [Express behind proxies guide](https://expressjs.com/en/guide/behind-proxies.html) and test every ingress path. A hop-count policy can become unsafe when paths have different lengths.

## Identity choices

Possible identities include:

- canonical client IP after correct proxy configuration;
- authenticated user or tenant ID;
- an API key identifier, not the secret key itself;
- a deliberate shared anonymous bucket.

IP addresses are imperfect: NAT combines users, privacy relays rotate addresses, and IPv6 clients may use temporary addresses. Authenticated identities are usually more stable but do not protect unauthenticated endpoints. Applications often need layered limits with different keys; this phase provides one resolver per middleware instance rather than a policy DSL.

Do not return or log raw API keys, session IDs, or identity values. rqg decisions and operational failure callbacks intentionally omit them.

## Missing identity

The core default rejects missing identity. The Express adapter maps missing or malformed identity to HTTP 400. An explicit shared identity can be configured through the core `missingIdentity` option, causing all unidentified clients to consume one quota.

Never generate a random identity per request. That creates a fresh counter every time and defeats the limiter while filling memory.

## Failure and denial-of-service tradeoffs

Fail closed returns HTTP 503 for storage, capacity, or resolver failure. It preserves protection but can reduce availability. Fail open continues without quota headers and reports the operational reason through `onFailure`; it preserves availability but temporarily removes the affected protection.

HTTP 429 means a valid identity exhausted a known quota. HTTP 503 is used when rqg cannot make a valid fail-closed quota decision. Conflating these states would emit misleading retry and reset information.

Application rate limiting occurs after a connection reaches Express. It cannot prevent attacks that exhaust bandwidth, sockets, TLS termination, a reverse proxy, or upstream infrastructure. Use network and edge controls in addition to application limits.
