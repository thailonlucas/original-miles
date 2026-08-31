# AGENTS.md — hiveops

Leia este arquivo antes de alterar qualquer coisa nesta pasta.

## Objetivo

HiveOps é o sistema interno da Buyticket onde ficam as configurações operacionais da Luna (habilidades/playbooks, bases de conhecimento, incidências, tarefas, tags de handoff, estado de conversas). Essa pasta existe pra ninguém no resto do app (`agents/`, `webhooks/`) precisar saber que isso hoje é Supabase — só conhecem a interface `HiveOpsProvider`.

## Por que existe (ports & adapters)

- `hiveops-provider.ts` — a interface `HiveOpsProvider` (o "port"). É o único contrato que o resto do app enxerga.
- `supabase-hiveops-provider.ts` — `SupabaseHiveOpsProvider`, a implementação atual (o "adapter"), usando `services/supabase.ts`.
- `index.ts` — `getHiveOps()`, um singleton lazy que devolve a implementação em uso. **Se um dia o HiveOps deixar de ser Supabase** (ou virar outra base), troca-se só a linha que instancia o provider aqui — nenhum agente, tool ou webhook muda.
- `types.ts` — os tipos de domínio (`HiveOpsSkill`, `HiveOpsIncident`, etc.), agnósticos de onde os dados vêm.

## Regras

- Nenhum arquivo fora de `hiveops/` deve importar `services/supabase.ts` diretamente para dados do HiveOps (habilidades, bases de conhecimento, incidências, tarefas, tags, conversas). Se precisar de um dado novo do HiveOps, adicione o método em `HiveOpsProvider` + implemente em `SupabaseHiveOpsProvider` — não chame `getSupabaseClient()` direto do agente/tool/webhook.
- `services/supabase.ts` continua existindo (client singleton + `requireTenantId`/`unwrapOrThrow`), mas só é consumido daqui de dentro.
- Tenant é resolvido internamente (via `LUNA_TENANT_ID`, `requireTenantId`) — a Luna hoje atende um único tenant por deployment; os métodos da interface não recebem `tenantId` como parâmetro.

## Não incluído (ainda)

- `findLunaCustomerByPhone` (`agents/luna/customer-lookup.ts`) continua fora do HiveOps — busca no Zendesk, não no Supabase.

## Notas de desenvolvimento

- Os métodos de `SupabaseHiveOpsProvider` são a migração direta do que antes vivia espalhado em `agents/luna/{skills,incidents,knowledge-bases,tasks}.ts`, `agents/luna/memory/supabase-sync.ts` e `webhooks/zendesk/{blocklist,conversation-state}.ts` — sem mudança de comportamento, só de local.
- `getHandoffTagTitles()` e `getPriorityTags()` leem a mesma tabela `tags`, só filtrando `type` diferente (`'handoff'` vs `'priority'`) — é a mesma tabela configurável pelo time de suporte pra dois usos: bloquear a Luna numa conversa (`routes/zendesk-webhook.ts`, `isContactBlocked`) e alimentar o agente de tags especiais (`agents/tags/special-tags-agent.ts`), que soma essas tags "priority" (título + descrição) às 4 tags críticas fixas antes de reavaliar a conversa.
- `getAgentConfig()` lê a tabela `agents` (colunas `system_prompt` e `guardrail_prompt`), filtrando pela linha via `LUNA_AGENT_ID` (`requireAgentId`, análogo ao `requireTenantId`). É chamado a cada geração da Luna e a cada classificação do guardrail (`instructions` como função em `luna-agent.ts`/`luna-guardrail-agent.ts`), não só uma vez no boot — trocar o texto no Supabase reflete na próxima mensagem, sem deploy. Os dois agentes usam `helpers/with-timeout-fallback.ts`: se a busca falhar ou passar de 1min, caem no prompt local (`agents/luna/prompts/system-prompt.ts` / `agents/luna-guardrail/prompts/system-prompt.ts`) como default — esses arquivos continuam existindo como cópia de referência/seed, não são mais a fonte lida em runtime no caminho feliz.
- `getBypassKeywords()` lê a mesma tabela `agents`, coluna `bypass_keys` (array de text), mesma linha via `LUNA_AGENT_ID`. Consumida em `routes/zendesk-webhook.ts` (`isMessageKeywordToBypassAgent`) pra decidir se a mensagem do cliente pula a Luna e vai direto pro humano — antes era um array fixo no código (`BYPASS_AGENT_KEYWORDS`), agora edita-se pelo Supabase sem deploy. Diferente de `getAgentConfig()`, essa checagem não usa `with-timeout-fallback`: se a busca falhar, um try/catch local em `isMessageKeywordToBypassAgent` faz fail-open (assume que não é bypass e deixa a Luna responder), mesmo padrão de `isContactBlocked` no mesmo arquivo.
