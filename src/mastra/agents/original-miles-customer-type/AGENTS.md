# AGENTS.md — luna-customer-type

Leia este arquivo antes de alterar qualquer coisa nesta pasta.

## Objetivo

Classifica o contato numa conversa da Luna em uma de 6 categorias: vendedor, comprador, improdutivo, parceiro_afiliado, imprensa ou funcionario.

## Relação com outros agentes

- Chamado por `agents/luna/memory/conversation-memory-extractor.ts`, dentro do `onExtracted` do Extractor de memória observacional da Luna — não roda sozinho numa conversa normal.
- Recebe a transcrição da conversa já montada (`agents/luna/memory/transcript.ts`) e retorna só a `category`; quem grava o resultado (junto com `problem_summary`/`data_needed`/`data_collected`) é o extractor, na tabela `conversation_memory` do Supabase via HiveOps (`getHiveOps().upsertConversationMemory(...)`, ver `hiveops/AGENTS.md`).
- **Não é mais chamado** por `agents/luna-working-memory/`: o campo `tipo_cliente` da working memory passou a ser decidido pelo próprio `lunaWorkingMemoryAgent` numa única chamada (economiza uma chamada de modelo por turno). As descrições de categoria usadas por esse prompt vêm de `category-descriptions.ts` desta pasta — fonte única compartilhada entre os agents, pra evitar que as listas de categorias saiam de sincronia.
- `agents/tags/` também usa `category-descriptions.ts` — mas só a descrição do `tipo_cliente` que já veio da working memory (`customerTypeCategoryDescriptions[tipo]`), não a lista completa (esse agent nunca precisa classificar do zero).

## Arquivos desta pasta

- `luna-customer-type-agent.ts` — definição do `Agent` (`customerTypeAgent`), registrado em `src/mastra/index.ts`, mais o helper `classifyCustomerType(transcript)`. `defaultOptions.structuredOutput` já aponta pro `customerTypeOutputSchema`, então `.generate()` retorna `{ category }` em `result.object` sem precisar passar `structuredOutput` de novo.
- `category-descriptions.ts` — `customerTypeCategoryDescriptions` (dicionário `{ vendedor: '...', comprador: '...', ... }`, chave = valor exato do enum) e `renderCustomerTypeCategoryDescriptions()` (junta as 6 descrições num bloco "categoria — descrição", um por linha). Editar uma categoria é editar só aqui — usado pelo prompt deste agent, pelo `lunaWorkingMemoryAgent` (`agents/luna-working-memory/prompts/system-prompt.ts`) e pelo `tagsAgent` (`agents/tags/prompts/system-prompt.ts`).
- `prompts/system-prompt.ts` — prompt de classificação (`buildSystemPrompt()`), no formato "classifique e só responda o json", igual ao padrão usado em `agents/luna-guardrail/`. Só monta o texto lendo `renderCustomerTypeCategoryDescriptions()` de `category-descriptions.ts`.
- `schema.ts` — schema zod das 6 categorias (`customerTypeCategories` + `customerTypeOutputSchema`).

## Notas de desenvolvimento

- Este agente é puramente uma classificação auxiliar da memória da Luna — não decide nada sobre o que a Luna responde ao cliente.
