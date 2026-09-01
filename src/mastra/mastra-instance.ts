import 'dd-trace/init.js';
import { Mastra } from '@mastra/core/mastra';
import { SimpleAuth } from '@mastra/core/server';
import { PostgresStore } from '@mastra/pg';
import { DuckDBStore } from '@mastra/duckdb';
import { PinoLogger } from '@mastra/loggers';
import { MastraCompositeStore } from '@mastra/core/storage';
import { MastraEditor } from '@mastra/editor';
import {
  MastraStorageExporter,
  MastraPlatformExporter,
  Observability,
  SensitiveDataFilter,
} from '@mastra/observability';
import { env } from './config/env';
import { requireEnv } from './config/require-env';
import { luna } from './agents/luna/luna-agent';
import { customerTypeAgent } from './agents/luna-customer-type/luna-customer-type-agent';
import { documentAnalysisAgent } from './agents/luna-document-analysis/luna-document-analysis-agent';
import { lunaGuardrail } from './agents/luna-guardrail/luna-guardrail-agent';
import { imageAnalysisAgent } from './agents/luna-image-analysis/luna-image-analysis-agent';
import { lunaWorkingMemoryAgent } from './agents/luna-working-memory/luna-working-memory-agent';
// import { tagsAgent } from './agents/tags/tags-agent';
import { lunaHistoryRoute, lunaAsk } from './routes/luna-api';
import { zendeskWebhookRoute } from './routes/zendesk-webhook';

// Silencia os warnings do AI SDK sobre o embedding model do Mastra rodar em modo de
// compatibilidade de spec (v2 -> v3) — o fallback automático já cobre, é só ruído no log.
(globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;

const { SUPABASE_DB_URL } = requireEnv({ SUPABASE_DB_URL: env.SUPABASE_DB_URL }, 'Mastra storage');

export const mastra = new Mastra({
  bundler: {
    externals: ['@duckdb/node-bindings', 'dd-trace'],
  },
  // prettyPrint tem default `true` no PinoLogger do Mastra (mesmo com NODE_ENV=production) — sem
  // isso, cada log sai formatado em várias linhas em vez de um JSON compacto por entrada, o que
  // infla bastante o log do container (sem rotação configurada no host, isso vira disco sumindo).
  logger: new PinoLogger({ name: 'Mastra', level: 'info', prettyPrint: process.env.NODE_ENV !== 'production' }),
  agents: { luna, lunaGuardrail, customerTypeAgent, lunaWorkingMemoryAgent, imageAnalysisAgent, documentAnalysisAgent },
  server: {
    // Toda rota exige "Authorization: Bearer <LUNA_API_KEY>", exceto o webhook do Zendesk
    // (que não manda esse header) — ele opta por fora com `requiresAuth: false` na própria rota.
    auth: new SimpleAuth({ tokens: { [env.LUNA_API_KEY]: { id: 'luna-api' } } }),
    apiRoutes: [lunaAsk, lunaHistoryRoute, zendeskWebhookRoute],
  },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    // max abaixo do pool_size do Supabase Session Pooler (15), senão o pg.Pool
    // (default max: 20) estoura o pooler com EMAXCONNSESSION sob concorrência.
    default: new PostgresStore({ id: 'mastra-storage', connectionString: SUPABASE_DB_URL, max: 10 }),
    domains: {
      // memoryLimit alto o suficiente pra evitar spill em disco: o container roda com
      // readOnlyRootFilesystem, então um spill (que o DuckDB tenta em ".tmp" relativo ao
      // cwd) falha com "Read-only file system" e invalida o banco :memory: permanentemente
      // até o pod reiniciar.
      observability: await new DuckDBStore({ path: ':memory:', memoryLimit: '512MB' }).getStore('observability'),
    },
  }),
  editor: new MastraEditor(),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [new MastraStorageExporter(), new MastraPlatformExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
        logging: {
          enabled: true,
          level: 'info',
        },
      },
    },
  }),
});
