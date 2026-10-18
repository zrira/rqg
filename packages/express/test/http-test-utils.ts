import { request as httpRequest, type OutgoingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Express } from 'express';

export interface TestResponse {
  readonly statusCode: number;
  readonly headers: Readonly<
    Record<string, string | readonly string[] | undefined>
  >;
  readonly body: string;
}

export async function withServer<T>(
  app: Express,
  run: (origin: string) => Promise<T>,
): Promise<T> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address() as AddressInfo;
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) =>
        error === undefined ? resolve() : reject(error),
      );
    });
  }
}

export function get(
  origin: string,
  path = '/',
  headers?: OutgoingHttpHeaders | readonly string[],
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      `${origin}${path}`,
      { method: 'GET', headers },
      (response) => {
        response.setEncoding('utf8');
        let body = '';
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.once('end', () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            body,
          });
        });
      },
    );
    request.once('error', reject);
    request.end();
  });
}
