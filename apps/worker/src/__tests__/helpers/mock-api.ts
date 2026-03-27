import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export function createMockApi(
  url: string,
  status: number,
  body: unknown = {},
  delayMs?: number,
) {
  const server = setupServer(
    http.post(url, async () => {
      if (delayMs) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      return HttpResponse.json(body, { status });
    }),
  );
  return server;
}
