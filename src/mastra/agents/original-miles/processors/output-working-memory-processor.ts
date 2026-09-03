import type { MastraDBMessage } from '@mastra/core/memory';
import type { Processor, ProcessOutputResultArgs } from '@mastra/core/processors';
import { deepMergeWorkingMemory } from '@mastra/memory';
import { messagesToTranscript } from '../memory/transcript';
import { lunaSupabaseMemory } from '../memory/luna-supabase-memory';
import { lunaWorkingMemoryAgent } from '../../luna-working-memory/luna-working-memory-agent';
import { logConversationError } from '../../../helpers/logger';


export class LunaWorkingMemoryProcessor implements Processor {
  readonly id = 'luna-working-memory-processor';

  async processOutputResult({ messages, messageList, result }: ProcessOutputResultArgs): Promise<MastraDBMessage[]> {
    const threadId = messages.find((message) => message.threadId)?.threadId;
    const resourceId = messages.find((message) => message.resourceId)?.resourceId;

    if (threadId) {
      const userMessage = messageList.getLatestUserContent() ?? '';
      const botAnswer = result.text;
      const transcript = messagesToTranscript(messageList.get.all.db());

      try {
        await this.updateWorkingMemory({ threadId, resourceId, userMessage, botAnswer, transcript });
      } catch (error) {
        logConversationError(threadId, 'falha ao atualizar working memory', error);
      }
    }

    return messages;
  }

  private async updateWorkingMemory({
    threadId,
    resourceId,
    userMessage,
    botAnswer,
    transcript,
  }: {
    threadId: string;
    resourceId?: string;
    userMessage: string;
    botAnswer: string;
    transcript: string;
  }): Promise<void> {
    const currentRaw = await lunaSupabaseMemory.getWorkingMemory({ threadId, resourceId });
    const current = currentRaw ? JSON.parse(currentRaw) : {};

    const { object: update } = await lunaWorkingMemoryAgent.generate(
      `Working memory atual:\n${JSON.stringify(current)}\n\nMensagem do cliente: ${userMessage}\nResposta da Luna: ${botAnswer}\n\nTranscript completo da conversa (use para classificar tipo_cliente):\n${transcript}`,
    );

    const merged = deepMergeWorkingMemory(current, update);
    await lunaSupabaseMemory.updateWorkingMemory({ threadId, resourceId, workingMemory: JSON.stringify(merged) });
  }
}
