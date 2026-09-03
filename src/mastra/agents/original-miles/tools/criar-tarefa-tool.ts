import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getHiveOps } from '../../../hiveops';

export const criarTarefaTool = createTool({
  id: 'criar_tarefa',
  description: `Tarefas que você pode executar e acompanhar.

Utilize essa tool somente após consultar as habilidades e as F.A.Q e uma das duas pedirem explicitamente para executar a tool "Criar tarefa".

Só é permitido chamar essa ferramenta se uma Habilidade solicitar.

Pense antes de executar.`,
  inputSchema: z.object({
    type: z
      .string()
      .describe(
        'O exato task_type informado pela habilidade (ex.: update_user_info, create_new_event_by_luna, cancellation_request).',
      ),
    priority: z
      .enum(['low', 'normal', 'high', 'urgent'])
      .describe('Prioridade da tarefa, conforme orientado pela habilidade.'),
    input: z
      .record(z.string(), z.unknown())
      .describe('Os campos necessários para executar a tarefa, conforme a habilidade.'),
  }),
  outputSchema: z.object({
    id: z.string(),
  }),
  execute: async ({ type, priority, input }, { agent }) => {
    return getHiveOps().createTask({
      type,
      priority,
      input,
      conversationId: agent?.threadId,
    });
  },
});
