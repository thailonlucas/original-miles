# AGENTS.md — luna

Leia este arquivo antes de alterar qualquer coisa nesta pasta. Ele existe para dar contexto a outros agentes de código (Claude Code, Cursor, etc.) sobre o objetivo e as regras deste agente específico.

## Objetivo

Agente principal: responde o cliente via WhatsApp com base na F.A.Q. da empresa.

TODO: detalhar escopo exato da FAQ, tom de voz, e o que a Luna NUNCA deve responder (isso deve ficar mais claro quando o prompt real chegar).

## Regras

TODO: listar regras e restrições específicas deste agente (o que ele pode/não pode fazer, tom de voz, limites de escopo, etc.).

## Relação com outros agentes

- `agents/luna-guardrail/` roda depois da Luna, em toda resposta, classificando se ela pode ir pro cliente ou se a conversa deve ser transferida pra um humano.
- `agents/luna-working-memory/` também roda depois da Luna (outro `outputProcessor`), decidindo o que atualizar na working memory (nome, ID do pedido, evento hoje, motivo do contato, tipo de cliente). A resposta da Luna espera esse processor terminar, então isso adiciona latência real. Ver seção "Working memory" abaixo.
- `agents/luna-customer-type/` roda dentro da extração de memória da Luna (`memory/conversation-memory-extractor.ts`), classificando o tipo de contato. Não roda sozinho numa conversa normal.
- `agents/trending/` observa as mensagens da conversa (não só as da Luna) para popular a base de conhecimento do time.
- `agents/tags/` observam a conversa para tabular o ticket no Zendesk.

## Arquivos desta pasta

- `luna-agent.ts` — definição do `Agent` do Mastra, registrado em `src/mastra/index.ts`.
- `luna-memory.ts` — a `Memory` da Luna (extraída de `luna-agent.ts` pra evitar import circular com `agents/luna-working-memory/output-processor.ts`, que importa essa instância diretamente).
- `prompts/system-prompt.ts` — cópia de referência/seed do system prompt. **Não é mais a fonte lida em runtime no caminho feliz**: `instructions` em `luna-agent.ts` busca o texto no Supabase (tabela `agents`, coluna `system_prompt`, linha `LUNA_AGENT_ID`) via `getHiveOps().getAgentConfig()`, a cada geração. Editar este arquivo não muda o comportamento em produção — é preciso sincronizar o texto pro Supabase (ver `backups/supabase-agents/` na raiz do repo pro histórico da migração). Ele só volta a ser usado como **default**, via `helpers/with-timeout-fallback.ts`, se a busca no Supabase falhar ou passar de 1min.
- `prompts/context-prompt.ts` — texto enviado junto com toda mensagem do usuário, dando contexto sobre skills/habilidades disponíveis e (na 1ª mensagem) os dados do cliente.
- `customer-lookup.ts` — busca de `user_fields` no Zendesk por telefone. Não é uma tool: é chamada deterministicamente pelo `LunaContextProcessor` (`processors/input-context-processor.ts`) só na 1ª mensagem de cada thread (detectado contando mensagens `role: 'user'` no prompt já reconstruído pela memória), e o resultado é injetado no texto de contexto — a Luna nunca decide se/quando buscar.
- `knowledge-search.ts` — acesso a dados que não vêm do HiveOps (Pinecone), usado pelas tools em `tools/`. Habilidades, bases de conhecimento, incidências e tarefas vêm do HiveOps (`getHiveOps()`, ver `hiveops/AGENTS.md`), não de arquivos aqui dentro.
- `tools/` — as tools ativas da Luna (`buscar_habilidade`, `pesquisar_base_conhecimento`, `criar_tarefa`). Também guarda `buscar-dados-cliente-tool.ts` (`buscarDadosClienteTool`), mantida pronta para uso futuro mas **não registrada** em `luna-agent.ts` — hoje a busca de dados do cliente é feita por `customer-lookup.ts`, não por essa tool.
- `processors/input-context-processor.ts` — injeta habilidades, bases de conhecimento, incidências ativas e dados do cliente (1ª mensagem) na mensagem do usuário antes de chegar no modelo.
- `memory/` — a memória observacional (`conversation_memory`) da Luna. Ver seção abaixo.

## Memória de conversa (`conversation_memory`)

A Luna usa Observational Memory (OM) do Mastra pra comprimir histórico. Além disso, um **Extractor** da OM
(`memory/conversation-memory-extractor.ts`) roda em background (no mesmo ritmo do Observer/Reflector) e grava,
por conversa, num registro estruturado:

- `customer_type` — vendedor / comprador / improdutivo / parceiro_afiliado / imprensa / funcionario.
- `problem_summary` — o problema que o cliente quer resolver nesta conversa.
- `data_needed` / `data_collected` — dados que faltam coletar vs. já coletados.

Esse registro é persistido na tabela `conversation_memory` do **Supabase** (não nas tabelas internas do Mastra,
que hoje são LibSQL/Turso) — ver `sql/conversation_memory.sql` na raiz do repo pro DDL da tabela.

**Decisão de arquitetura:** isso é *write-only* — não volta pro prompt da Luna via inputProcessor. Serve só pra uso
interno (relatórios, Zendesk, dashboards). Se no futuro precisar que a Luna adapte tom/comportamento com base nisso,
vai precisar de um inputProcessor novo lendo essa tabela (hoje não existe).

`customer_type` é classificado por um **agente dedicado, em pasta separada** (`agents/luna-customer-type/`,
registrado em `src/mastra/index.ts` como `customerTypeAgent`), não pelo Extractor genérico — é um agente próprio,
com seu próprio `AGENTS.md`, igual ao padrão usado em `agents/luna-guardrail/`. O extractor chama esse agente
dentro do seu `onExtracted`, passando a transcrição da conversa (`memory/transcript.ts`), e grava o resultado
junto com os outros campos.

- `memory/conversation-memory-schema.ts` — schema Zod de `problem_summary`/`data_needed`/`data_collected`.
- `memory/transcript.ts` — converte `MastraDBMessage[]` em texto simples pro classificador.
- O upsert na tabela `conversation_memory` (chave: `conversation_id` = `threadId`) é feito por `getHiveOps().upsertConversationMemory(...)`, não por um arquivo desta pasta.
- `memory/conversation-memory-extractor.ts` — define o `Extractor` de `problem_summary`/dados, chama o
  `customerTypeAgent` no `onExtracted` e grava tudo no Supabase. Ligado em `luna-agent.ts` via
  `observationalMemory.observation.extract`.

**Tags e trending não fazem parte disso** — continuam sendo os agentes `agents/tags/` e `agents/trending/` do
roadmap (ainda não construídos), que observam a conversa para fins diferentes (tabulação de ticket no Zendesk e
detecção de padrões entre conversas pro time interno, respectivamente).

## Working memory

Diferente do `conversation_memory` acima (write-only, pra relatórios), a working memory **volta pro prompt da
Luna** — é o que ela efetivamente "lembra" durante o atendimento (nome do cliente, número do pedido, outras
informações já coletadas). A `Memory` da Luna vive em `luna-memory.ts` (não inline em `luna-agent.ts`) — ver nota abaixo.
Configurada em `memory.options.workingMemory`:

- `enabled: true`, `scope: 'resource'` — persiste entre conversas diferentes do mesmo cliente (mesmo `resourceId`),
  não só dentro da mesma thread.
- `schema: lunaWorkingMemorySchema` (de `agents/luna-working-memory/schema.ts`) — a Luna recebe/atualiza working
  memory como JSON, com merge semantics (só os campos que mudam; `null` remove um campo).
- `agentManaged: false` — a Luna **não tem** a tool `updateWorkingMemory` nem instruções de auto-atualização. Ela
  só enxerga a working memory como contexto de leitura no system prompt; quem decide o que escrever é o agente
  dedicado `agents/luna-working-memory/`, rodando via `LunaWorkingMemoryProcessor` (`outputProcessors`).

Ver `agents/luna-working-memory/AGENTS.md` para detalhes de como a decisão/merge/persistência funcionam — inclusive
por que a `Memory` foi extraída pra `luna-memory.ts` (import circular com o output processor + `agent.getMemory()`
não vem populado nesse call path).

## Notas de desenvolvimento

TODO: decisões de design, histórico relevante e observações para quem for mexer neste agente no futuro.
