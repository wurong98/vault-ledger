import { fromCents, toCents, type RecordType } from '@ledgerbox/contracts';
import { AppError } from '../errors.js';

export interface Posting {
  accountKind: 'user_account' | 'receivable' | 'payable' | 'revenue' | 'expense';
  accountId: string;
  contactId: string | null;
  direction: 'debit' | 'credit';
  amount: string;
}

export interface PostingInput {
  type: RecordType;
  amount: string;
  accountId: string;
  counterAccountId: string | null;
  contactId: string | null;
}

/**
 * 借贷规则表（第一版）：
 *
 *   支出          借 费用        贷 现金账户      日常支出 +
 *   收入          借 现金账户    贷 收入          日常收入 +
 *   转账          借 转入账户    贷 转出账户      不进日常收支
 *   借出(lend)    借 应收(对方)  贷 现金账户      应收本金 +
 *   收回          借 现金账户    贷 应收(对方)    应收本金 -
 *   借入(borrow)  借 现金账户    贷 应付(对方)    应付本金 +
 *   归还          借 应付(对方)  贷 现金账户      应付本金 -
 *
 * 每条记录生成同币种平衡分录：借方合计 = 贷方合计。
 */
export function buildPostings(input: PostingInput): Posting[] {
  const cents = toCents(input.amount);
  if (cents <= 0n) {
    throw new AppError('VALIDATION_FAILED', '金额必须大于 0');
  }
  const amount = fromCents(cents);

  const user = (accountId: string, direction: 'debit' | 'credit'): Posting => ({
    accountKind: 'user_account',
    accountId,
    contactId: null,
    direction,
    amount,
  });
  const counter = (
    kind: 'receivable' | 'payable',
    direction: 'debit' | 'credit',
  ): Posting => ({
    accountKind: kind,
    accountId: input.contactId as string,
    contactId: input.contactId,
    direction,
    amount,
  });

  switch (input.type) {
    case 'expense':
      return [
        { accountKind: 'expense', accountId: input.accountId, contactId: null, direction: 'debit', amount },
        user(input.accountId, 'credit'),
      ];
    case 'income':
      return [
        user(input.accountId, 'debit'),
        { accountKind: 'revenue', accountId: input.accountId, contactId: null, direction: 'credit', amount },
      ];
    case 'transfer': {
      if (!input.counterAccountId) {
        throw new AppError('VALIDATION_FAILED', '转账必须指定转入账户');
      }
      if (input.counterAccountId === input.accountId) {
        throw new AppError('VALIDATION_FAILED', '转出与转入账户必须不同');
      }
      return [user(input.counterAccountId, 'debit'), user(input.accountId, 'credit')];
    }
    case 'lend':
      requireContact(input.contactId);
      return [counter('receivable', 'debit'), user(input.accountId, 'credit')];
    case 'repayment_received':
      requireContact(input.contactId);
      return [user(input.accountId, 'debit'), counter('receivable', 'credit')];
    case 'borrow':
      requireContact(input.contactId);
      return [user(input.accountId, 'debit'), counter('payable', 'credit')];
    case 'repayment_paid':
      requireContact(input.contactId);
      return [counter('payable', 'debit'), user(input.accountId, 'credit')];
    default: {
      const exhaustive: never = input.type;
      throw new AppError('VALIDATION_FAILED', `不支持的交易类型: ${String(exhaustive)}`);
    }
  }
}

function requireContact(contactId: string | null): void {
  if (!contactId) {
    throw new AppError('VALIDATION_FAILED', '借还款必须指定联系人');
  }
}

/** 校验分录平衡。 */
export function assertBalanced(postings: Posting[]): void {
  let debit = 0n;
  let credit = 0n;
  for (const posting of postings) {
    const value = toCents(posting.amount);
    if (posting.direction === 'debit') debit += value;
    else credit += value;
  }
  if (debit !== credit) {
    throw new AppError('INTERNAL_ERROR', '分录不平衡');
  }
}

/** 借还款方向常量，便于查询层复用。 */
export const DEBT_TYPES = {
  receivable: ['lend', 'repayment_received'],
  payable: ['borrow', 'repayment_paid'],
} as const;
