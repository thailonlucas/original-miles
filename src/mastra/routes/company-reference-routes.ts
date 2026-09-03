import { registerApiRoute } from '@mastra/core/server';
import { z } from 'zod';
import {
  COMPANY_REFERENCE_CATEGORIES,
  createCompanyReference,
  deleteCompanyReference,
  getCompanyReference,
  listCompanyReferences,
  updateCompanyReference,
} from '../services/company-reference-db';
import { getTenantIdByEmail } from '../services/travel-db';
import { deleteCompanyReferenceEmbedding, upsertCompanyReferenceEmbedding } from '../knowledge/company-reference-sync';
import { extractBearerToken, verifySupabaseAccessToken, UnauthorizedError } from '../services/supabase-auth';
import { logWarning } from '../helpers/logger';
import { parseOrBadRequest } from './validate';

// Mesmo contrato de autenticação das outras rotas de travel_agent/* (ver `voucher-routes.ts`).
async function resolveTenantId(authorizationHeader: string | undefined | null): Promise<string> {
  const token = extractBearerToken(authorizationHeader);
  const user = await verifySupabaseAccessToken(token);
  const tenantId = await getTenantIdByEmail(user.email);
  if (!tenantId) {
    throw new UnauthorizedError(`Nenhum tenant encontrado para o e-mail "${user.email}" (tabela team).`);
  }
  return tenantId;
}

// Grava/atualiza o vetor da referência no Pinecone depois do Postgres já ter confirmado a escrita
// (fonte de verdade). Uma falha aqui não deve derrubar a resposta HTTP — só fica temporariamente
// fora de sincronia com a busca semântica, o que é preferível a reportar erro numa escrita que já
// aconteceu de fato. Loga pra investigação manual/retry.
function syncEmbeddingInBackground(reference: Parameters<typeof upsertCompanyReferenceEmbedding>[0]): void {
  void upsertCompanyReferenceEmbedding(reference).catch((error) =>
    logWarning(`falha ao sincronizar embedding da company_reference ${reference.id} no Pinecone`, { error }),
  );
}

const categorySchema = z.enum(COMPANY_REFERENCE_CATEGORIES);

const createBodySchema = z.object({
  category: categorySchema.optional(),
  name: z.string().min(1),
  city: z.string().min(1).nullable().optional(),
  country: z.string().min(1).nullable().optional(),
  prompt: z.string().min(1).nullable().optional(),
  description: z.string().min(1).nullable().optional(),
  contact_name: z.string().min(1).nullable().optional(),
  phone: z.string().min(1).nullable().optional(),
  email: z.string().email().nullable().optional(),
  website: z.string().url().nullable().optional(),
  address: z.string().min(1).nullable().optional(),
  active: z.boolean().optional(),
});

const updateBodySchema = createBodySchema.partial().extend({ name: z.string().min(1).optional() });

export const companyReferenceListRoute = registerApiRoute('/travel_agent/company-reference', {
  method: 'GET',
  requiresAuth: false,
  openapi: {
    summary: 'Lista as referências da empresa (hotéis, restaurantes, passeios, etc.) cadastradas',
    description:
      'Filtros opcionais via query string: `category` (accommodation/restaurant/experience/transfer/other) e `active` ' +
      '("true"/"false", default "true").',
    tags: ['Company Reference'],
  },
  handler: async (c) => {
    let tenantId: string;
    try {
      tenantId = await resolveTenantId(c.req.header('Authorization'));
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return c.json({ error: 'unauthorized', message: error.message }, 401);
      }
      throw error;
    }

    const categoryParam = c.req.query('category');
    if (categoryParam) {
      const parsedCategory = categorySchema.safeParse(categoryParam);
      if (!parsedCategory.success) {
        return c.json({ error: 'bad_request', message: `"category" deve ser um de: ${COMPANY_REFERENCE_CATEGORIES.join(', ')}.` }, 400);
      }
    }
    const activeParam = c.req.query('active');
    const active = activeParam === undefined ? undefined : activeParam !== 'false';

    const references = await listCompanyReferences(tenantId, {
      category: categoryParam ? (categoryParam as (typeof COMPANY_REFERENCE_CATEGORIES)[number]) : undefined,
      active,
    });
    return c.json({ references }, 200);
  },
});

export const companyReferenceGetRoute = registerApiRoute('/travel_agent/company-reference/:id', {
  method: 'GET',
  requiresAuth: false,
  openapi: {
    summary: 'Busca uma referência da empresa por id',
    tags: ['Company Reference'],
  },
  handler: async (c) => {
    let tenantId: string;
    try {
      tenantId = await resolveTenantId(c.req.header('Authorization'));
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return c.json({ error: 'unauthorized', message: error.message }, 401);
      }
      throw error;
    }

    const id = c.req.param('id');
    const reference = await getCompanyReference(tenantId, id);
    if (!reference) {
      return c.json({ error: 'not_found', message: `Referência ${id} não encontrada.` }, 404);
    }
    return c.json(reference, 200);
  },
});

export const companyReferenceCreateRoute = registerApiRoute('/travel_agent/company-reference', {
  method: 'POST',
  requiresAuth: false,
  openapi: {
    summary: 'Cadastra uma referência da empresa (hotel, restaurante, passeio, transfer, etc.)',
    description: 'Grava no Postgres (`company_reference`) e sincroniza o embedding no Pinecone (busca semântica, usada futuramente como tool do agente).',
    tags: ['Company Reference'],
  },
  handler: async (c) => {
    let tenantId: string;
    try {
      tenantId = await resolveTenantId(c.req.header('Authorization'));
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return c.json({ error: 'unauthorized', message: error.message }, 401);
      }
      throw error;
    }

    const rawBody = await c.req.json().catch(() => null);
    const body = parseOrBadRequest(createBodySchema, rawBody, c);
    if (body instanceof Response) return body;

    const reference = await createCompanyReference({
      tenantId,
      category: body.category ?? 'other',
      name: body.name,
      city: body.city ?? null,
      country: body.country ?? null,
      prompt: body.prompt ?? null,
      description: body.description ?? null,
      contactName: body.contact_name ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      website: body.website ?? null,
      address: body.address ?? null,
      active: body.active ?? true,
    });

    syncEmbeddingInBackground(reference);
    return c.json(reference, 201);
  },
});

export const companyReferenceUpdateRoute = registerApiRoute('/travel_agent/company-reference/:id', {
  method: 'PATCH',
  requiresAuth: false,
  openapi: {
    summary: 'Atualiza (parcialmente) uma referência da empresa',
    description: 'Só os campos enviados no corpo são alterados. Re-sincroniza o embedding no Pinecone com os dados atualizados.',
    tags: ['Company Reference'],
  },
  handler: async (c) => {
    let tenantId: string;
    try {
      tenantId = await resolveTenantId(c.req.header('Authorization'));
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return c.json({ error: 'unauthorized', message: error.message }, 401);
      }
      throw error;
    }

    const id = c.req.param('id');
    const rawBody = await c.req.json().catch(() => null);
    const body = parseOrBadRequest(updateBodySchema, rawBody, c);
    if (body instanceof Response) return body;

    const patch: Parameters<typeof updateCompanyReference>[2] = {};
    if ('category' in body) patch.category = body.category;
    if ('name' in body) patch.name = body.name;
    if ('city' in body) patch.city = body.city ?? null;
    if ('country' in body) patch.country = body.country ?? null;
    if ('prompt' in body) patch.prompt = body.prompt ?? null;
    if ('description' in body) patch.description = body.description ?? null;
    if ('contact_name' in body) patch.contactName = body.contact_name ?? null;
    if ('phone' in body) patch.phone = body.phone ?? null;
    if ('email' in body) patch.email = body.email ?? null;
    if ('website' in body) patch.website = body.website ?? null;
    if ('address' in body) patch.address = body.address ?? null;
    if ('active' in body) patch.active = body.active;

    const reference = await updateCompanyReference(tenantId, id, patch);
    if (!reference) {
      return c.json({ error: 'not_found', message: `Referência ${id} não encontrada.` }, 404);
    }

    syncEmbeddingInBackground(reference);
    return c.json(reference, 200);
  },
});

export const companyReferenceDeleteRoute = registerApiRoute('/travel_agent/company-reference/:id', {
  method: 'DELETE',
  requiresAuth: false,
  openapi: {
    summary: 'Remove uma referência da empresa',
    description: 'Remove do Postgres e do Pinecone (vetor correspondente ao id).',
    tags: ['Company Reference'],
  },
  handler: async (c) => {
    let tenantId: string;
    try {
      tenantId = await resolveTenantId(c.req.header('Authorization'));
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return c.json({ error: 'unauthorized', message: error.message }, 401);
      }
      throw error;
    }

    const id = c.req.param('id');
    const deleted = await deleteCompanyReference(tenantId, id);
    if (!deleted) {
      return c.json({ error: 'not_found', message: `Referência ${id} não encontrada.` }, 404);
    }

    void deleteCompanyReferenceEmbedding(tenantId, id).catch((error) =>
      logWarning(`falha ao remover embedding da company_reference ${id} no Pinecone`, { error }),
    );
    return c.json({ deleted: true }, 200);
  },
});
