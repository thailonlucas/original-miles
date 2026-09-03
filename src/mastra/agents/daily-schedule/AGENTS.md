# AGENTS.md — daily-schedule

Leia este arquivo antes de alterar qualquer coisa nesta pasta.

## Objetivo

Monta/atualiza o roteiro dia a dia de uma viagem (`travel.daily_schedule`, jsonb + `travel.travel_start_at`/`travel_end_at`, date) a partir dos vouchers já extraídos — um objeto por dia com evento, com eventos separados em manhã/tarde/noite. Substitui o agente equivalente hoje em n8n (`travel_agent/generate_itinerary` / `travel_agent/daily-schedule`).

**Reativo, não sob comando**: roda automaticamente depois de CADA voucher extraído ou excluído
(`routes/voucher-routes.ts`), nunca por uma chamada manual do usuário.

## Como o agente vê os vouchers: lista leve + tool `openVoucher`

O agente **nunca** recebe `ai_extracted_data` de todos os vouchers de uma vez no prompt. Recebe só
uma lista leve (`getVoucherSummaries`, `services/travel-db.ts`): `{ id, voucher_type_slug, title,
content }` por voucher — sem os dados extraídos completos. Antes de escrever qualquer evento, o
agente chama a tool `openVoucher` (`tools/open-voucher-tool.ts`) com o `id` do voucher pra abrir o
`ai_extracted_data` completo daquele voucher específico. `tenant_id` da tool vem do
`requestContext`, nunca de um argumento que o model preenche — evita um voucher de outro tenant
vazar por um id errado/adivinhado.

Isso espelha o fluxo original em n8n (tool "Busca documento", um voucher por vez) — a diferença é
que aqui o agente decide sozinho quais abrir (sem loop por dia dirigido de fora), guiado pela lista
leve + as instructions (`prompts/system-prompt.ts`).

## Dois modos — incremental (padrão) vs rebuild completo

- **`updateDailyScheduleForVoucher`** (`rebuild-daily-schedule.ts`) — caminho padrão, chamado a
  cada voucher **extraído**. Não reprocessa os outros vouchers da viagem: passa a lista leve de
  todos os vouchers + o estado atual do roteiro (`daily_schedule`/`travel_start_at`/`travel_end_at`,
  já resumidos) + qual é o voucher novo, e deixa o agente decidir o que abrir e atualizar
  (`applyVoucherToDailySchedule`). Mais rápido/barato que reprocessar tudo — viabiliza "reativo com
  o menor tempo possível" mesmo em viagens com muitos vouchers.
- **`rebuildDailySchedule`** (mesmo arquivo) — reconstrói TUDO do zero: passa a lista leve de TODOS
  os vouchers, sem estado anterior (`buildDailyScheduleFromScratch`). Usado só quando um voucher é
  **excluído** — remover a contribuição de um voucher específico de um roteiro já montado
  incrementalmente não é confiável (não dá pra saber com segurança quais pedaços do roteiro atual
  vieram só daquele voucher), então é mais simples/correto recomeçar do zero com os vouchers que
  sobraram.

Os dois modos chamam o mesmo `dailyScheduleAgent` (`daily-schedule-agent.ts`), só com
instructions/mensagem diferentes, e devolvem o mesmo formato de saída: `{ schedule,
travel_start_at, travel_end_at }` (`schema.ts` → `dailyScheduleUpdateSchema`).

## Por que `travel_start_at`/`travel_end_at` em vez de dias vazios no array

`daily_schedule` é um array **esparso** — só entram dias que têm pelo menos um evento.
`travel_start_at`/`travel_end_at` (colunas `date` em `travel`) guardam o range conhecido da viagem
— atualizadas a cada chamada (incremental ou rebuild) se o voucher aberto tiver uma data mais
cedo/mais tarde que o range atual. Quem consome o roteiro trata qualquer dia entre
`travel_start_at` e `travel_end_at` que não apareça no array como um dia sem evento.

## Concorrência (race condition entre vouchers extraídos ao mesmo tempo)

Tanto o update incremental quanto o rebuild completo fazem leitura+escrita do estado da viagem —
sem proteção, dois vouchers da mesma viagem terminando de extrair quase ao mesmo tempo poderiam
disparar duas chamadas concorrentes, e a mais lenta (que leu o estado *antes* da mais rápida
escrever) sobrescreveria o resultado mais completo com uma foto desatualizada.

`withTravelScheduleLock` (`services/travel-db.ts`) resolve isso com `pg_advisory_xact_lock` por
`travelId` (hash): serializa as chamadas da MESMA viagem (viagens diferentes nunca se bloqueiam
entre si) — cada chamada só começa a ler o estado depois que a anterior daquela viagem já
commitou, então sempre parte do estado mais atual. Isso garante que a ÚLTIMA extração/exclusão de
uma sequência sempre resulta no roteiro mais completo, mesmo sob concorrência.

**Tradeoff conhecido**: a conexão fica presa (dentro de uma transação) durante toda a chamada de
IA (incluindo as chamadas de tool), não só durante o read/write. Aceitável pro volume atual (pool
pequeno, poucos vouchers por vez); revisitar se isso virar gargalo (ver comentário em
`withTravelScheduleLock`).

**Risco conhecido do modo incremental**: como cada chamada só abre (via tool) o que julgar
necessário, não TODOS os vouchers antigos, há um risco teórico de deriva ao longo de muitas
atualizações sucessivas (ex: um detalhe que só apareceria abrindo dois vouchers antigos lado a lado
pode não ser reconciliado se nenhum dos dois for reaberto numa atualização futura). Mitigado por
sempre reenviar/reescrever o roteiro completo a cada chamada (nunca um diff/patch) e por a lista
completa de vouchers (não só o novo) sempre ir no prompt, dando ao agente a opção de abrir um
voucher antigo se perceber que precisa. Não é uma garantia matemática de equivalência ao rebuild
completo — se isso virar problema na prática, a saída é rodar `rebuildDailySchedule` periodicamente
ou sob demanda, não só na exclusão.

## Arquivos desta pasta

- `daily-schedule-agent.ts` — `Agent` com instructions placeholder (a de verdade é montada por
  chamada) + tool `openVoucher` + `structuredOutput` (`schema.ts`). Exporta
  `buildDailyScheduleFromScratch(vouchers, tenantId)` (rebuild) e
  `applyVoucherToDailySchedule(currentState, vouchers, newVoucherId, tenantId)` (incremental).
- `schema.ts` — `dailyScheduleUpdateSchema`: `{ schedule, travel_start_at, travel_end_at }`, onde
  `schedule` é o array esparso de dias (`dailyScheduleSchema`), cada dia com `events: { morning,
  afternoon, night }` e cada evento `{ title, content, type, observation }`.
- `prompts/system-prompt.ts` — instructions + mensagem do usuário separadas pros dois modos
  (`buildRebuildInstructions`/`buildRebuildUserMessage` e
  `buildIncrementalInstructions`/`buildIncrementalUserMessage`), compartilhando as regras de
  negócio comuns (`COMMON_RULES`: exclusão de `travel_insurance`, condição pro tipo `other`, uso
  obrigatório da tool antes de escrever um evento, período do dia por horário, nunca inventar
  dado, nunca duplicar evento, etc.).
- `tools/open-voucher-tool.ts` — `openVoucherTool`: abre `ai_extracted_data` de um voucher por id
  (`getVoucherExtractedData`, `services/travel-db.ts`), tenant do `requestContext`.
- `rebuild-daily-schedule.ts` — `updateDailyScheduleForVoucher` e `rebuildDailySchedule`, os dois
  pontos de entrada chamados pela rota (`routes/voucher-routes.ts`).

## Notas de desenvolvimento

- Modelo `openai/gpt-4.1` (não o `-mini`) nos dois modos — montar/atualizar o roteiro exige mais
  raciocínio (decidir o que abrir, casar datas de vouchers de tipos diferentes, evitar duplicar o
  mesmo evento em dias sucessivos) do que classificação/extração isolada.
- Sem vouchers relevantes (viagem vazia ou só com `travel_insurance`), `rebuildDailySchedule` zera
  `daily_schedule`/`travel_start_at`/`travel_end_at` sem gastar chamada de IA.
- `updateDailyScheduleForVoucher` pula silenciosamente (sem chamar o agente) vouchers do tipo
  `travel_insurance` — mesma exclusão de `EXCLUDED_VOUCHER_TYPES`, aplicada antes mesmo de entrar
  no lock.
- Ambas as funções são sempre disparadas em background (fire-and-forget) pela rota que cria/apaga
  o voucher — a resposta HTTP não espera o roteiro terminar de ser atualizado/reconstruído.
