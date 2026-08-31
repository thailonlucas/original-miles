#!/usr/bin/env bun
// Atualiza UMA coluna da linha da Luna em `agents` no Supabase, sempre fazendo backup da linha
// atual antes (mesmo padrão dos arquivos em backups/supabase-agents/). Nunca rodar sem o usuário
// ter confirmado explicitamente o texto novo antes.
//
// Uso:
//   bun .claude/skills/prompt-tuning/scripts/update-agent.mjs \
//     --column system_prompt --file /caminho/novo-system-prompt.txt --label golpe-bts-fix
//
// Colunas aceitas: system_prompt, guardrail_prompt, tone (texto) | guardrail, bypass_keys (JSON)
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LUNA_AGENT_ID } = process.env;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

const column = arg('--column');
const file = arg('--file');
const label = arg('--label');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !LUNA_AGENT_ID) {
  console.error('Faltam env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LUNA_AGENT_ID). Rode a partir da raiz do luna-nova.');
  process.exit(1);
}
if (!column || !file || !label) {
  console.error('Uso: bun update-agent.mjs --column <coluna> --file <caminho> --label <motivo-curto-kebab-case>');
  process.exit(1);
}

const TEXT_COLUMNS = ['system_prompt', 'guardrail_prompt', 'tone'];
const JSON_COLUMNS = ['guardrail', 'bypass_keys'];
if (!TEXT_COLUMNS.includes(column) && !JSON_COLUMNS.includes(column)) {
  console.error(`Coluna "${column}" não permitida. Use uma de: ${[...TEXT_COLUMNS, ...JSON_COLUMNS].join(', ')}`);
  process.exit(1);
}

const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const { data: before, error: beforeErr } = await client.from('agents').select('*').eq('id', LUNA_AGENT_ID).single();
if (beforeErr || !before) {
  console.error(`Falha ao buscar a linha atual (backup abortado, nada foi alterado): ${beforeErr?.message ?? 'linha não encontrada'}`);
  process.exit(1);
}

const dir = 'backups/supabase-agents';
mkdirSync(dir, { recursive: true });
const date = new Date().toISOString().slice(0, 10);
const backupPath = join(dir, `luna-agents-row-${date}-pre-${label}.json`);
writeFileSync(backupPath, `${JSON.stringify(before, null, 2)}\n`);
console.error(`Backup da linha atual salvo em ${backupPath}`);

const raw = readFileSync(file, 'utf-8');
const newValue = JSON_COLUMNS.includes(column) ? JSON.parse(raw) : raw.replace(/\n$/, '');

const { data: after, error: updateErr } = await client
  .from('agents')
  .update({ [column]: newValue, updated_at: new Date().toISOString() })
  .eq('id', LUNA_AGENT_ID)
  .select('*')
  .single();

if (updateErr) {
  console.error(`Falha ao atualizar (o backup pré-mudança já foi salvo em ${backupPath}): ${updateErr.message}`);
  process.exit(1);
}

console.log(`Coluna "${column}" atualizada com sucesso.`);
console.log(JSON.stringify(after, null, 2));
