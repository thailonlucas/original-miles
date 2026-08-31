# Mapa do prompt da Luna

Índice pra localizar rápido em qual seção provavelmente está o problema. O texto exato muda com o
tempo — sempre confie no que `fetch-agent.mjs` trouxe agora, isso aqui é só um mapa das seções que
costumam existir em `system_prompt`, não uma cópia do conteúdo.

## `system_prompt` (agente Luna — gera a resposta ao cliente)

1. **IDENTIDADE** — tom, saudação inicial, canal, idioma, regras de fala ("a gente", nunca mandar
   contatar a Buyticket), limite de linhas, sem emoji, sem "posso ajudar em algo mais".
   → Erro de tom, saudação repetida, resposta longa demais, emoji indevido: olhar aqui.

2. **REGRAS INVIOLÁVEIS** — lista numerada **em ordem de prioridade**. Regra 3 costuma ser algo como
   "Resolução > Brevidade > Tom" — ou seja, quando duas regras colidem, a de número/prioridade mais
   alta vence. Se a Luna violou uma regra que "parecia" coberta, o problema quase sempre é uma regra
   *mais alta* na lista pisando em cima da que você esperava, não a ausência da regra.
   → Zero invenção, dado vazio ≠ inexistente, nunca pedir senha/cartão, nunca mencionar
   ferramentas/FAQ/IA, nunca prometer prazo, transferir quando não sabe: olhar aqui primeiro pra
   qualquer resposta "inventada", "prometida" ou que "vazou" algo interno.

3. **PROCESSAMENTO** — a sequência que o agente deveria seguir antes de responder (dados do cliente
   → chat memory → habilidades → FAQs → fluxos → transferir), mais a tabela de inferência de papel
   (comprador/vendedor) e a explicação de "dados do cliente" automáticos.
   → Erro de inferir errado se é comprador/vendedor, pular etapa, ou perguntar algo que já tinha
   vindo no contexto: olhar aqui.

4. **FERRAMENTAS** — como usar FAQ (bases de conhecimento) e Fluxos de Atendimento, incluindo a
   **lista de chaves de fluxo** (chave_do_fluxo) separada por Comprador/Vendedor/Ambos. Cada chave é
   um tema (ex: "meu ingresso é falso ou inválido", "quando recebo meu pagamento") que existe como
   registro à parte no HiveOps (tabela `playbooks`, ver `hiveops-provider.ts`) — o texto aqui só lista
   as chaves, não o conteúdo do fluxo em si.
   → Se a Luna não seguiu um fluxo esperado, o problema pode ser: (a) a chave não existe nessa lista
   pra aquele tema, ou (b) o conteúdo do próprio playbook no HiveOps está desatualizado/errado — isso
   está numa tabela diferente de `agents`, não dá pra corrigir só editando `system_prompt`.

5. **INFORMAÇÕES ESSENCIAIS DA BUYTICKET** — taxas, prazos, parcelamento, saque, canais oficiais,
   e-mails válidos (sempre `@buyticketbrasil.com`), seção de golpe com keywords de alerta.
   → Informação factual errada (prazo, taxa, canal) dita pela Luna: olhar aqui — é o texto mais fácil
   de citar literalmente na proposta de correção.

6. **EVENTOS URGENTES (< 24h)** — fluxo específico pra evento iminente sem ingresso recebido.

7. **ESCOPO E LIMITES** — quando direcionar pro site em vez de tentar resolver por dentro da
   conversa (anunciar, comprar, cadastro de show não listado).

## `guardrail_prompt` (agente Luna Guardrail — classifica a resposta já gerada)

Não é o prompt que fala com o cliente — é o que decide, depois que a Luna já respondeu, se a
resposta segue (`reply`), corta e transfere sem enviar (`connect_human`), ou envia e já marca pra
transferência (`reply_and_connect_human`). Se o problema reportado foi "a Luna respondeu errado mas
ninguém foi acionado" ou "a conversa foi cortada sem necessidade", o ajuste é aqui, não em
`system_prompt`. Estrutura de referência (pode ter evoluído): critérios de `reply`, critérios de
`connect_human` (bot mencionou ferramenta/IA, prometeu prazo, cliente com raiva real, etc.) e a linha
tênue entre "prometeu contato" (→ `reply_and_connect_human`) vs "resposta em si é ruim" (→
`connect_human`). Ver `src/mastra/agents/luna-guardrail/GUARDRAIL.md` no repo pra a versão-semente
mais recente (não é a fonte lida em runtime, mas costuma refletir a intenção mais recente do time).

## Coluna `guardrail` (jsonb) — cuidado, não é o que roda

A tabela `agents` também tem uma coluna `guardrail` (jsonb, com listas `reply` /
`connect_human` / `reply_and_connect`). **Isso não é lido em runtime** —
`SupabaseHiveOpsProvider.getAgentConfig()` só seleciona `system_prompt` e `guardrail_prompt`
(ver `src/mastra/hiveops/supabase-hiveops-provider.ts`). Parece ser um rascunho/estrutura auxiliar
mantida à parte. Se a hipótese de correção depender dessa coluna, confirme antes com o usuário —
mudar só ela não muda o comportamento da Luna.

## Outras fontes que podem explicar uma resposta errada (fora de `agents`)

- **Playbooks** (tabela `playbooks`, HiveOps) — conteúdo de cada fluxo de atendimento
  (`questions_sequence`, `business_rules`, `escalation_conditions`).
- **Knowledge bases / FAQ** (tabela `knowledge_bases`) — confiança > 85% é o critério citado no
  prompt; uma FAQ desatualizada ou ambígua pode ser a causa real, não o prompt.
- **Tags** (tabela `tags`, tipos `handoff`/`priority`) — se o problema for "não devia ter respondido
  nessa conversa" ou "devia ter subido prioridade", pode ser tag mal configurada, não prompt.
- **Bypass keywords** (`agents.bypass_keys`) — se a mensagem do cliente deveria ter pulado a Luna
  direto pro humano e não pulou (ou pulou quando não devia).

Se a causa raiz estiver numa dessas tabelas em vez do prompt, diga isso claramente em vez de forçar
uma mudança em `system_prompt`/`guardrail_prompt` que não resolveria o caso.
