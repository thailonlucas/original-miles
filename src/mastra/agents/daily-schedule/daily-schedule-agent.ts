import { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import type { TravelScheduleState, VoucherSummary } from '../../services/travel-db';
import {
  buildIncrementalInstructions,
  buildIncrementalUserMessage,
  buildRebuildInstructions,
  buildRebuildUserMessage,
} from './prompts/system-prompt';
import { dailyScheduleUpdateSchema, type DailyScheduleUpdate } from './schema';
import { openVoucherTool } from './tools/open-voucher-tool';

// Instructions reais são montadas por chamada (rebuild vs update incremental, ver funções abaixo)
// — mesmo padrão de `agents/tags/tags-agent.ts` antes de ser removido. A lista de vouchers (só
// id/tipo/título/resumo) vai na mensagem do usuário, não aqui — os dados completos de cada voucher
// só entram via a tool `openVoucher`, chamada pelo próprio agente sob demanda.
export const dailyScheduleAgent = new Agent({
  id: 'daily-schedule',
  name: 'Daily Schedule',
  description: 'Monta/atualiza o roteiro dia a dia de uma viagem (manhã/tarde/noite) a partir dos vouchers já extraídos.',
  instructions: 'Aguardando a lista de vouchers da viagem.',
  model: 'openai/gpt-4.1',
  tools: { openVoucher: openVoucherTool },
  defaultOptions: {
    // Default do Mastra é baixo demais pra uma viagem com muitos vouchers — cada voucher relevante
    // pode custar 1 chamada de "openVoucher", e ainda sobra pelo menos 1 passo pra escrever a saída
    // estruturada. Sem isso, viagens com >~10 vouchers cortavam a rodada de tool calls antes do
    // agente abrir tudo que precisava, produzindo roteiro incompleto (dias sumindo, datas erradas).
    maxSteps: 40,
    structuredOutput: {
      schema: dailyScheduleUpdateSchema,
    },
  },
});

// Reconstrói o roteiro do zero a partir de TODOS os vouchers fornecidos — usado quando não dá pra
// fazer incremental (hoje, só depois de excluir um voucher, ver `rebuild-daily-schedule.ts`).
export async function buildDailyScheduleFromScratch(vouchers: VoucherSummary[], tenantId: string): Promise<DailyScheduleUpdate> {
  const { object } = await dailyScheduleAgent.generate(buildRebuildUserMessage(vouchers), {
    instructions: buildRebuildInstructions(),
    requestContext: new RequestContext([['tenant_id', tenantId]]),
  });
  return object;
}

// Aplica só o que UM voucher novo muda no roteiro já existente — caminho padrão a cada voucher
// extraído (mais barato/rápido que reprocessar tudo).
export async function applyVoucherToDailySchedule(
  currentState: TravelScheduleState,
  vouchers: VoucherSummary[],
  newVoucherId: string,
  tenantId: string,
): Promise<DailyScheduleUpdate> {
  const { object } = await dailyScheduleAgent.generate(buildIncrementalUserMessage(currentState, vouchers, newVoucherId), {
    instructions: buildIncrementalInstructions(),
    requestContext: new RequestContext([['tenant_id', tenantId]]),
  });
  return object;
}
