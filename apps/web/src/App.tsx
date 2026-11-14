import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import type { Ledger } from '@ledgerbox/contracts';
import { api, ApiError } from './api.js';
import { SetupPage } from './pages/SetupPage.js';
import { UnlockPage } from './pages/UnlockPage.js';
import { HomePage } from './pages/HomePage.js';
import { ChatCapturePage } from './pages/ChatCapturePage.js';
import { RecordsPage } from './pages/RecordsPage.js';
import { RecordPage } from './pages/RecordPage.js';
import { ContactsPage } from './pages/ContactsPage.js';
import { SettingsPage } from './pages/SettingsPage.js';

export interface Status {
  setupState: 'uninitialized' | 'password_created' | 'llm_config_pending' | 'ready';
  locked: boolean;
  llmConfigured: boolean;
  llmSource: 'env' | 'ui' | 'none';
  model: string | null;
  serverTime: string;
  public: {
    llm: { provider: string; baseUrl: string; model: string; envKeyPresent: boolean };
    limits: { maxImageBytes: number; maxImagePixels: number; maxBackupBytes: number };
    sessionIdleMinutes: number;
  };
}

const LEDGER_KEY = 'ledgerbox.currentLedger';

export function App() {
  const navigate = useNavigate();
  const [showCreateLedger, setShowCreateLedger] = useState(false);
  const [ledgerName, setLedgerName] = useState('');
  const [creatingLedger, setCreatingLedger] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [ledgerId, setLedgerId] = useState<string | null>(
    () => localStorage.getItem(LEDGER_KEY),
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.get<Status>('/status');
      setStatus(next);
      setError(next.locked && next.setupState !== 'uninitialized' ? '当前设备尚未解锁或会话已失效，请输入原密码继续。' : null);
      if (!next.locked && next.setupState !== 'uninitialized') {
        const data = await api.get<{ ledgers: Ledger[] }>('/ledgers');
        setLedgers(data.ledgers);
        setLedgerId((current) => {
          if (current && data.ledgers.some((l) => l.id === current)) return current;
          const fallback = data.ledgers[0]?.id ?? null;
          if (fallback) localStorage.setItem(LEDGER_KEY, fallback);
          return fallback;
        });
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'LOCKED') {
        setStatus(current => current ? { ...current, locked: true } : current);
      }
      setError(err instanceof ApiError ? err.message : '无法连接服务');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onLocked = () => {
      setStatus(current => current ? { ...current, locked: true } : current);
      setError('会话已失效，请重新输入密码解锁。已保存的数据不受影响。');
    };
    window.addEventListener('ledgerbox:locked', onLocked);
    return () => window.removeEventListener('ledgerbox:locked', onLocked);
  }, []);

  const currentLedger = useMemo(
    () => ledgers.find((l) => l.id === ledgerId) ?? null,
    [ledgers, ledgerId],
  );

  const switchLedger = (id: string) => {
    localStorage.setItem(LEDGER_KEY, id);
    setLedgerId(id);
    navigate('/');
  };

  const createLedger = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creatingLedger) return;
    const name = ledgerName.trim();
    if (!name) {
      setLedgerError('请输入账本名称');
      return;
    }
    setCreatingLedger(true);
    setLedgerError(null);
    try {
      const { ledger } = await api.post<{ ledger: Ledger }>('/ledgers', {
        name,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
      });
      setLedgers((current) => [...current, ledger]);
      switchLedger(ledger.id);
      setShowCreateLedger(false);
      setLedgerName('');
    } catch (err) {
      setLedgerError(err instanceof ApiError ? err.message : '创建失败，请重试');
    } finally {
      setCreatingLedger(false);
    }
  };

  if (!status) {
    return (
      <div className="app">
        <div className="card">
          <p className="muted">正在连接 LedgerBox…</p>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </div>
    );
  }

  if (status.setupState === 'uninitialized') {
    return (
      <div className="app">
        <SetupPage onDone={() => void refresh()} />
      </div>
    );
  }

  if (status.locked) {
    return (
      <div className="app">
        {error ? <p className="error" role="alert">{error}</p> : null}
        <UnlockPage onDone={() => void refresh()} />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="brand-mark" aria-hidden="true">匣</span><div><h1>账匣</h1><span className="brand-caption">LEDGERBOX · 私人账本</span></div></div>
        <div className="spacer" />
        <select
          value={ledgerId ?? ''}
          onChange={(event) => {
            if (event.target.value === '__new__') {
              setShowCreateLedger(true);
              setLedgerError(null);
            } else {
              switchLedger(event.target.value);
              setShowCreateLedger(false);
            }
          }}
          style={{ width: 'auto', marginBottom: 0 }}
          aria-label="切换账本"
        >
          {!ledgerId ? <option value="">选择账本</option> : null}
          {ledgers.map((ledger) => (
            <option key={ledger.id} value={ledger.id}>
              {ledger.name}
            </option>
          ))}
          <option value="__new__">＋ 新建账本</option>
        </select>
      </header>

      {showCreateLedger ? (
        <form className="card ledger-create" onSubmit={(event) => void createLedger(event)} aria-labelledby="create-ledger-title">
          <h2 id="create-ledger-title">新建账本</h2>
          <p className="muted">生活、旅行或工作，分开记录更清晰。</p>
          <label htmlFor="new-ledger-name">账本名称</label>
          <input id="new-ledger-name" value={ledgerName} onChange={(event) => setLedgerName(event.target.value)} placeholder="例如：日常生活" maxLength={60} autoFocus disabled={creatingLedger} required />
          <div className="row">
            <button className="primary" type="submit" disabled={creatingLedger}>{creatingLedger ? '创建中…' : '创建账本'}</button>
            <button type="button" disabled={creatingLedger} onClick={() => setShowCreateLedger(false)}>取消</button>
          </div>
          {ledgerError ? <p className="error" role="alert">{ledgerError}</p> : null}
        </form>
      ) : null}

      {error ? <div className="card" role="alert"><p className="error">{error}</p><button onClick={() => void refresh()}>重新加载账本</button></div> : null}

      {!status.llmConfigured ? (
        <div className="card">
          <p className="muted">
            尚未配置模型 API Key：可以手动记账，但识别与 AI 查询不可用。
          </p>
        </div>
      ) : null}

      <Routes key={ledgerId}>
        <Route path="/" element={<HomePage ledger={currentLedger} onRefresh={refresh} />} />
        <Route path="/assistant" element={<ChatCapturePage ledger={currentLedger} />} />
        <Route path="/capture" element={<Navigate to="/assistant" replace />} />
        <Route path="/records" element={<RecordsPage ledger={currentLedger} />} />
        <Route path="/records/:id" element={<RecordPage ledger={currentLedger} />} />
        <Route path="/query" element={<Navigate to="/assistant" replace />} />
        <Route path="/contacts" element={<ContactsPage ledger={currentLedger} />} />
        <Route path="/settings" element={<SettingsPage status={status} onRefresh={refresh} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <nav className="nav" aria-label="主导航">
        {[
          { to: '/', label: '首页', path: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9' },
          { to: '/assistant', label: 'AI助理', path: 'M12 8v8m-4-4h8M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z' },
          { to: '/records', label: '流水', path: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01' },
          { to: '/settings', label: '设置', path: 'M4 7h16M4 17h16M9 4v6m6 4v6' },
        ].map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={item.path} />
            </svg>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
