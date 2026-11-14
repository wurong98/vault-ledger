import { useState } from 'react';
import { api, ApiError } from '../api.js';

export function SetupPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [ledgerName, setLedgerName] = useState('个人');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/setup', { password, passwordConfirmation: confirmation, ledgerName });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '初始化失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>首次设置</h2>
      <p className="muted">
        设置解锁密码并创建第一个账本。密码不上传任何服务器（包括模型服务），本项目不提供密码找回。
      </p>
      <label htmlFor="password">密码（至少 12 个字符）</label>
      <input
        id="password"
        type="password"
        value={password}
        autoComplete="new-password"
        onChange={(e) => setPassword(e.target.value)}
      />
      <label htmlFor="confirmation">确认密码</label>
      <input
        id="confirmation"
        type="password"
        value={confirmation}
        autoComplete="new-password"
        onChange={(e) => setConfirmation(e.target.value)}
      />
      <label htmlFor="ledgerName">账本名称</label>
      <input
        id="ledgerName"
        value={ledgerName}
        onChange={(e) => setLedgerName(e.target.value)}
      />
      {error ? <p className="error">{error}</p> : null}
      <button className="primary" onClick={() => void submit()} disabled={busy}>
        {busy ? '正在初始化…' : '创建账本并加密数据空间'}
      </button>
      <p className="muted" style={{ marginTop: 12 }}>
        也可以先从备份恢复：在设置页选择备份文件。
      </p>
    </div>
  );
}
