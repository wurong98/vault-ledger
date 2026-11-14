import { describe, expect, it } from 'vitest';
import { createApp } from '../../apps/server/src/app.js';
import { VaultRepository } from '../../apps/server/src/vault/store.js';
import { LedgerService } from '../../apps/server/src/domain/ledger-service.js';
import { LedgerCsvService } from '../../apps/server/src/domain/csv-service.js';
import { parseLedgerCsv, serializeLedgerCsv } from '../../apps/web/src/csv.js';
import { makeTempDir, removeDir } from '../helpers/mock-llm.js';
import { recordListQuerySchema, type LedgerCsvRow, RECORD_TYPES } from '@ledgerbox/contracts';

const row: LedgerCsvRow = {
  id: 'record-1', type: 'expense', amount: '123.40', currency: 'CNY', occurredOn: '2026-11-15',
  accountId: 'cash', accountName: '现金', counterAccountId: null, counterAccountName: null,
  contactId: null, contactName: null, sourceId: null, paymentMethod: '现金', merchant: '  商户  ',
  category: '测试', remark: '  多行,备注\n他说"好的"  ', status: 'active',
  createdAt: '2026-11-15T00:00:00.000Z', updatedAt: '2026-11-15T00:00:00.000Z',
};

describe('全量流水 CSV', () => {
  it('往返保留空白、金额、引号、换行及公式样式文本', () => {
    for (const remark of [row.remark, '=1+2', '+123', '-abc', '@SUM(A1)', "'原有单引号", "'=1+2", '\t备注', '  =1']) {
      const data = [{ ...row, remark }];
      expect(parseLedgerCsv(serializeLedgerCsv(data))).toEqual(data);
    }
    expect(parseLedgerCsv(serializeLedgerCsv([]))).toEqual([]);
    expect(() => parseLedgerCsv('日期,金额\n2026-11-15,1')).toThrow('新版');
    expect(() => parseLedgerCsv(serializeLedgerCsv([row, row]))).toThrow('重复');
  });

  it('全量替换所有类型和作废状态，保留其他账本，原子校验并拒绝过期预览', async () => {
    const dir = await makeTempDir();
    try {
      const vault = new VaultRepository(dir);
      await vault.initialize('test password for csv 2026', '个人', 'Asia/Shanghai');
      const ledger = new LedgerService(vault);
      const csv = new LedgerCsvService(vault);
      const id = vault.manifest.ledgers[0]!.id;
      const other = await ledger.createLedger('其他账本', 'Asia/Shanghai');
      await ledger.createRecord(other.id, { ...row, accountId: ledger.listAccounts(other.id)[0]!.id });
      const data = RECORD_TYPES.map((type, index) => ({
        ...row, id: `r-${index}`, type,
        counterAccountId: type === 'transfer' ? 'bank' : null,
        counterAccountName: type === 'transfer' ? '银行' : null,
        contactId: ['lend', 'borrow', 'repayment_received', 'repayment_paid'].includes(type) ? 'contact' : null,
        contactName: ['lend', 'borrow', 'repayment_received', 'repayment_paid'].includes(type) ? '张三' : null,
      }));
      data.push({ ...row, id: 'voided', type: 'expense', status: 'voided', counterAccountId: null, counterAccountName: null, contactId: null, contactName: null });
      const plan = csv.preview(id, data);
      expect(ledger.listRecords(id, recordListQuerySchema.parse({}))).toHaveLength(0);
      await csv.replace(id, data, plan.revision);
      expect(csv.exportRows(id)).toEqual(data);
      expect(ledger.summary(id).recordCount).toBe(7);
      expect(ledger.summary(id).expense).toBe('123.40');
      expect(ledger.debts(id)).toEqual([]);
      expect(ledger.summary(other.id).recordCount).toBe(1);
      const before = structuredClone(vault.manifest);
      await expect(csv.replace(id, [{ ...row, occurredOn: '2026-02-30' }], before.revision)).rejects.toThrow('日期无效');
      await expect(csv.replace(id, [{ ...row, type: 'transfer' }], before.revision)).rejects.toThrow('转入账户');
      expect(vault.manifest).toEqual(before);
      await expect(csv.replace(id, data, plan.revision)).rejects.toThrow('其他操作');
      // 覆盖相同 ID 的金额和状态，文件外流水删除；重复导入不增加记录。
      const updated = [{ ...data[0]!, amount: '99.00', status: 'voided' as const }];
      expect(csv.preview(id, updated).removed).toBe(7);
      await csv.replace(id, updated, vault.manifest.revision);
      await csv.replace(id, updated, vault.manifest.revision);
      expect(csv.exportRows(id)).toEqual(updated);
      expect(ledger.summary(id).recordCount).toBe(0);
      const reloaded = new VaultRepository(dir);
      await reloaded.unlock('test password for csv 2026');
      expect(new LedgerCsvService(reloaded).exportRows(id)).toEqual(updated);
      await csv.replace(id, [], vault.manifest.revision);
      expect(csv.exportRows(id)).toEqual([]);
      expect(ledger.summary(other.id).recordCount).toBe(1);
    } finally { await removeDir(dir); }
  });

  it('超过列表上限仍全量导出，缺失截图在预览明确计数', async () => {
    const dir = await makeTempDir();
    try {
      const vault = new VaultRepository(dir);
      await vault.initialize('test password for csv 2026', '个人', 'Asia/Shanghai');
      const id = vault.manifest.ledgers[0]!.id;
      const csv = new LedgerCsvService(vault);
      const data = Array.from({ length: 501 }, (_, i) => ({ ...row, id: `record-${i}`, sourceId: 'not-on-this-machine' }));
      const plan = csv.preview(id, data);
      expect(plan.missingSources).toBe(501);
      await csv.replace(id, data, plan.revision);
      expect(csv.exportRows(id)).toHaveLength(501);
      expect(csv.exportRows(id).every(r => r.sourceId === null)).toBe(true);
      expect(new LedgerService(vault).listRecords(id, recordListQuerySchema.parse({}))).toHaveLength(100);
    } finally { await removeDir(dir); }
  });
  it('接口要求登录和同源，导出忽略筛选，预览后才能按版本覆盖', async () => {
    const dir = await makeTempDir();
    const { app, context } = await createApp({ dataDir: dir, appOrigin: 'http://localhost' });
    try {
      const setup = await app.inject({ method: 'POST', url: '/api/v1/setup', payload: { password: 'csv-test-password', passwordConfirmation: 'csv-test-password', ledgerName: '个人' } });
      expect(setup.statusCode).toBe(200);
      const headers = { cookie: String(setup.headers['set-cookie']).split(';')[0]! };
      const id = context.vault.manifest.ledgers[0]!.id;
      const path = `/api/v1/ledgers/${id}/records`;
      const csv = new LedgerCsvService(context.vault);
      const data = [row, { ...row, id: 'voided', status: 'voided' as const }];
      await csv.replace(id, data, context.vault.manifest.revision);
      expect((await app.inject({ method: 'GET', url: path + '/export' })).statusCode).not.toBe(200);
      const exported = await app.inject({ method: 'GET', url: path + '/export?type=income', headers });
      expect(exported.statusCode).toBe(200);
      expect(exported.json().records).toHaveLength(2);
      const rows = parseLedgerCsv(serializeLedgerCsv(exported.json().records));
      const preview = await app.inject({ method: 'POST', url: path + '/import/preview', headers, payload: { rows } });
      expect(preview.statusCode).toBe(200);
      const expectedRevision = preview.json().revision;
      const blocked = await app.inject({ method: 'POST', url: path + '/import', headers: { ...headers, origin: 'https://elsewhere.invalid' }, payload: { rows, expectedRevision } });
      expect(blocked.statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: path + '/import', headers, payload: { rows } })).statusCode).toBe(400);
      const imported = await app.inject({ method: 'POST', url: path + '/import', headers, payload: { rows, expectedRevision } });
      expect(imported.statusCode).toBe(200);
      expect(csv.exportRows(id)).toEqual(data);
      expect((await app.inject({ method: 'POST', url: path + '/import', headers, payload: { rows, expectedRevision } })).statusCode).toBe(409);
    } finally { await app.close(); await removeDir(dir); }
  });

});
