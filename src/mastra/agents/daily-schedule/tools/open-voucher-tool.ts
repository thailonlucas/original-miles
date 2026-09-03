import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getVoucherExtractedData } from '../../../services/travel-db';

// Abre o `ai_extracted_data` completo de UM voucher pelo id — o agente de dia a dia
// (`daily-schedule-agent.ts`) só recebe id/tipo/título/content de cada voucher no prompt (ver
// `services/travel-db.ts` → `getVoucherSummaries`), e chama esta tool antes de escrever qualquer
// evento baseado naquele voucher. `tenant_id` vem do `requestContext` (mesmo padrão de
// `agents/voucher-type/`), nunca é passado pelo model — evita um voucher de outro tenant vazar
// por um id adivinhado/errado.
export const openVoucherTool = createTool({
  id: 'openVoucher',
  description:
    'Abre os dados completos extraídos de um voucher específico, pelo id (ver a lista de vouchers da viagem). ' +
    'Use antes de escrever qualquer evento baseado nesse voucher — nunca invente dados que não vieram daqui.',
  inputSchema: z.object({
    voucherId: z.string().describe('id do voucher a abrir, da lista de vouchers da viagem.'),
  }),
  outputSchema: z.unknown(),
  execute: async ({ voucherId }, { requestContext }) => {
    const tenantId = requestContext.get<string, string>('tenant_id');
    if (!tenantId) {
      throw new Error('openVoucher: requestContext "tenant_id" é obrigatório.');
    }
    const data = await getVoucherExtractedData(tenantId, voucherId);
    return data ?? { error: `voucher ${voucherId} não encontrado ou sem dados extraídos.` };
  },
});
