import type { Processor, ProcessLLMRequestArgs, ProcessLLMRequestResult } from '@mastra/core/processors';
import type { RequestContext } from '@mastra/core/request-context';
import { getHiveOps } from '../../../hiveops';
import { buildContextPrompt, type CustomerLookupResult } from '../prompts/context-prompt';
import { searchCustomerOnZendeskByPhone } from '../customer-lookup';

// Roda em processLLMRequest (não processInput) de propósito: o embrulho de contexto
// (habilidades/bases de conhecimento/incidências) fica só no prompt enviado ao model
// desta chamada. Nada disso é persistido no MessageList/memória — quem ler o histórico
// depois (working memory, tipo de cliente, guardrail, /luna/history) já recebe a
// mensagem do cliente limpa, sem precisar desembrulhar nada.
export class LunaContextProcessor implements Processor {
  readonly id = 'luna-context-processor';

  async processLLMRequest({ prompt, state, requestContext }: ProcessLLMRequestArgs): Promise<ProcessLLMRequestResult> {
    const lastUserMessage = [...prompt].reverse().find((message) => message.role === 'user');
    const textPart = lastUserMessage?.content.find((part) => part.type === 'text');
    if (!textPart?.text) return;

    if (state.wrappedText === undefined) {
      // `prompt` já vem com o histórico da thread reconstruído pela memória — se só há
      // 1 mensagem de usuário, esta é a 1ª interação da conversa. Busca do cliente roda
      // determinística e só aqui, sem depender do model decidir chamar uma tool.
      const isFirstUserMessage = prompt.filter((message) => message.role === 'user').length === 1;

      const hiveOps = getHiveOps();
      const [skills, knowledgeBases, incidents, customerData] = await Promise.all([
        hiveOps.getActiveSkills(),
        hiveOps.getActiveKnowledgeBases(),
        hiveOps.getActiveIncidents(),
        isFirstUserMessage ? this.lookupCustomerData(requestContext) : Promise.resolve(null),
      ]);
      state.wrappedText = buildContextPrompt(textPart.text, new Date(), skills, knowledgeBases, incidents, customerData);
    }

    textPart.text = state.wrappedText as string;
    return { prompt };
  }

  private async lookupCustomerData(requestContext?: RequestContext): Promise<CustomerLookupResult> {
    const phone = requestContext?.get<string, string>('user_phone');
    if (!phone) return { found: false };

    const userFields = await searchCustomerOnZendeskByPhone(phone);
    return userFields ? { found: true, userFields } : { found: false };
  }
}
