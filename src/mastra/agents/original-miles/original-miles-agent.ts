import { Agent } from '@mastra/core/agent';
import { getHiveOps } from '../../hiveops';
import { withTimeoutFallback } from '../../helpers/with-timeout-fallback';
import { guardrailActionSchema } from '../luna-guardrail/schema';
import { LunaWorkingMemoryProcessor } from './processors/output-working-memory-processor';
import { LunaGuardrailProcessor } from './processors/output-guardrail-processor';
import { LunaContextProcessor } from './processors/input-context-processor';
import { lunaSupabaseMemory } from './memory/luna-supabase-memory';
import { buildSystemPrompt } from './prompts/system-prompt';
import { buscarHabilidadeTool } from './tools/buscar-habilidade-tool';
import { criarTarefaTool } from './tools/criar-tarefa-tool';
import { pesquisarBaseConhecimentoTool } from './tools/pesquisar-base-conhecimento-tool';

// Reexportados aqui pra quem usa a Luna também ter os types/schema do veredito do
// guardrail à mão, sem precisar importar direto de agents/luna-guardrail.
export { guardrailActionSchema };
export type { GuardrailAction, GuardrailOutput } from '../luna-guardrail/schema';

// TODO: tools, workspace and metadata below are still the starter-template
// defaults; revisit once Luna's real prompt and requirements are in AGENTS.md.
export const luna = new Agent({
  id: 'luna',
  name: 'Luna',
  description: 'Atendente virtual oficial da Buyticket',
  metadata: {
    suggestedPrompts: [
      "Preciso de ajuda com o meu pedido #123?",
      "O comprador não me responde, e agora?",
      'Gostaria de cadastrar um evento.',
    ],
  },
  // Lido do Supabase (tabela `agents`, coluna `system_prompt`, linha `LUNA_AGENT_ID`) a cada
  // geração — editar o prompt lá reflete na próxima mensagem, sem deploy. Se a busca falhar ou
  // passar de 1min, cai no prompt local (`prompts/system-prompt.ts`) como default.
  instructions: async () =>
    withTimeoutFallback(
      async () => (await getHiveOps().getAgentConfig()).systemPrompt,
      () => buildSystemPrompt(),
      60_000,
    ),
  model: 'openai/gpt-4.1',
  defaultOptions: {
    maxSteps: 10,
    autoResumeSuspendedTools: true,
    modelSettings: {
      temperature: 0.3,
      topP: 0.3,
      maxRetries: 5,
    },
  },
  tools: {
    buscar_habilidade: buscarHabilidadeTool,
    pesquisar_base_conhecimento: pesquisarBaseConhecimentoTool,
    criar_tarefa: criarTarefaTool,
  },
  inputProcessors: [new LunaContextProcessor()],
  outputProcessors: [new LunaGuardrailProcessor(), new LunaWorkingMemoryProcessor()],
  memory: lunaSupabaseMemory,
});
