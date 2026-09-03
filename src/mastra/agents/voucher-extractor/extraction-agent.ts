import { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import type { VoucherTypeFull } from '../../services/travel-db';

// `voucher_type.ai_provider` guarda "open_ai" (valor legado do fluxo antigo em n8n) — o model
// router do Mastra usa o prefixo "openai". Outros providers (se algum dia existirem) passam direto.
function toModelRouterProvider(aiProvider: string | null): string {
  if (!aiProvider || aiProvider === 'open_ai') return 'openai';
  return aiProvider;
}

// Extrai os dados estruturados de um voucher já classificado — instructions (prompt) e modelo
// vêm por `requestContext` porque são específicos de cada `voucher_type` (linha do Supabase),
// resolvidos por chamada em `extractStructuredVoucherData`. O `structuredOutput.schema` (JSON
// Schema, também por tipo) é passado direto em `.generate()`, não faz parte da config do Agent —
// cada tipo de voucher tem um schema diferente, não dá pra fixar um só na definição do Agent.
export const voucherExtractionAgent = new Agent({
  id: 'voucher-extraction',
  name: 'Voucher Extraction',
  description: 'Extrai os dados estruturados de um voucher de viagem já classificado, usando o prompt e o JSON Schema cadastrados para o tipo (voucher_type).',
  instructions: ({ requestContext }) => {
    const prompt = requestContext.get<string, string>('extraction_prompt');
    if (!prompt) {
      throw new Error('voucher-extraction: requestContext "extraction_prompt" é obrigatório.');
    }
    return prompt;
  },
  model: ({ requestContext }) => {
    const model = requestContext.get<string, string>('extraction_model');
    if (!model) {
      throw new Error('voucher-extraction: requestContext "extraction_model" é obrigatório.');
    }
    return model;
  },
});

export async function extractStructuredVoucherData(rawContent: string, voucherType: VoucherTypeFull): Promise<Record<string, unknown>> {
  if (!voucherType.prompt) {
    throw new Error(`voucher_type "${voucherType.slug}" não tem "prompt" cadastrado no Supabase — não é possível extrair.`);
  }
  if (!voucherType.schema) {
    throw new Error(`voucher_type "${voucherType.slug}" não tem "structured_output" cadastrado no Supabase — não é possível extrair.`);
  }

  const modelString = `${toModelRouterProvider(voucherType.aiProvider)}/${voucherType.aiModel ?? 'gpt-4.1-mini'}`;

  const { object } = await voucherExtractionAgent.generate(`Extraia o máximo de informações do texto abaixo:\n${rawContent}`, {
    requestContext: new RequestContext([
      ['extraction_prompt', voucherType.prompt],
      ['extraction_model', modelString],
    ]),
    structuredOutput: {
      schema: voucherType.schema,
    },
  });

  return object as Record<string, unknown>;
}
