import {
  fromCents,
  toCents,
  queryIntentSchema,
  type QueryIntent,
  type RecordEntry,
} from '@ledgerbox/contracts';
import { AppError } from '../errors.js';
import type { LedgerService } from '../domain/ledger-service.js';
import { DeepSeekClient, parseJsonLoose } from './deepseek.js';
import { buildQueryUserPrompt, QUERY_SYSTEM_PROMPT } from './prompts.js';

export interface QueryBreakdownItem {
  key: string;
  label: string;
  amount: string;
  count: number;
}

export interface QueryResult {
  intent: QueryIntent;
  appliedFilters: QueryIntent['filters'];
  count: number;
  total: string | null;
  breakdown: QueryBreakdownItem[];
  records: RecordEntry[];
  debts: ReturnType<LedgerService['debts']>;
  message: string;
}

export class QueryService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly client: DeepSeekClient,
  ) {}

  async ask(ledgerId: string, question: string): Promise<QueryResult> {
    const ledgerInfo = this.ledger.requireLedger(ledgerId);
    const contacts = this.ledger.listContacts(ledgerId).map((c) => ({
      id: c.id,
      displayName: c.displayName,
    }));
    const accounts = this.ledger.listAccounts(ledgerId).map((a) => ({
      id: a.id,
      name: a.name,
    }));

    const today = todayInTimezone(ledgerInfo.timezone);
    const raw = await this.client.chat(
      [
        { role: 'system', content: QUERY_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildQueryUserPrompt(question, {
            today,
            timezone: ledgerInfo.timezone,
            contacts,
            accounts,
          }),
        },
      ],
      { jsonMode: true, maxTokens: 1024 },
    );

    const parsed = parseJsonLoose<Partial<QueryIntent>>(raw);
    if (!parsed) {
      throw new AppError('MODEL_RESPONSE_INVALID', '模型返回的查询意图无法解析');
    }
    const candidate = queryIntentSchema.safeParse({
      operation: parsed.operation ?? 'unsupported',
      filters: parsed.filters ?? {},
      supported: parsed.supported ?? false,
      clarification: parsed.clarification ?? null,
    });
    if (!candidate.success) {
      throw new AppError('MODEL_RESPONSE_INVALID', '模型返回的查询意图不合法');
    }

    const intent = this.sanitize(candidate.data, ledgerId, contacts, accounts);
    return this.execute(ledgerId, intent);
  }

  /** 服务端强制账本边界：模型不能引用其他账本的 ID。 */
  private sanitize(
    intent: QueryIntent,
    ledgerId: string,
    contacts: Array<{ id: string }>,
    accounts: Array<{ id: string }>,
  ): QueryIntent {
    const contactIds = new Set(contacts.map((c) => c.id));
    const accountIds = new Set(accounts.map((a) => a.id));
    const filters = { ...intent.filters };
    if (filters.contactId && !contactIds.has(filters.contactId)) filters.contactId = null;
    if (filters.accountId && !accountIds.has(filters.accountId)) filters.accountId = null;
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      const swap = filters.dateFrom;
      filters.dateFrom = filters.dateTo;
      filters.dateTo = swap;
    }
    void ledgerId;
    return { ...intent, filters };
  }

  private execute(ledgerId: string, intent: QueryIntent): QueryResult {
    const filters = intent.filters;
    const all = this.ledger
      .listRecords(ledgerId, {
        limit: 500,
        includeVoided: false,
        type: filters.type ?? undefined,
        category: filters.category ?? undefined,
        contactId: filters.contactId ?? undefined,
        accountId: filters.accountId ?? undefined,
        paymentMethod: filters.paymentMethod ?? undefined,
        keyword: filters.keyword ?? undefined,
        dateFrom: filters.dateFrom ?? undefined,
        dateTo: filters.dateTo ?? undefined,
      })
      .filter((r) => r.ledgerId === ledgerId);

    const base: QueryResult = {
      intent,
      appliedFilters: filters,
      count: all.length,
      total: null,
      breakdown: [],
      records: [],
      debts: [],
      message: '',
    };

    if (!intent.supported || intent.operation === 'unsupported') {
      return {
        ...base,
        message: intent.clarification ?? '这个问题超出当前支持的查询范围。',
      };
    }

    if (intent.operation === 'debt_balance') {
      const debts = this.ledger.debts(ledgerId);
      const scoped = filters.contactId
        ? debts.filter((d) => d.contactId === filters.contactId)
        : debts;
      const hasPeriod = Boolean(filters.dateFrom || filters.dateTo);
      if (hasPeriod) {
        const period = this.periodNet(ledgerId, filters);
        return {
          ...base,
          count: scoped.length,
          debts: scoped,
          total: period,
          message:
            '带日期范围的借还款结果为该期间净变动，不等于当前欠款；当前欠款请不带日期查询。',
        };
      }
      return {
        ...base,
        count: scoped.length,
        debts: scoped,
        total: fromCents(scoped.reduce((sum, d) => sum + toCents(d.net), 0n)),
        message: '当前欠款按全部有效历史计算。',
      };
    }

    if (intent.operation === 'count') {
      return { ...base, count: all.length, message: `匹配 ${all.length} 笔。` };
    }

    if (intent.operation === 'list') {
      return {
        ...base,
        records: all.slice(0, 100),
        message: `匹配 ${all.length} 笔。`,
      };
    }

    const daily = all.filter((r) => r.type === 'expense' || r.type === 'income');
    const scoped = daily.length > 0 || all.length === 0 ? daily : all;
    const total = scoped.reduce((sum, r) => sum + toCents(r.amount), 0n);

    if (intent.operation === 'group_sum') {
      const grouped = new Map<string, { amount: bigint; count: number }>();
      for (const record of scoped) {
        const key = record.category ?? record.type;
        const current = grouped.get(key) ?? { amount: 0n, count: 0 };
        current.amount += toCents(record.amount);
        current.count += 1;
        grouped.set(key, current);
      }
      return {
        ...base,
        count: scoped.length,
        total: fromCents(total),
        breakdown: [...grouped.entries()].map(([key, value]) => ({
          key,
          label: key,
          amount: fromCents(value.amount),
          count: value.count,
        })),
        message: `匹配 ${scoped.length} 笔，合计 ${fromCents(total)} 元。`,
      };
    }

    return {
      ...base,
      count: scoped.length,
      total: fromCents(total),
      records: scoped.slice(0, 100),
      message: `匹配 ${scoped.length} 笔，合计 ${fromCents(total)} 元。`,
    };
  }

  private periodNet(
    ledgerId: string,
    filters: QueryIntent['filters'],
  ): string {
    const records = this.ledger.listRecords(ledgerId, {
      limit: 500,
      includeVoided: false,
      contactId: filters.contactId ?? undefined,
      dateFrom: filters.dateFrom ?? undefined,
      dateTo: filters.dateTo ?? undefined,
      type: filters.type ?? undefined,
    });
    let net = 0n;
    for (const record of records) {
      const cents = toCents(record.amount);
      if (record.type === 'lend') net += cents;
      else if (record.type === 'repayment_received') net -= cents;
      else if (record.type === 'borrow') net -= cents;
      else if (record.type === 'repayment_paid') net += cents;
    }
    return fromCents(net);
  }
}

/** 按账本时区取当天日期。 */
export function todayInTimezone(timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
