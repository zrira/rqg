# Express example

A minimal Express 5 application demonstrating rqg's standalone and composed middleware.

## Run

From the repository root:

```bash
npm install
npm run build --workspace @rqg-example/express-app
npm start --workspace @rqg-example/express-app
```

Set a different port with `PORT=8080`. Then try:

```bash
curl -i http://localhost:3000/standalone
curl -i http://localhost:3000/combined
curl -i http://localhost:3000/error
```

Repeated calls to the protected endpoints return HTTP 429 after five requests per minute. The application writes structured completion records to stdout and uses Express error-handling middleware for rejected route promises.

The example deliberately leaves Express `trust proxy` disabled. If it is deployed behind a reverse proxy, configure an exact trust policy before using `req.ip`; never trust `X-Forwarded-For` unconditionally.
