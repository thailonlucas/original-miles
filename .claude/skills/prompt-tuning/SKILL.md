---
name: prompt-tuning
description: "Diagnostica uma resposta errada da Luna e propõe um ajuste pontual no prompt salvo no Supabase (HiveOps, tabela `agents`). Use quando o usuário trouxer um histórico de conversa onde a Luna respondeu mal e pedir pra melhorar o prompt, revisar o system_prompt, ajustar o guardrail, ou corrigir o comportamento da Luna."
---

# Ajustar o prompt da Luna (Supabase / HiveOps)

Este skill existe pra transformar "a Luna respondeu errado nessa conversa" em uma mudança pequena e
justificada no prompt que está em produção — sem reescrever o prompt inteiro e sem aplicar nada no
Supabase sem confirmação explícita do usuário.

**Importante sobre "Supabase hiveops":** o projeto Supabase que guarda esse prompt (`fscrqdhecwzqfuevgrwf`,
ver `SUPABASE_URL` no `.env` do luna-nova) não é um dos projetos visíveis pelo conector Supabase do
Claude (`mcp__claude_ai_Supabase__*` só lista `vestra_unna` e `thermolab_unna`). Por isso este skill
não usa esse conector — ele usa as credenciais do próprio `.env` do luna-nova
(`SUPABASE_SERVICE_ROLE_KEY` + `LUNA_AGENT_ID`) via os scripts abaixo, do mesmo jeito que o código da
Luna acessa (`src/mastra/services/supabase.ts` / `hiveops/supabase-hiveops-provider.ts`). Não tente o
conector Supabase do Claude pra esse projeto — ele não vai achar.

## Passo 1 — entender o problema

Se o usuário ainda não colou a transcrição, pergunte:
- O histórico da conversa (ou o `conversationId`/nome/telefone do cliente — nesse caso, use o skill
  `logs` primeiro pra puxar a transcrição do log local do servidor Mastra).
- Qual foi a resposta errada da Luna e qual seria a resposta certa/esperada.

Não pule pra análise do prompt sem ter a transcrição real — inferir o erro só pela descrição do
usuário costuma levar a "consertar" a regra errada.

## Passo 2 — buscar o prompt atual (sempre, nunca assumir)

Rode, a partir da raiz do `luna-nova`:

```bash
cd luna-nova && bun .claude/skills/prompt-tuning/scripts/fetch-agent.mjs
```

Isso traz a linha **atual** da tabela `agents` (`system_prompt`, `guardrail_prompt`, `guardrail`,
`tone`, `bypass_keys`, etc.) exatamente como `getAgentConfig()` lê a cada mensagem — ou seja, é o que
está valendo em produção agora, não o que está nos arquivos-semente locais
(`agents/luna/prompts/system-prompt.ts`, `agents/luna-guardrail/prompts/system-prompt.ts`) nem nos
backups antigos em `backups/supabase-agents/` (esses são só snapshots de antes de mudanças passadas —
úteis pra ver o que mudou ao longo do tempo, não pra saber o que está valendo hoje).

Não pule este passo mesmo se achar que já sabe o que está no prompt — o texto muda direto pelo
Supabase, sem deploy, e uma sugestão baseada em versão desatualizada pode já estar corrigida ou pode
contradizer uma regra nova.

## Passo 3 — diagnosticar

Cruze a transcrição com o `system_prompt`/`guardrail_prompt` que acabou de buscar. Use
[`references/prompt-structure.md`](references/prompt-structure.md) como mapa das seções pra não
precisar reler o prompt inteiro do zero toda vez. Identifique, especificamente:

- **Qual seção/regra** parece ter causado (ou deixado de evitar) a resposta errada — cite o número da
  regra ou o nome da seção, não só "o prompt está confuso".
- **Por que**: falta uma regra, uma regra é ambígua, duas regras colidem e a prioridade entre elas
  não está clara, falta uma chave de fluxo pro tema, ou a causa raiz está fora de `agents`
  (playbook/FAQ/tag desatualizada — ver a seção final da referência).
- Se a causa raiz não é o prompt (é FAQ/playbook/tag), diga isso claramente em vez de forçar uma
  mudança no prompt que não resolveria o caso.

## Passo 4 — propor a mudança

Proponha um **diff mínimo e cirúrgico**: trecho exato de antes → depois (não o prompt inteiro).
Explique em 1-2 frases por que resolve o caso sem quebrar as regras vizinhas — em especial a ordem de
prioridade da seção de regras invioláveis, que é o lugar mais fácil de introduzir uma contradição
nova ao "consertar" uma regra isolada. Se a mudança for no `guardrail_prompt`, deixe claro se afeta
`reply`, `connect_human` ou `reply_and_connect_human` especificamente.

Apresente a proposta ao usuário e espere aprovação antes do próximo passo — isso é o prompt de
produção de um agente que atende clientes reais, uma mudança errada tem efeito imediato (sem deploy)
em todo mundo que conversar com a Luna dali pra frente.

## Passo 5 — aplicar (só com confirmação explícita)

Só depois do usuário confirmar o texto final exato. Salve o novo conteúdo da coluna num arquivo
temporário e rode:

```bash
cd luna-nova && bun .claude/skills/prompt-tuning/scripts/update-agent.mjs \
  --column system_prompt --file /caminho/para/novo-texto.txt --label motivo-curto-kebab-case
```

(`--column` aceita `system_prompt`, `guardrail_prompt`, `tone`, `guardrail`, `bypass_keys`.)

O script sempre salva a linha inteira atual em `backups/supabase-agents/luna-agents-row-<data>-pre-<label>.json`
antes de gravar — mesmo padrão dos backups que já existem no repo. Depois de aplicar, mostre ao
usuário o `after` que o script imprime pra confirmar que gravou o texto certo.

Nunca rode `update-agent.mjs` como parte da análise, "pra testar", ou sem o usuário ter visto e
aprovado o texto final — isso edita produção direto.
