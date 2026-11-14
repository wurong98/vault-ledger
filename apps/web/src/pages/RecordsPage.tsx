import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Ledger } from '@ledgerbox/contracts';
import { api } from '../api.js';

interface RecordRow {
  id: string;
  type: string;
  amount: string;
  occurredOn: string;
  category: string | null;
  merchant: string | null;
  remark: string | null;
  status: string;
  revision: number;
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

export function RecordsPage({ ledger }: { ledger: Ledger | null }) {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [filters, setFilters] = useState({ type: '', keyword: '', dateFrom: '', dateTo: '' });
  const [includeVoided, setIncludeVoided] = useState(false);

  useEffect(() => {
    if (!ledger) return;
    const params = new URLSearchParams();
    if (filters.type) params.set('type', filters.type);
    if (filters.keyword) params.set('keyword', filters.keyword);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (includeVoided) params.set('includeVoided', 'true');
    void (async () => {
      const result = await api.get<{ records: RecordRow[] }>(
        `/ledgers/${ledger.id}/records?${params.toString()}`,
      );
      setRecords(result.records);
    })();
  }, [ledger, filters, includeVoided]);

  if (!ledger) return <div className="card">正在加载账本…</div>;

  return (
    <>
      <div className="card">
        <h2>流水</h2>
        <label htmlFor="filter-type">类型</label>
        <select
          id="filter-type"
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
        >
          <option value="">全部</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label htmlFor="filter-keyword">关键词</label>
        <input
          id="filter-keyword"
          value={filters.keyword}
          onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
          placeholder="商户、分类、备注"
        />
        <div className="grid2">
          <div>
            <label htmlFor="filter-from">开始日期</label>
            <input
              id="filter-from"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="filter-to">结束日期</label>
            <input
              id="filter-to"
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            />
          </div>
        </div>
        <label className="row">
          <input
            type="checkbox"
            style={{ width: 'auto', marginBottom: 0 }}
            checked={includeVoided}
            onChange={(e) => setIncludeVoided(e.target.checked)}
          />
          <span>包含已作废记录</span>
        </label>
      </div>

      <div className="card">
        {records.length === 0 ? (
          <p className="muted">没有符合条件的记录</p>
        ) : (
          records.map((record) => (
            <Link className="list-item" to={`/records/${record.id}`} key={record.id}>
              <span>
                {record.occurredOn} · {TYPE_LABELS[record.type] ?? record.type}
                {record.merchant ? ` · ${record.merchant}` : ''}
                {record.category ? ` · ${record.category}` : ''}
                {record.status === 'voided' ? ' · 已作废' : ''}
              </span>
              <span className="amount">¥{record.amount}</span>
            </Link>
          ))
        )}
      </div>
    </>
  );
}
