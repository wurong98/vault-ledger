import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Contact, Ledger } from '@ledgerbox/contracts';
import { api } from '../api.js';

interface Summary {
  ledgerId: string;
  income: string;
  expense: string;
  receivable: string;
  payable: string;
  recordCount: number;
}

interface Debt {
  contactId: string;
  contactName: string;
  receivable: string;
  payable: string;
  net: string;
  direction: string;
}

interface RecordRow {
  id: string;
  type: string;
  amount: string;
  occurredOn: string;
  contactId: string | null;
  paymentMethod: string | null;
  category: string | null;
  merchant: string | null;
  status: string;
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

export function HomePage({
  ledger,
  onRefresh,
}: {
  ledger: Ledger | null;
  onRefresh: () => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [backup, setBackup] = useState<{
    lastBackupRevision: number | null;
    currentRevision: number;
  } | null>(null);

  useEffect(() => {
    if (!ledger) return;
    void (async () => {
      const [s, d, r] = await Promise.all([
        api.get<{ summary: Summary }>(`/ledgers/${ledger.id}/summary`),
        api.get<{ debts: Debt[] }>(`/ledgers/${ledger.id}/debts`),
        api.get<{ records: RecordRow[] }>(`/ledgers/${ledger.id}/records?limit=8`),
      ]);
      const c = await api.get<{ contacts: Contact[] }>(`/ledgers/${ledger.id}/contacts`);
      setContacts(c.contacts);
      setSummary(s.summary);
      setDebts(d.debts);
      setRecords(r.records);
    })();
  }, [ledger]);

  useEffect(() => {
    void (async () => {
      try {
        const settings = await api.get<{
          lastBackupRevision: number | null;
          currentRevision: number;
        }>('/settings/backup');
        setBackup(settings);
      } catch {
        setBackup(null);
      }
    })();
  }, []);

  if (!ledger) return <div className="card">正在加载账本…</div>;

  const hasNewChanges =
    backup !== null &&
    backup.lastBackupRevision !== null &&
    backup.lastBackupRevision < backup.currentRevision;

  return (
    <>
      <div className="card">
        <h2>概览 · {ledger.name}</h2>
        <div className="grid2">
          <div>
            <p className="muted">日常收入</p>
            <p className="amount">{summary?.income ?? '—'}</p>
          </div>
          <div>
            <p className="muted">日常支出</p>
            <p className="amount">{summary?.expense ?? '—'}</p>
          </div>
          <div>
            <p className="muted">对方欠我</p>
            <p className="amount">{summary?.receivable ?? '—'}</p>
          </div>
          <div>
            <p className="muted">我欠对方</p>
            <p className="amount">{summary?.payable ?? '—'}</p>
          </div>
        </div>
        <p className="muted">共 {summary?.recordCount ?? 0} 笔有效记录</p>
      </div>

      {hasNewChanges ? (
        <div className="card">
          <p className="muted">有新的修改尚未包含在最近一次备份中，建议重新下载备份。</p>
        </div>
      ) : null}

      <div className="card">
        <h2>借还款</h2>
        {debts.length === 0 ? (
          <p className="muted">暂无借还款记录</p>
        ) : (
          debts.map((debt) => (
            <div className="list-item" key={debt.contactId}>
              <span>{debt.contactName}</span>
              <span className="amount">
                {debt.direction === 'they_owe_me'
                  ? `对方欠我 ${debt.receivable}`
                  : debt.direction === 'i_owe_them'
                    ? `我欠对方 ${debt.payable}`
                    : debt.direction === 'inconsistent'
                      ? '多收/多还或缺少历史'
                      : '已结清'}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <div className="row">
          <h2 style={{ flex: 1 }}>最近记录</h2>
          <Link to="/capture">
            <button className="primary">截图录入</button>
          </Link>
        </div>
        {records.length === 0 ? (
          <p className="muted">还没有记录，去录入第一笔吧</p>
        ) : (
          records.map((record) => (
            <Link className="list-item" to={`/records/${record.id}`} key={record.id}>
              <span>
                {record.occurredOn} · {TYPE_LABELS[record.type] ?? record.type}
                {record.contactId ? ` · ${contacts.find(c => c.id === record.contactId)?.displayName ?? '联系人不可用'}` : ['lend','borrow','repayment_received','repayment_paid'].includes(record.type) ? ' · 未关联联系人' : ''}
                {record.paymentMethod ? ` · ${record.paymentMethod}` : ''}
                {record.merchant ? ` · ${record.merchant}` : ''}
                {record.category ? ` · ${record.category}` : ''}
              </span>
              <span className="amount">¥{record.amount}</span>
            </Link>
          ))
        )}
      </div>

      <div className="card">
        <button onClick={onRefresh}>刷新数据</button>
      </div>
    </>
  );
}
