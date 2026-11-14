import { z } from 'zod';
import { recordInputSchema } from './api.js';

export const csvMappingSchema = z.object({
  headerRow: z.number().int().min(0).max(29),
  date: z.number().int().min(0),
  amount: z.number().int().min(0),
  type: z.number().int().min(0).nullable(),
  merchant: z.number().int().min(0).nullable(),
  category: z.number().int().min(0).nullable(),
  remark: z.number().int().min(0).nullable(),
  incomeValues: z.array(z.string().max(80)).max(30),
  expenseValues: z.array(z.string().max(80)).max(30),
});
export type CsvMapping = z.infer<typeof csvMappingSchema>;

/** 全量流水 CSV 的传输行。截图内容与历史修订由加密备份保存。 */
export const ledgerCsvRowSchema = recordInputSchema.extend({
  id: z.string().min(1).max(100),
  status: z.enum(['active', 'voided']),
  accountName: z.string().min(1).max(60),
  counterAccountName: z.string().max(60).nullable(),
  contactName: z.string().max(60).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LedgerCsvRow = z.infer<typeof ledgerCsvRowSchema>;
export const ledgerCsvImportSchema = z.object({
  rows: z.array(ledgerCsvRowSchema).max(100000),
  expectedRevision: z.number().int().nonnegative().optional(),
});
export interface LedgerCsvPreview {
  revision: number;
  existing: number;
  incoming: number;
  removed: number;
  missingSources: number;
}
