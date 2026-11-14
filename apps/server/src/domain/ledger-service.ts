import { createHash, randomUUID } from 'node:crypto';
import {
  fromCents,
  toCents,
  type Account,
  type Contact,
  type Journal,
  type Ledger,
  type Manifest,
  type RecordEntry,
  type RecordInput,
  type RecordPatch,
  type RecordListQuery,
  type RecordRevision,
} from '@ledgerbox/contracts';
import { AppError } from '../errors.js';
import { assertBalanced, buildPostings } from '../accounting/postings.js';
import type { VaultRepository } from '../vault/store.js';

export interface DebtSummary {
  contactId: string;
  contactName: string;
  receivable: string;
  payable: string;
  /** 负数表示多收/多还或缺少历史。 */
  net: string;
  direction: 'they_owe_me' | 'i_owe_them' | 'settled' | 'inconsistent';
}

export interface LedgerSummary {
  ledgerId: string;
  income: string;
  expense: string;
  receivable: string;
  payable: string;
  recordCount: number;
}

export function hashRequest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export class LedgerService {
  constructor(private readonly vault: VaultRepository) {}

  private get manifest(): Manifest {
    return this.vault.manifest;
  }

  /* ---------- 账本 / 账户 / 联系人 ---------- */

  listLedgers(): Ledger[] {
    return this.manifest.ledgers;
  }

  requireLedger(ledgerId: string): Ledger {
    const ledger = this.manifest.ledgers.find((l) => l.id === ledgerId);
    if (!ledger) throw new AppError('NOT_FOUND', '账本不存在');
    return ledger;
  }

  listAccounts(ledgerId: string): Account[] {
    this.requireLedger(ledgerId);
    return this.manifest.accounts.filter((a) => a.ledgerId === ledgerId);
  }

  listContacts(ledgerId: string): Contact[] {
    this.requireLedger(ledgerId);
    return this.manifest.contacts.filter((c) => c.ledgerId === ledgerId);
  }

  async createLedger(name: string, timezone: string): Promise<Ledger> {
    const ledger: Ledger = {
      id: randomUUID(),
      name,
      currency: 'CNY',
      timezone,
      createdAt: new Date().toISOString(),
    };
    await this.vault.commit(null, (draft) => {
      draft.ledgers.push(ledger);
      draft.accounts.push({ id: randomUUID(), ledgerId: ledger.id, name: '日常资金', paymentMethod: null, active: true });
      draft.auditEvents.push(this.audit('ledger.create', ledger.id, draft.revision));
    });
    return ledger;
  }

  /** 为旧版本没有账户的账本补齐默认账户，不修改已有账户。 */
  async ensureDefaultAccounts(): Promise<void> {
    if (!this.manifest.ledgers.some(ledger => !this.manifest.accounts.some(account => account.ledgerId === ledger.id))) return;
    await this.vault.commit(null, draft => {
      for (const ledger of draft.ledgers) {
        if (draft.accounts.some(account => account.ledgerId === ledger.id)) continue;
        const account = { id: randomUUID(), ledgerId: ledger.id, name: '日常资金', paymentMethod: null, active: true };
        draft.accounts.push(account);
        draft.auditEvents.push(this.audit('account.create', account.id, draft.revision, ledger.id));
      }
    });
  }

  async createAccount(
    ledgerId: string,
    name: string,
    paymentMethod: string | null,
  ): Promise<Account> {
    this.requireLedger(ledgerId);
    const account: Account = {
      id: randomUUID(),
      ledgerId,
      name,
      paymentMethod,
      active: true,
    };
    await this.vault.commit(null, (draft) => {
      draft.accounts.push(account);
      draft.auditEvents.push(this.audit('account.create', account.id, draft.revision));
    });
    return account;
  }

  async createContact(
    ledgerId: string,
    displayName: string,
    remark: string | null,
  ): Promise<Contact> {
    this.requireLedger(ledgerId);
    displayName = displayName.trim();
    if (!displayName) throw new AppError('VALIDATION_FAILED', '请输入联系人姓名');
    let contact: Contact = { id: randomUUID(), ledgerId, displayName, remark };
    await this.vault.commit(null, (draft) => {
      const existing = draft.contacts.find(c => c.ledgerId === ledgerId && c.displayName.trim() === displayName);
      if (existing) { contact = existing; return; }
      draft.contacts.push(contact);
      draft.auditEvents.push(this.audit('contact.create', contact.id, draft.revision));
    });
    return contact;
  }

  async updateContact(ledgerId: string, contactId: string, displayName: string, remark: string | null): Promise<Contact> {
    this.requireLedger(ledgerId);
    displayName = displayName.trim();
    if (!displayName) throw new AppError('VALIDATION_FAILED', '请输入联系人姓名');
    let result: Contact | undefined;
    await this.vault.commit(null, draft => {
      const contact = draft.contacts.find(c => c.id === contactId && c.ledgerId === ledgerId);
      if (!contact) throw new AppError('NOT_FOUND', '联系人不存在');
      if (draft.contacts.some(c => c.ledgerId === ledgerId && c.id !== contactId && c.displayName.trim() === displayName)) throw new AppError('VALIDATION_FAILED', '已存在同名联系人');
      contact.displayName = displayName; contact.remark = remark; result = contact;
      draft.auditEvents.push(this.audit('contact.update', contactId, draft.revision, ledgerId));
    });
    return result!;
  }

  async deleteContact(ledgerId: string, contactId: string): Promise<void> {
    this.requireLedger(ledgerId);
    await this.vault.commit(null, draft => {
      if (!draft.contacts.some(c => c.id === contactId && c.ledgerId === ledgerId)) throw new AppError('NOT_FOUND', '联系人不存在');
      if (draft.records.some(r => r.contactId === contactId)) throw new AppError('VALIDATION_FAILED', '该联系人已关联账单，请保留以便对账');
      draft.contacts = draft.contacts.filter(c => c.id !== contactId);
      draft.auditEvents.push(this.audit('contact.delete', contactId, draft.revision, ledgerId));
    });
  }

  /* ---------- 记录 ---------- */

  listRecords(ledgerId: string, query: RecordListQuery): RecordEntry[] {
    this.requireLedger(ledgerId);
    let records = this.manifest.records.filter((r) => r.ledgerId === ledgerId);
    if (!query.includeVoided) records = records.filter((r) => r.status === 'active');
    if (query.type) records = records.filter((r) => r.type === query.type);
    if (query.category) records = records.filter((r) => r.category === query.category);
    if (query.contactId) records = records.filter((r) => r.contactId === query.contactId);
    if (query.accountId) records = records.filter((r) => r.accountId === query.accountId);
    if (query.paymentMethod) {
      records = records.filter((r) => r.paymentMethod === query.paymentMethod);
    }
    if (query.dateFrom) records = records.filter((r) => r.occurredOn >= query.dateFrom!);
    if (query.dateTo) records = records.filter((r) => r.occurredOn <= query.dateTo!);
    if (query.keyword) {
      const keyword = query.keyword.toLowerCase();
      records = records.filter((r) =>
        [r.merchant, r.category, r.remark, r.paymentMethod]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(keyword)),
      );
    }
    records.sort((a, b) =>
      a.occurredOn === b.occurredOn
        ? a.createdAt.localeCompare(b.createdAt)
        : b.occurredOn.localeCompare(a.occurredOn),
    );
    return records.slice(0, query.limit);
  }

  getRecord(recordId: string): RecordEntry {
    const record = this.manifest.records.find((r) => r.id === recordId);
    if (!record) throw new AppError('NOT_FOUND', '记录不存在');
    return record;
  }

  recordHistory(recordId: string): {
    revisions: RecordRevision[];
    journals: Journal[];
    auditEvents: Manifest['auditEvents'];
  } {
    this.getRecord(recordId);
    return {
      revisions: this.manifest.recordRevisions.filter((r) => r.recordId === recordId),
      journals: this.manifest.journals.filter((j) => j.recordId === recordId),
      auditEvents: this.manifest.auditEvents.filter(
        (e) => e.targetId === recordId,
      ),
    };
  }

  async createRecord(
    ledgerId: string,
    input: RecordInput,
    idempotencyKey?: string,
  ): Promise<RecordEntry> {
    this.requireLedger(ledgerId);
    this.validateReferences(ledgerId, input);

    const scope = `${ledgerId}:record.create`;
    const requestHash = hashRequest(input);
    if (idempotencyKey) {
      const existing = this.manifest.idempotency.find(
        (i) => i.key === idempotencyKey && i.scope === scope,
      );
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new AppError('IDEMPOTENCY_CONFLICT', '相同幂等键对应了不同的请求内容');
        }
        const record = existing.resultId
          ? this.manifest.records.find((r) => r.id === existing.resultId)
          : undefined;
        if (record) return record;
      }
    }

    const now = new Date().toISOString();
    const record: RecordEntry = {
      id: randomUUID(),
      ledgerId,
      sourceId: input.sourceId ?? null,
      type: input.type,
      amount: input.amount,
      currency: input.currency,
      occurredOn: input.occurredOn,
      accountId: input.accountId,
      counterAccountId: input.counterAccountId ?? null,
      contactId: input.contactId ?? null,
      paymentMethod: input.paymentMethod ?? null,
      merchant: input.merchant ?? null,
      category: input.category ?? null,
      remark: input.remark ?? null,
      revision: 1,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    const postings = buildPostings({
      type: record.type,
      amount: record.amount,
      accountId: record.accountId,
      counterAccountId: record.counterAccountId,
      contactId: record.contactId,
    });
    assertBalanced(postings);

    const journal: Journal = {
      id: randomUUID(),
      ledgerId,
      recordId: record.id,
      revision: 1,
      reversesJournalId: null,
      postings,
      createdAt: now,
    };

    await this.vault.commit(null, (draft) => {
      draft.records.push(record);
      draft.journals.push(journal);
      draft.auditEvents.push(this.audit('record.create', record.id, draft.revision, ledgerId));
      if (idempotencyKey) {
        draft.idempotency.push({
          key: idempotencyKey,
          scope,
          requestHash,
          resultId: record.id,
          createdAt: now,
        });
      }
    });
    return record;
  }

  async updateRecord(
    recordId: string,
    patch: RecordPatch,
    expectedRevision: number,
  ): Promise<RecordEntry> {
    const current = this.getRecord(recordId);
    if (current.revision !== expectedRevision) {
      throw new AppError('REVISION_CONFLICT', '记录已被其他操作修改，请重新加载');
    }
    const next: RecordEntry = {
      ...current,
      ...stripUndefined(patch),
      revision: current.revision + 1,
      status: 'active',
      updatedAt: new Date().toISOString(),
    };
    delete (next as Partial<RecordPatch>).reason;
    this.validateReferences(current.ledgerId, next);

    const postings = buildPostings({
      type: next.type,
      amount: next.amount,
      accountId: next.accountId,
      counterAccountId: next.counterAccountId,
      contactId: next.contactId,
    });
    assertBalanced(postings);

    const previousJournal = this.effectiveJournal(current.id);
    const journal: Journal = {
      id: randomUUID(),
      ledgerId: current.ledgerId,
      recordId: current.id,
      revision: next.revision,
      reversesJournalId: previousJournal?.id ?? null,
      postings,
      createdAt: next.updatedAt,
    };
    const correctedFields = Object.keys(patch).filter(
      (key) => key !== 'reason' && (patch as Record<string, unknown>)[key] !== undefined,
    );

    await this.vault.commit(null, (draft) => {
      const index = draft.records.findIndex((r) => r.id === current.id);
      draft.records[index] = next;
      draft.journals.push(journal);
      draft.recordRevisions.push({
        id: randomUUID(),
        recordId: current.id,
        ledgerId: current.ledgerId,
        previousRevision: current.revision,
        correctedFields,
        reason: patch.reason ?? null,
        createdAt: next.updatedAt,
      });
      draft.auditEvents.push(
        this.audit('record.update', current.id, draft.revision, current.ledgerId),
      );
    });
    return next;
  }

  async voidRecord(recordId: string, expectedRevision: number): Promise<RecordEntry> {
    const current = this.getRecord(recordId);
    if (current.revision !== expectedRevision) {
      throw new AppError('REVISION_CONFLICT', '记录已被其他操作修改，请重新加载');
    }
    const next: RecordEntry = {
      ...current,
      status: 'voided',
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    const previousJournal = this.effectiveJournal(current.id);
    const journal: Journal = {
      id: randomUUID(),
      ledgerId: current.ledgerId,
      recordId: current.id,
      revision: next.revision,
      reversesJournalId: previousJournal?.id ?? null,
      postings: previousJournal
        ? previousJournal.postings.map((p) => ({
            ...p,
            direction: p.direction === 'debit' ? 'credit' : 'debit',
          }))
        : [],
      createdAt: next.updatedAt,
    };
    await this.vault.commit(null, (draft) => {
      const index = draft.records.findIndex((r) => r.id === current.id);
      draft.records[index] = next;
      draft.journals.push(journal);
      draft.recordRevisions.push({
        id: randomUUID(),
        recordId: current.id,
        ledgerId: current.ledgerId,
        previousRevision: current.revision,
        correctedFields: ['status'],
        reason: '作废',
        createdAt: next.updatedAt,
      });
      draft.auditEvents.push(
        this.audit('record.void', current.id, draft.revision, current.ledgerId),
      );
    });
    return next;
  }

  private effectiveJournal(recordId: string): Journal | undefined {
    const journals = this.manifest.journals.filter((j) => j.recordId === recordId);
    if (journals.length === 0) return undefined;
    const reversed = new Set(
      journals.map((j) => j.reversesJournalId).filter((id): id is string => Boolean(id)),
    );
    const effective = journals.filter((j) => !reversed.has(j.id));
    return effective[effective.length - 1];
  }

  /* ---------- 统计 ---------- */

  summary(ledgerId: string): LedgerSummary {
    this.requireLedger(ledgerId);
    const active = this.manifest.records.filter(
      (r) => r.ledgerId === ledgerId && r.status === 'active',
    );
    let income = 0n;
    let expense = 0n;
    let receivable = 0n;
    let payable = 0n;
    for (const record of active) {
      const cents = toCents(record.amount);
      switch (record.type) {
        case 'income':
          income += cents;
          break;
        case 'expense':
          expense += cents;
          break;
        case 'lend':
          receivable += cents;
          break;
        case 'repayment_received':
          receivable -= cents;
          break;
        case 'borrow':
          payable += cents;
          break;
        case 'repayment_paid':
          payable -= cents;
          break;
        default:
          break;
      }
    }
    return {
      ledgerId,
      income: fromCents(income),
      expense: fromCents(expense),
      receivable: fromCents(receivable),
      payable: fromCents(payable),
      recordCount: active.length,
    };
  }

  debts(ledgerId: string): DebtSummary[] {
    this.requireLedger(ledgerId);
    const contacts = this.manifest.contacts.filter((c) => c.ledgerId === ledgerId);
    const active = this.manifest.records.filter(
      (r) => r.ledgerId === ledgerId && r.status === 'active' && r.contactId,
    );
    return contacts
      .map((contact) => {
        let receivable = 0n;
        let payable = 0n;
        for (const record of active) {
          if (record.contactId !== contact.id) continue;
          const cents = toCents(record.amount);
          if (record.type === 'lend') receivable += cents;
          else if (record.type === 'repayment_received') receivable -= cents;
          else if (record.type === 'borrow') payable += cents;
          else if (record.type === 'repayment_paid') payable -= cents;
        }
        const net = receivable - payable;
        let direction: DebtSummary['direction'];
        if (receivable < 0n || payable < 0n) direction = 'inconsistent';
        else if (net > 0n) direction = 'they_owe_me';
        else if (net < 0n) direction = 'i_owe_them';
        else direction = 'settled';
        return {
          contactId: contact.id,
          contactName: contact.displayName,
          receivable: fromCents(receivable),
          payable: fromCents(payable),
          net: fromCents(net),
          direction,
        };
      })
      .filter((d) => d.receivable !== '0.00' || d.payable !== '0.00');
  }

  /* ---------- 校验与工具 ---------- */

  private validateReferences(ledgerId: string, input: {
    accountId: string;
    counterAccountId?: string | null;
    contactId?: string | null;
    sourceId?: string | null;
  }): void {
    const manifest = this.manifest;
    const account = manifest.accounts.find(
      (a) => a.id === input.accountId && a.ledgerId === ledgerId,
    );
    if (!account) throw new AppError('VALIDATION_FAILED', '账户不存在或不属于该账本');
    if (input.counterAccountId) {
      const counter = manifest.accounts.find(
        (a) => a.id === input.counterAccountId && a.ledgerId === ledgerId,
      );
      if (!counter) {
        throw new AppError('VALIDATION_FAILED', '转入账户不存在或不属于该账本');
      }
    }
    if (input.contactId) {
      const contact = manifest.contacts.find(
        (c) => c.id === input.contactId && c.ledgerId === ledgerId,
      );
      if (!contact) {
        throw new AppError('VALIDATION_FAILED', '联系人不存在或不属于该账本');
      }
    }
    if (input.sourceId) {
      const source = manifest.sources.find(
        (s) => s.id === input.sourceId && s.ledgerId === ledgerId,
      );
      if (!source) throw new AppError('VALIDATION_FAILED', '来源不存在或不属于该账本');
    }
  }

  private audit(
    action: string,
    targetId: string | null,
    revision: number,
    ledgerId: string | null = null,
  ): Manifest['auditEvents'][number] {
    return {
      id: randomUUID(),
      ledgerId,
      action,
      targetId,
      revision,
      createdAt: new Date().toISOString(),
    };
  }
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = item;
  }
  return out as Partial<T>;
}
