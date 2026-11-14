import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Ledger } from '@ledgerbox/contracts';
import { api, ApiError } from '../api.js';

interface RecordRow {
  id: string;
  type: string;
  amount: string;
  currency: string;
  occurredOn: string;
  contactId: string | null;
  paymentMethod: string | null;
  merchant: string | null;
  category: string | null;
  remark: string | null;
  sourceId: string | null;
  revision: number;
  status: string;
}

interface History {
  revisions: Array<{
    id: string;
    previousRevision: number;
    correctedFields: string[];
    reason: string | null;
    createdAt: string;
  }>;
  journals: Array<{ id: string; revision: number; createdAt: string }>;
  auditEvents: Array<{ action: string; createdAt: string }>;
}

const TYPE_LABELS: Record<string, string> = {
  expense: '支出',
  income: '收入',
  transfer: '转账',
  lend: '借出',
  borrow: '借入',
  repayment_received: '收回',
  repayment_paid: '归还',
};

export function RecordPage({ ledger }: { ledger: Ledger | null }) {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<RecordRow | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [amount, setAmount] = useState('');
  const [occurredOn, setOccurredOn] = useState('');
  const [remark, setRemark] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const result = await api.get<{ record: RecordRow }>(`/records/${id}`);
      setRecord(result.record);
      setAmount(result.record.amount);
      setOccurredOn(result.record.occurredOn);
      setRemark(result.record.remark ?? '');
      const h = await api.get<History>(`/records/${id}/history`);
      setHistory(h);
      if (result.record.sourceId) {
        const response = await fetch(`/api/v1/sources/${result.record.sourceId}/image`, {
          credentials: 'same-origin',
        });
        if (response.ok) {
          const blob = await response.blob();
          setImageUrl(URL.createObjectURL(blob));
        }
      }
    })();
  }, [id]);

  if (!ledger) return <div className="card">正在加载账本…</div>;
  if (!record) return <div className="card">正在加载记录…</div>;

  const save = async () => {
    setError(null);
    setMessage(null);
    try {
      const result = await api.patch<{ record: RecordRow }>(`/records/${record.id}`, {
        expectedRevision: record.revision,
        amount,
        occurredOn,
        remark: remark || null,
        reason: '页面修改',
      });
      setRecord(result.record);
      setMessage('已保存，旧版本保留在历史中');
      const h = await api.get<History>(`/records/${record.id}/history`);
      setHistory(h);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    }
  };

  const voidRecord = async () => {
    setError(null);
    try {
      const result = await api.post<{ record: RecordRow }>(
        `/records/${record.id}/void`,
        { expectedRevision: record.revision },
      );
      setRecord(result.record);
      setMessage('已作废，历史与来源保留');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '作废失败');
    }
  };

  return (
    <>
      <div className="card">
        <h2>
          {TYPE_LABELS[record.type] ?? record.type} ¥{record.amount}
        </h2>
        <p className="muted">
          {record.occurredOn} · 第 {record.revision} 版 ·{' '}
          {record.status === 'voided' ? '已作废' : '有效'}
        </p>
        {imageUrl ? (
          <a href={imageUrl} target="_blank" rel="noreferrer">
            <img className="preview" src={imageUrl} alt="原始截图" />
          </a>
        ) : (
          <p className="muted">这条记录没有关联截图</p>
        )}
      </div>

      <div className="card">
        <h2>修改</h2>
        <label htmlFor="edit-amount">金额</label>
        <input
          id="edit-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <label htmlFor="edit-date">日期</label>
        <input
          id="edit-date"
          type="date"
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
        />
        <label htmlFor="edit-remark">备注</label>
        <input
          id="edit-remark"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
        />
        <div className="row">
          <button className="primary" onClick={() => void save()}>
            保存修改
          </button>
          {record.status === 'active' ? (
            <button className="danger" onClick={() => void voidRecord()}>
              作废
            </button>
          ) : null}
        </div>
        {message ? <p className="ok">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>

      <div className="card">
        <h2>修改历史</h2>
        {history && history.revisions.length > 0 ? (
          history.revisions.map((revision) => (
            <div className="list-item" key={revision.id}>
              <span>
                第 {revision.previousRevision} 版 → 第 {revision.previousRevision + 1} 版：
                {revision.correctedFields.join('、')}
              </span>
              <span className="muted">{revision.createdAt.slice(0, 16).replace('T', ' ')}</span>
            </div>
          ))
        ) : (
          <p className="muted">还没有修改过</p>
        )}
      </div>
    </>
  );
}
