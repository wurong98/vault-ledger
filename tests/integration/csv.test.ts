import { describe, expect, it } from 'vitest';
import { convertCsv, parseCsv } from '../../apps/web/src/csv.js';
import type { CsvMapping } from '@ledgerbox/contracts';
const mapping: CsvMapping = { headerRow: 0, date: 0, amount: 1, type: 2, merchant: null, category: 3, remark: 4, incomeValues: ['收入'], expenseValues: ['支出'] };
describe('旧账单 CSV', () => {
  it('支持BOM、引号内逗号换行和双引号转义', () => {
    expect(parseCsv('\uFEFF日期,备注\r\n2026-01-01,"饭钱,含饮料\n他说""好的"""')).toEqual([['日期','备注'], ['2026-01-01','饭钱,含饮料\n他说"好的"']]);
    expect(() => parseCsv('a,b\n"未闭合')).toThrow('引号未闭合');
  });
  it('拒绝不真实日期、含糊收支和超过两位小数，保留有效金额', () => {
    const result = convertCsv(parseCsv('日期,金额,收支,分类,备注\n2026/1/2,"￥1,200.50",支出,餐饮,聚餐\n2026-02-30,20,收入,,\n2026-01-02,30,转账,,\n2026-01-02,1.234,支出,,'), mapping, 'account');
    expect(result.inputs).toHaveLength(1);
    expect(result.inputs[0]).toMatchObject({ amount: '1200.50', type: 'expense', occurredOn: '2026-01-02', category: '餐饮' });
    expect(result.errors).toHaveLength(3);
  });
});
