import { afterEach, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../apps/web/src/api.js';

afterEach(() => vi.unstubAllGlobals());
it('前端收到LOCKED时通知应用显示解锁页，并保留明确错误原因', async () => {
  const window = new EventTarget();
  const listener = vi.fn();
  window.addEventListener('ledgerbox:locked', listener);
  vi.stubGlobal('window', window);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'LOCKED', message: '会话已失效，请重新解锁' }), { status: 401 })));
  await expect(api.get('/ledgers')).rejects.toMatchObject({ code: 'LOCKED', message: '会话已失效，请重新解锁' });
  expect(listener).toHaveBeenCalledOnce();
});
it('普通请求失败不会误判为会话失效', async () => {
  const window = new EventTarget();
  const listener = vi.fn();
  window.addEventListener('ledgerbox:locked', listener);
  vi.stubGlobal('window', window);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'INTERNAL_ERROR', message: '服务暂时不可用' }), { status: 500 })));
  await expect(api.get('/ledgers')).rejects.toBeInstanceOf(ApiError);
  expect(listener).not.toHaveBeenCalled();
});
