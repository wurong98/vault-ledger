import { useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
import type { Status } from '../App.js';

interface LlmSettings {
  provider: string;
  model: string;
  keySource: 'env' | 'ui' | 'none';
  keyMask: string | null;
  envKeyPresent: boolean;
  updatedAt: string;
}

export function SettingsPage({
  status,
  onRefresh,
}: {
  status: Status;
  onRefresh: () => void;
}) {
  const [settings, setSettings] = useState<LlmSettings | null>(null);
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [planId, setPlanId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    createdAt: string;
    ledgerCount: number;
    recordCount: number;
    blobCount: number;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await api.get<LlmSettings>('/settings/llm');
      setSettings(result);
      setModel(result.model);
    })();
  }, []);

  const saveLlm = async () => {
    setError(null);
    setMessage(null);
    try {
      const payload: { model?: string; apiKey?: string } = { model };
      if (apiKey) payload.apiKey = apiKey;
      const result = await api.patch<LlmSettings>('/settings/llm', payload);
      setSettings(result);
      setApiKey('');
      setMessage('已保存');
      onRefresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    }
  };

  const testLlm = async () => {
    setError(null);
    setMessage(null);
    try {
      await api.post('/settings/llm/test', {});
      setMessage('连接正常');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '连接失败');
    }
  };

  const downloadBackup = async () => {
    setError(null);
    setMessage(null);
    try {
      const result = await api.post<{ backupId: string; filename: string }>('/backups', {});
      const link = document.createElement('a');
      link.href = `/api/v1/backups/${result.backupId}/download`;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setMessage(
        '已发起备份下载。请到手机文件管理器确认文件确实存在——网页无法证明下载结果。',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '生成备份失败');
    }
  };

  const previewRestore = async () => {
    setError(null);
    setMessage(null);
    if (!restoreFile) {
      setError('请选择备份文件');
      return;
    }
    const form = new FormData();
    form.append('password', restorePassword);
    form.append('file', restoreFile);
    try {
      const response = await fetch('/api/v1/restores/preview', {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
      });
      const body = await response.json();
      if (!response.ok) {
        throw new ApiError(body.code ?? 'INTERNAL_ERROR', body.message ?? '恢复校验失败');
      }
      setPlanId(body.planId);
      setPreview(body.preview);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '恢复校验失败');
    }
  };

  const confirmRestore = async () => {
    if (!planId) return;
    setError(null);
    try {
      await api.post(`/restores/${planId}/confirm`, {});
      setMessage('恢复完成，请重新解锁');
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '恢复失败');
    }
  };

  return (
    <>
      <div className="card">
        <h2>模型设置</h2>
        <p className="muted">
          Key 加密保存在本机，不进入前端包。环境变量提供的 Key 优先于界面保存值，且不随备份迁移。
        </p>
        <label htmlFor="model">模型名称</label>
        <input id="model" value={model} onChange={(e) => setModel(e.target.value)} />
        <label htmlFor="apikey">DeepSeek API Key（留空表示不修改）</label>
        <input
          id="apikey"
          type="password"
          value={apiKey}
          autoComplete="off"
          onChange={(e) => setApiKey(e.target.value)}
        />
        {settings ? (
          <p className="muted">
            当前来源：
            {settings.keySource === 'env'
              ? '环境变量'
              : settings.keySource === 'ui'
                ? `界面保存（${settings.keyMask ?? '已设置'}）`
                : '未配置'}
          </p>
        ) : null}
        <div className="row">
          <button className="primary" onClick={() => void saveLlm()}>
            保存
          </button>
          <button onClick={() => void testLlm()}>测试连接</button>
        </div>
        {message ? <p className="ok">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>

      <div className="card">
        <h2>备份</h2>
        <p className="muted">
          每次点击都会生成当时的一份完整加密快照，包含全部账本、记录、截图与设置。
        </p>
        <button onClick={() => void downloadBackup()}>下载加密备份</button>
      </div>

      <div className="card">
        <h2>从备份恢复</h2>
        <p className="muted">恢复会整体替换当前数据空间，恢复前的副本会被保留。</p>
        <label htmlFor="restore-file">备份文件</label>
        <input
          id="restore-file"
          type="file"
          accept=".ledgerbox,application/zip"
          onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
        />
        <label htmlFor="restore-password">备份密码</label>
        <input
          id="restore-password"
          type="password"
          value={restorePassword}
          onChange={(e) => setRestorePassword(e.target.value)}
        />
        <div className="row">
          <button onClick={() => void previewRestore()}>校验备份</button>
          {planId ? (
            <button className="danger" onClick={() => void confirmRestore()}>
              确认恢复
            </button>
          ) : null}
        </div>
        {preview ? (
          <p className="muted">
            备份时间 {preview.createdAt.slice(0, 16).replace('T', ' ')} · {preview.ledgerCount}{' '}
            个账本 · {preview.recordCount} 条记录 · {preview.blobCount} 张截图
          </p>
        ) : null}
      </div>

      <div className="card">
        <h2>会话</h2>
        <p className="muted">空闲 {status.public.sessionIdleMinutes} 分钟后自动锁定。</p>
        <div className="row">
          <button
            onClick={() => {
              void api.post('/lock', {}).then(() => window.location.reload());
            }}
          >
            锁定当前设备
          </button>
          <button
            className="danger"
            onClick={() => {
              void api.post('/lock-all', {}).then(() => window.location.reload());
            }}
          >
            锁定全部设备
          </button>
        </div>
      </div>
    </>
  );
}
