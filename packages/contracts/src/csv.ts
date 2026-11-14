import { z } from 'zod';

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
