import { z } from 'zod';

export const conversationMemorySchema = z.object({
  problem_summary: z
    .string()
    .optional()
    .describe('Frase objetiva descrevendo o problema que o cliente quer resolver nesta conversa.'),
  data_needed: z
    .array(z.string())
    .optional()
    .describe('Dados que ainda faltam ser coletados para resolver o problema do cliente.'),
  data_collected: z
    .record(z.string(), z.string())
    .optional()
    .describe('Dados que o cliente já informou nesta conversa, como pares chave-valor (ex.: { "pedido_id": "123" }).'),
});

export type ConversationMemory = z.infer<typeof conversationMemorySchema>;
