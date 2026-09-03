import { Agent } from '@mastra/core/agent';
import { getHiveOps } from '../../hiveops';
import { withTimeoutFallback } from '../../helpers/with-timeout-fallback';
import { buildSystemPrompt, withDateFooter } from './prompts/system-prompt';
import { guardrailOutputSchema } from './schema';

export const lunaGuardrail = new Agent({
  id: 'luna-guardrail',
  name: 'Luna Guardrail',
  description: 'Classifica cada resposta da Luna (reply | connect_human | reply_and_connect_human).',
  // Lido do Supabase (tabela `agents`, coluna `guardrail_prompt`, linha `LUNA_AGENT_ID`) a cada
  // classificação — a data atual é sempre acrescentada por fora (`withDateFooter`), nunca vem do
  // Supabase. Se a busca falhar ou passar de 1min, cai no prompt local (`prompts/system-prompt.ts`).
  instructions: () => {
    const now = new Date();
    return withTimeoutFallback(
      async () => withDateFooter((await getHiveOps().getAgentConfig()).guardrailPrompt, now),
      () => buildSystemPrompt(now),
      60_000,
    );
  },
  model: 'openai/gpt-5.6-luna',
  defaultOptions: {
    structuredOutput: {
      schema: guardrailOutputSchema,
    },
  },
});
