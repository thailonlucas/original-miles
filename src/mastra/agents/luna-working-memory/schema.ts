import { z } from 'zod';
import { customerTypeCategories } from '../luna-customer-type/schema';

export const lunaWorkingMemorySchema = z.object({
  nome_cliente: z
    .string()
    .nullable()
    .optional()
    .describe('Nome do cliente.'),
  id_pedido: z
    .string()
    .nullable()
    .optional()
    .describe(
      'PRIORIDADE. ID do pedido/compra mais recente mencionado pelo cliente',
    ),
  nome_evento: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Nome do evento/show relacionado ao pedido do cliente',
    ),
  evento_hoje: z
    .boolean()
    .nullable()
    .optional()
    .describe('PRIORIDADE: Se o evento relacionado ao pedido do cliente é hoje'),
  motivo_contato: z
    .string()
    .nullable()
    .optional()
    .describe('Resumo objetivo do motivo pelo qual o cliente entrou em contato'),
  tipo_cliente: z
    .enum(customerTypeCategories)
    .nullable()
    .optional()
    .describe('Tipo de cliente (vendedor, comprador, etc.)'),
  especialista_acionado: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Preenchido automaticamente (fora deste agente) quando um especialista humano já foi acionado pra essa conversa — não gerar nem alterar este campo.',
    ),
});

export type LunaWorkingMemory = z.infer<typeof lunaWorkingMemorySchema>;

// Schema de saída do `lunaWorkingMemoryAgent` (`luna-working-memory-agent.ts`) — igual ao de cima,
// sem `especialista_acionado`. Esse campo é escrito de fora do agente (handoff do Zendesk, ver
// `agents/luna/luna.ts`), nunca decidido pelo modelo; tirá-lo do structured output evita que o LLM
// preencha/sobrescreva por conta própria, em vez de confiar só na descrição do campo.
export const lunaWorkingMemoryAgentOutputSchema = lunaWorkingMemorySchema.omit({ especialista_acionado: true });
