# AGENTS.md — luna-document-analysis

Leia este arquivo antes de alterar qualquer coisa nesta pasta.

## Objetivo

Descreve em texto um documento/arquivo enviado pelo cliente no WhatsApp (ingresso, boleto, fatura, comprovante), pra servir de input pra Luna — a Luna nunca recebe o arquivo diretamente, só o texto que este agente gera.

## Relação com outros agentes

- Chamado por `webhooks/zendesk/attachment-router.ts` (`resolveMessageOutput`), quando a mensagem chega com `messageType === 'file'` e não é áudio (`mediaType !== 'audio/ogg'`, que é tratado à parte por `transcribeAudio`).
- Não roda como `outputProcessor` de nada e não tem relação com o guardrail ou a working memory — é só uma etapa de normalização de input, junto com `agents/luna-image-analysis/`.
- Compartilha a factory `agents/shared/media-analysis-agent.ts` com `agents/luna-image-analysis/` — os dois agentes só diferem no tipo da parte multimodal (`file` vs `image`) e no prompt.

## Arquivos desta pasta

- `luna-document-analysis-agent.ts` — monta o `Agent` via `createMediaAnalysisAgent` e exporta `analyzeDocument(mediaUrl, mediaType, userMessage)`.
- `prompts/system-prompt.ts` — instruções de como descrever o documento (`buildDocumentAnalysisPrompt()`).

## Notas de desenvolvimento

- Sem `schema.ts`/structured output — a saída é sempre texto livre, que vira a "mensagem do cliente" pra Luna processar.
- Modelo é `openai/gpt-4.1-mini` (mesmo provider já configurado pro resto do app) — não depende do Gemini.
