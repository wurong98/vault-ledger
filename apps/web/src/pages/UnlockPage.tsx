import { useState } from 'react';
import { api, ApiError } from '../api.js';

export function UnlockPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/unlock', { password });
      onDone();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setRetryAfter(err.retryAfterSeconds ?? null);
      } else {
        setError('解锁失败');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>解锁账匣</h2>
      <p className="muted">数据在本地加密保存，输入密码后才能查看。</p>
      <p className="muted">
        连续输错 3 次后会进入冷却：1 分钟 → 1 小时 → 1 天 → 1 周 → 1 月 → 1 年，重启服务才重置。
      </p>
      <label htmlFor="unlock-password">密码</label>
      <input
        id="unlock-password"
        type="password"
        value={password}
        autoComplete="current-password"
        onChange={(e) => setPassword(e.target.value)}
      />
      {error ? <p className="error">{error}</p> : null}
      {retryAfter ? (
        <p className="muted">
          冷却剩余约 {Math.ceil(retryAfter / 60)} 分钟（{retryAfter} 秒）。
        </p>
      ) : null}
      <button className="primary" onClick={() => void submit()} disabled={busy}>
        {busy ? '解锁中…' : '解锁'}
      </button>
    </div>
  );
}
