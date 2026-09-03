import { GuardrailOutput } from "./schema";

interface GenerateResultWithMetadata {
  response?: {
    uiMessages?: Array<{ role: string; metadata?: unknown }>;
  };
}

function extractOutput(result: GenerateResultWithMetadata): GuardrailOutput | null {
  const assistantMessage = result.response?.uiMessages?.find((message) => message.role === 'assistant');
  const metadata = assistantMessage?.metadata as { guardrail?: GuardrailOutput } | undefined;
  return metadata?.guardrail ?? null;
}


export const LunaGuardrail = { extractOutput }