# AGENTS.md — luna-guardrail

Leia este arquivo antes de alterar qualquer coisa nesta pasta.

## Objetivo

Classifica cada resposta da Luna, com base no histórico completo da conversa até agora, decidindo se ela pode ir pro cliente ou se a conversa deve ser transferida para um humano.

## Relação com outros agentes

- Roda como `outputProcessor` de `agents/luna/`, em toda resposta gerada pela Luna.
- O guardrail **nunca bloqueia** a resposta (não chama `abort()`). Ele só classifica e anexa o resultado em `message.content.metadata.guardrail` — quem decide o que fazer com `action` (mandar a resposta pro cliente, conectar humano, ou os dois) é o consumidor externo (n8n), não o Mastra.
- `reply` → resposta normal, sem necessidade de humano.
- `connect_human` → sinaliza que a conversa deve ser transferida para humano; `answer` ainda é gerada normalmente, cabe ao n8n decidir se envia ou não ao cliente antes de escalar.
- `reply_and_connect_human` → resposta deve ser enviada ao cliente e a conversa também fica marcada para handoff humano a jusante (esse handoff em si — ex: Zendesk — ainda não está implementado).

## Arquivos desta pasta

- `luna-guardrail-agent.ts` — definição do `Agent` classificador, registrado em `src/mastra/index.ts`. `defaultOptions.structuredOutput` já aponta pro `guardrailOutputSchema`, então toda chamada a `.generate()`/`.stream()` retorna `{ analysis, action }` em `result.object` sem precisar passar `structuredOutput` de novo. Sem `model` separado aqui (diferente de `luna`) porque este agente não tem tools — structured output nativo funciona direto.
- `GUARDRAIL.md` — texto-fonte histórico das regras de classificação, escrito em markdown. Hoje quem edita o comportamento em produção é a coluna `agents.guardrail_prompt` no Supabase (linha `LUNA_AGENT_ID`) — este `.md` não é lido em runtime nem sincronizado automaticamente.
- `prompts/system-prompt.ts` — exporta `GUARDRAIL_PROMPT_TEMPLATE` (texto estático, cópia de referência/seed do que está no Supabase) e `withDateFooter(template, now)`, que acrescenta a data/hora atual (`America/Sao_Paulo`) a qualquer template — usada tanto para o texto vindo do Supabase quanto para `buildSystemPrompt(now)` (o default local). Ver `luna-guardrail-agent.ts`: `instructions` busca `guardrail_prompt` no Supabase a cada classificação e cai em `buildSystemPrompt(now)` se a busca falhar ou passar de 1min.
- `schema.ts` — schema zod do structured output (`{ analysis, action }`), importado tanto pelo agent (`defaultOptions`) quanto por quem consome `result.object` (ex: `routes/luna-api.ts`).
- `output-processor.ts` — `Processor` (`processOutputResult`) que chama o agent classificador (sem precisar repassar `structuredOutput`) e anexa o resultado como metadata na mensagem do assistente.

## Notas de desenvolvimento

- A classificação olha as últimas `RECENT_EXCHANGES_LIMIT` (4) trocas de mensagens, não só a última — precisava de mais contexto porque o guardrail estava classificando `connect_human` por falta dele (ex: cliente tinha mencionado antes que o vendedor não respondia, mas o guardrail via só a última troca e achava que o bot tinha inventado o assunto). Deliberadamente **não** é o histórico completo — `buildExchanges` (`agents/luna/memory/transcript.ts`, compartilhada — também usada sem limite pelo endpoint `GET /luna/history`) monta um array `{ user_message, bot_answer }[]`, aqui limitado via `RECENT_EXCHANGES_LIMIT`, pra não gastar tokens com o resto da conversa, chamadas de tool ou skills.
  - `getMessageText` (`agents/luna/memory/transcript.ts`) só extrai `parts` do tipo `text` — chamadas de tool (`tool-call`/`tool-result`) já ficam de fora naturalmente.
  - `extractUserMessageFromContextPrompt` (`agents/luna/prompts/context-prompt.ts`) tira o "embrulho" que `LunaContextProcessor` grava permanentemente na mensagem do usuário (lista de habilidades, bases de conhecimento, incidências, timestamp) — sem isso, cada mensagem antiga do cliente no array traria esse embrulho inteiro de novo.
- `output-processor.ts` usa dois "views" diferentes de propósito: `messageList.get.all.db()` só pra montar o array de trocas recentes enviado ao guardrail; o `messages` (stage-scoped, só a resposta atual) continua sendo o que recebe o `metadata.guardrail` de volta. Não trocar isso — se o metadata for aplicado sobre `get.all.db()`, sobrescreve o `guardrail` de *todas* as mensagens antigas com a classificação da rodada atual.
