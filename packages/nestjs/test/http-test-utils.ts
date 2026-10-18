import { request as httpRequest, type OutgoingHttpHeaders } from 'node:http';

import type { INestApplication } from '@nestjs/common';

export interface TestResponse {
  readonly statusCode: number;
  readonly headers: Readonly<
    Record<string, string | readonly string[] | undefined>
  >;
  readonly body: string;
}

export async function listen(app: INestApplication): Promise<string> {
  await app.listen(0, '127.0.0.1');
  return app.getUrl();
}

export function get(
  origin: string,
  path = '/',
  headers?: OutgoingHttpHeaders,
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
