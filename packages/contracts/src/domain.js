import { z } from 'zod';
/** 第一版只支持人民币，最多两位小数。金额一律用十进制字符串传输。 */
export const MONEY_PATTERN = /^(0|[1-9]\d{0,12})(\.\d{1,2})?$/;
export const moneyString = z
    .string()
    .regex(MONEY_PATTERN, '金额必须是最多两位小数的十进制数字')
    .refine((v) => BigInt(v.replace('.', '')) > 0n, '金额必须大于 0');
/** 十进制字符串 → 整数分（bigint）。不经过浮点。 */
export function toCents(value) {
    const trimmed = value.trim();
    const negative = trimmed.startsWith('-');
    const raw = negative ? trimmed.slice(1) : trimmed;
    const [intPart = '0', fracPart = ''] = raw.split('.');
    const cents = BigInt(intPart) * 100n + BigInt((fracPart + '00').slice(0, 2));
    return negative ? -cents : cents;
}
/** 整数分 → 十进制字符串。 */
export function fromCents(cents) {
    const negative = cents < 0n;
    const abs = negative ? -cents : cents;
    const int = abs / 100n;
    const frac = abs % 100n;
    return `${negative ? '-' : ''}${int}.${frac.toString().padStart(2, '0')}`;
}
export const CURRENCY = 'CNY';
export const currencySchema = z.literal(CURRENCY);
/** 交易类型。日常收支与借还款分离，内部转账不进入日常收支。 */
export const RECORD_TYPES = [
    'expense',
    'income',
    'transfer',
    'lend',
    'borrow',
    'repayment_received',
    'repayment_paid',
];
export const recordTypeSchema = z.enum(RECORD_TYPES);
/** 分录科目类型。 */
export const ACCOUNT_KINDS = [
    'user_account',
    'receivable',
    'payable',
    'revenue',
    'expense',
];
export const ledgerSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1).max(60),
    currency: currencySchema,
    timezone: z.string().min(1),
    createdAt: z.string(),
});
export const accountSchema = z.object({
    id: z.string().min(1),
    ledgerId: z.string().min(1),
    name: z.string().min(1).max(60),
    paymentMethod: z.string().max(40).nullable(),
    active: z.boolean(),
});
export const contactSchema = z.object({
    id: z.string().min(1),
    ledgerId: z.string().min(1),
    displayName: z.string().min(1).max(60),
    remark: z.string().max(200).nullable(),
});
export const sourceSchema = z.object({
    id: z.string().min(1),
    ledgerId: z.string().min(1),
    sha256: z.string().length(64),
    mimeType: z.string().min(1),
    blobId: z.string().min(1),
    note: z.string().max(1000),
    createdAt: z.string(),
});
export const extractionStateSchema = z.enum([
    'draft',
    'validated',
    'confirmed',
    'rejected',
    'failed',
]);
export const extractionSchema = z.object({
    id: z.string().min(1),
    sourceId: z.string().min(1),
    ledgerId: z.string().min(1),
    model: z.string().min(1),
    promptVersion: z.string().min(1),
    candidate: z.unknown(),
    evidence: z.array(z.object({ field: z.string(), text: z.string() })),
    requiresReview: z.array(z.string()),
    state: extractionStateSchema,
    createdAt: z.string(),
});
export const recordStatusSchema = z.enum(['active', 'voided']);
export const recordSchema = z.object({
    id: z.string().min(1),
    ledgerId: z.string().min(1),
    sourceId: z.string().nullable(),
    type: recordTypeSchema,
    amount: moneyString,
    currency: currencySchema,
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    accountId: z.string().min(1),
    counterAccountId: z.string().min(1).nullable(),
    contactId: z.string().nullable(),
    paymentMethod: z.string().max(40).nullable(),
    merchant: z.string().max(100).nullable(),
    category: z.string().max(40).nullable(),
    remark: z.string().max(500).nullable(),
    revision: z.number().int().min(1),
    status: recordStatusSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
});
export const recordRevisionSchema = z.object({
    id: z.string().min(1),
    recordId: z.string().min(1),
    ledgerId: z.string().min(1),
    previousRevision: z.number().int().min(1),
    correctedFields: z.array(z.string()),
    reason: z.string().max(500).nullable(),
    createdAt: z.string(),
});
export const postingSchema = z.object({
    accountKind: z.enum(['user_account', 'receivable', 'payable', 'revenue', 'expense']),
    accountId: z.string().min(1),
    contactId: z.string().nullable(),
    direction: z.enum(['debit', 'credit']),
    amount: moneyString,
});
export const journalSchema = z.object({
    id: z.string().min(1),
    ledgerId: z.string().min(1),
    recordId: z.string().min(1),
    revision: z.number().int().min(1),
    reversesJournalId: z.string().nullable(),
    postings: z.array(postingSchema).min(2),
    createdAt: z.string(),
});
export const auditEventSchema = z.object({
    id: z.string().min(1),
    ledgerId: z.string().nullable(),
    action: z.string().min(1),
    targetId: z.string().nullable(),
    revision: z.number().int().min(1),
    createdAt: z.string(),
});
/** 模型密钥来源：环境变量优先，界面保存为次。 */
export const KEY_SOURCES = ['env', 'ui', 'none'];
export const providerSettingsSchema = z.object({
    provider: z.literal('deepseek'),
    model: z.string().min(1),
    keySource: z.enum(KEY_SOURCES),
    /** 仅掩码，不保存完整 Key 的展示副本。 */
    keyMask: z.string().nullable(),
    /** 界面录入的 Key。manifest 整体加密落盘，接口永不回显该字段。 */
    apiKey: z.string().nullable().default(null),
    updatedAt: z.string(),
});
export const setupStateSchema = z.enum([
    'uninitialized',
    'password_created',
    'llm_config_pending',
    'ready',
]);
/** 幂等记录，随正式数据持久化。 */
export const idempotencyRecordSchema = z.object({
    key: z.string().min(1),
    scope: z.string().min(1),
    requestHash: z.string().min(1),
    resultId: z.string().nullable(),
    createdAt: z.string(),
});
export const manifestSchema = z.object({
    schemaVersion: z.number().int(),
    /** 数据空间 ID：恢复时必须与备份保持一致，不参与 AAD 绑定。 */
    vaultId: z.string().min(1),
    setupState: setupStateSchema,
    revision: z.number().int().min(0),
    providerSettings: providerSettingsSchema,
    ledgers: z.array(ledgerSchema),
    accounts: z.array(accountSchema),
    contacts: z.array(contactSchema),
    sources: z.array(sourceSchema),
    extractions: z.array(extractionSchema),
    records: z.array(recordSchema),
    recordRevisions: z.array(recordRevisionSchema),
    journals: z.array(journalSchema),
    auditEvents: z.array(auditEventSchema),
    idempotency: z.array(idempotencyRecordSchema),
    /** 最近一次发起备份下载的数据修订版本。 */
    lastBackupRevision: z.number().int().min(0).nullable(),
});
//# sourceMappingURL=domain.js.map