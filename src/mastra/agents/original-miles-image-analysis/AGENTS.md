# AGENTS.md — luna-image-analysis

Leia este arquivo antes de alterar qualquer coisa nesta pasta.

## Objetivo

Descreve em texto uma imagem enviada pelo cliente no WhatsApp (foto, print, comprovante, documento de identidade), pra servir de input pra Luna — a Luna nunca recebe a imagem diretamente, só o texto que este agente gera.

## Relação com outros agentes

- Chamado por `webhooks/zendesk/attachment-router.ts` (`resolveMessageOutput`), quando `messageType === 'image'`, antes da mensagem chegar na Luna.
- Não roda como `outputProcessor` de nada e não tem relação com o guardrail ou a working memory — é só uma etapa de normalização de input, junto com `agents/luna-document-analysis/` (áudio é tratado à parte, via `services/openai-audio.ts`).
- Compartilha a factory `agents/shared/media-analysis-agent.ts` com `agents/luna-document-analysis/` — os dois agentes só diferem no tipo da parte multimodal (`image` vs `file`) e no prompt.

## Arquivos desta pasta

- `luna-image-analysis-agent.ts` — monta o `Agent` via `createMediaAnalysisAgent` e exporta `analyzeImage(mediaUrl, mediaType, userMessage)`.
- `prompts/system-prompt.ts` — instruções de como descrever a imagem (`buildImageAnalysisPrompt()`).

## Notas de desenvolvimento

- Sem `schema.ts`/structured output — a saída é sempre texto livre, que vira a "mensagem do cliente" pra Luna processar.
- Modelo é `openai/gpt-4.1-mini` (mesmo provider já configurado pro resto do app).
