import { registerApiRoute } from '@mastra/core/server';
import { z } from 'zod';
import { Luna } from '../agents/luna/luna';
import { createTicketTagsWithAI } from '../agents/tags/create-ticket-tags-with-ai';
import { logConversationError } from '../helpers/logger';
import { parseOrBadRequest } from './validate';

const bodySchema = z.object({
  messages: z.string(),
  memory: z
    .object({
      thread: z.string(),
      resource: z.string(),
    })
    .optional(),
  requestContext: z.record(z.string(), z.unknown()).optional(),
});

export const lunaAsk = registerApiRoute('/luna/ask', {
  method: 'POST',
  openapi: {
    summary: 'Gera a resposta da Luna para uma mensagem de cliente',
    description:
      'Endpoint simplificado para integrações externas (ex: n8n). Retorna a resposta pronta pro cliente, ' +
      'o resultado do guardrail e as tags de tabulação em um único JSON plano. Tags só saem preenchidas ' +
      'quando `memory` é informado e a ação do guardrail é `connect_human` ou `reply_and_connect_human`.',
    tags: ['Luna'],
  },
  handler: async (c) => {
    const parsed = parseOrBadRequest(bodySchema, await c.req.json(), c);
    if (parsed instanceof Response) return parsed;
    const { messages, memory, requestContext } = parsed;

    const { answer, guardrail, working_memory } = await Luna.ask(messages, { memory, requestContext });

    // Mesmas tags de tabulação do handoff do Zendesk (`createTicketTagsWithAI`, ver
    // `agents/tags/AGENTS.md`), aqui entrando na própria resposta. Só faz sentido tabular quando a
    // conversa vai (ou pode ir) pra um humano — mesmo critério do handoff do Zendesk, ver
    // `routes/zendesk-webhook.ts`. Sem `memory` não tem thread/resource pra buscar histórico, então
    // não dá pra resolver — fica `[]`. Se a resolução falhar, loga o erro e também cai pra `[]` em
    // vez de derrubar a resposta.
    const requiresHandoff = guardrail?.action === 'connect_human' || guardrail?.action === 'reply_and_connect_human';
    const tags =
      memory && requiresHandoff
        ? await createTicketTagsWithAI(memory.thread, memory.resource, working_memory).catch((error) => {
            logConversationError(memory.thread, 'falha ao resolver tags de tabulação', error);
            return [];
          })
        : [];

    return c.json({ answer, guardrail, working_memory, tags });
  },
});

const DEFAULT_HISTORY_LIMIT = 20;

const historyQuerySchema = z.object({
  thread: z.string(),
  resource: z.string().optional(),
  // Últimas N trocas no total. Sem esse parâmetro, o endpoint já aplica o default abaixo — não
  // existe modo "histórico ilimitado" via query param, só passando um `limit` alto.
  limit: z.coerce.number().int().positive().optional(),
  // "Hoje" no fuso de Brasília (não UTC) — ver `filterMessagesBySameDay` em `memory/transcript.ts`.
  same_day: z.preprocess((value) => value === 'true' || value === '1', z.boolean()),
  // Últimas N mensagens de cada papel (cliente e empresa/Luna) antes de parear em exchanges —
  // ver `limitMessagesByRole`. Combina com `same_day` e `limit`, aplicados nessa ordem.
  limit_per_role: z.coerce.number().int().positive().optional(),
});

export const lunaHistoryRoute = registerApiRoute('/luna/history', {
  method: 'GET',
  openapi: {
    summary: 'Retorna o histórico da conversa e a working memory da Luna',
    description:
      'Endpoint somente leitura, sem gerar nenhuma resposta nova. Retorna a conversa como um array de trocas ' +
      '{ user_message, bot_answer } e o estado atual da working memory. `resource` é opcional — se omitido, ' +
      'busca só pelo `thread` e usa o resource já gravado nela; se informado, valida que a thread pertence a ' +
      `esse resource. Sem nenhum filtro, retorna as últimas ${DEFAULT_HISTORY_LIMIT} trocas. Filtros disponíveis: ` +
      '`limit` (últimas N trocas no total), `same_day` (só mensagens de hoje, fuso America/Sao_Paulo) e ' +
      '`limit_per_role` (últimas N mensagens de cada lado — cliente e empresa/Luna — antes de parear em trocas).',
    tags: ['Luna'],
  },
  handler: async (c) => {
    const parsed = parseOrBadRequest(
      historyQuerySchema,
      {
        thread: c.req.query('thread'),
        resource: c.req.query('resource'),
        limit: c.req.query('limit'),
        same_day: c.req.query('same_day'),
        limit_per_role: c.req.query('limit_per_role'),
      },
      c,
    );
    if (parsed instanceof Response) return parsed;
    const { thread, resource, limit, same_day, limit_per_role } = parsed;

    let result;
    try {
      result = await Luna.getMessageHistory(thread, resource, {
        limit: limit ?? DEFAULT_HISTORY_LIMIT,
        sameDayOnly: same_day,
        limitPerRole: limit_per_role,
      });
    } catch {
      return c.json({ error: 'memory_not_configured' }, 500);
    }

    switch (result.status) {
      case 'not_found':
        return c.json({ history: [], working_memory: null });
      case 'resource_mismatch':
        return c.json(
          {
            error: 'resource_mismatch',
            message: `A thread '${thread}' pertence ao resource '${result.actualResource}', não '${resource}'.`,
          },
          400,
        );
      case 'ok':
        return c.json({ history: result.history, working_memory: result.working_memory });
    }
  },
});
