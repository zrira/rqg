# Deployment security

## 1. Single-process Node.js

With a direct client connection, Express's default `trust proxy: false` makes `request.ip` use the socket peer. Configure parser limits, server timeouts, maximum headers, graceful shutdown, heap monitoring, and a bounded `MemoryRateLimitStore`.

The memory limiter is atomic only inside that process. Restarting the process clears all windows.

## 2. Express behind one trusted proxy

Restrict Node so only the proxy can connect. Configure `trust proxy` with the proxy's addresses or subnets, not blanket `true`, and require the proxy to replace—rather than append to attacker-controlled—forwarding headers.

```ts
app.set('trust proxy', ['loopback', '10.20.0.0/16']);
```

Set connection, body, header, and request-rate controls at the proxy too. Test a direct connection and a spoofed `X-Forwarded-For` value before deployment.

## 3. NestJS behind a reverse proxy

The same Express trust rules apply to the supported NestJS Express platform:

```ts
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.set('trust proxy', ['10.20.0.0/16']);
```

Register `RqgModule` exactly once in the root application module. Do not combine `@rqg/express` and `@rqg/nestjs` on the same request pipeline. Configure body parsers with `useBodyParser()` and upload-specific middleware separately.

Fastify is not currently a supported rqg adapter.

## 4. Multiple proxies and load balancers

Prefer address/subnet trust or a custom trust function that reflects actual network ownership. A numeric hop count is safe only if every path has the same minimum length; a shorter alternate path can make an attacker-supplied address appear trusted.

For each ingress path verify:

1. untrusted forwarding headers are removed or overwritten;
2. only known proxy peers can reach Node;
3. Express resolves the expected `request.ip`;
4. IPv4, IPv4-mapped IPv6, and native IPv6 are normalized consistently for the policy;
5. proxy and Node parsing and timeout policies agree.

## 5. Multiple processes or replicas

Each in-memory store enforces an independent quota. Four replicas can permit approximately four times a configured quota, and load-balancer changes can move a client between fresh counters. Process restarts also reset state.

Sticky sessions reduce movement but do not provide a global guarantee. A deployment-wide policy requires atomic shared storage or an edge limiter; rqg Phase 6 provides neither. Fail-open behavior can further increase effective allowance during protection failure.

## Operational checklist

- Enforce connection and traffic controls before Node.
- Restrict direct access around trusted proxies.
- Set parser-specific and upload-specific body limits.
- Use stable, non-secret identities.
- Monitor HTTP 429, HTTP 503, aborts, store capacity, latency, heap, and event-loop delay.
- Alert on sudden identity cardinality and fail-open decisions.
- Keep Node, frameworks, and transitive packages patched.
- Run `npm audit` in CI and review findings rather than applying forced upgrades blindly.
- Avoid recording raw forwarding headers, API keys, cookies, or request bodies.
- Exercise abort, overload, and restart behavior in staging.
