import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Ledger } from '@ledgerbox/contracts';
import { api, ApiError } from '../api.js';

export interface QueryResponse {
  intent: {
    operation: string;
    filters: Record<string, string | null>;
    supported: boolean;
    clarification: string | null;
  };
  appliedFilters: Record<string, string | null>;
  count: number;
  total: string | null;
  breakdown: Array<{ key: string; label: string; amount: string; count: number }>;
  records: Array<{ id: string; occurredOn: string; type: string; amount: string }>;
  debts: Array<{
    contactId: string;
    contactName: string;
    receivable: string;
    payable: string;
    net: string;
    direction: string;
  }>;
  message: string;
}

export function QueryPage({ ledger }: { ledger: Ledger | null }) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ledger) return <div className="card">正在加载账本…</div>;

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await api.post<QueryResponse>(`/ledgers/${ledger.id}/query`, {
        question,
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '查询失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card">
        <h2>自然语言查询</h2>
        <p className="muted">
          问题与必要的字段词典会发送到模型服务，金额由本机按实际记录计算。
        </p>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="例如：本月餐饮花了多少 / 张三还欠我多少"
        />
        <button className="primary" onClick={() => void ask()} disabled={busy}>
          {busy ? '查询中…' : '查询'}
        </button>
        {error ? <p className="error">{error}</p> : null}
      </div>

      {result ? (
        <div className="card">
          <h2>结果</h2>
          <p className="muted">{result.message}</p>
          <p className="muted">
            实际应用的筛选条件：
            {Object.entries(result.appliedFilters)
              .filter(([, value]) => value)
              .map(([key, value]) => `${key}=${value}`)
              .join('，') || '无'}
          </p>
          {result.total ? (
            <p className="amount">合计 ¥{result.total}</p>
          ) : null}
          {result.breakdown.length > 0 ? (
            <>
              {result.breakdown.map((item) => (
                <div className="list-item" key={item.key}>
                  <span>
                    {item.label}（{item.count} 笔）
                  </span>
                  <span className="amount">¥{item.amount}</span>
                </div>
              ))}
            </>
          ) : null}
          {result.debts.length > 0 ? (
            <>
              {result.debts.map((debt) => (
                <div className="list-item" key={debt.contactId}>
                  <span>{debt.contactName}</span>
                  <span className="amount">
                    应收 ¥{debt.receivable} / 应付 ¥{debt.payable}
                  </span>
                </div>
              ))}
            </>
          ) : null}
          {result.records.length > 0 ? (
            <>
              {result.records.map((record) => (
                <Link className="list-item" to={`/records/${record.id}`} key={record.id}>
                  <span>
                    {record.occurredOn} · {record.type}
                  </span>
                  <span className="amount">¥{record.amount}</span>
                </Link>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
