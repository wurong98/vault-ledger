import { z } from 'zod';
export declare const setupRequestSchema: z.ZodObject<{
    password: z.ZodString;
    passwordConfirmation: z.ZodString;
    ledgerName: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    password: string;
    passwordConfirmation: string;
    ledgerName: string;
}, {
    password: string;
    passwordConfirmation: string;
    ledgerName?: string | undefined;
}>;
export type SetupRequest = z.infer<typeof setupRequestSchema>;
export declare const unlockRequestSchema: z.ZodObject<{
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    password: string;
}, {
    password: string;
}>;
export type UnlockRequest = z.infer<typeof unlockRequestSchema>;
export declare const statusResponseSchema: z.ZodObject<{
    setupState: z.ZodEnum<["uninitialized", "password_created", "llm_config_pending", "ready"]>;
    locked: z.ZodBoolean;
    llmConfigured: z.ZodBoolean;
    llmSource: z.ZodEnum<["env", "ui", "none"]>;
    model: z.ZodNullable<z.ZodString>;
    serverTime: z.ZodString;
}, "strip", z.ZodTypeAny, {
    model: string | null;
    setupState: "uninitialized" | "password_created" | "llm_config_pending" | "ready";
    locked: boolean;
    llmConfigured: boolean;
    llmSource: "env" | "ui" | "none";
    serverTime: string;
}, {
    model: string | null;
    setupState: "uninitialized" | "password_created" | "llm_config_pending" | "ready";
    locked: boolean;
    llmConfigured: boolean;
    llmSource: "env" | "ui" | "none";
    serverTime: string;
}>;
export type StatusResponse = z.infer<typeof statusResponseSchema>;
export declare const llmSettingsPatchSchema: z.ZodObject<{
    model: z.ZodOptional<z.ZodString>;
    /** 传空字符串表示清除界面保存的 Key。 */
    apiKey: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    model?: string | undefined;
    apiKey?: string | undefined;
}, {
    model?: string | undefined;
    apiKey?: string | undefined;
}>;
export type LlmSettingsPatch = z.infer<typeof llmSettingsPatchSchema>;
export declare const llmSettingsResponseSchema: z.ZodObject<{
    provider: z.ZodLiteral<"deepseek">;
    model: z.ZodString;
    keySource: z.ZodEnum<["env", "ui", "none"]>;
    keyMask: z.ZodNullable<z.ZodString>;
    envKeyPresent: z.ZodBoolean;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    model: string;
    updatedAt: string;
    provider: "deepseek";
    keySource: "env" | "ui" | "none";
    keyMask: string | null;
    envKeyPresent: boolean;
}, {
    model: string;
    updatedAt: string;
    provider: "deepseek";
    keySource: "env" | "ui" | "none";
    keyMask: string | null;
    envKeyPresent: boolean;
}>;
export type LlmSettingsResponse = z.infer<typeof llmSettingsResponseSchema>;
export declare const createLedgerSchema: z.ZodObject<{
    name: z.ZodString;
    timezone: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    timezone: string;
}, {
    name: string;
    timezone?: string | undefined;
}>;
export declare const createAccountSchema: z.ZodObject<{
    name: z.ZodString;
    paymentMethod: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    paymentMethod: string | null;
}, {
    name: string;
    paymentMethod?: string | null | undefined;
}>;
export declare const createContactSchema: z.ZodObject<{
    displayName: z.ZodString;
    remark: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    displayName: string;
    remark: string | null;
}, {
    displayName: string;
    remark?: string | null | undefined;
}>;
export declare const uploadSourceSchema: z.ZodObject<{
    note: z.ZodDefault<z.ZodString>;
    /** 已有相同内容哈希时复用来源；否则新建。 */
    reuseIfExists: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    note: string;
    reuseIfExists: boolean;
}, {
    note?: string | undefined;
    reuseIfExists?: boolean | undefined;
}>;
export declare const extractionCandidateSchema: z.ZodObject<{
    type: z.ZodEnum<["expense", "income", "transfer", "lend", "borrow", "repayment_received", "repayment_paid"]>;
    amount: z.ZodEffects<z.ZodString, string, string>;
    currency: z.ZodLiteral<"CNY">;
    occurredOn: z.ZodNullable<z.ZodString>;
    contactName: z.ZodNullable<z.ZodString>;
    accountHint: z.ZodNullable<z.ZodString>;
    paymentMethod: z.ZodNullable<z.ZodString>;
    merchant: z.ZodNullable<z.ZodString>;
    category: z.ZodNullable<z.ZodString>;
    remark: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    currency: "CNY";
    type: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid";
    paymentMethod: string | null;
    remark: string | null;
    amount: string;
    occurredOn: string | null;
    merchant: string | null;
    category: string | null;
    contactName: string | null;
    accountHint: string | null;
}, {
    currency: "CNY";
    type: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid";
    paymentMethod: string | null;
    remark: string | null;
    amount: string;
    occurredOn: string | null;
    merchant: string | null;
    category: string | null;
    contactName: string | null;
    accountHint: string | null;
}>;
export type ExtractionCandidate = z.infer<typeof extractionCandidateSchema>;
export declare const extractionEnvelopeSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    ledgerId: z.ZodString;
    sourceId: z.ZodString;
    candidate: z.ZodObject<{
        type: z.ZodEnum<["expense", "income", "transfer", "lend", "borrow", "repayment_received", "repayment_paid"]>;
        amount: z.ZodEffects<z.ZodString, string, string>;
        currency: z.ZodLiteral<"CNY">;
        occurredOn: z.ZodNullable<z.ZodString>;
        contactName: z.ZodNullable<z.ZodString>;
        accountHint: z.ZodNullable<z.ZodString>;
        paymentMethod: z.ZodNullable<z.ZodString>;
        merchant: z.ZodNullable<z.ZodString>;
        category: z.ZodNullable<z.ZodString>;
        remark: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        currency: "CNY";
        type: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid";
        paymentMethod: string | null;
        remark: string | null;
        amount: string;
        occurredOn: string | null;
        merchant: string | null;
        category: string | null;
        contactName: string | null;
        accountHint: string | null;
    }, {
        currency: "CNY";
        type: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid";
        paymentMethod: string | null;
        remark: string | null;
        amount: string;
        occurredOn: string | null;
        merchant: string | null;
        category: string | null;
        contactName: string | null;
        accountHint: string | null;
    }>;
    requiresReview: z.ZodArray<z.ZodString, "many">;
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
}, "strip", z.ZodTypeAny, {
    ledgerId: string;
    sourceId: string;
    candidate: {
        currency: "CNY";
        type: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid";
        paymentMethod: string | null;
        remark: string | null;
        amount: string;
        occurredOn: string | null;
        merchant: string | null;
        category: string | null;
        contactName: string | null;
        accountHint: string | null;
    };
    evidence: {
        field: string;
        text: string;
    }[];
    requiresReview: string[];
    schemaVersion: 1;
}, {
    ledgerId: string;
    sourceId: string;
    candidate: {
        currency: "CNY";
        type: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid";
        paymentMethod: string | null;
        remark: string | null;
        amount: string;
        occurredOn: string | null;
        merchant: string | null;
        category: string | null;
        contactName: string | null;
        accountHint: string | null;
    };
    evidence: {
        field: string;
        text: string;
    }[];
    requiresReview: string[];
    schemaVersion: 1;
}>;
export type ExtractionEnvelope = z.infer<typeof extractionEnvelopeSchema>;
export declare const recordInputSchema: z.ZodObject<{
    type: z.ZodEnum<["expense", "income", "transfer", "lend", "borrow", "repayment_received", "repayment_paid"]>;
    amount: z.ZodEffects<z.ZodString, string, string>;
    currency: z.ZodDefault<z.ZodLiteral<"CNY">>;
    occurredOn: z.ZodString;
    accountId: z.ZodString;
    counterAccountId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    contactId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    paymentMethod: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    merchant: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    category: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    remark: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    sourceId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    currency: "CNY";
    type: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid";
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
}, {
    type: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid";
    amount: string;
    occurredOn: string;
    accountId: string;
    currency?: "CNY" | undefined;
    paymentMethod?: string | null | undefined;
    remark?: string | null | undefined;
    sourceId?: string | null | undefined;
    counterAccountId?: string | null | undefined;
    contactId?: string | null | undefined;
    merchant?: string | null | undefined;
    category?: string | null | undefined;
}>;
export type RecordInput = z.infer<typeof recordInputSchema>;
export declare const recordPatchSchema: z.ZodObject<{
    type: z.ZodOptional<z.ZodEnum<["expense", "income", "transfer", "lend", "borrow", "repayment_received", "repayment_paid"]>>;
    amount: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodLiteral<"CNY">>>;
    occurredOn: z.ZodOptional<z.ZodString>;
    accountId: z.ZodOptional<z.ZodString>;
    counterAccountId: z.ZodOptional<z.ZodDefault<z.ZodNullable<z.ZodString>>>;
    contactId: z.ZodOptional<z.ZodDefault<z.ZodNullable<z.ZodString>>>;
    paymentMethod: z.ZodOptional<z.ZodDefault<z.ZodNullable<z.ZodString>>>;
    merchant: z.ZodOptional<z.ZodDefault<z.ZodNullable<z.ZodString>>>;
    category: z.ZodOptional<z.ZodDefault<z.ZodNullable<z.ZodString>>>;
    remark: z.ZodOptional<z.ZodDefault<z.ZodNullable<z.ZodString>>>;
    sourceId: z.ZodOptional<z.ZodDefault<z.ZodNullable<z.ZodString>>>;
} & {
    reason: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    reason: string | null;
    currency?: "CNY" | undefined;
    type?: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid" | undefined;
    paymentMethod?: string | null | undefined;
    remark?: string | null | undefined;
    sourceId?: string | null | undefined;
    amount?: string | undefined;
    occurredOn?: string | undefined;
    accountId?: string | undefined;
    counterAccountId?: string | null | undefined;
    contactId?: string | null | undefined;
    merchant?: string | null | undefined;
    category?: string | null | undefined;
}, {
    currency?: "CNY" | undefined;
    type?: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid" | undefined;
    paymentMethod?: string | null | undefined;
    remark?: string | null | undefined;
    sourceId?: string | null | undefined;
    amount?: string | undefined;
    occurredOn?: string | undefined;
    accountId?: string | undefined;
    counterAccountId?: string | null | undefined;
    contactId?: string | null | undefined;
    merchant?: string | null | undefined;
    category?: string | null | undefined;
    reason?: string | null | undefined;
}>;
export type RecordPatch = z.infer<typeof recordPatchSchema>;
export declare const recordListQuerySchema: z.ZodObject<{
    type: z.ZodOptional<z.ZodEnum<["expense", "income", "transfer", "lend", "borrow", "repayment_received", "repayment_paid"]>>;
    category: z.ZodOptional<z.ZodString>;
    contactId: z.ZodOptional<z.ZodString>;
    accountId: z.ZodOptional<z.ZodString>;
    paymentMethod: z.ZodOptional<z.ZodString>;
    keyword: z.ZodOptional<z.ZodString>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
    includeVoided: z.ZodDefault<z.ZodBoolean>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    includeVoided: boolean;
    limit: number;
    type?: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid" | undefined;
    paymentMethod?: string | undefined;
    accountId?: string | undefined;
    contactId?: string | undefined;
    category?: string | undefined;
    keyword?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
}, {
    type?: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid" | undefined;
    paymentMethod?: string | undefined;
    accountId?: string | undefined;
    contactId?: string | undefined;
    category?: string | undefined;
    keyword?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    includeVoided?: boolean | undefined;
    limit?: number | undefined;
}>;
export type RecordListQuery = z.infer<typeof recordListQuerySchema>;
export declare const queryOperationSchema: z.ZodEnum<["list", "count", "sum", "group_sum", "debt_balance", "unsupported"]>;
export type QueryOperation = z.infer<typeof queryOperationSchema>;
export declare const queryIntentSchema: z.ZodObject<{
    operation: z.ZodEnum<["list", "count", "sum", "group_sum", "debt_balance", "unsupported"]>;
    filters: z.ZodObject<{
        contactId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        dateFrom: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        dateTo: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        type: z.ZodDefault<z.ZodNullable<z.ZodEnum<["expense", "income", "transfer", "lend", "borrow", "repayment_received", "repayment_paid"]>>>;
        category: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        accountId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        paymentMethod: z.ZodDefault<z.ZodNullable<z.ZodString>>;
        keyword: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        type: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid" | null;
        paymentMethod: string | null;
        accountId: string | null;
        contactId: string | null;
        category: string | null;
        keyword: string | null;
        dateFrom: string | null;
        dateTo: string | null;
    }, {
        type?: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid" | null | undefined;
        paymentMethod?: string | null | undefined;
        accountId?: string | null | undefined;
        contactId?: string | null | undefined;
        category?: string | null | undefined;
        keyword?: string | null | undefined;
        dateFrom?: string | null | undefined;
        dateTo?: string | null | undefined;
    }>;
    supported: z.ZodBoolean;
    clarification: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    operation: "list" | "count" | "sum" | "group_sum" | "debt_balance" | "unsupported";
    filters: {
        type: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid" | null;
        paymentMethod: string | null;
        accountId: string | null;
        contactId: string | null;
        category: string | null;
        keyword: string | null;
        dateFrom: string | null;
        dateTo: string | null;
    };
    supported: boolean;
    clarification: string | null;
}, {
    operation: "list" | "count" | "sum" | "group_sum" | "debt_balance" | "unsupported";
    filters: {
        type?: "expense" | "income" | "transfer" | "lend" | "borrow" | "repayment_received" | "repayment_paid" | null | undefined;
        paymentMethod?: string | null | undefined;
        accountId?: string | null | undefined;
        contactId?: string | null | undefined;
        category?: string | null | undefined;
        keyword?: string | null | undefined;
        dateFrom?: string | null | undefined;
        dateTo?: string | null | undefined;
    };
    supported: boolean;
    clarification?: string | null | undefined;
}>;
export type QueryIntent = z.infer<typeof queryIntentSchema>;
export declare const queryRequestSchema: z.ZodObject<{
    question: z.ZodString;
}, "strip", z.ZodTypeAny, {
    question: string;
}, {
    question: string;
}>;
export type QueryRequest = z.infer<typeof queryRequestSchema>;
export declare const idempotencyKeySchema: z.ZodString;
