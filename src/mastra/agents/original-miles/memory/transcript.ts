import type { MastraDBMessage } from '@mastra/core/memory';
import { extractUserMessageFromContextPrompt } from '../prompts/context-prompt';

export function getMessageText(message: MastraDBMessage): string {
  return message.content.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join(' ');
}

export function messagesToTranscript(messages: MastraDBMessage[]): string {
  return messages
    .map((message) => {
      const rawText = getMessageText(message);
      if (!rawText) return undefined;
      const text = message.role === 'user' ? extractUserMessageFromContextPrompt(rawText) : rawText;
      return `${message.role}: ${text}`;
    })
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

export type MessageExchange = { user_message: string; bot_answer: string };

// Agrupa mensagens em pares { user_message, bot_answer } (várias mensagens de assistant
// dentro do mesmo turno, ex: passos de tool call, são concatenadas num único bot_answer).
// Tira o embrulho de contexto (habilidades/bases/incidências) da mensagem do usuário.
// `limit` corta pras últimas N trocas; omitido retorna a conversa inteira.
export function buildExchanges(messages: MastraDBMessage[], limit?: number): MessageExchange[] {
  const exchanges: MessageExchange[] = [];
  let current: MessageExchange | undefined;

  for (const message of messages) {
    const text = getMessageText(message);
    if (!text) continue;

    if (message.role === 'user') {
      if (current) exchanges.push(current);
      current = { user_message: extractUserMessageFromContextPrompt(text), bot_answer: '' };
    } else if (message.role === 'assistant' && current) {
      current.bot_answer = current.bot_answer ? `${current.bot_answer} ${text}` : text;
    }
  }
  if (current) exchanges.push(current);

  return limit ? exchanges.slice(-limit) : exchanges;
}

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

function localDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// Compara pelo dia civil no fuso de Brasília, não em UTC — uma mensagem mandada às 23h50 ou às
// 00h10 (horário de Brasília) precisa cair no dia local certo, mesmo quando isso não bate com o
// corte de dia em UTC (senão mensagens perto da meia-noite local somem do filtro "hoje").
export function filterMessagesBySameDay(messages: MastraDBMessage[], reference: Date, timeZone = DEFAULT_TIMEZONE): MastraDBMessage[] {
  const referenceKey = localDateKey(reference, timeZone);
  return messages.filter((message) => localDateKey(message.createdAt, timeZone) === referenceKey);
}

// Últimas `limitPerRole` mensagens de cada papel (user = cliente, assistant = empresa/Luna),
// preservando a ordem cronológica original das mensagens mantidas — usado antes de
// `buildExchanges`, já que o pareamento 1:1 em exchanges não deixa limitar cada lado sozinho.
export function limitMessagesByRole(messages: MastraDBMessage[], limitPerRole: number): MastraDBMessage[] {
  const lastByRole = (role: MastraDBMessage['role']) => messages.filter((message) => message.role === role).slice(-limitPerRole);
  const keptIds = new Set([...lastByRole('user'), ...lastByRole('assistant')].map((message) => message.id));
  return messages.filter((message) => keptIds.has(message.id));
}
