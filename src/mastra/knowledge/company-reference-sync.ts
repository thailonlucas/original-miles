import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import { embed } from 'ai';
import { env } from '../config/env';
import { requireEnv } from '../config/require-env';
import { getPineconeIndexName, getPineconeStore } from '../services/pinecone';
import type { CompanyReference } from '../services/company-reference-db';

// Namespace prefixado (em vez do `tenantId` cru) pra não colidir com outros usos de namespace no
// mesmo índice (ex: `knowledgeBaseSlug` em `knowledge-search.ts`).
function namespaceFor(tenantId: string): string {
  return `company-reference:${tenantId}`;
}

// Vector id = `id` do Postgres (bigint como string) — estável entre updates, permite `upsert`
// sobrescrever o vetor existente em vez de duplicar.
function vectorIdFor(reference: CompanyReference): string {
  return reference.id;
}

// Texto usado pro embedding: concatena os campos que ajudam a busca semântica (nome, categoria,
// localização, descrição e o `prompt` livre cadastrado pra essa referência) — campos só
// operacionais (contato, telefone, email, site, endereço) ficam de fora do texto, mas vão nos
// metadados pra o agente conseguir exibi-los quando abrir a referência.
function buildEmbeddingText(reference: CompanyReference): string {
  return [
    `Categoria: ${reference.category}`,
    `Nome: ${reference.name}`,
    [reference.city, reference.country].filter(Boolean).join(', ') && `Local: ${[reference.city, reference.country].filter(Boolean).join(', ')}`,
    reference.description && `Descrição: ${reference.description}`,
    reference.prompt && `Observações: ${reference.prompt}`,
  ]
    .filter(Boolean)
    .join('\n');
}

async function embedText(text: string): Promise<number[]> {
  const { OPENAI_EMBEDDING_MODEL } = requireEnv({ OPENAI_EMBEDDING_MODEL: env.OPENAI_EMBEDDING_MODEL }, 'Pinecone embeddings');
  const { embedding } = await embed({ model: new ModelRouterEmbeddingModel(`openai/${OPENAI_EMBEDDING_MODEL}`), value: text });
  return embedding;
}

// Cria/atualiza o vetor de UMA `company_reference` no Pinecone — chamado depois de gravar no
// Postgres (fonte de verdade), então uma falha aqui não deve derrubar a resposta da rota (ver
// `routes/company-reference-routes.ts`, que captura e loga em vez de propagar).
export async function upsertCompanyReferenceEmbedding(reference: CompanyReference): Promise<void> {
  const text = buildEmbeddingText(reference);
  const embedding = await embedText(text);

  await getPineconeStore().upsert({
    indexName: getPineconeIndexName(),
    namespace: namespaceFor(reference.tenantId),
    ids: [vectorIdFor(reference)],
    vectors: [embedding],
    metadata: [
      {
        id: reference.id,
        tenantId: reference.tenantId,
        category: reference.category,
        name: reference.name,
        city: reference.city ?? '',
        country: reference.country ?? '',
        active: reference.active,
        text,
      },
    ],
  });
}

export async function deleteCompanyReferenceEmbedding(tenantId: string, id: string): Promise<void> {
  await getPineconeStore().deleteVector({ indexName: getPineconeIndexName(), id, namespace: namespaceFor(tenantId) });
}
