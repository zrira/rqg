# Node.js HTTP lifecycle

Express request and response objects extend Node.js [`IncomingMessage`](https://nodejs.org/api/http.html#class-httpincomingmessage) and [`ServerResponse`](https://nodejs.org/api/http.html#class-httpserverresponse). Correct observability depends on transport events rather than only route-handler control flow.

## Response `finish`

`finish` fires after the response headers and body have been handed to the operating system for transmission. It does not prove that the remote client received every byte. rqg classifies this as `completed`, including normally finished 404 and 500 responses.

An application exception is not itself a transport outcome. Express may pass the error to error-handling middleware, which can produce a complete 500 response. That exchange is still transport-completed.

## Response `close`

`close` indicates that the response completed or its underlying connection terminated. Normal responses commonly emit `finish` before `close`. rqg lets the first terminal event win:

- `finish` first → completed;
- `close` before `finish` → aborted.

This ordering prevents a normal response from being logged again as aborted.

## Request abortion and stream errors

`req.aborted` fires when the client aborts while the request is being received. A request or response stream `error` represents a transport failure. rqg maps abortion to `aborted` and stream errors to `failed` unless another terminal event already won.

An aborted or failed exchange reports a status only if headers were already sent and the status is valid. Otherwise the core record uses `null`.

## Listener management

EventEmitter listeners retain their closures and referenced request state. Adding listeners without removing them can increase per-request retention and produce duplicate work.

The observability adapter:

1. installs one-shot listeners before calling `next()`;
2. protects settlement with a local boolean;
3. removes every rqg listener when one event wins;
4. relies on the core observer's idempotence as a second guard;
5. attaches both fulfillment and rejection handlers to logging completion.

No lifecycle promise is left unhandled. Logger failure reporting is guarded so an error callback cannot recursively fail the request.

## Streaming responses

A streaming handler may run for much longer than its route function. Completion must therefore follow response events, not the return of the handler. `finish` measures until Node accepts the final response data. If the connection is destroyed before that point, `close` wins and the outcome is aborted.

## Race conditions

Client abortion, response destruction, and stream errors can occur close together. Event names alone cannot guarantee only one callback. Local first-wins state plus listener cleanup is required even when listeners use `once()` because different events can each fire once.

Official references:

- [Node.js HTTP API](https://nodejs.org/api/http.html)
- [Node.js EventEmitter API](https://nodejs.org/api/events.html)
- [Express 5 error handling](https://expressjs.com/en/guide/error-handling.html)
