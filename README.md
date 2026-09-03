# luna-nova

Luna, a atendente virtual da [Buyticket](https://www.buyticketbrasil.com), construída com [Mastra](https://mastra.ai).

Luna responde clientes via WhatsApp com base em habilidades (playbooks operacionais) e bases de conhecimento (F.A.Q.), pode abrir tarefas para o time humano e busca dados do cliente no Zendesk. Toda resposta passa por um segundo agente (guardrail) que decide se ela pode ir direto pro cliente ou se a conversa precisa de um humano.

## Agentes registrados

| Agente (id na API)      | O que faz                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `luna`                  | Agente principal. Ver [`src/mastra/agents/original-miles/AGENTS.md`](src/mastra/agents/original-miles/AGENTS.md).                    |
| `original-miles-guardrail`        | Roda automaticamente após cada resposta da Luna. Ver [`src/mastra/agents/original-miles-guardrail/AGENTS.md`](src/mastra/agents/original-miles-guardrail/AGENTS.md). |
| `original-miles-customer-type`    | Classifica o contato (vendedor, comprador, parceiro/afiliado, imprensa, funcionário ou improdutivo). Roda automaticamente ao fim de cada turno, como parte da extração de memória observacional. |

`original-miles-guardrail` e `original-miles-customer-type` rodam sozinhos durante uma conversa normal com a Luna — você não precisa chamá-los diretamente. Eles também aparecem na Mastra Studio caso queira testá-los isoladamente.

## Instalação

Requer Node.js 22+ (ou Bun, usado neste ambiente de desenvolvimento).

```shell
bun install
# ou: npm install
```

Copie `.env.example` para `.env` e preencha as credenciais:

```shell
cp .env.example .env
```

| Variável | Necessária para | Onde é usada |
| --- | --- | --- |
| `OPENAI_API_KEY` | Todos os agentes (modelo de chat) | Sempre obrigatória |
| `OPENAI_EMBEDDING_MODEL` | `pesquisar_base_conhecimento` (embeddar a pergunta antes de buscar no Pinecone) | [`knowledge-search.ts`](src/mastra/agents/original-miles/knowledge-search.ts) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Só se algum agente/skill futuro usar Gemini | — |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Habilidades, bases de conhecimento, tarefas, memória de conversa (via HiveOps) | [`hiveops/supabase-hiveops-provider.ts`](src/mastra/hiveops/supabase-hiveops-provider.ts) |
| `OM_TENANT_ID` | Escopar habilidades/bases/tarefas/memória para o tenant certo | [`config/env.ts`](src/mastra/config/env.ts) |
| `PINECONE_API_KEY` / `PINECONE_INDEX_NAME` | `pesquisar_base_conhecimento` | [`services/pinecone.ts`](src/mastra/services/pinecone.ts) |
| `ZENDESK_SUBDOMAIN` / `ZENDESK_EMAIL` / `ZENDESK_API_TOKEN` | `buscar_dados_cliente` | [`services/zendesk.ts`](src/mastra/services/zendesk.ts) |

`OPENAI_MODEL` e `OM_AGENT_ID` já estão no schema de env mas ainda não são usados por nenhum código — reservados para quando o system prompt da Luna passar a ser lido da tabela `agents` no Supabase.

## Rodando

```shell
bun run dev
```

Abre em [http://localhost:4111](http://localhost:4111) a [Mastra Studio](https://mastra.ai/docs/studio/overview) — interface pra testar agentes, ver o histórico de tool calls e depurar conversas.

## Testando a Luna

### Pela Mastra Studio

Selecione o agente **luna**, mande uma mensagem e acompanhe as tool calls (`buscar_dados_cliente`, `buscar_habilidade`, `pesquisar_base_conhecimento`, `criar_tarefa`) no painel de execução.

### Pela API

```shell
curl -X POST http://localhost:4111/api/agents/original-miles/generate \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{ "role": "user", "content": "Quero cancelar minha compra" }],
    "memory": {
      "thread": "<conversation_id>",
      "resource": "<id do cliente>"
    },
    "requestContext": {
      "user_phone": "+5511999999999"
    }
  }'
```

- **`memory.thread`**: o identificador da conversa (o mesmo `conversation_id` usado na tabela `tasks`/`conversation_memory`).
- **`memory.resource`**: identificador do cliente (útil pra memória entre conversas diferentes da mesma pessoa).
- **`requestContext.user_phone`**: obrigatório — é como a tool `buscar_dados_cliente` sabe qual telefone buscar no Zendesk. Quem chamar a Luna (o backend/integração do WhatsApp) precisa sempre enviar esse campo.

O endpoint `POST /luna/ask` retorna um JSON plano:

```json
{
  "answer": "Oie! aqui é a Luna da Buyticket ✨ Como posso te ajudar hoje?",
  "guardrail": { "analysis": "...", "action": "reply" },
  "working_memory": {
    "id_pedido": "77234",
    "nome_evento": "Turnê Fã pra Fã",
    "nome_cliente": "Carlos",
    "evento_hoje": false,
    "motivo_contato": "Ingresso não recebido após a compra.",
    "tipo_cliente": "comprador"
  }
}
```

- **`answer`**: resposta pronta pro cliente.
- **`guardrail`**: classificação da resposta (`reply` | `connect_human` | `reply_and_connect_human`) — ver `agents/original-miles-guardrail/AGENTS.md`.
- **`working_memory`**: estado da working memory da Luna pro `resource` da chamada, já incluindo o que foi aprendido *nesta* mensagem (`null` se `memory` não foi enviado ou nada foi aprendido ainda). A atualização é aguardada antes da resposta ser retornada — isso adiciona latência à resposta, ver `agents/original-miles-working-memory/AGENTS.md`.

### Consultar histórico + working memory (sem gerar resposta)

`GET /luna/history?thread=<conversation_id>&resource=<id do cliente>` — endpoint somente leitura, não gera nenhuma resposta nova nem chama a Luna. Útil pra inspecionar uma conversa (ex: debug, dashboards internos).

```shell
curl "http://localhost:4111/luna/history?thread=<conversation_id>&resource=<id do cliente>"
```

```json
{
  "history": [
    { "user_message": "Meu nome é Carlos, comprei o pedido 77234", "bot_answer": "Oie! aqui é a Luna..." }
  ],
  "working_memory": {
    "id_pedido": "77234",
    "nome_evento": "Turnê Fã pra Fã",
    "nome_cliente": "Carlos",
    "evento_hoje": false,
    "motivo_contato": "Ingresso não recebido após a compra.",
    "tipo_cliente": "comprador"
  }
}
```

`history` é a conversa **completa** (sem limite, diferente do array bounded que o guardrail usa internamente), já sem chamadas de tool/skill e sem o embrulho de contexto (habilidades/bases/incidências) que fica gravado nas mensagens do cliente.

Se o guardrail bloquear a resposta (`connect_human`), encaminhe a conversa para um humano.

## Tools da Luna

| Tool | O que faz | Fonte de dados |
| --- | --- | --- |
| `buscar_dados_cliente` | Busca últimas compras/vendas, status, limite de saque, etc. Usa `requestContext.user_phone`, não recebe input da LLM. | Zendesk (`users/search.json`) |
| `buscar_habilidade` | Busca o passo a passo (slots, regras, fallback) de uma habilidade pelo slug. | Supabase `playbooks` |
| `pesquisar_base_conhecimento` | Busca semântica na F.A.Q., até 4 resultados, por `knowledge_base_slug`. | Pinecone (índice `faq`) |
| `criar_tarefa` | Abre uma tarefa para o time humano (cancelamento, cadastro de evento, etc.), só quando uma habilidade pedir. | Supabase `tasks` |

## Memória e classificação automática

A cada turno, a Mastra extrai memória observacional da conversa ([`memory/conversation-memory-extractor.ts`](src/mastra/agents/original-miles/memory/conversation-memory-extractor.ts)):
- Resumo do problema, dados ainda faltando e dados já coletados.
- Classifica o tipo de contato via o agente `original-miles-customer-type`.
- Sincroniza tudo na tabela `conversation_memory` do Supabase via HiveOps ([`hiveops/`](src/mastra/hiveops)).

## Storage

O banco `file:./mastra.db` guarda memória de conversa e observability localmente. Para usar Turso em produção, defina `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` no `.env`.

## Estrutura do projeto

- `src/mastra/agents/original-miles/` — agente principal, prompts, tools, memória. Leia o `AGENTS.md` da pasta antes de editar.
- `src/mastra/agents/original-miles-guardrail/` — classificador de output. Leia o `AGENTS.md` da pasta antes de editar.
- `src/mastra/hiveops/` — acesso a dados do HiveOps (habilidades, bases de conhecimento, incidências, tarefas, tags, conversas) por trás de uma interface (`HiveOpsProvider`), hoje implementada com Supabase. Leia o `AGENTS.md` da pasta antes de editar.
- `src/mastra/config/` — validação central de env (`env.ts`) e helpers (`require-env.ts`, `time.ts`).
- `src/mastra/services/` — clients genéricos (Supabase, Pinecone, Zendesk, HTTP).
- `src/mastra/index.ts` — registro de agentes, tools, storage e observability.

## Aprenda mais

Documentação da Mastra: [mastra.ai/docs](https://mastra.ai/docs/). Este projeto tem uma skill (`.claude/skills/mastra/`) com o guia atualizado de APIs para agentes de código — carregue-a antes de mexer em qualquer coisa relacionada a Mastra.
