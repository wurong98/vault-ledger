import { ledgerCsvRowSchema, type LedgerCsvRow, recordInputSchema, type CsvMapping, type ChatRecordInput as RecordInput } from '@ledgerbox/contracts';

export function parseCsv(text: string, preserveWhitespace = false): string[][] {
  const finishCell = (value: string) => preserveWhitespace ? value : value.trim();
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/).slice(0, 10).join('\n');
  const delimiter = first.includes('\t') && !first.includes(',') ? '\t' : first.includes(';') && !first.includes(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || cell === '') quoted = !quoted;
      else cell += c;
    } else if (!quoted && c === delimiter) { row.push(finishCell(cell)); cell = ''; }
    else if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(finishCell(cell)); if (row.some(Boolean)) rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('CSV引号未闭合，请检查文件格式');
  row.push(finishCell(cell)); if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function convertCsv(rows: string[][], mapping: CsvMapping, accountId: string) {
  const errors: string[] = [];
  const inputs: RecordInput[] = [];
  rows.slice(mapping.headerRow + 1).forEach((row, index) => {
    const get = (column: number | null) => column === null ? '' : row[column]?.trim() ?? '';
    const date = get(mapping.date).match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
    const occurredOn = date ? `${date[1]}-${date[2]!.padStart(2, '0')}-${date[3]!.padStart(2, '0')}` : '';
    const amount = get(mapping.amount).replace(/[¥￥,\s]/g, '');
    const kind = get(mapping.type);
    const type = mapping.incomeValues.includes(kind) ? 'income' : mapping.expenseValues.includes(kind) ? 'expense' : mapping.type === null && /^-?\d+(\.\d{1,2})?$/.test(amount) ? (amount.startsWith('-') ? 'expense' : 'income') : null;
    const parsedDate = new Date(occurredOn + 'T00:00:00Z');
    if (!date || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== occurredOn || !/^-?\d+(\.\d{1,2})?$/.test(amount) || Number(amount) === 0 || !type) {
      errors.push(`数据行 ${index + mapping.headerRow + 2}：日期、金额或收支无法确定（${row.slice(0, 4).join(' / ')}）`); return;
    }
    const input = { type, amount: amount.replace(/^-/, ''), currency: 'CNY', occurredOn, accountId, counterAccountId: null, contactId: null, sourceId: null, merchant: get(mapping.merchant) || null, category: get(mapping.category) || null, remark: get(mapping.remark) || null, paymentMethod: null };
    const parsed = recordInputSchema.safeParse(input);
    if (parsed.success) inputs.push(parsed.data);
    else errors.push(`数据行 ${index + mapping.headerRow + 2}：字段长度或金额格式不符合要求`);
  });
  return { inputs, errors };
}

export function exportCsv(inputs: (RecordInput & { status?: string })[], filename = '蓝鲸账本-核对清单.csv', includeStatus = false) {
  const quote = (value: string) => '"' + (/^[=+\-@\t\r]/.test(value) ? "'" : '') + value.replaceAll('"', '""') + '"';
  const rows = [['日期','类型','金额','币种','账户ID','转入账户ID','联系人ID','联系人姓名','支付方式','分类','商户','备注','来源ID'], ...inputs.map(r => [r.occurredOn, r.type, r.amount, r.currency, r.accountId, r.counterAccountId ?? '', r.contactId ?? '', r.contactName ?? '', r.paymentMethod ?? '', r.category ?? '', r.merchant ?? '', r.remark ?? '', r.sourceId ?? ''])];
  if (includeStatus) {
    rows[0]!.push('状态');
    inputs.forEach((r, i) => rows[i + 1]!.push(r.status === 'voided' ? '已作废' : '有效'));
  }
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const LEDGER_CSV_COLUMNS = [
  ['id', '记录ID'], ['occurredOn', '日期'], ['type', '类型'], ['amount', '金额'],
  ['currency', '币种'], ['accountId', '账户ID'], ['accountName', '账户名称'],
  ['counterAccountId', '转入账户ID'], ['counterAccountName', '转入账户名称'],
  ['contactId', '联系人ID'], ['contactName', '联系人姓名'], ['paymentMethod', '支付方式'],
  ['category', '分类'], ['merchant', '商户'], ['remark', '备注'], ['sourceId', '来源ID'],
  ['status', '状态'], ['createdAt', '创建时间'], ['updatedAt', '更新时间'],
] as const;

/** v2 前缀转义可逆，保留空白、引号、换行和原有单引号。 */
export function serializeLedgerCsv(records: LedgerCsvRow[]): string {
  const quote = (value: string) => '"' + (/^[\s]*[=+\-@]|^[\t\r\n']/.test(value) ? "'" : '') + value.replaceAll('"', '""') + '"';
  const rows = [
    ['蓝鲸流水CSV v2', ...LEDGER_CSV_COLUMNS.map(([, label]) => label)],
    ...records.map(record => ['2', ...LEDGER_CSV_COLUMNS.map(([key]) => record[key] ?? '')]),
  ];
  return '\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n');
}

export function parseLedgerCsv(text: string): LedgerCsvRow[] {
  const [header, ...rows] = parseCsv(text, true);
  const expected = ['蓝鲸流水CSV v2', ...LEDGER_CSV_COLUMNS.map(([, label]) => label)];
  if (!header || header.length !== expected.length || header.some((cell, i) => cell !== expected[i])) {
    throw new Error('请选择新版「导出全部 CSV」生成的全量流水文件；旧版 CSV 请先重新导出。');
  }
  if (rows.length > 100000) throw new Error('单次最多导入 100000 笔流水');
  const ids = new Set<string>();
  return rows.map((row, index) => {
    if (row.length !== expected.length || row[0] !== '2') throw new Error(`第 ${index + 2} 行：列数或格式版本不正确`);
    const data: Record<string, unknown> = {};
    LEDGER_CSV_COLUMNS.forEach(([key], i) => {
      let value = row[i + 1]!;
      if (value.startsWith("'") && /^[\s]*[=+\-@]|^[\t\r\n']/.test(value.slice(1))) value = value.slice(1);
      data[key] = value === '' ? null : value;
    });
    const result = ledgerCsvRowSchema.safeParse(data);
    if (!result.success) throw new Error(`第 ${index + 2} 行：${result.error.issues.map(issue => issue.path.join('.') + ' ' + issue.message).join('；')}`);
    if (ids.has(result.data.id)) throw new Error(`第 ${index + 2} 行：记录 ID 重复`);
    ids.add(result.data.id);
    return result.data;
  });
}

export function downloadLedgerCsv(records: LedgerCsvRow[]) {
  const url = URL.createObjectURL(new Blob([serializeLedgerCsv(records)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `蓝鲸账本-全量流水-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
