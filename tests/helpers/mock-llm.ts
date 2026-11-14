import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface MockDeepSeek {
  url: string;
  server: Server;
  requests: Array<{ body: any }>;
  close: () => Promise<void>;
}

/** 启动一个假的 DeepSeek Chat Completions 服务，用于自动化测试。 */
export async function startMockDeepSeek(
  handler: (body: any) => { content: string } | { status: number },
): Promise<MockDeepSeek> {
  const requests: Array<{ body: any }> = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      let body: any = {};
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        body = {};
      }
      requests.push({ body });
      const result = handler(body);
      if ('status' in result) {
        res.statusCode = result.status;
        res.end(JSON.stringify({ error: { message: 'mock error' } }));
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          id: 'mock',
          model: body.model,
          choices: [{ message: { role: 'assistant', content: result.content } }],
        }),
      );
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    server,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

export async function makeTempDir(prefix = 'ledgerbox-test-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function removeDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}
