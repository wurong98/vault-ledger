import { afterEach, expect, it, vi } from 'vitest';
import { createApp } from '../../apps/server/src/app.js';
import { loadConfig } from '../../apps/server/src/config.js';
import { makeTempDir, removeDir } from '../helpers/mock-llm.js';

afterEach(() => vi.useRealTimers());
it('按当前浏览器会话返回锁定状态，过期后提示解锁且保留账本', async () => {
  const dir = await makeTempDir();
  const { app, context } = await createApp({ ...loadConfig(), dataDir: dir, sessionIdleMinutes: 30 });
  try {
    const setup = await app.inject({ method: 'POST', url: '/api/v1/setup', payload: { password: 'password123', passwordConfirmation: 'password123', ledgerName: '保留的账本' } });
    const cookie = String(setup.headers['set-cookie']).split(';')[0]!;
    const headers = { cookie };
    const status = () => app.inject({ method: 'GET', url: '/api/v1/status', headers });
    expect((await status()).json()).toMatchObject({ locked: false });
    // Another browser has no authenticated session even though the vault is in memory.
    const anonymous = await app.inject({ method: 'GET', url: '/api/v1/status' });
    expect(anonymous.json()).toMatchObject({ locked: true, setupState: 'password_created' });
    const invalid = await app.inject({ method: 'GET', url: '/api/v1/status', headers: { cookie: 'lb_session=invalid' } });
    expect(invalid.json().locked).toBe(true);
    expect(context.vault.isUnlocked).toBe(true);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 31 * 60_000);
    const expired = await app.inject({ method: 'GET', url: '/api/v1/ledgers', headers });
    expect(expired.json()).toMatchObject({ code: 'LOCKED', message: '会话已失效，请重新解锁' });
    expect((await status()).json().locked).toBe(true);
    vi.useRealTimers();
    const unlock = await app.inject({ method: 'POST', url: '/api/v1/unlock', payload: { password: 'password123' } });
    const renewed = { cookie: String(unlock.headers['set-cookie']).split(';')[0]! };
    const records = await app.inject({ method: 'GET', url: '/api/v1/ledgers', headers: renewed });
    expect(records.json().ledgers[0].name).toBe('保留的账本');
    const restored = await app.inject({ method: 'GET', url: '/api/v1/status', headers: renewed });
    expect(restored.json().locked).toBe(false);
  } finally { vi.useRealTimers(); await app.close(); await context.vault.releaseDirectoryLock(); await removeDir(dir); }
});
