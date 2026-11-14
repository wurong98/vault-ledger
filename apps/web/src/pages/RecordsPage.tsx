import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Contact, Ledger, LedgerCsvRow, LedgerCsvPreview } from '@ledgerbox/contracts';
import { api } from '../api.js';
import { downloadLedgerCsv, parseLedgerCsv } from '../csv.js';

interface RecordRow {
  id: string;
  type: string;
  amount: string;
  occurredOn: string;
  contactId: string | null;
  paymentMethod: string | null;
  accountId: string;
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
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [filters, setFilters] = useState({ type: '', contactId: '', keyword: '', dateFrom: '', dateTo: '' });
  const [includeVoided, setIncludeVoided] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');

  async function downloadCsv() {
    if (!ledger) return;
    setExporting(true);
    setExportMessage('');
    try {
      const result = await api.get<{ records: LedgerCsvRow[] }>(`/ledgers/${ledger.id}/records/export`);
      downloadLedgerCsv(result.records);
      setExportMessage(`已发起下载，共 ${result.records.length} 笔流水`);
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : '导出失败，请重试');
    } finally { setExporting(false); }
  }

  const [importRows, setImportRows] = useState<LedgerCsvRow[] | null>(null);
  const [preview, setPreview] = useState<(LedgerCsvPreview & { ledgerId: string }) | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    setImportRows(null); setPreview(null); setImportMessage(''); setExportMessage('');
    setSelectedFile(null);
    if (fileInput.current) fileInput.current.value = '';
  }, [ledger?.id]);

  async function selectCsv(file: File) {
    if (!ledger) return;
    const ledgerId = ledger.id;
    setImportRows(null); setPreview(null); setImportMessage(''); setImporting(true);
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('CSV 文件不能超过 8 MB');
      const rows = parseLedgerCsv(await file.text());
      const result = await api.post<LedgerCsvPreview>(`/ledgers/${ledgerId}/records/import/preview`, { rows });
      setImportRows(rows); setPreview({ ...result, ledgerId });
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : '校验失败');
    } finally { setImporting(false); }
  }

  async function importCsv() {
    if (!ledger || !preview || !importRows || preview.ledgerId !== ledger.id) return;
    setImporting(true); setImportMessage('');
    try {
      const result = await api.post<LedgerCsvPreview>(`/ledgers/${ledger.id}/records/import`, { rows: importRows, expectedRevision: preview.revision });
      setImportMessage(`已全量覆盖导入 ${result.incoming} 笔流水，移除 ${result.removed} 笔文件外流水。`);
      setImportRows(null); setPreview(null); setSelectedFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setRefresh(value => value + 1);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : '导入失败');
      setPreview(null);
    } finally { setImporting(false); }
  }

  useEffect(() => {
    if (!ledger) return;
    const params = new URLSearchParams();
    if (filters.type) params.set('type', filters.type);
    if (filters.contactId) params.set('contactId', filters.contactId);
    if (filters.keyword) params.set('keyword', filters.keyword);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (includeVoided) params.set('includeVoided', 'true');
    void (async () => {
      const result = await api.get<{ records: RecordRow[] }>(
        `/ledgers/${ledger.id}/records?${params.toString()}`,
      );
      const c = await api.get<{ contacts: Contact[] }>(`/ledgers/${ledger.id}/contacts`);
      setContacts(c.contacts);
      setRecords(result.records);
    })();
  }, [ledger, filters, includeVoided, refresh]);

  if (!ledger) return <div className="card">正在加载账本…</div>;

  return (
    <>
      <div className="card">
        <h2>流水</h2>
        <button disabled={exporting} onClick={() => void downloadCsv()}>{exporting ? '正在导出…' : '导出全部 CSV'}</button>
        <p className="muted">全量导出当前账本全部流水（含已作废），不受下方筛选限制。</p>
        {exportMessage ? <p role="status">{exportMessage}</p> : null}
        <label htmlFor="import-csv">导入全量 CSV（覆盖当前账本流水）</label>
        <input ref={fileInput} id="import-csv" type="file" style={{ display: 'none' }} disabled={importing} onChange={e => {
          setSelectedFile(e.target.files?.[0] ?? null);
          setImportRows(null); setPreview(null); setImportMessage('');
        }} />
        <div className="row">
          <button type="button" disabled={importing} onClick={() => fileInput.current?.click()}>选择 CSV 文件</button>
          <span>{selectedFile ? selectedFile.name : '尚未选择文件'}</span>
          <button type="button" disabled={!selectedFile || importing} onClick={() => { if (selectedFile) void selectCsv(selectedFile); }}>校验文件</button>
        </div>
        <p className="muted">点击「选择 CSV 文件」，再点击「校验文件」，查看预览后确认覆盖。请选择本页新版导出的文件。其他账本保留；截图文件和修改历史请用加密备份恢复。</p>
        {importing ? <p role="status">正在处理…</p> : null}
        {preview && preview.ledgerId === ledger.id ? <div role="alert">
          <p>将覆盖「{ledger.name}」的全部流水：现有 {preview.existing} 笔 → 文件中 {preview.incoming} 笔（含已作废）；其中 {preview.removed} 笔文件外流水将移除。</p>
          <p>当前账本的流水修改历史将清除，分录按文件重新生成。现有可用截图关联保留。</p>
          {preview.missingSources > 0 ? <p className="error">文件中 {preview.missingSources} 笔流水的截图不在本机，导入后无法查看这些截图。</p> : null}
          {preview.incoming === 0 ? <p className="error">文件为空，确认后将清空当前账本流水。</p> : null}
          <button type="button" disabled={importing} onClick={() => { setPreview(null); setImportRows(null); }}>取消预览</button>
        </div> : null}
        <button type="button" className="primary" disabled={importing || !preview || preview.ledgerId !== ledger.id} onClick={() => void importCsv()}>确认全量覆盖导入</button>
        {!preview ? <p className="muted">选择文件并校验成功后，即可提交导入。</p> : null}
        {importMessage ? <p role="status">{importMessage}</p> : null}
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
        <label htmlFor="filter-contact">联系人</label>
        <select
          id="filter-contact"
          value={filters.contactId}
          onChange={(e) => setFilters({ ...filters, contactId: e.target.value })}
        >
          <option value="">全部联系人</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>{contact.displayName}</option>
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
                {record.contactId ? ` · ${contacts.find(c => c.id === record.contactId)?.displayName ?? '联系人不可用'}` : ['lend','borrow','repayment_received','repayment_paid'].includes(record.type) ? ' · 未关联联系人' : ''}
                {record.paymentMethod ? ` · ${record.paymentMethod}` : ''}
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
