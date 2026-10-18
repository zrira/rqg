# NestJS example

A minimal NestJS 11 application demonstrating `RqgModule` with asynchronous configuration, request IDs, structured transport logging, global rate limiting, a route override, and a skipped health route.

## Run

From the repository root:

```bash
npm install
npm run build --workspace @rqg-example/nestjs-app
npm start --workspace @rqg-example/nestjs-app
```

Set a different port with `PORT=8080`. Try:

```bash
curl -i http://127.0.0.1:3000/
curl -i http://127.0.0.1:3000/limited
curl -i http://127.0.0.1:3000/health
curl -i http://127.0.0.1:3000/error
```

The global policy allows five requests per minute per direct client IP. `/limited` has an isolated two-request policy, while `/health` skips rate limiting. Express-backed JSON and URL-encoded parsers enforce a 100 KB limit; multipart and streaming endpoints would require separate limits. The example leaves proxy trust at its secure default; configure it explicitly before relying on forwarded client addresses.
