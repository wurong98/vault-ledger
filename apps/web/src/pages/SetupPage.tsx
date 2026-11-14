import { useState } from 'react';
import { api, ApiError } from '../api.js';

export function SetupPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [ledgerName, setLedgerName] = useState('个人');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (password.length < 6) {
      setFieldErrors({ password: '密码至少 6 个字符' });
      setError(null);
      return;
    }
    if (password !== confirmation) {
      setFieldErrors({ passwordConfirmation: '两次输入的密码不一致' });
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await api.post('/setup', { password, passwordConfirmation: confirmation, ledgerName });
      onDone();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.fields) setFieldErrors(err.fields);
      } else {
        setError('初始化失败');
      }
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
      <label htmlFor="password">密码（至少 6 个字符）</label>
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
      {fieldErrors.password ? <p className="error">{fieldErrors.password}</p> : null}
      {fieldErrors.passwordConfirmation ? (
        <p className="error">{fieldErrors.passwordConfirmation}</p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      <p className="muted">当前密码长度：{password.length} / 至少 6</p>
      <button className="primary" onClick={() => void submit()} disabled={busy}>
        {busy ? '正在初始化…' : '创建账本并加密数据空间'}
      </button>
      <p className="muted" style={{ marginTop: 12 }}>
        也可以先从备份恢复：在设置页选择备份文件。
      </p>
    </div>
  );
}
