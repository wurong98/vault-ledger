import { expect, it } from 'vitest';
import { createApp } from '../../apps/server/src/app.js';
import { loadConfig } from '../../apps/server/src/config.js';
import { makeTempDir, removeDir, startMockDeepSeek } from '../helpers/mock-llm.js';

it('界面保存的Key和模型跨重启保留，重新解锁后实际使用保存值', async () => {
  const dir = await makeTempDir();
  const mock = await startMockDeepSeek(() => ({ content: 'OK' }));
  const base = loadConfig();
  const config = { ...base, dataDir: dir, llm: { ...base.llm, baseUrl: mock.url, envApiKey: null } };
  let { app, context } = await createApp(config);
  try {
    const setup = await app.inject({ method: 'POST', url: '/api/v1/setup', payload: { password: 'password123', passwordConfirmation: 'password123' } });
    let headers = { cookie: String(setup.headers['set-cookie']).split(';')[0]! };
    const saved = await app.inject({ method: 'PATCH', url: '/api/v1/settings/llm', headers, payload: { model: 'saved-model', apiKey: 'test-stored-key' } });
    expect(saved.statusCode).toBe(200);
    const test = await app.inject({ method: 'POST', url: '/api/v1/settings/llm/test', headers, payload: {} });
    expect(test.statusCode).toBe(200);
    expect(mock.requests.at(-1)?.body.model).toBe('saved-model');
    context.vault.lock(); await context.vault.releaseDirectoryLock(); await app.close();
    ({ app, context } = await createApp(config));
    const status = await app.inject({ method: 'GET', url: '/api/v1/status' });
    expect(status.json()).toMatchObject({ setupState: 'password_created', locked: true });
    const unlock = await app.inject({ method: 'POST', url: '/api/v1/unlock', payload: { password: 'password123' } });
    expect(unlock.statusCode).toBe(200);
    headers = { cookie: String(unlock.headers['set-cookie']).split(';')[0]! };
    const settings = await app.inject({ method: 'GET', url: '/api/v1/settings/llm', headers });
    expect(settings.json()).toMatchObject({ model: 'saved-model', keySource: 'ui', keyMask: '********-key' });
    expect(context.vault.manifest.providerSettings.apiKey).toBe('test-stored-key');
    const again = await app.inject({ method: 'POST', url: '/api/v1/settings/llm/test', headers, payload: {} });
    expect(again.statusCode).toBe(200);
    expect(mock.requests.at(-1)?.body.model).toBe('saved-model');
  } finally { await app.close(); await context.vault.releaseDirectoryLock(); await mock.close(); await removeDir(dir); }
});
