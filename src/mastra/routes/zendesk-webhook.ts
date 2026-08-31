import { registerApiRoute } from '@mastra/core/server';
import { Luna } from '../agents/luna/luna';
import { createTicketTagsWithAI } from '../agents/tags/create-ticket-tags-with-ai';
import { resolveBusinessByAppId } from '../business/registry';
import { env } from '../config/env';
import { requireEnv } from '../config/require-env';
import { logConversation, logConversationError, logWarning } from '../helpers/logger';
import { zendeskRequest } from '../services/zendesk';
import { getHiveOps } from '../hiveops';
import { conversationMessageSchema, zendeskWebhookSchema } from '../webhooks/zendesk';
import type { AskLunaInput } from '../webhooks/zendesk/schema';
import { buildHandoffTags } from '../webhooks/zendesk/handoff-tags';
import { bufferMessage } from '../webhooks/zendesk/message-buffer';
import { buildHandoffTicketFields } from '../webhooks/zendesk/ticket-fields';
import { transformMessageInTextWithAI } from '../webhooks/zendesk/message-normalizer';
import type { ZendeskConversationMessagePayload, ZendeskUserSearchResponse } from '../webhooks/zendesk/schema';
import { normalizeIncomingMessage, zendesk } from '../webhooks/zendesk/zendesk';
import { parseOrBadRequest } from './validate';
import { PREDEFINED_MESSAGES } from '../predefined-messages';

// Ponto de entrada único pro fluxo "mensagem nova do Zendesk chegou": recebe o webhook, prepara
// a mensagem (bloqueio, mídia normalizada pra texto), junta com outras mensagens próximas no
// tempo da mesma conversa (buffer) e manda pra Luna, aplicando a decisão do guardrail.
export const zendeskWebhookRoute = registerApiRoute('/webhooks/zendesk', {
  method: 'POST',
  // O Zendesk chama esse endpoint sem o header Authorization da nossa API — precisa ficar
  // fora da autenticação (SimpleAuth) configurada no server.
  requiresAuth: false,
  openapi: {
    summary: 'Recebe eventos de conversa do Zendesk (WhatsApp)',
    description:
      'Webhook chamado pelo Zendesk a cada mensagem de uma conversa. A resposta ao Zendesk é sempre ' +
      'imediata — todo o processamento roda em background: identifica bloqueio, normaliza mídia (áudio, ' +
      'imagem, etc.) pra texto, junta com outras mensagens próximas no tempo da mesma conversa (buffer) ' +
      'e só então manda pra Luna, aplicando a decisão do guardrail (responder e/ou transferir para um humano).',
    tags: ['Zendesk'],
  },
  handler: async (c) => {
    const { ZENDESK_WEBHOOK_ID, ZENDESK_WEBHOOK_SECRET } = requireEnv(
      { ZENDESK_WEBHOOK_ID: env.ZENDESK_WEBHOOK_ID, ZENDESK_WEBHOOK_SECRET: env.ZENDESK_WEBHOOK_SECRET },
      'Zendesk webhook',
    );

    if (c.req.header('x-api-key') !== ZENDESK_WEBHOOK_SECRET) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    const parsed = parseOrBadRequest(zendeskWebhookSchema, await c.req.json(), c);
    if (parsed instanceof Response) return parsed;

    if (parsed.webhook.id !== ZENDESK_WEBHOOK_ID) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    for (const event of parsed.events) {
      const message = conversationMessageSchema.safeParse(event.payload);
      if (!message.success) {
        logWarning(`evento zendesk inválido (app ${parsed.app.id})`, message.error.flatten());
        continue;
      }

      void onNewZendeskMessageReceived(parsed.app.id, message.data).catch((error) =>
        logConversationError(message.data.conversation.id, 'falha ao processar mensagem recebida', error),
      );
    }

    return c.json({ received: true });
  },
});

// Conversas com um buffer aberto (aguardando mensagens novas antes de perguntar pra Luna),
// usado só pra saber se uma mensagem que chega fecha um buffer anterior ou abre um novo.
const conversationsAwaitingBuffer = new Set<string>();

// Nunca espera esse processamento terminar antes de responder ao Zendesk. Identifica se a
// mensagem é da empresa ou do cliente, checa bloqueio, normaliza mídia pra texto e só então
// junta com outras mensagens próximas no tempo da mesma conversa (buffer) antes de perguntar
// pra Luna.
async function onNewZendeskMessageReceived(appId: string, payload: ZendeskConversationMessagePayload): Promise<void> {
  const zendeskPayload = normalizeIncomingMessage(appId, payload);

  if (zendeskPayload.isFromCompany) {
    if (zendeskPayload.userName?.includes(Luna.id)) {
      // logConversation(zendeskPayload.conversationId, "echo do Zendesk - mensagem da própria luna: não tratar" )
      return;
    }
    logConversation(zendeskPayload.conversationId, "empresa mandou mensagem na conversa" )
    zendesk
      .connectHuman(appId, zendeskPayload.conversationId, {
        tags: buildHandoffTags('luna-interrompida', null),
        ticketFields: buildHandoffTicketFields(zendeskPayload.conversationId, null),
      })
      .then(() => logConversation(zendeskPayload.conversationId, "luna desativada da conversa" ));
    return;
  }

  logConversation(
    zendeskPayload.conversationId,
    `mensagem recebida de "${zendeskPayload.userName ?? 'desconhecido'}" (${zendeskPayload.mediaType}, origem: ${zendeskPayload.isFromCompany ? 'empresa' : 'cliente'})`,
  );
  // Contato com alguma tag de handoff no Zendesk, ou mensagem com palavra-chave de bypass:
  // a Luna não cuida desses casos.
  const [blocked, bypassKeyword] = await Promise.all([
    isContactBlocked(zendeskPayload.conversationId, zendeskPayload.userPhone, zendeskPayload.externalId),
    isMessageKeywordToBypassAgent(zendeskPayload.conversationId, zendeskPayload.additionalText),
  ]);
  if (blocked || bypassKeyword) {
    logConversation(
      zendeskPayload.conversationId,
      bypassKeyword ? 'mensagem com palavra-chave de bypass' : 'usuário bloqueado ou com tags de bloqueio',
    )
    zendesk
      .connectHuman(appId, zendeskPayload.conversationId, {
        // Sem BASE_HANDOFF_TAGS ("luna", "luna-transferencia") aqui: contato bloqueado ou
        // bypass não é uma transferência normal da Luna, é a Luna nem entrando na conversa.
        tags: ['luna-interrompida'],
        ticketFields: buildHandoffTicketFields(zendeskPayload.conversationId, null),
      })
      .then(() => logConversation(zendeskPayload.conversationId, "luna desativada da conversa" ));
    return;
  }

  if (zendeskPayload.mediaType === 'sticker') {
    logConversation(zendeskPayload.conversationId, 'sticker recebido e ignorado');
    return;
  }

  logConversation(zendeskPayload.conversationId, `transformando mensagem "${zendeskPayload.mediaType}"`);
  const message = await transformMessageInTextWithAI({
    mediaType: zendeskPayload.mediaType,
    mediaUrl: zendeskPayload.mediaUrl,
    additionalText: zendeskPayload.additionalText,
  }).catch((error) => {
    // Erro permanente da OpenAI (ex.: tipo de arquivo/áudio que ela não aceita) — sem esse
    // fallback, a mensagem inteira se perde em silêncio aqui: nunca chega no buffer nem na Luna,
    // e o cliente não recebe resposta nenhuma (esse `await` não tinha nenhum catch antes). Loga e
    // segue com um texto genérico, mesma lógica de fail-open já usada acima pro bloqueio/bypass.
    logConversationError(
      zendeskPayload.conversationId,
      `falha ao transformar mídia "${zendeskPayload.mediaType}" em texto, seguindo com texto genérico`,
      error,
    );
    return PREDEFINED_MESSAGES.media.processing_failed;
  });
  const resourceId = zendeskPayload.userPhone ?? `zendesk:${zendeskPayload.userId ?? zendeskPayload.conversationId}`;

  if (conversationsAwaitingBuffer.has(zendeskPayload.conversationId)) {
    logConversation(zendeskPayload.conversationId, 'Nova mensagem chegou, fluxo encerrado');
  }
  conversationsAwaitingBuffer.add(zendeskPayload.conversationId);
  logConversation(zendeskPayload.conversationId, 'Aguardando novas mensagens');

  bufferMessage({ appId, conversationId: zendeskPayload.conversationId, resourceId, userPhone: zendeskPayload.userPhone, message }, async (merged) => {
    conversationsAwaitingBuffer.delete(merged.conversationId);
    logConversation(merged.conversationId, 'Nenhuma nova mensagem, gerar resposta');
    logConversation(merged.conversationId, `buffer fechado, perguntando pra Luna: "${merged.message}"`);

    const askResult = await askLunaWithFallback(merged);
    if (!askResult) {
      // Luna esgotou as tentativas e não conseguiu gerar nenhuma resposta — o cliente não pode
      // ficar sem resposta, então avisamos e passamos pra um humano em vez de deixar a conversa muda.
      
      //O codigo esta comentado pq temos um outro fluxo de retry que roda no n7n. Pega as pessoas sem respostas e reenvia pra Luan
      // const fallbackNotice = `${PREDEFINED_MESSAGES.error.technical_issue} ${PREDEFINED_MESSAGES.business.high_volume}`;
      // await zendesk.sendMessage(merged.appId, merged.conversationId, fallbackNotice);
      // await zendesk.connectHuman(merged.appId, merged.conversationId, {
      //   tags: buildHandoffTags('luna-erro', null),
      //   ticketFields: buildHandoffTicketFields(merged.conversationId, null),
      // });
      return;
    }

    const { answer, guardrail, working_memory } = askResult;
    const action = guardrail?.action ?? 'reply';
    logConversation(merged.conversationId, `Luna decidiu responder: "${answer}"`);

    if ((action === 'reply' || action === 'reply_and_connect_human') && answer) {
      await zendesk.sendMessage(merged.appId, merged.conversationId, answer);
    }

    if (action === 'connect_human' || action === 'reply_and_connect_human') {
      // Tags de tabulação são um "nice to have" resolvido por IA (2 agentes) — se falhar (timeout,
      // rate limit etc.), não pode travar o handoff em si. `buildHandoffTags` já garante as tags
      // base (luna, luna-transferencia, motivo, tipo_cliente...) mesmo com `tabulacaoTags` vazio.
      const tabulacaoTags = await createTicketTagsWithAI(merged.conversationId, merged.resourceId, working_memory).catch(
        (error) => {
          logConversationError(merged.conversationId, 'falha ao gerar tags de tabulação via IA — seguindo sem elas', error);
          return [];
        },
      );

      await zendesk.connectHuman(merged.appId, merged.conversationId, {
        tags: buildHandoffTags(action, working_memory, tabulacaoTags),
        ticketFields: buildHandoffTicketFields(merged.conversationId, working_memory),
      });

      // Só avisa o cliente depois que a transferência de fato aconteceu — antes disso o handoff
      // podia falhar (rede, API do Zendesk) e o cliente ficava com o aviso de espera sem nunca
      // ser transferido de verdade.
      const notice = resolveBusinessByAppId(merged.appId).getHandoffNoticeMessage();
      if (notice) await zendesk.sendMessage(merged.appId, merged.conversationId, notice);
    }
  });
}

const DEFAULT_ASK_MAX_ATTEMPTS = 3;

// Chama a Luna e tenta de novo se der erro (a LLM upstream falha de vez em quando por motivos
// transitórios — rate limit, timeout, item de conversa expirado). Número de tentativas
// configurável via `LUNA_ASK_MAX_ATTEMPTS` (padrão 3). Só devolve `null` — sinal pra quem chamou
// mandar a mensagem de transferência — depois de esgotar todas as tentativas sem conseguir
// nenhuma resposta.
async function askLunaWithFallback(merged: AskLunaInput): Promise<Awaited<ReturnType<typeof Luna.ask>> | null> {
  const memory = { thread: merged.conversationId, resource: merged.resourceId };
  const requestContext = merged.userPhone ? { user_phone: merged.userPhone } : {};
  const maxAttempts = env.LUNA_ASK_MAX_ATTEMPTS ?? DEFAULT_ASK_MAX_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await Luna.ask(merged.message, { memory, requestContext });
    } catch (error) {
      const isLastAttempt = attempt === maxAttempts;
      logConversationError(
        merged.conversationId,
        isLastAttempt
          ? `Luna falhou ao gerar resposta (tentativa ${attempt}/${maxAttempts}), desistindo`
          : `Luna falhou ao gerar resposta (tentativa ${attempt}/${maxAttempts}), tentando de novo`,
        error,
      );
    }
  }

  return null;
}

// Um contato é considerado bloqueado quando existe um usuário no Zendesk com o telefone dele
// que também carrega alguma tag de handoff (ex.: "golpe", "vip-humano" etc, configuráveis via
// HiveOps). A busca cobre telefone com e sem "+" e o `externalId` do webhook como variantes,
// já que o mesmo contato pode aparecer cadastrado em formatos diferentes no Zendesk. Se a
// checagem falhar (Zendesk/HiveOps fora do ar), segue o fluxo assumindo que o contato não está
// bloqueado — a Luna não pode travar por uma falha nessa verificação.
async function isContactBlocked(conversationId: string, phone: string | null, externalId: string | undefined): Promise<boolean> {
  try {
    const handoffTags = await getHiveOps().getHandoffTagTitles();

    const query = [
      'type:user',
      `phone:${phone ?? ''}`,
      `phone:+${phone ?? ''}`,
      `phone:${externalId ?? ''}`,
      `phone:+${externalId ?? ''}`,
      ...handoffTags.map((title) => `tags:${title}`),
    ].join('\n');

    const response = await zendeskRequest<ZendeskUserSearchResponse>(`users/search.json?query=${encodeURIComponent(query)}`);

    return response.users.some((user) => Boolean(user.phone));
  } catch (error) {
    logConversationError(
      conversationId,
      'erro ao buscar no Zendesk se o contato está bloqueado — deixando passar e assumindo que não está bloqueado',
      error,
    );
    return false;
  }
}

// Palavras-chave que, quando a mensagem do cliente é exatamente igual (sem variação), pulam a
// Luna e vão direto pro humano — isso pra mensagens ativas onde o usuário clica num botão ou
// mensagens ativas do time de social. Vêm da coluna `bypass_keys` (array de text) na tabela
// `agents` do HiveOps/Supabase — editar lá reflete na próxima mensagem, sem deploy. Se a busca
// falhar, segue o fluxo assumindo que não é bypass (mesma lógica de fail-open do `isContactBlocked`
// acima) — a Luna não pode travar por uma falha nessa verificação.
async function isMessageKeywordToBypassAgent(conversationId: string, message: string): Promise<boolean> {
  try {
    const bypassKeywords = await getHiveOps().getBypassKeywords();
    return bypassKeywords.includes(message);
  } catch (error) {
    logConversationError(conversationId, 'erro ao buscar palavras-chave de bypass no HiveOps — deixando passar pra Luna', error);
    return false;
  }
}
