import { z } from 'zod';
/** 第一版只支持人民币，最多两位小数。金额一律用十进制字符串传输。 */
export declare const MONEY_PATTERN: RegExp;
export declare const moneyString: z.ZodEffects<z.ZodString, string, string>;
/** 十进制字符串 → 整数分（bigint）。不经过浮点。 */
export declare function toCents(value: string): bigint;
/** 整数分 → 十进制字符串。 */
export declare function fromCents(cents: bigint): string;
export declare const CURRENCY: "CNY";
export declare const currencySchema: z.ZodLiteral<"CNY">;
/** 交易类型。日常收支与借还款分离，内部转账不进入日常收支。 */
export declare const RECORD_TYPES: readonly ["expense", "income", "transfer", "lend", "borrow", "repayment_received", "repayment_paid"];
export type RecordType = (typeof RECORD_TYPES)[number];
export declare const recordTypeSchema: z.ZodEnum<["expense", "income", "transfer", "lend", "borrow", "repayment_received", "repayment_paid"]>;
/** 分录科目类型。 */
export declare const ACCOUNT_KINDS: readonly ["user_account", "receivable", "payable", "revenue", "expense"];
export type AccountKind = (typeof ACCOUNT_KINDS)[number];
export declare const ledgerSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    currency: z.ZodLiteral<"CNY">;
    timezone: z.ZodString;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    currency: "CNY";
    timezone: string;
    createdAt: string;
}, {
    id: string;
    name: string;
    currency: "CNY";
    timezone: string;
    createdAt: string;
}>;
export declare const accountSchema: z.ZodObject<{
    id: z.ZodString;
    ledgerId: z.ZodString;
    name: z.ZodString;
    paymentMethod: z.ZodNullable<z.ZodString>;
    active: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    ledgerId: string;
    paymentMethod: string | null;
    active: boolean;
}, {
    id: string;
    name: string;
    ledgerId: string;
    paymentMethod: string | null;
    active: boolean;
}>;
export declare const contactSchema: z.ZodObject<{
    id: z.ZodString;
    ledgerId: z.ZodString;
    displayName: z.ZodString;
    remark: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    ledgerId: string;
    displayName: string;
    remark: string | null;
}, {
    id: string;
    ledgerId: string;
    displayName: string;
    remark: string | null;
}>;
export declare const sourceSchema: z.ZodObject<{
    id: z.ZodString;
    ledgerId: z.ZodString;
    sha256: z.ZodString;
    mimeType: z.ZodString;
    blobId: z.ZodString;
    note: z.ZodString;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    ledgerId: string;
    sha256: string;
    mimeType: string;
    blobId: string;
    note: string;
}, {
    id: string;
    createdAt: string;
    ledgerId: string;
    sha256: string;
    mimeType: string;
    blobId: string;
    note: string;
}>;
export declare const extractionStateSchema: z.ZodEnum<["draft", "validated", "confirmed", "rejected", "failed"]>;
export declare const extractionSchema: z.ZodObject<{
    id: z.ZodString;
    sourceId: z.ZodString;
    ledgerId: z.ZodString;
    model: z.ZodString;
    promptVersion: z.ZodString;
    candidate: z.ZodUnknown;
    evidence: z.ZodArray<z.ZodObject<{
        field: z.ZodString;
        text: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        field: string;
        text: string;
    }, {
        field: string;
        text: string;
    }>, "many">;
    requiresReview: z.ZodArray<z.ZodString, "many">;
    state: z.ZodEnum<["draft", "validated", "confirmed", "rejected", "failed"]>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    ledgerId: string;
    sourceId: string;
    model: string;
    promptVersion: string;
    evidence: {
        field: string;
        text: string;
    }[];
    requiresReview: string[];
    state: "draft" | "validated" | "confirmed" | "rejected" | "failed";
    candidate?: unknown;
}, {
    id: string;
    createdAt: string;
    ledgerId: string;
    sourceId: string;
    model: string;
    promptVersion: string;
    evidence: {
        field: string;
        text: string;
    }[];
    requiresReview: string[];
    state: "draft" | "validated" | "confirmed" | "rejected" | "failed";
    candidate?: unknown;
}>;
export declare const recordStatusSchema: z.ZodEnum<["active", "voided"]>;
export declare const recordSchema: z.ZodObject<{
    id: z.ZodString;
    ledgerId: z.ZodString;
    sourceId: z.ZodNullable<z.ZodString>;
    type: z.ZodEnum<["expense", "income", "transfer", "lend", "borrow", "repayment_received", "repayment_paid"]>;
    amount: z.ZodEffects<z.ZodString, string, string>;
    currency: z.ZodLiteral<"CNY">;
    occurredOn: z.ZodString;
    accountId: z.ZodString;
    counterAccountId: z.ZodNullable<z.ZodString>;
    contactId: z.ZodNullable<z.ZodString>;
    paymentMethod: z.ZodNullable<z.ZodString>;
    merchant: z.ZodNullable<z.ZodString>;
    category: z.ZodNullable<z.ZodString>;
    remark: z.ZodNullable<z.ZodString>;
    revision: z.ZodNumber;
    status: z.ZodEnum<["active", "voided"]>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    currency: "CNY";
    createdAt: string;
    type: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid";
    status: "active" | "voided";
    ledgerId: string;
    paymentMethod: string | null;
    remark: string | null;
    sourceId: string | null;
    amount: string;
    occurredOn: string;
    accountId: string;
    counterAccountId: string | null;
    contactId: string | null;
    merchant: string | null;
    category: string | null;
    revision: number;
    updatedAt: string;
}, {
    id: string;
    currency: "CNY";
    createdAt: string;
    type: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid";
    status: "active" | "voided";
    ledgerId: string;
    paymentMethod: string | null;
    remark: string | null;
    sourceId: string | null;
    amount: string;
    occurredOn: string;
    accountId: string;
    counterAccountId: string | null;
    contactId: string | null;
    merchant: string | null;
    category: string | null;
    revision: number;
    updatedAt: string;
}>;
export declare const recordRevisionSchema: z.ZodObject<{
    id: z.ZodString;
    recordId: z.ZodString;
    ledgerId: z.ZodString;
    previousRevision: z.ZodNumber;
    correctedFields: z.ZodArray<z.ZodString, "many">;
    reason: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    ledgerId: string;
    recordId: string;
    previousRevision: number;
    correctedFields: string[];
    reason: string | null;
}, {
    id: string;
    createdAt: string;
    ledgerId: string;
    recordId: string;
    previousRevision: number;
    correctedFields: string[];
    reason: string | null;
}>;
export declare const postingSchema: z.ZodObject<{
    accountKind: z.ZodEnum<["user_account", "receivable", "payable", "revenue", "expense"]>;
    accountId: z.ZodString;
    contactId: z.ZodNullable<z.ZodString>;
    direction: z.ZodEnum<["debit", "credit"]>;
    amount: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    amount: string;
    accountId: string;
    contactId: string | null;
    accountKind: "expense" | "user_account" | "receivable" | "payable" | "revenue";
    direction: "debit" | "credit";
}, {
    amount: string;
    accountId: string;
    contactId: string | null;
    accountKind: "expense" | "user_account" | "receivable" | "payable" | "revenue";
    direction: "debit" | "credit";
}>;
export declare const journalSchema: z.ZodObject<{
    id: z.ZodString;
    ledgerId: z.ZodString;
    recordId: z.ZodString;
    revision: z.ZodNumber;
    reversesJournalId: z.ZodNullable<z.ZodString>;
    postings: z.ZodArray<z.ZodObject<{
        accountKind: z.ZodEnum<["user_account", "receivable", "payable", "revenue", "expense"]>;
        accountId: z.ZodString;
        contactId: z.ZodNullable<z.ZodString>;
        direction: z.ZodEnum<["debit", "credit"]>;
        amount: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        amount: string;
        accountId: string;
        contactId: string | null;
        accountKind: "expense" | "user_account" | "receivable" | "payable" | "revenue";
        direction: "debit" | "credit";
    }, {
        amount: string;
        accountId: string;
        contactId: string | null;
        accountKind: "expense" | "user_account" | "receivable" | "payable" | "revenue";
        direction: "debit" | "credit";
    }>, "many">;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    ledgerId: string;
    revision: number;
    recordId: string;
    reversesJournalId: string | null;
    postings: {
        amount: string;
        accountId: string;
        contactId: string | null;
        accountKind: "expense" | "user_account" | "receivable" | "payable" | "revenue";
        direction: "debit" | "credit";
    }[];
}, {
    id: string;
    createdAt: string;
    ledgerId: string;
    revision: number;
    recordId: string;
    reversesJournalId: string | null;
    postings: {
        amount: string;
        accountId: string;
        contactId: string | null;
        accountKind: "expense" | "user_account" | "receivable" | "payable" | "revenue";
        direction: "debit" | "credit";
    }[];
}>;
export declare const auditEventSchema: z.ZodObject<{
    id: z.ZodString;
    ledgerId: z.ZodNullable<z.ZodString>;
    action: z.ZodString;
    targetId: z.ZodNullable<z.ZodString>;
    revision: z.ZodNumber;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    ledgerId: string | null;
    revision: number;
    action: string;
    targetId: string | null;
}, {
    id: string;
    createdAt: string;
    ledgerId: string | null;
    revision: number;
    action: string;
    targetId: string | null;
}>;
export type Ledger = z.infer<typeof ledgerSchema>;
export type Account = z.infer<typeof accountSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Extraction = z.infer<typeof extractionSchema>;
export type RecordEntry = z.infer<typeof recordSchema>;
export type RecordRevision = z.infer<typeof recordRevisionSchema>;
export type Journal = z.infer<typeof journalSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
/** 模型密钥来源：环境变量优先，界面保存为次。 */
export declare const KEY_SOURCES: readonly ["env", "ui", "none"];
export type KeySource = (typeof KEY_SOURCES)[number];
export declare const providerSettingsSchema: z.ZodObject<{
    provider: z.ZodLiteral<"deepseek">;
    model: z.ZodString;
    keySource: z.ZodEnum<["env", "ui", "none"]>;
    /** 仅掩码，不保存完整 Key 的展示副本。 */
    keyMask: z.ZodNullable<z.ZodString>;
    /** 界面录入的 Key。manifest 整体加密落盘，接口永不回显该字段。 */
    apiKey: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    model: string;
    updatedAt: string;
    provider: "deepseek";
    keySource: "env" | "ui" | "none";
    keyMask: string | null;
    apiKey: string | null;
}, {
    model: string;
    updatedAt: string;
    provider: "deepseek";
    keySource: "env" | "ui" | "none";
    keyMask: string | null;
    apiKey?: string | null | undefined;
}>;
export type ProviderSettings = z.infer<typeof providerSettingsSchema>;
export declare const setupStateSchema: z.ZodEnum<["uninitialized", "password_created", "llm_config_pending", "ready"]>;
export type SetupState = z.infer<typeof setupStateSchema>;
/** 幂等记录，随正式数据持久化。 */
export declare const idempotencyRecordSchema: z.ZodObject<{
    key: z.ZodString;
    scope: z.ZodString;
    requestHash: z.ZodString;
    resultId: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    createdAt: string;
    key: string;
    scope: string;
    requestHash: string;
    resultId: string | null;
}, {
    createdAt: string;
    key: string;
    scope: string;
    requestHash: string;
    resultId: string | null;
}>;
export type IdempotencyRecord = z.infer<typeof idempotencyRecordSchema>;
export declare const manifestSchema: z.ZodObject<{
    schemaVersion: z.ZodNumber;
    /** 数据空间 ID：恢复时必须与备份保持一致，不参与 AAD 绑定。 */
    vaultId: z.ZodString;
    setupState: z.ZodEnum<["uninitialized", "password_created", "llm_config_pending", "ready"]>;
    revision: z.ZodNumber;
    providerSettings: z.ZodObject<{
        provider: z.ZodLiteral<"deepseek">;
        model: z.ZodString;
        keySource: z.ZodEnum<["env", "ui", "none"]>;
        /** 仅掩码，不保存完整 Key 的展示副本。 */
        keyMask: z.ZodNullable<z.ZodString>;
        /** 界面录入的 Key。manifest 整体加密落盘，接口永不回显该字段。 */
        apiKey: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        updatedAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        model: string;
        updatedAt: string;
        provider: "deepseek";
        keySource: "env" | "ui" | "none";
        keyMask: string | null;
        apiKey: string | null;
    }, {
        model: string;
        updatedAt: string;
        provider: "deepseek";
        keySource: "env" | "ui" | "none";
        keyMask: string | null;
        apiKey?: string | null | undefined;
    }>;
    ledgers: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        currency: z.ZodLiteral<"CNY">;
        timezone: z.ZodString;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        currency: "CNY";
        timezone: string;
        createdAt: string;
    }, {
        id: string;
        name: string;
        currency: "CNY";
        timezone: string;
        createdAt: string;
    }>, "many">;
    accounts: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        ledgerId: z.ZodString;
        name: z.ZodString;
        paymentMethod: z.ZodNullable<z.ZodString>;
        active: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        ledgerId: string;
        paymentMethod: string | null;
        active: boolean;
    }, {
        id: string;
        name: string;
        ledgerId: string;
        paymentMethod: string | null;
        active: boolean;
    }>, "many">;
    contacts: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        ledgerId: z.ZodString;
        displayName: z.ZodString;
        remark: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        ledgerId: string;
        displayName: string;
        remark: string | null;
    }, {
        id: string;
        ledgerId: string;
        displayName: string;
        remark: string | null;
    }>, "many">;
    sources: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        ledgerId: z.ZodString;
        sha256: z.ZodString;
        mimeType: z.ZodString;
        blobId: z.ZodString;
        note: z.ZodString;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        createdAt: string;
        ledgerId: string;
        sha256: string;
        mimeType: string;
        blobId: string;
        note: string;
    }, {
        id: string;
        createdAt: string;
        ledgerId: string;
        sha256: string;
        mimeType: string;
        blobId: string;
        note: string;
    }>, "many">;
    extractions: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        sourceId: z.ZodString;
        ledgerId: z.ZodString;
        model: z.ZodString;
        promptVersion: z.ZodString;
        candidate: z.ZodUnknown;
        evidence: z.ZodArray<z.ZodObject<{
            field: z.ZodString;
            text: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            field: string;
            text: string;
        }, {
            field: string;
            text: string;
        }>, "many">;
        requiresReview: z.ZodArray<z.ZodString, "many">;
        state: z.ZodEnum<["draft", "validated", "confirmed", "rejected", "failed"]>;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        createdAt: string;
        ledgerId: string;
        sourceId: string;
        model: string;
        promptVersion: string;
        evidence: {
            field: string;
            text: string;
        }[];
        requiresReview: string[];
        state: "draft" | "validated" | "confirmed" | "rejected" | "failed";
        candidate?: unknown;
    }, {
        id: string;
        createdAt: string;
        ledgerId: string;
        sourceId: string;
        model: string;
        promptVersion: string;
        evidence: {
            field: string;
            text: string;
        }[];
        requiresReview: string[];
        state: "draft" | "validated" | "confirmed" | "rejected" | "failed";
        candidate?: unknown;
    }>, "many">;
    records: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        ledgerId: z.ZodString;
        sourceId: z.ZodNullable<z.ZodString>;
        type: z.ZodEnum<["expense", "income", "transfer", "lend", "borrow", "repayment_received", "repayment_paid"]>;
        amount: z.ZodEffects<z.ZodString, string, string>;
        currency: z.ZodLiteral<"CNY">;
        occurredOn: z.ZodString;
        accountId: z.ZodString;
        counterAccountId: z.ZodNullable<z.ZodString>;
        contactId: z.ZodNullable<z.ZodString>;
        paymentMethod: z.ZodNullable<z.ZodString>;
        merchant: z.ZodNullable<z.ZodString>;
        category: z.ZodNullable<z.ZodString>;
        remark: z.ZodNullable<z.ZodString>;
        revision: z.ZodNumber;
        status: z.ZodEnum<["active", "voided"]>;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        currency: "CNY";
        createdAt: string;
        type: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid";
        status: "active" | "voided";
        ledgerId: string;
        paymentMethod: string | null;
        remark: string | null;
        sourceId: string | null;
        amount: string;
        occurredOn: string;
        accountId: string;
        counterAccountId: string | null;
        contactId: string | null;
        merchant: string | null;
        category: string | null;
        revision: number;
        updatedAt: string;
    }, {
        id: string;
        currency: "CNY";
        createdAt: string;
        type: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid";
        status: "active" | "voided";
        ledgerId: string;
        paymentMethod: string | null;
        remark: string | null;
        sourceId: string | null;
        amount: string;
        occurredOn: string;
        accountId: string;
        counterAccountId: string | null;
        contactId: string | null;
        merchant: string | null;
        category: string | null;
        revision: number;
        updatedAt: string;
    }>, "many">;
    recordRevisions: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        recordId: z.ZodString;
        ledgerId: z.ZodString;
        previousRevision: z.ZodNumber;
        correctedFields: z.ZodArray<z.ZodString, "many">;
        reason: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        createdAt: string;
        ledgerId: string;
        recordId: string;
        previousRevision: number;
        correctedFields: string[];
        reason: string | null;
    }, {
        id: string;
        createdAt: string;
        ledgerId: string;
        recordId: string;
        previousRevision: number;
        correctedFields: string[];
        reason: string | null;
    }>, "many">;
    journals: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        ledgerId: z.ZodString;
        recordId: z.ZodString;
        revision: z.ZodNumber;
        reversesJournalId: z.ZodNullable<z.ZodString>;
        postings: z.ZodArray<z.ZodObject<{
            accountKind: z.ZodEnum<["user_account", "receivable", "payable", "revenue", "expense"]>;
            accountId: z.ZodString;
            contactId: z.ZodNullable<z.ZodString>;
            direction: z.ZodEnum<["debit", "credit"]>;
            amount: z.ZodEffects<z.ZodString, string, string>;
        }, "strip", z.ZodTypeAny, {
            amount: string;
            accountId: string;
            contactId: string | null;
            accountKind: "expense" | "user_account" | "receivable" | "payable" | "revenue";
            direction: "debit" | "credit";
        }, {
            amount: string;
            accountId: string;
            contactId: string | null;
            accountKind: "expense" | "user_account" | "receivable" | "payable" | "revenue";
            direction: "debit" | "credit";
        }>, "many">;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        createdAt: string;
        ledgerId: string;
        revision: number;
        recordId: string;
        reversesJournalId: string | null;
        postings: {
            amount: string;
            accountId: string;
            contactId: string | null;
            accountKind: "expense" | "user_account" | "receivable" | "payable" | "revenue";
            direction: "debit" | "credit";
        }[];
    }, {
        id: string;
        createdAt: string;
        ledgerId: string;
        revision: number;
        recordId: string;
        reversesJournalId: string | null;
        postings: {
            amount: string;
            accountId: string;
            contactId: string | null;
            accountKind: "expense" | "user_account" | "receivable" | "payable" | "revenue";
            direction: "debit" | "credit";
        }[];
    }>, "many">;
    auditEvents: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        ledgerId: z.ZodNullable<z.ZodString>;
        action: z.ZodString;
        targetId: z.ZodNullable<z.ZodString>;
        revision: z.ZodNumber;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        createdAt: string;
        ledgerId: string | null;
        revision: number;
        action: string;
        targetId: string | null;
    }, {
        id: string;
        createdAt: string;
        ledgerId: string | null;
        revision: number;
        action: string;
        targetId: string | null;
    }>, "many">;
    idempotency: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        scope: z.ZodString;
        requestHash: z.ZodString;
        resultId: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        createdAt: string;
        key: string;
        scope: string;
        requestHash: string;
        resultId: string | null;
    }, {
        createdAt: string;
        key: string;
        scope: string;
        requestHash: string;
        resultId: string | null;
    }>, "many">;
    /** 最近一次发起备份下载的数据修订版本。 */
    lastBackupRevision: z.ZodNullable<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    revision: number;
    schemaVersion: number;
    vaultId: string;
    setupState: "uninitialized" | "password_created" | "llm_config_pending" | "ready";
    providerSettings: {
        model: string;
        updatedAt: string;
        provider: "deepseek";
        keySource: "env" | "ui" | "none";
        keyMask: string | null;
        apiKey: string | null;
    };
    ledgers: {
        id: string;
        name: string;
        currency: "CNY";
        timezone: string;
        createdAt: string;
    }[];
    accounts: {
        id: string;
        name: string;
        ledgerId: string;
        paymentMethod: string | null;
        active: boolean;
    }[];
    contacts: {
        id: string;
        ledgerId: string;
        displayName: string;
        remark: string | null;
    }[];
    sources: {
        id: string;
        createdAt: string;
        ledgerId: string;
        sha256: string;
        mimeType: string;
        blobId: string;
        note: string;
    }[];
    extractions: {
        id: string;
        createdAt: string;
        ledgerId: string;
        sourceId: string;
        model: string;
        promptVersion: string;
        evidence: {
            field: string;
            text: string;
        }[];
        requiresReview: string[];
        state: "draft" | "validated" | "confirmed" | "rejected" | "failed";
        candidate?: unknown;
    }[];
    records: {
        id: string;
        currency: "CNY";
        createdAt: string;
        type: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid";
        status: "active" | "voided";
        ledgerId: string;
        paymentMethod: string | null;
        remark: string | null;
        sourceId: string | null;
        amount: string;
        occurredOn: string;
        accountId: string;
        counterAccountId: string | null;
        contactId: string | null;
        merchant: string | null;
        category: string | null;
        revision: number;
        updatedAt: string;
    }[];
    recordRevisions: {
        id: string;
        createdAt: string;
        ledgerId: string;
        recordId: string;
        previousRevision: number;
        correctedFields: string[];
        reason: string | null;
    }[];
    journals: {
        id: string;
        createdAt: string;
        ledgerId: string;
        revision: number;
        recordId: string;
        reversesJournalId: string | null;
        postings: {
            amount: string;
            accountId: string;
            contactId: string | null;
            accountKind: "expense" | "user_account" | "receivable" | "payable" | "revenue";
            direction: "debit" | "credit";
        }[];
    }[];
    auditEvents: {
        id: string;
        createdAt: string;
        ledgerId: string | null;
        revision: number;
        action: string;
        targetId: string | null;
    }[];
    idempotency: {
        createdAt: string;
        key: string;
        scope: string;
        requestHash: string;
        resultId: string | null;
    }[];
    lastBackupRevision: number | null;
}, {
    revision: number;
    schemaVersion: number;
    vaultId: string;
    setupState: "uninitialized" | "password_created" | "llm_config_pending" | "ready";
    providerSettings: {
        model: string;
        updatedAt: string;
        provider: "deepseek";
        keySource: "env" | "ui" | "none";
        keyMask: string | null;
        apiKey?: string | null | undefined;
    };
    ledgers: {
        id: string;
        name: string;
        currency: "CNY";
        timezone: string;
        createdAt: string;
    }[];
    accounts: {
        id: string;
        name: string;
        ledgerId: string;
        paymentMethod: string | null;
        active: boolean;
    }[];
    contacts: {
        id: string;
        ledgerId: string;
        displayName: string;
        remark: string | null;
    }[];
    sources: {
        id: string;
        createdAt: string;
        ledgerId: string;
        sha256: string;
        mimeType: string;
        blobId: string;
        note: string;
    }[];
    extractions: {
        id: string;
        createdAt: string;
        ledgerId: string;
        sourceId: string;
        model: string;
        promptVersion: string;
        evidence: {
            field: string;
            text: string;
        }[];
        requiresReview: string[];
        state: "draft" | "validated" | "confirmed" | "rejected" | "failed";
        candidate?: unknown;
    }[];
    records: {
        id: string;
        currency: "CNY";
        createdAt: string;
        type: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid";
        status: "active" | "voided";
        ledgerId: string;
        paymentMethod: string | null;
        remark: string | null;
        sourceId: string | null;
        amount: string;
        occurredOn: string;
        accountId: string;
        counterAccountId: string | null;
        contactId: string | null;
        merchant: string | null;
        category: string | null;
        revision: number;
        updatedAt: string;
    }[];
    recordRevisions: {
        id: string;
        createdAt: string;
        ledgerId: string;
        recordId: string;
        previousRevision: number;
        correctedFields: string[];
        reason: string | null;
    }[];
    journals: {
        id: string;
        createdAt: string;
        ledgerId: string;
        revision: number;
        recordId: string;
        reversesJournalId: string | null;
        postings: {
            amount: string;
            accountId: string;
            contactId: string | null;
            accountKind: "expense" | "user_account" | "receivable" | "payable" | "revenue";
            direction: "debit" | "credit";
        }[];
    }[];
    auditEvents: {
        id: string;
        createdAt: string;
        ledgerId: string | null;
        revision: number;
        action: string;
        targetId: string | null;
    }[];
    idempotency: {
        createdAt: string;
        key: string;
        scope: string;
        requestHash: string;
        resultId: string | null;
    }[];
    lastBackupRevision: number | null;
}>;
export type Manifest = z.infer<typeof manifestSchema>;
