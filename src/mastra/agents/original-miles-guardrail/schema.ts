import { z } from 'zod';

export const guardrailActionSchema = z.enum(['reply', 'connect_human', 'reply_and_connect_human']);

export const guardrailOutputSchema = z.object({
  analysis: z.string().describe('Descrição breve de como o bot performou diante da intenção do cliente'),
  action: guardrailActionSchema,
});

export type GuardrailOutput = z.infer<typeof guardrailOutputSchema>;
export type GuardrailAction = GuardrailOutput['action'];
