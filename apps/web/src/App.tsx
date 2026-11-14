import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import type { Ledger } from '@ledgerbox/contracts';
import { api, ApiError } from './api.js';
import { SetupPage } from './pages/SetupPage.js';
import { UnlockPage } from './pages/UnlockPage.js';
import { HomePage } from './pages/HomePage.js';
import { CapturePage } from './pages/CapturePage.js';
import { RecordsPage } from './pages/RecordsPage.js';
import { RecordPage } from './pages/RecordPage.js';
import { QueryPage } from './pages/QueryPage.js';
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
      setError(null);
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
      setError(err instanceof ApiError ? err.message : '无法连接服务');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const currentLedger = useMemo(
    () => ledgers.find((l) => l.id === ledgerId) ?? null,
    [ledgers, ledgerId],
  );

  const switchLedger = (id: string) => {
    localStorage.setItem(LEDGER_KEY, id);
    setLedgerId(id);
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
        <UnlockPage onDone={() => void refresh()} />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>LedgerBox 账匣</h1>
        <div className="spacer" />
        <select
          value={ledgerId ?? ''}
          onChange={(event) => switchLedger(event.target.value)}
          style={{ width: 'auto', marginBottom: 0 }}
          aria-label="切换账本"
        >
          {ledgers.map((ledger) => (
            <option key={ledger.id} value={ledger.id}>
              {ledger.name}
            </option>
          ))}
        </select>
      </header>

      {!status.llmConfigured ? (
        <div className="card">
          <p className="muted">
            尚未配置模型 API Key：可以手动记账，但识别与 AI 查询不可用。
          </p>
        </div>
      ) : null}

      <Routes>
        <Route path="/" element={<HomePage ledger={currentLedger} onRefresh={refresh} />} />
        <Route path="/capture" element={<CapturePage ledger={currentLedger} />} />
        <Route path="/records" element={<RecordsPage ledger={currentLedger} />} />
        <Route path="/records/:id" element={<RecordPage ledger={currentLedger} />} />
        <Route path="/query" element={<QueryPage ledger={currentLedger} />} />
        <Route path="/settings" element={<SettingsPage status={status} onRefresh={refresh} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <nav className="nav">
        <NavLink to="/" end>
          {({ isActive }) => (
            <button className={isActive ? 'active' : ''}>首页</button>
          )}
        </NavLink>
        <NavLink to="/capture">
          {({ isActive }) => (
            <button className={isActive ? 'active' : ''}>录入</button>
          )}
        </NavLink>
        <NavLink to="/records">
          {({ isActive }) => (
            <button className={isActive ? 'active' : ''}>流水</button>
          )}
        </NavLink>
        <NavLink to="/query">
          {({ isActive }) => (
            <button className={isActive ? 'active' : ''}>查询</button>
          )}
        </NavLink>
        <NavLink to="/settings">
          {({ isActive }) => (
            <button className={isActive ? 'active' : ''}>设置</button>
          )}
        </NavLink>
      </nav>
    </div>
  );
}
