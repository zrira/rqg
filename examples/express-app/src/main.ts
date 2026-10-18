import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import {
  getRequestId,
  rateLimit,
  requestId,
  requestObservability,
  rqg,
} from '@rqg/express';

const logger = {
  log(record: unknown): void {
    process.stdout.write(`${JSON.stringify(record)}\n`);
  },
};

const app = express();

// Do not enable `trust proxy` without matching the actual proxy topology.
// With the default false value, req.ip comes from the direct socket.
app.set('trust proxy', false);

// Parser-native limits enforce both declared and chunked decoded body sizes.
// Configure multipart/upload limits in the selected upload middleware instead.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

const standaloneLimiter = rateLimit({
  max: 5,
  windowMs: 60_000,
  identity: (request) => request.ip,
});

app.use('/standalone', requestId());
app.use('/standalone', requestObservability({ logger }));
app.use('/standalone', standaloneLimiter);
app.get('/standalone', (_request, response) => {
  response.json({ requestId: getRequestId(response), mode: 'standalone' });
});

app.use(
  '/combined',
  rqg({
    requestId: { acceptIncoming: false },
    observability: { logger },
    rateLimit: {
      max: 5,
      windowMs: 60_000,
      identity: (request) => request.ip,
    },
  }),
);
app.get('/combined', (_request, response) => {
  response.json({ requestId: getRequestId(response), mode: 'combined' });
});

app.get('/error', async () => Promise.reject(new Error('Example failure')));

app.use(
  (
    error: unknown,
    _request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    void _request;
    void next;
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Unknown error'}\n`,
    );
    const statusCode = safeErrorStatus(error);
    response.status(statusCode).json({
      error: statusCode === 413 ? 'Payload Too Large' : 'Internal Server Error',
    });
  },
);

function safeErrorStatus(error: unknown): number {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return 500;
  }
  const status: unknown = error.status;
  return Number.isInteger(status) && status === 413 ? status : 500;
}

const configuredPort = Number(process.env.PORT ?? 3000);
if (
  !Number.isInteger(configuredPort) ||
  configuredPort < 0 ||
  configuredPort > 65_535
) {
  throw new TypeError('PORT must be an integer from 0 to 65535');
}

const server = app.listen(configuredPort, () => {
  const address = server.address();
  const listeningPort =
    typeof address === 'object' && address !== null
      ? address.port
      : configuredPort;
  process.stdout.write(
    `rqg Express example listening on port ${listeningPort}\n`,
  );
});
