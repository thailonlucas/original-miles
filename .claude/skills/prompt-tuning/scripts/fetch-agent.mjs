#!/usr/bin/env bun
// Busca a linha atual da Luna na tabela `agents` do Supabase (o HiveOps) e imprime em JSON.
// Rodar a partir da raiz do luna-nova (onde está o .env), ex:
//   bun .claude/skills/prompt-tuning/scripts/fetch-agent.mjs
//   bun .claude/skills/prompt-tuning/scripts/fetch-agent.mjs --backup investigacao-golpe-bts
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LUNA_AGENT_ID } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !LUNA_AGENT_ID) {
  console.error(
    'Faltam env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LUNA_AGENT_ID). Rode este script a partir da raiz do luna-nova, onde está o .env.',
  );
  process.exit(1);
}

const backupIndex = process.argv.indexOf('--backup');
const backupLabel = backupIndex === -1 ? null : process.argv[backupIndex + 1];

const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await client.from('agents').select('*').eq('id', LUNA_AGENT_ID).single();

if (error) {
  console.error(`Falha ao buscar a linha da Luna em "agents": ${error.message}`);
  process.exit(1);
}

if (backupLabel) {
  const dir = 'backups/supabase-agents';
  mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const path = join(dir, `luna-agents-row-${date}-pre-${backupLabel}.json`);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  console.error(`Backup salvo em ${path}`);
}

console.log(JSON.stringify(data, null, 2));
