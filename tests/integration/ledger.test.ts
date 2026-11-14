import { describe, expect, it } from 'vitest';
import { VaultRepository } from '../../apps/server/src/vault/store.js';
import { LedgerService } from '../../apps/server/src/domain/ledger-service.js';
import { makeTempDir, removeDir } from '../helpers/mock-llm.js';

const PASSWORD = 'correct horse battery staple 2026';

async function setup() {
  const dir = await makeTempDir();
  const vault = new VaultRepository(dir);
  await vault.initialize(PASSWORD, '个人', 'Asia/Shanghai');
  const service = new LedgerService(vault);
  const ledgerId = vault.manifest.ledgers[0]!.id;
  const account = await service.createAccount(ledgerId, '微信零钱', '微信');
  const contact = await service.createContact(ledgerId, '张三', null);
  return { dir, vault, service, ledgerId, account, contact };
}

describe('账本与借还款', () => {
  it('借出 500、收回 200 → 应收 300，日常收支不变', async () => {
    const ctx = await setup();
    try {
      const { service, ledgerId, account, contact } = ctx;
      await service.createRecord(ledgerId, {
        type: 'lend',
        amount: '500.00',
        currency: 'CNY',
        occurredOn: '2026-11-01',
        accountId: account.id,
        counterAccountId: null,
        contactId: contact.id,
        paymentMethod: '微信',
        merchant: null,
        category: null,
        remark: null,
        sourceId: null,
      });
      await service.createRecord(ledgerId, {
        type: 'repayment_received',
        amount: '200.00',
        currency: 'CNY',
        occurredOn: '2026-11-10',
        accountId: account.id,
        counterAccountId: null,
        contactId: contact.id,
        paymentMethod: '微信',
        merchant: null,
        category: null,
        remark: null,
        sourceId: null,
      });

      const summary = service.summary(ledgerId);
      expect(summary.receivable).toBe('300.00');
      expect(summary.income).toBe('0.00');
      expect(summary.expense).toBe('0.00');

      const debts = service.debts(ledgerId);
      expect(debts).toHaveLength(1);
      expect(debts[0]!.receivable).toBe('300.00');
      expect(debts[0]!.direction).toBe('they_owe_me');
    } finally {
      await removeDir(ctx.dir);
    }
  });

  it('借入 800、归还 300 → 应付 500', async () => {
    const ctx = await setup();
    try {
      const { service, ledgerId, account, contact } = ctx;
      for (const [type, amount] of [
        ['borrow', '800.00'],
        ['repayment_paid', '300.00'],
      ] as const) {
        await service.createRecord(ledgerId, {
          type,
          amount,
          currency: 'CNY',
          occurredOn: '2026-11-02',
          accountId: account.id,
          counterAccountId: null,
          contactId: contact.id,
          paymentMethod: null,
          merchant: null,
          category: null,
          remark: null,
          sourceId: null,
        });
      }
      const debts = service.debts(ledgerId);
      expect(debts[0]!.payable).toBe('500.00');
      expect(debts[0]!.direction).toBe('i_owe_them');
    } finally {
      await removeDir(ctx.dir);
    }
  });

  it('金额拒绝超过两位小数', async () => {
    const ctx = await setup();
    try {
      await expect(
        ctx.service.createRecord(ctx.ledgerId, {
          type: 'expense',
          amount: '0.001',
          currency: 'CNY',
          occurredOn: '2026-11-02',
          accountId: ctx.account.id,
          counterAccountId: null,
          contactId: null,
          paymentMethod: null,
          merchant: null,
          category: null,
          remark: null,
          sourceId: null,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    } finally {
      await removeDir(ctx.dir);
    }
  });

  it('修改金额保留历史，版本冲突被拒绝', async () => {
    const ctx = await setup();
    try {
      const { service, ledgerId, account } = ctx;
      const record = await service.createRecord(ledgerId, {
        type: 'expense',
        amount: '500.00',
        currency: 'CNY',
        occurredOn: '2026-11-02',
        accountId: account.id,
        counterAccountId: null,
        contactId: null,
        paymentMethod: null,
        merchant: null,
        category: '餐饮',
        remark: null,
        sourceId: null,
      });
      const updated = await service.updateRecord(
        record.id,
        { amount: '600.00', reason: '记错了' },
        record.revision,
      );
      expect(updated.amount).toBe('600.00');

      const history = service.recordHistory(record.id);
      expect(history.revisions).toHaveLength(1);
      expect(history.revisions[0]!.previousRevision).toBe(1);

      await expect(
        service.updateRecord(record.id, { amount: '700.00' }, record.revision),
      ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });

      const summary = service.summary(ledgerId);
      expect(summary.expense).toBe('600.00');
    } finally {
      await removeDir(ctx.dir);
    }
  });

  it('修订借还款记录时保留联系人，不会被缺省值覆盖', async () => {
    const ctx = await setup();
    try {
      const { service, ledgerId, account, contact } = ctx;
      const record = await service.createRecord(ledgerId, {
        type: 'lend',
        amount: '500.00',
        currency: 'CNY',
        occurredOn: '2026-11-01',
        accountId: account.id,
        counterAccountId: null,
        contactId: contact.id,
        paymentMethod: '微信',
        merchant: null,
        category: null,
        remark: '月底归还',
        sourceId: null,
      });
      const updated = await service.updateRecord(
        record.id,
        { amount: '600.00' },
        record.revision,
      );
      expect(updated.amount).toBe('600.00');
      expect(updated.contactId).toBe(contact.id);
      expect(updated.remark).toBe('月底归还');
      expect(updated.paymentMethod).toBe('微信');
    } finally {
      await removeDir(ctx.dir);
    }
  });

  it('作废后不计入当前统计', async () => {
    const ctx = await setup();
    try {
      const { service, ledgerId, account } = ctx;
      const record = await service.createRecord(ledgerId, {
        type: 'expense',
        amount: '12.00',
        currency: 'CNY',
        occurredOn: '2026-11-02',
        accountId: account.id,
        counterAccountId: null,
        contactId: null,
        paymentMethod: null,
        merchant: null,
        category: null,
        remark: null,
        sourceId: null,
      });
      await service.voidRecord(record.id, record.revision);
      expect(service.summary(ledgerId).expense).toBe('0.00');
      const visible = service.listRecords(ledgerId, { limit: 10, includeVoided: false });
      expect(visible).toHaveLength(0);
      const withVoided = service.listRecords(ledgerId, { limit: 10, includeVoided: true });
      expect(withVoided).toHaveLength(1);
    } finally {
      await removeDir(ctx.dir);
    }
  });

  it('相同幂等键不会重复入账，不同内容报冲突', async () => {
    const ctx = await setup();
    try {
      const { service, ledgerId, account } = ctx;
      const input = {
        type: 'expense' as const,
        amount: '30.00',
        currency: 'CNY' as const,
        occurredOn: '2026-11-02',
        accountId: account.id,
        counterAccountId: null,
        contactId: null,
        paymentMethod: null,
        merchant: null,
        category: null,
        remark: null,
        sourceId: null,
      };
      const first = await service.createRecord(ledgerId, input, 'idem-key-0001');
      const second = await service.createRecord(ledgerId, input, 'idem-key-0001');
      expect(second.id).toBe(first.id);
      expect(service.listRecords(ledgerId, { limit: 10, includeVoided: true })).toHaveLength(1);

      await expect(
        service.createRecord(ledgerId, { ...input, amount: '31.00' }, 'idem-key-0001'),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    } finally {
      await removeDir(ctx.dir);
    }
  });

  it('借还款必须指定联系人', async () => {
    const ctx = await setup();
    try {
      await expect(
        ctx.service.createRecord(ctx.ledgerId, {
          type: 'lend',
          amount: '100.00',
          currency: 'CNY',
          occurredOn: '2026-11-02',
          accountId: ctx.account.id,
          counterAccountId: null,
          contactId: null,
          paymentMethod: null,
          merchant: null,
          category: null,
          remark: null,
          sourceId: null,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    } finally {
      await removeDir(ctx.dir);
    }
  });
});
