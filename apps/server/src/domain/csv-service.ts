import { randomUUID } from 'node:crypto';
import { ledgerCsvRowSchema, ledgerCsvImportSchema, type LedgerCsvRow, type LedgerCsvPreview, type Manifest, type RecordEntry } from '@ledgerbox/contracts';
import { assertBalanced, buildPostings } from '../accounting/postings.js';
import { AppError } from '../errors.js';
import type { VaultRepository } from '../vault/store.js';

/** 一次提交替换当前账本流水；先在副本中完成所有校验。 */
export class LedgerCsvService {
  constructor(private readonly vault: VaultRepository) {}

  exportRows(ledgerId: string): LedgerCsvRow[] {
    const m = this.vault.manifest;
    this.requireLedger(m, ledgerId);
    return m.records.filter(r => r.ledgerId === ledgerId).map(r => ledgerCsvRowSchema.parse({
      ...r,
      accountName: m.accounts.find(a => a.id === r.accountId)!.name,
      counterAccountName: m.accounts.find(a => a.id === r.counterAccountId)?.name ?? null,
      contactName: m.contacts.find(c => c.id === r.contactId)?.displayName ?? null,
    }));
  }

  preview(ledgerId: string, rows: LedgerCsvRow[]): LedgerCsvPreview {
    return this.prepare(structuredClone(this.vault.manifest), ledgerId, rows);
  }

  async replace(ledgerId: string, rows: LedgerCsvRow[], expectedRevision: number): Promise<LedgerCsvPreview> {
    let result!: LedgerCsvPreview;
    await this.vault.commit(expectedRevision, draft => {
      result = this.prepare(draft, ledgerId, rows);
      draft.auditEvents.push({ id: randomUUID(), ledgerId, action: 'records.csv.replace', targetId: ledgerId, revision: draft.revision + 1, createdAt: new Date().toISOString() });
    });
    return result;
  }

  private requireLedger(m: Manifest, id: string) {
    if (!m.ledgers.some(l => l.id === id)) throw new AppError('NOT_FOUND', '账本不存在');
  }

  private prepare(m: Manifest, ledgerId: string, rawRows: LedgerCsvRow[]): LedgerCsvPreview {
    this.requireLedger(m, ledgerId);
    const rows = ledgerCsvImportSchema.parse({ rows: rawRows }).rows;
    const old = m.records.filter(r => r.ledgerId === ledgerId);
    const ids = new Set<string>();
    const oldById = new Map(old.map(r => [r.id, r]));
    const otherIds = new Set(m.records.filter(r => r.ledgerId !== ledgerId).map(r => r.id));
    const accounts = new Map<string, string>();
    const contacts = new Map<string, string>();
    const now = new Date().toISOString();
    let missingSources = 0;
    const account = (id: string, name: string): string => {
      const mapped = accounts.get(id);
      if (mapped) {
        if (m.accounts.find(a => a.id === mapped)!.name !== name) throw new AppError('VALIDATION_FAILED', '同一账户 ID 对应了不同名称');
        return mapped;
      }
      const existing = m.accounts.find(a => a.id === id && a.ledgerId === ledgerId);
      if (existing) existing.name = name;
      const target = existing ?? { id: m.accounts.some(a => a.id === id) ? randomUUID() : id, ledgerId, name, paymentMethod: null, active: true };
      if (!existing) m.accounts.push(target);
      accounts.set(id, target.id);
      return target.id;
    };
    const records: RecordEntry[] = [];
    for (const [index, row] of rows.entries()) {
      const fail = (message: string): never => { throw new AppError('VALIDATION_FAILED', `第 ${index + 2} 行：${message}`); };
      if (ids.has(row.id)) fail('记录 ID 重复');
      ids.add(row.id);
      if (otherIds.has(row.id)) fail('记录 ID 属于其他账本，请导入原账本或空的数据空间');
      const date = new Date(row.occurredOn + 'T00:00:00Z');
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== row.occurredOn) fail('日期无效');
      if (!!row.counterAccountId !== !!row.counterAccountName) fail('转入账户 ID 与名称必须同时填写');
      if (!!row.contactId !== !!row.contactName) fail('联系人 ID 与姓名必须同时填写');
      let contactId: string | null = null;
      if (row.contactId && row.contactName) {
        contactId = contacts.get(row.contactId) ?? null;
        if (contactId && m.contacts.find(c => c.id === contactId)!.displayName !== row.contactName) fail('同一联系人 ID 对应了不同姓名');
        if (!contactId) {
          const existing = m.contacts.find(c => c.id === row.contactId && c.ledgerId === ledgerId);
          if (existing) existing.displayName = row.contactName;
          const target = existing ?? { id: m.contacts.some(c => c.id === row.contactId) ? randomUUID() : row.contactId, ledgerId, displayName: row.contactName, remark: null };
          if (!existing) m.contacts.push(target);
          contactId = target.id;
          contacts.set(row.contactId, contactId);
        }
      }
      const sourceId = row.sourceId && m.sources.some(s => s.id === row.sourceId && s.ledgerId === ledgerId) ? row.sourceId : null;
      if (row.sourceId && !sourceId) missingSources++;
      const record: RecordEntry = {
        id: row.id, ledgerId, type: row.type, amount: row.amount, currency: row.currency,
        occurredOn: row.occurredOn, accountId: account(row.accountId, row.accountName),
        counterAccountId: row.counterAccountId ? account(row.counterAccountId, row.counterAccountName!) : null,
        contactId, sourceId, paymentMethod: row.paymentMethod, merchant: row.merchant,
        category: row.category, remark: row.remark, status: row.status, revision: (oldById.get(row.id)?.revision ?? 0) + 1,
        createdAt: row.createdAt, updatedAt: row.updatedAt,
      };
      const postings = buildPostings(record);
      assertBalanced(postings);
      records.push(record);
    }
    // 以快照重建分录，作废流水没有有效分录；不保留失效的旧流水修订。
    m.records = [...m.records.filter(r => r.ledgerId !== ledgerId), ...records];
    m.recordRevisions = m.recordRevisions.filter(r => r.ledgerId !== ledgerId);
    m.journals = m.journals.filter(j => j.ledgerId !== ledgerId);
    for (const record of records) {
      m.journals.push({ id: randomUUID(), ledgerId, recordId: record.id, revision: record.revision, reversesJournalId: null, postings: record.status === 'active' ? buildPostings(record) : [], createdAt: now });
    }
    // 清除已移除流水的幂等引用，保留仍存在的记录以避免旧草稿重复入账。
    m.idempotency = m.idempotency.filter(i => i.scope !== `${ledgerId}:record.create` || (i.resultId !== null && ids.has(i.resultId)));
    return { revision: m.revision, existing: old.length, incoming: records.length, removed: old.filter(r => !ids.has(r.id)).length, missingSources };
  }
}
