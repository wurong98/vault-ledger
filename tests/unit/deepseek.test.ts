import { afterEach, expect, it, vi } from 'vitest';
import { DeepSeekClient } from '../../apps/server/src/llm/deepseek.js';

afterEach(() => vi.unstubAllGlobals());

const client = () => new DeepSeekClient({
  baseUrl: 'https://example.invalid', model: 'deepseek-flash',
  timeoutMs: 1000, maxConcurrency: 1, getApiKey: () => 'test',
});

it('显式关闭思考模式，让有限输出额度用于正文', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { content: '{"operation":"sum"}' } }],
  })));
  vi.stubGlobal('fetch', fetchMock);
  await expect(client().chat([{ role: 'user', content: '查询' }], { jsonMode: true, maxTokens: 1024 }))
    .resolves.toBe('{"operation":"sum"}');
  expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({
    thinking: { type: 'disabled' }, max_tokens: 1024, response_format: { type: 'json_object' },
  });
});

it.each(['', '{"operation":'])('输出被截断时提供长度提示，正文为 %j', async content => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    choices: [{ finish_reason: 'length', message: { content, reasoning_content: 'thinking' } }],
  }))));
  await expect(client().chat([])).rejects.toThrow('模型输出达到长度上限');
});

it('只有思考过程时不将其当作最终答复', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { content: null, reasoning_content: 'thinking' } }],
  }))));
  await expect(client().chat([])).rejects.toThrow('模型仅返回了思考过程');
});
