# AGENTS.md — luna-working-memory

Leia este arquivo antes de alterar qualquer coisa nesta pasta.

## Objetivo

Decide o que deve ser adicionado, atualizado ou removido na working memory da Luna — `id_pedido`, `nome_evento`, `nome_cliente`, `evento_hoje`, `motivo_contato` e `tipo_cliente` — a partir do par mais recente (mensagem do cliente, resposta da Luna) e da transcript completa da conversa. `id_pedido`, `nome_evento` e `evento_hoje` são prioridade: o agente deve tentar descobri-los ativamente sempre que possível (inclusive olhando o que a Luna já respondeu, não só o que o cliente escreveu), em vez de só preencher quando o cliente repete o dado explicitamente. `evento_hoje` é a mais importante das três — é ela que prioriza o atendimento pro time humano no handoff (via `agents/tags/`/`webhooks/zendesk/handoff-tags.ts`) — por isso é reavaliada a cada troca, igual `tipo_cliente`, mesmo sem mudança.

## Relação com outros agentes

- Roda como `outputProcessor` de `agents/luna/`, em toda resposta gerada pela Luna — igual ao padrão de `agents/luna-guardrail/`.
- **A resposta da Luna espera esse processor terminar** (`await` dentro de `processOutputResult`, sem fire-and-forget) — isso adiciona latência real à resposta (mais uma chamada de modelo: `lunaWorkingMemoryAgent`), mas garante que `working_memory` em `/luna/reply` já reflita o que acabou de ser aprendido nesta mesma mensagem, não só nas anteriores.
- Não depende da Luna chamar nenhuma tool. A Luna nem tem a tool `updateWorkingMemory` exposta (`workingMemory.agentManaged: false` em `agents/luna/luna-agent.ts`) — só enxerga a working memory como contexto somente leitura no próprio system prompt.
- **`tipo_cliente` é decidido pelo próprio `lunaWorkingMemoryAgent`**, não mais por uma chamada separada. As descrições de categoria vêm de `agents/luna-customer-type/category-descriptions.ts` (fonte única, compartilhada com o `customerTypeAgent`), embutidas no `prompts/system-prompt.ts` deste agent. Isso economiza uma chamada de modelo por turno: antes, `tipo_cliente` era classificado em paralelo pelo `customerTypeAgent` (via `classifyCustomerType`) com a transcript completa; hoje o próprio `lunaWorkingMemoryAgent` recebe a transcript e decide tudo numa única chamada.
- O `customerTypeAgent`/`classifyCustomerType` (`agents/luna-customer-type/`) continua existindo e é usado em outro lugar: `agents/luna/memory/conversation-memory-extractor.ts`, pro campo `customer_type` do Supabase. Não foi removido, só deixou de ser chamado a partir deste processor.
- Não tem relação com a Observational Memory (`observationalMemory` em `agents/luna/luna-agent.ts`) nem com o extractor write-only de `agents/luna/memory/conversation-memory-extractor.ts` (que grava em `conversation_memory` no Supabase pra relatórios, não volta pro prompt). Working memory é uma camada separada, pensada especificamente para o que a própria Luna precisa lembrar durante o atendimento.

## Arquivos desta pasta

- `luna-working-memory-agent.ts` — definição do `Agent` de decisão, registrado em `src/mastra/index.ts`. `defaultOptions.structuredOutput` aponta pro `lunaWorkingMemorySchema` (schema completo, incluindo `tipo_cliente`).
- `schema.ts` — `lunaWorkingMemorySchema`: shape completo (`id_pedido`, `nome_evento`, `nome_cliente`, `evento_hoje`, `motivo_contato`, `tipo_cliente`), usado tanto pelo `lunaWorkingMemoryAgent` quanto pelo `workingMemory.schema` da `Memory` da Luna (`agents/luna/luna-memory.ts`) e por quem lê a working memory (ex: `routes/luna-api.ts`). Campos são `nullable` — `null` remove o valor (merge semantics do Mastra, ver `deepMergeWorkingMemory`). **Não usar `z.record(...)`/dicionário de chave livre aqui** — o OpenAI Structured Outputs (usado pelo `lunaWorkingMemoryAgent`, modelo `gpt-5-mini`) rejeita schemas com `propertyNames`/chaves abertas (`AI_APICallError: 'propertyNames' is not permitted`); qualquer campo "outros dados" livre precisa ser texto, não um mapa chave-valor.
- `prompts/system-prompt.ts` — instruções do agent de decisão, incluindo as descrições de categoria importadas de `agents/luna-customer-type/category-descriptions.ts` pra classificar `tipo_cliente`.
- `output-processor.ts` — `Processor` (`processOutputResult`) que:
  1. Lê a working memory atual via `lunaMemory.getWorkingMemory(...)`.
  2. Chama o `lunaWorkingMemoryAgent` com o JSON atual, o par mensagem/resposta e a transcript completa (via `messagesToTranscript(messageList.get.all.db())`, de `agents/luna/memory/transcript.ts`) — uma única chamada de modelo decide todos os campos, incluindo `tipo_cliente`.
  3. Faz merge do resultado com `deepMergeWorkingMemory` (de `@mastra/memory`) e persiste com `lunaMemory.updateWorkingMemory(...)`.
  4. Tudo isso é `await`ado dentro de `processOutputResult` — erros são capturados e só logados (não derrubam a resposta da Luna), mas o tempo de execução conta pra latência total da resposta.

  **Por que `lunaMemory` importado diretamente (não `agent.getMemory()`):** o campo `agent` de `ProcessOutputResultArgs` não vem populado quando a Luna é chamada via `routes/luna-api.ts` (`luna.generate(...)` direto) — só nesse call path, `agent` chega `undefined` no processor, então `agent.getMemory()` nunca resolvia nada e o processor saía silenciosamente sem atualizar nada (bug real encontrado e corrigido). A `Memory` da Luna foi extraída pra `agents/luna/luna-memory.ts` (não fica mais inline em `luna-agent.ts`) especificamente pra esse processor poder importá-la direto, sem depender do `agent` do contexto do processor **e sem criar import circular** com `luna-agent.ts` (que importa este `output-processor.ts` pros seus `outputProcessors`).

## Notas de desenvolvimento

- `scope: 'resource'` na working memory da Luna (não `'thread'`) — os dados persistem entre conversas diferentes do mesmo cliente, coerente com o uso já documentado de `memory.resource` no README (`/luna/reply`).
- Se no futuro for preciso que a Luna decida sozinha atualizar a working memory (ex: durante a própria geração da resposta), seria necessário setar `workingMemory.agentManaged: true` em `agents/luna/luna-memory.ts` — hoje isso é intencionalmente `false`.
- Se precisar adicionar mais um "dono" pra `lunaMemory` fora de `agents/luna/`, importe de `agents/luna/luna-memory.ts`, nunca de `agents/luna/luna-agent.ts` (evita reintroduzir o ciclo).
