# AGENTS.md — voucher-extractor

Leia este arquivo antes de alterar qualquer coisa nesta pasta.

## Objetivo

Recebe um documento de voucher (imagem/PDF) e devolve os dados extraídos em JSON. É o "Agente
Extrator de vouchers" — substitui o fluxo equivalente hoje em n8n
(`https://n8n.flowerslab.ai/webhook/travel_agent/extract/vouchers`, nós "Extração em texto" →
"Tipo selecionado" → "Extrator de voucher").

## Pipeline (`voucher-extractor.ts` — `extractVoucher(fileBytes, mediaType, tenantId)`)

1. **Texto** (`text-extraction-agent.ts`) — transcreve o documento (bytes crus, sem hospedar em
   URL nenhuma) em texto (`raw_content`). Único passo que "vê" o arquivo em si.
2. **Tipo** (`agents/voucher-type/`, via `classifyVoucherTypeFromText`) — classifica
   `raw_content` num `voucher_type_slug` (tipos ativos do tenant, vindos do Supabase). Se o slug
   devolvido não existir mais (tipo desativado entre a classificação e a busca, resposta fora do
   esperado), cai no fallback `"other"`.
3. **Dados estruturados** (`extraction-agent.ts`) — busca a linha completa do `voucher_type`
   classificado (`getVoucherTypeBySlug`, `services/travel-db.ts`): usa o `prompt` da linha como
   instructions e o `structured_output.schema` (JSON Schema, não Zod) como `structuredOutput` da
   chamada. Modelo também vem da linha (`ai_model`/`ai_provider`, ex: `gpt-5.6-luna` + `open_ai` →
   `openai/gpt-5.6-luna`).
4. **Revisão** (`review-agent.ts`) — segunda passada: recebe o `raw_content` + o JSON da etapa 3 e
   devolve uma versão revisada, seguindo o mesmo `structured_output.schema`. Objetivo é garantir
   que nenhuma informação do `raw_content` que caiba no schema fique de fora, e corrigir campos
   errados/incompletos da primeira extração. `extractVoucher`/`extractVoucherFromText` só retornam
   depois desse passo — não existe um "extraído, mas ainda não revisado" saindo do pipeline.
   **Não é um `Processor` do Mastra**: o objeto estruturado final não fica acessível dentro de
   `processOutputResult`/`processOutputStep` quando se usa `structuredOutput` (só
   `text`/`usage`/`finishReason`/`steps` — ver `SerializableOutputResult` em
   `@mastra/core/dist/processors/step-schema.d.ts`), então enriquecer o JSON precisa ser uma
   segunda chamada de `Agent`, não um hook do pipeline de geração.

`extractVoucher` **não grava nada no Supabase** — só devolve `{ rawContent, voucherTypeSlug,
voucherTypeConfidence, extractedData }`. Quem persiste na tabela `voucher` é a rota
(`routes/voucher-routes.ts`), porque é ela que sabe `travel_id`/`issuer`/`extract_with_ai` e decide
`title`/`content` a partir de `extractedData.document_name`/`extractedData.content`.

## Convenção do `structured_output` de cada `voucher_type`

Todo `structured_output.schema` visto até agora (flight, accommodation, experience, other) tem, no
nível raiz, pelo menos `document_name` (string, vira `voucher.title`), `content` (string curta,
vira `voucher.content`) e `confidence` (number). O resto do schema é livre por tipo — não assuma
mais nada fixo além desses três campos.

## Arquivos desta pasta

- `voucher-extractor.ts` — orquestra os 3 passos acima. Ponto de entrada usado pela rota.
- `text-extraction-agent.ts` — `Agent` multimodal (imagem/PDF via bytes, não URL — diferente de
  `agents/shared/media-analysis-agent.ts`, que só aceita URL) + `extractRawTextFromDocument`.
- `extraction-agent.ts` — `Agent` cujo `instructions`/`model` são resolvidos por `requestContext`
  (`extraction_prompt`/`extraction_model`) a cada chamada, porque mudam por `voucher_type`; o
  `structuredOutput.schema` (também por tipo) é passado direto em `.generate()`, não faz parte da
  config do Agent. Ver `extractStructuredVoucherData`.
- `review-agent.ts` — `Agent` de revisão pós-extração (`reviewExtractedVoucherData`): recebe
  `raw_content` + JSON extraído, devolve versão enriquecida/corrigida usando o mesmo
  `structured_output.schema` do `voucher_type`. Modelo vem do mesmo `ai_model`/`ai_provider` do
  `voucher_type` (via `requestContext`, chave `review_model`).
- `prompts/text-extraction-prompt.ts` — instructions da etapa de OCR/transcrição.

## Notas de desenvolvimento

- **Sem upload/Storage.** O Supabase deste tenant não tem nenhum bucket configurado
  (`storage.buckets` vazio) e os vouchers já extraídos pelo fluxo antigo em produção têm
  `file_url = null` — o arquivo nunca é persistido, só passa em memória pelo passo de OCR. Se um
  dia precisar do arquivo original depois (reimprimir o documento original, por exemplo), isso é
  infraestrutura nova (bucket + upload), não existe hoje.
- **`ai_extracted_data` é gravado com double-encoding** (string JSON de uma string JSON) — isso é
  tratado em `services/travel-db.ts` (`insertVoucher`), não aqui; só documentando pra não estranhar
  se for debugar o pipeline ponta a ponta.
- **Reação no roteiro (dia a dia)**: quando o agente de itinerário existir, este é o lugar
  natural pra disparar o recálculo reativo (a cada voucher extraído, sem esperar comando) — ainda
  não implementado, ver conversa/roadmap do projeto.
