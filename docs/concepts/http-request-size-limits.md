# HTTP request size limits

## Why rqg has no body-size middleware

A reliable limit must count bytes as the selected parser consumes the stream. Looking only at `Content-Length` is insufficient because it can be absent, chunked transfer has no total length, and intermediaries can disagree about framing. Reading the stream in rqg would compete with JSON, URL-encoded, raw, multipart, and streaming consumers and could break backpressure.

rqg therefore delegates body enforcement to established framework parsers and upstream infrastructure. This is a deliberate security boundary, not a claim that bodies are safe by default.

## Express

Place limits on every parser you enable, before affected routes:

```ts
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
```

Express returns HTTP 413 when these parsers exceed their configured decoded body limit, including when the request uses chunked transfer encoding. Parser middleware ordering still matters: a parser registered earlier owns the stream.

`express.json()` does not limit multipart forms or arbitrary streams. Configure the multipart/upload package's byte, file-count, field-count, and temporary-storage limits. Streaming handlers should count accepted bytes while preserving backpressure and abort early according to their protocol.

## Express-backed NestJS

Use the supported platform API before listening:

```ts
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.useBodyParser('json', { limit: '100kb' });
app.useBodyParser('urlencoded', { extended: false, limit: '100kb' });
await app.listen(3000);
```

If body parsing is disabled or replaced, configure the replacement parser. Multipart and streaming endpoints remain outside these parsers. rqg does not currently claim Fastify integration.

## Layered controls

Set compatible limits at the CDN/load balancer, reverse proxy, Node server, and application parser. An upstream limit rejects traffic before it consumes application bandwidth or heap; an application parser limit protects against paths that reach Node and applies format-specific semantics.

Compressed bodies require care: wire-byte and decoded-byte limits protect different resources. Also configure decompression behavior and expansion limits where applicable.

Request smuggling is primarily a parser-consistency problem across intermediaries. Keep components patched, avoid ambiguous proxy transformations, and do not add an rqg framing parser alongside Node's parser.
