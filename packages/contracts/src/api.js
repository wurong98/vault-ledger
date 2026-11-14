import { z } from 'zod';
import { currencySchema, moneyString, recordTypeSchema, } from './domain.js';
/* ---------- 引导与解锁 ---------- */
export const setupRequestSchema = z.object({
    password: z.string().min(12, '密码至少 12 个字符').max(200),
    passwordConfirmation: z.string(),
    ledgerName: z.string().min(1).max(60).default('个人'),
});
export const unlockRequestSchema = z.object({
    password: z.string().min(1).max(200),
});
export const statusResponseSchema = z.object({
    setupState: z.enum(['uninitialized', 'password_created', 'llm_config_pending', 'ready']),
    locked: z.boolean(),
    llmConfigured: z.boolean(),
    llmSource: z.enum(['env', 'ui', 'none']),
    model: z.string().nullable(),
    serverTime: z.string(),
});
/* ---------- 模型设置 ---------- */
export const llmSettingsPatchSchema = z.object({
    model: z.string().min(1).max(80).optional(),
    /** 传空字符串表示清除界面保存的 Key。 */
    apiKey: z.string().max(200).optional(),
});
export const llmSettingsResponseSchema = z.object({
    provider: z.literal('deepseek'),
    model: z.string(),
    keySource: z.enum(['env', 'ui', 'none']),
    keyMask: z.string().nullable(),
    envKeyPresent: z.boolean(),
    updatedAt: z.string(),
});
/* ---------- 账本 / 账户 / 联系人 ---------- */
export const createLedgerSchema = z.object({
    name: z.string().min(1).max(60),
    timezone: z.string().min(1).default('Asia/Shanghai'),
});
export const createAccountSchema = z.object({
    name: z.string().min(1).max(60),
    paymentMethod: z.string().max(40).nullable().default(null),
});
export const createContactSchema = z.object({
    displayName: z.string().min(1).max(60),
    remark: z.string().max(200).nullable().default(null),
});
/* ---------- 来源与截图 ---------- */
export const uploadSourceSchema = z.object({
    note: z.string().max(1000).default(''),
    /** 已有相同内容哈希时复用来源；否则新建。 */
    reuseIfExists: z.boolean().default(true),
});
export const extractionCandidateSchema = z.object({
    type: recordTypeSchema,
    amount: moneyString,
    currency: currencySchema,
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    contactName: z.string().max(60).nullable(),
    accountHint: z.string().max(60).nullable(),
    paymentMethod: z.string().max(40).nullable(),
    merchant: z.string().max(100).nullable(),
    category: z.string().max(40).nullable(),
    remark: z.string().max(500).nullable(),
});
export const extractionEnvelopeSchema = z.object({
    schemaVersion: z.literal(1),
    ledgerId: z.string().min(1),
    sourceId: z.string().min(1),
    candidate: extractionCandidateSchema,
    requiresReview: z.array(z.string()),
    evidence: z.array(z.object({ field: z.string(), text: z.string() })),
});
/* ---------- 记录 ---------- */
export const recordInputSchema = z.object({
    type: recordTypeSchema,
    amount: moneyString,
    currency: currencySchema.default('CNY'),
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    accountId: z.string().min(1),
    counterAccountId: z.string().min(1).nullable().default(null),
    contactId: z.string().nullable().default(null),
    paymentMethod: z.string().max(40).nullable().default(null),
    merchant: z.string().max(100).nullable().default(null),
    category: z.string().max(40).nullable().default(null),
    remark: z.string().max(500).nullable().default(null),
    sourceId: z.string().nullable().default(null),
});
export const recordPatchSchema = recordInputSchema.partial().extend({
    reason: z.string().max(500).nullable().default(null),
});
export const recordListQuerySchema = z.object({
    type: recordTypeSchema.optional(),
    category: z.string().optional(),
    contactId: z.string().optional(),
    accountId: z.string().optional(),
    paymentMethod: z.string().optional(),
    keyword: z.string().max(100).optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    includeVoided: z.coerce.boolean().default(false),
    limit: z.coerce.number().int().min(1).max(500).default(100),
});
/* ---------- 查询意图 ---------- */
export const queryOperationSchema = z.enum([
    'list',
    'count',
    'sum',
    'group_sum',
    'debt_balance',
    'unsupported',
]);
export const queryIntentSchema = z.object({
    operation: queryOperationSchema,
    filters: z.object({
        contactId: z.string().nullable().default(null),
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
        type: recordTypeSchema.nullable().default(null),
        category: z.string().nullable().default(null),
        accountId: z.string().nullable().default(null),
        paymentMethod: z.string().nullable().default(null),
        keyword: z.string().nullable().default(null),
    }),
    supported: z.boolean(),
    clarification: z.string().nullable().default(null),
});
export const queryRequestSchema = z.object({
    question: z.string().min(1).max(500),
});
/* ---------- 幂等 ---------- */
export const idempotencyKeySchema = z.string().min(8).max(200);
//# sourceMappingURL=api.js.map