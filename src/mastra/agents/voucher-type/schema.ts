import { z } from 'zod';

export const voucherTypeClassificationSchema = z.object({
  voucher_type_slug: z
    .string()
    .describe(
      'Slug do tipo de voucher identificado, escolhido dentre os slugs listados nas instruções. Use "other" se nenhum tipo listado corresponder ao documento.',
    ),
  confidence: z.number().min(0).max(1).describe('Confiança da classificação, de 0 (nenhuma certeza) a 1 (certeza total).'),
});

export type VoucherTypeClassification = z.infer<typeof voucherTypeClassificationSchema>;
