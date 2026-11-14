import { recordInputSchema, type CsvMapping, type ChatRecordInput as RecordInput } from '@ledgerbox/contracts';

export function parseCsv(text: string): string[][] {
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
    } else if (!quoted && c === delimiter) { row.push(cell.trim()); cell = ''; }
    else if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('CSV引号未闭合，请检查文件格式');
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
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

export function exportCsv(inputs: RecordInput[]) {
  const quote = (value: string) => '"' + (/^[=+\-@\t\r]/.test(value) ? "'" : '') + value.replaceAll('"', '""') + '"';
  const rows = [['日期','类型','金额','币种','账户ID','转入账户ID','联系人ID','联系人姓名','支付方式','分类','商户','备注','来源ID'], ...inputs.map(r => [r.occurredOn, r.type, r.amount, r.currency, r.accountId, r.counterAccountId ?? '', r.contactId ?? '', r.contactName ?? '', r.paymentMethod ?? '', r.category ?? '', r.merchant ?? '', r.remark ?? '', r.sourceId ?? ''])];
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = '账匣-核对清单.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
