import { useEffect, useMemo, useState } from 'react';
import type { Ledger } from '@ledgerbox/contracts';
import { api, ApiError, newIdempotencyKey } from '../api.js';

interface Account {
  id: string;
  name: string;
}
interface Contact {
  id: string;
  displayName: string;
}
interface Candidate {
  type: string;
  amount: string;
  currency: string;
  occurredOn: string | null;
  contactName: string | null;
  accountHint: string | null;
  paymentMethod: string | null;
  merchant: string | null;
  category: string | null;
  remark: string | null;
}
interface Extraction {
  id: string;
  candidate: Candidate;
  requiresReview: string[];
  evidence: Array<{ field: string; text: string }>;
}

const TYPES = [
  ['expense', '支出'],
  ['income', '收入'],
  ['transfer', '转账'],
  ['lend', '借出'],
  ['borrow', '借入'],
  ['repayment_received', '收回'],
  ['repayment_paid', '归还'],
] as const;

export function CapturePage({ ledger }: { ledger: Ledger | null }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [form, setForm] = useState({
    type: 'expense',
    amount: '',
    occurredOn: '',
    accountId: '',
    contactId: '',
    paymentMethod: '',
    remark: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ledger) return;
    void (async () => {
      const [a, c] = await Promise.all([
        api.get<{ accounts: Account[] }>(`/ledgers/${ledger.id}/accounts`),
        api.get<{ contacts: Contact[] }>(`/ledgers/${ledger.id}/contacts`),
      ]);
      setAccounts(a.accounts);
      setContacts(c.contacts);
    })();
  }, [ledger]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  if (!ledger) return <div className="card">正在加载账本…</div>;

  const upload = async () => {
    if (!file) {
      setError('请先选择截图');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.upload<{ source: { id: string }; reused: boolean }>(
        `/ledgers/${ledger.id}/sources?note=${encodeURIComponent(note)}`,
        file,
      );
      setSourceId(result.source.id);
      setMessage(result.reused ? '已复用相同内容的来源' : '已加密保存截图');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '上传失败');
    } finally {
      setBusy(false);
    }
  };

  const recognize = async () => {
    if (!sourceId) {
      setError('请先上传截图');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ extraction: Extraction }>(
        `/sources/${sourceId}/extractions`,
        { ledgerId: ledger.id },
      );
      setExtraction(result.extraction);
      const candidate = result.extraction.candidate;
      const account = accounts.find((a) => a.name === candidate.accountHint);
      const contact = contacts.find((c) => c.displayName === candidate.contactName);
      setForm({
        type: candidate.type,
        amount: candidate.amount,
        occurredOn: candidate.occurredOn ?? '',
        accountId: account?.id ?? accounts[0]?.id ?? '',
        contactId: contact?.id ?? '',
        paymentMethod: candidate.paymentMethod ?? '',
        remark: candidate.remark ?? '',
      });
      setMessage('识别完成，请核对后确认');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '识别失败');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!extraction || !sourceId) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(
        `/extractions/${extraction.id}/confirm`,
        {
          ledgerId: ledger.id,
          sourceId,
          record: {
            type: form.type,
            amount: form.amount,
            currency: 'CNY',
            occurredOn: form.occurredOn || today,
            accountId: form.accountId,
            counterAccountId: null,
            contactId: form.contactId || null,
            paymentMethod: form.paymentMethod || null,
            merchant: null,
            category: null,
            remark: form.remark || null,
          },
        },
        { 'Idempotency-Key': newIdempotencyKey() },
      );
      setMessage('已保存到本机；尚未下载最新备份');
      setExtraction(null);
      setSourceId(null);
      setFile(null);
      setNote('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const manual = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(
        `/ledgers/${ledger.id}/records`,
        {
          type: form.type,
          amount: form.amount,
          currency: 'CNY',
          occurredOn: form.occurredOn || today,
          accountId: form.accountId,
          counterAccountId: null,
          contactId: form.contactId || null,
          paymentMethod: form.paymentMethod || null,
          merchant: null,
          category: null,
          remark: form.remark || null,
          sourceId: null,
        },
        { 'Idempotency-Key': newIdempotencyKey() },
      );
      setMessage('已保存手动记录');
      setForm({ ...form, amount: '', remark: '' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card">
        <h2>截图录入</h2>
        <p className="muted">
          截图和说明会发送给你配置的模型服务做识别；识别结果需要你确认后才会计入账本。
        </p>
        <label htmlFor="file">选择截图</label>
        <input
          id="file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {previewUrl ? (
          <img className="preview" src={previewUrl} alt="截图预览" />
        ) : null}
        <label htmlFor="note">说明（例如：微信借给张三 500，月底还）</label>
        <textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="用一句话说明这笔是什么"
        />
        <div className="row">
          <button onClick={() => void upload()} disabled={busy}>
            上传并加密保存
          </button>
          <button onClick={() => void recognize()} disabled={busy || !sourceId}>
            识别
          </button>
        </div>
        {message ? <p className="ok">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>

      <div className="card">
        <h2>{extraction ? '核对候选并确认' : '手动录入'}</h2>
        {extraction && extraction.requiresReview.length > 0 ? (
          <p className="muted">待确认字段：{extraction.requiresReview.join('、')}</p>
        ) : null}
        <label htmlFor="type">类型</label>
        <select
          id="type"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
        >
          {TYPES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label htmlFor="amount">金额</label>
        <input
          id="amount"
          inputMode="decimal"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
        />
        <label htmlFor="occurredOn">日期</label>
        <input
          id="occurredOn"
          type="date"
          value={form.occurredOn}
          onChange={(e) => setForm({ ...form, occurredOn: e.target.value })}
        />
        <label htmlFor="account">账户</label>
        <select
          id="account"
          value={form.accountId}
          onChange={(e) => setForm({ ...form, accountId: e.target.value })}
        >
          <option value="">未选择</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        <label htmlFor="contact">对方（借还款必填）</label>
        <select
          id="contact"
          value={form.contactId}
          onChange={(e) => setForm({ ...form, contactId: e.target.value })}
        >
          <option value="">无</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.displayName}
            </option>
          ))}
        </select>
        <label htmlFor="paymentMethod">支付方式</label>
        <input
          id="paymentMethod"
          value={form.paymentMethod}
          onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
        />
        <label htmlFor="remark">备注</label>
        <input
          id="remark"
          value={form.remark}
          onChange={(e) => setForm({ ...form, remark: e.target.value })}
        />
        <div className="row">
          {extraction ? (
            <button className="primary" onClick={() => void confirm()} disabled={busy}>
              确认并保存
            </button>
          ) : (
            <button className="primary" onClick={() => void manual()} disabled={busy}>
              保存手动记录
            </button>
          )}
        </div>
      </div>
    </>
  );
}
