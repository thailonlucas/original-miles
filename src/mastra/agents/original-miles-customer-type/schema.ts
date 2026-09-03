import { z } from 'zod';

export const customerTypeCategories = [
  'vendedor',
  'comprador',
  'improdutivo',
  'parceiro_afiliado',
  'imprensa',
  'funcionario',
] as const;

export const customerTypeOutputSchema = z.object({
  category: z.enum(customerTypeCategories),
});

export type CustomerTypeCategory = (typeof customerTypeCategories)[number];
export type CustomerTypeOutput = z.infer<typeof customerTypeOutputSchema>;
