import type { MastraDBMessage } from '@mastra/core/memory';
import type { Processor, ProcessOutputResultArgs } from '@mastra/core/processors';
import { buildExchanges } from '../memory/transcript';
import { lunaGuardrail } from '../../luna-guardrail/luna-guardrail-agent';

const RECENT_EXCHANGES_LIMIT = 4;

export class LunaGuardrailProcessor implements Processor {
  readonly id = 'luna-guardrail-output-processor';

  async processOutputResult({
    messages,
    messageList,
  }: ProcessOutputResultArgs): Promise<MastraDBMessage[]> {
    const exchanges = buildExchanges(messageList.get.all.db(), RECENT_EXCHANGES_LIMIT);

    const { object: classification } = await lunaGuardrail.generate(
      `Últimas trocas de mensagens entre o cliente e o bot (a última é a mais recente, que você deve avaliar):\n${JSON.stringify(exchanges)}`,
    );

    return messages.map((message) =>
      message.role === 'assistant'
        ? {
            ...message,
            content: {
              ...message.content,
              metadata: { ...message.content.metadata, guardrail: classification },
            },
          }
        : message,
    );
  }
}
