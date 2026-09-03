import { Agent } from '@mastra/core/agent';
import { buildSystemPrompt } from './prompts/system-prompt';
import { customerTypeOutputSchema } from './schema';

export const customerTypeAgent = new Agent({
  id: 'luna-customer-type',
  name: 'Luna Customer Type',
  description: 'Classifica o contato em vendedor, comprador, parceiro/afiliado, imprensa, funcionário ou improdutivo.',
  instructions: buildSystemPrompt(),
  model: 'openai/gpt-4.1-mini',
  defaultOptions: {
    structuredOutput: {
      schema: customerTypeOutputSchema,
    },
  },
});

export async function classifyCustomerType(transcript: string) {
  const { object } = await customerTypeAgent.generate(transcript);
  return object.category;
}
