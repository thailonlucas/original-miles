import { Agent } from '@mastra/core/agent';
import { buildSystemPrompt } from './prompts/system-prompt';
import { lunaWorkingMemoryAgentOutputSchema } from './schema';

export const lunaWorkingMemoryAgent = new Agent({
  id: 'luna-working-memory',
  name: 'Luna Working Memory',
  description: 'Decide o que deve ser adicionado, atualizado ou removido na working memory da Luna a partir da última troca de mensagens.',
  instructions: () => {
    const hoje = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date());
    return buildSystemPrompt(hoje);
  },
  model: 'openai/gpt-5.6-luna',
  defaultOptions: {
    structuredOutput: {
      schema: lunaWorkingMemoryAgentOutputSchema,
    },
  },
});
