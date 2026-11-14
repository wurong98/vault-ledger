import { useState } from 'react';
import { api, ApiError } from '../api.js';

export function UnlockPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/unlock', { password });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '解锁失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>解锁账匣</h2>
      <p className="muted">数据在本地加密保存，输入密码后才能查看。</p>
      <label htmlFor="unlock-password">密码</label>
      <input
        id="unlock-password"
        type="password"
        value={password}
        autoComplete="current-password"
        onChange={(e) => setPassword(e.target.value)}
      />
      {error ? <p className="error">{error}</p> : null}
      <button className="primary" onClick={() => void submit()} disabled={busy}>
        {busy ? '解锁中…' : '解锁'}
      </button>
    </div>
  );
}
