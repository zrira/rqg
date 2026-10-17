# rqg

A lightweight, modular HTTP request protection toolkit for Node.js, Express, and NestJS.

> **Status:** early development. Phase 2 timing and structured-logging APIs are available in `@rqg/core`.

## Packages

| Package        | Responsibility                                             |
| -------------- | ---------------------------------------------------------- |
| `@rqg/core`    | Framework-independent algorithms, contracts, and utilities |
| `@rqg/express` | Typed Express middleware adapters                          |
| `@rqg/nestjs`  | NestJS module and request-lifecycle adapters               |

The core package never depends on Express or NestJS. See [the architecture document](docs/architecture.md) for dependency and packaging decisions.

## Requirements

- Node.js 24 or newer
- npm 12 or newer

## Development

```bash
npm install
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Build artifacts are written to each package's `dist/` directory and are not committed.

## Roadmap

1. ✅ Request identification
2. ✅ Request timing and structured logging
3. Fixed-window rate limiting
4. Express integration
5. NestJS integration
6. Security hardening
7. Packaging and publishing verification

Implementation notes live in [`docs/concepts`](docs/concepts), including the [foundation](docs/concepts/phase-0-foundation.md), [request identification](docs/concepts/request-identification.md), [operation timing](docs/concepts/operation-timing.md), and [structured logging](docs/concepts/structured-logging.md).

## License

[MIT](LICENSE)
