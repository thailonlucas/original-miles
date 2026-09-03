import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import { env } from '../../../config/env';
import { requireEnv } from '../../../config/require-env';
import { lunaWorkingMemorySchema } from '../../luna-working-memory/schema';

const { SUPABASE_DB_URL } = requireEnv({ SUPABASE_DB_URL: env.SUPABASE_DB_URL }, 'Luna memory storage');

export const lunaSupabaseMemory = new Memory({
  // Storage no nível do agente (não o do Mastra em `index.ts`): a memória da Luna (threads,
  // mensagens, working memory) vive no Postgres do Supabase, com seu próprio schema nativo do
  // Mastra — não reaproveita a tabela `n8n_luna_chat_histories` do fluxo antigo do n8n.
  storage: new PostgresStore({ id: 'luna-memory-storage', connectionString: SUPABASE_DB_URL }),
  options: {
    generateTitle: false,
    lastMessages: 15,
    // `observationalMemory` está desativado de propósito neste projeto: cada tool-call/tool-result
    // da conversa (playbooks inteiros, artigos de F.A.Q.) entrava como JSON no payload do Observer,
    // deixando as chamadas gigantes e derrubando a taxa de sucesso. Ver `conversation-memory-extractor.ts`
    // pra reativar — só religar se o usuário pedir explicitamente, não por conta própria.
    workingMemory: {
      enabled: true,
      scope: 'thread',
      schema: lunaWorkingMemorySchema,
      agentManaged: false,
    },
  },
});
