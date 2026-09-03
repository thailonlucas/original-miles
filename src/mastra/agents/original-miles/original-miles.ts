import { randomUUID } from 'node:crypto';
import { RequestContext } from '@mastra/core/request-context';
import { deepMergeWorkingMemory } from '@mastra/memory';
import type { GuardrailOutput } from '../luna-guardrail/schema';
import type { LunaWorkingMemory } from '../luna-working-memory/schema';
import { luna } from './luna-agent';
import { buildExchanges, filterMessagesBySameDay, limitMessagesByRole, type MessageExchange } from './memory/transcript';
import { LunaGuardrail } from '../luna-guardrail/luna-guardrail';
import { logConversationError } from '../../helpers/logger';

// A OpenAI (Responses API) referencia, nos bastidores, o último item de resposta salvo na
// thread — se esse item já não existir mais do lado dela (retenção expirada, por exemplo), toda
// tentativa de continuar a thread falha com esse erro exato, pra sempre, já que a referência
// quebrada fica presa no histórico salvo. Não tem retentativa que resolva isso.
const STALE_RESPONSE_ITEM_ERROR = /item with id .+ not found/i;

function isStaleResponseItemError(error: unknown): boolean {
  return error instanceof Error && STALE_RESPONSE_ITEM_ERROR.test(error.message);
}

export function parseWorkingMemory(raw: string | null): LunaWorkingMemory | null {
  return raw ? (JSON.parse(raw) as LunaWorkingMemory) : null;
}

type LunaAskOptions = {
  memory?: { thread: string; resource: string };
  requestContext?: Record<string, unknown>;
};

type LunaAskResult = {
  answer: string | null;
  guardrail: GuardrailOutput | null;
  working_memory: LunaWorkingMemory | null;
};

// O resourceId que quem chama calcula (ex.: telefone do Zendesk) é só um palpite pra thread nova.
// Se a thread já existe, o Mastra trava a resposta caso o resourceId não bata com o dono
// original (`AGENT_MEMORY_THREAD_RESOURCE_MISMATCH`) — e o telefone resolvido por webhook pode
// variar entre mensagens da mesma conversa (ex.: campo bruto do provedor às vezes vem com o id
// da mensagem em vez do telefone). Pra não depender de acertar o resourceId toda vez, sempre
// usamos o dono já gravado na thread quando ela existir.
async function resolveMemoryOptions(memory: { thread: string; resource: string }): Promise<{ thread: string; resource: string }> {
  const lunaMemory = await luna.getMemory();
  if (!lunaMemory) return memory;

  const existingThread = await lunaMemory.getThreadById({ threadId: memory.thread });
  if (!existingThread) return memory;

  return { thread: memory.thread, resource: existingThread.resourceId };
}

async function generateAnswer(
  message: string,
  memory: { thread: string; resource: string } | undefined,
  requestContext: Record<string, unknown> | undefined,
): Promise<LunaAskResult> {
  const result = await luna.generate(message, {
    memory,
    requestContext: new RequestContext(Object.entries(requestContext ?? {})),
  });

  const guardrail = LunaGuardrail.extractOutput(result);

  const lunaMemory = await luna.getMemory();
  const workingMemoryRaw =
    memory && lunaMemory
      ? await lunaMemory.getWorkingMemory({ threadId: memory.thread, resourceId: memory.resource })
      : null;

  return {
    answer: result.text?.trim() ?? null,
    guardrail,
    working_memory: parseWorkingMemory(workingMemoryRaw),
  };
}

async function ask(message: string, options: LunaAskOptions = {}): Promise<LunaAskResult> {
  const { requestContext } = options;
  const memory = options.memory ? await resolveMemoryOptions(options.memory) : undefined;

  try {
    return await generateAnswer(message, memory, requestContext);
  } catch (error) {
    if (!memory || !isStaleResponseItemError(error)) throw error;

    // A thread ficou travada numa referência de resposta que a OpenAI já não reconhece mais —
    // não adianta tentar de novo do mesmo jeito. Descarta a thread (perde o histórico salvo
    // dessa conversa) e responde de novo como se fosse a primeira mensagem dela.
    logConversationError(memory.thread, 'Thread presa em referência de resposta expirada na OpenAI, reiniciando', error);
    const lunaMemory = await luna.getMemory();
    if (lunaMemory) await lunaMemory.deleteThread(memory.thread);
    return generateAnswer(message, memory, requestContext);
  }
}

type LunaHistoryResult =
  | { status: 'ok'; history: MessageExchange[]; working_memory: LunaWorkingMemory | null }
  | { status: 'not_found' }
  | { status: 'resource_mismatch'; actualResource: string };

// Filtros opcionais de leitura — nenhum tem default aqui (default de UI/API é decisão de quem
// chama, ex.: `routes/luna-api.ts`); sem filtros, devolve a conversa inteira, igual antes.
export type LunaHistoryFilters = {
  limit?: number;
  sameDayOnly?: boolean;
  limitPerRole?: number;
};

// Leitura pura do histórico + working memory de uma thread, sem gerar nenhuma resposta nova.
// `resource` é opcional: quando informado, valida que a thread pertence a ele (guarda contra
// buscar o histórico errado); quando omitido, busca só pelo `thread` e usa o resource já
// gravado nela (`existingThread.resourceId`).
async function getMessageHistory(thread: string, resource?: string, filters: LunaHistoryFilters = {}): Promise<LunaHistoryResult> {
  const lunaMemory = await luna.getMemory();
  if (!lunaMemory) {
    throw new Error('memory_not_configured');
  }

  const existingThread = await lunaMemory.getThreadById({ threadId: thread });
  if (!existingThread) {
    return { status: 'not_found' };
  }
  if (resource && existingThread.resourceId !== resource) {
    return { status: 'resource_mismatch', actualResource: existingThread.resourceId };
  }

  const resourceId = existingThread.resourceId;
  const [{ messages }, workingMemoryRaw] = await Promise.all([
    lunaMemory.recall({ threadId: thread, resourceId }),
    lunaMemory.getWorkingMemory({ threadId: thread, resourceId }),
  ]);

  // Ordem importa: primeiro reduz o período (dia), depois o volume por papel, e só então
  // pareia em exchanges e corta pro `limit` final — assim cada filtro estreita o anterior.
  let scopedMessages = messages;
  if (filters.sameDayOnly) scopedMessages = filterMessagesBySameDay(scopedMessages, new Date());
  if (filters.limitPerRole) scopedMessages = limitMessagesByRole(scopedMessages, filters.limitPerRole);

  return {
    status: 'ok',
    history: buildExchanges(scopedMessages, filters.limit),
    working_memory: parseWorkingMemory(workingMemoryRaw),
  };
}

// Grava `especialista_acionado` direto na working memory da thread, sem passar pelo
// `lunaWorkingMemoryAgent` — é uma nota determinística (o handoff do Zendesk já sabe exatamente o
// que aconteceu), não algo pra um LLM inferir. Faz o mesmo read-merge-write de
// `LunaWorkingMemoryProcessor` (`agents/luna/processors/output-working-memory-processor.ts`) pra
// não sobrescrever os outros campos já salvos (nome_cliente, id_pedido etc.).
async function markSpecialistEngaged(thread: string, resource: string, note: string): Promise<void> {
  const lunaMemory = await luna.getMemory();
  if (!lunaMemory) return;

  const currentRaw = await lunaMemory.getWorkingMemory({ threadId: thread, resourceId: resource });
  const current = currentRaw ? JSON.parse(currentRaw) : {};
  const merged = deepMergeWorkingMemory(current, { especialista_acionado: note });
  await lunaMemory.updateWorkingMemory({ threadId: thread, resourceId: resource, workingMemory: JSON.stringify(merged) });
}

// Mensagens como o aviso de handoff (`business/`) são mandadas direto pro Zendesk
// (`zendesk.sendMessage`), sem passar por `luna.generate()` — por isso nunca entram no histórico
// que a própria memória da Luna guarda. Sem esse registro, a Luna perde a cronologia: na próxima
// geração ela veria a próxima mensagem do cliente (ex.: "obrigado") sem o antecedente real na
// conversa, só o fato solto da working memory (`markSpecialistEngaged`), sem saber que aconteceu
// bem ali, logo depois da última resposta dela. `saveMessages` é a API pública do Mastra pra criar
// mensagem manualmente fora do `generate()` (thread e resource já existem a essa altura, não
// precisa `createThread`).
async function recordSentMessage(thread: string, resource: string, text: string): Promise<void> {
  const lunaMemory = await luna.getMemory();
  if (!lunaMemory) return;

  await lunaMemory.saveMessages({
    messages: [
      {
        id: randomUUID(),
        role: 'assistant',
        createdAt: new Date(),
        threadId: thread,
        resourceId: resource,
        content: { format: 2, parts: [{ type: 'text', text }] },
      },
    ],
  });
}

export const Luna = { id: 'Luna', ask, getMessageHistory, markSpecialistEngaged, recordSentMessage };
