import pg from 'pg';
import { env } from '../config/env';
import { requireEnv } from '../config/require-env';

// Mesmo acesso direto ao Postgres do Supabase de `travel-db.ts` (bypassa RLS de propósito — quem
// chama estas funções já resolveu o `tenantId` via `services/supabase-auth.ts`). Pool próprio (em
// vez de compartilhar o de `travel-db.ts`) porque `company_reference` é um domínio à parte, sem
// relação com viagem/voucher.
let pool: pg.Pool | undefined;

function getPool(): pg.Pool {
  if (!pool) {
    const { SUPABASE_DB_URL } = requireEnv({ SUPABASE_DB_URL: env.SUPABASE_DB_URL }, 'Company Reference DB');
    pool = new pg.Pool({ connectionString: SUPABASE_DB_URL, max: 5 });
  }
  return pool;
}

export const COMPANY_REFERENCE_CATEGORIES = ['accommodation', 'restaurant', 'experience', 'transfer', 'other'] as const;
export type CompanyReferenceCategory = (typeof COMPANY_REFERENCE_CATEGORIES)[number];

export interface CompanyReference {
  id: string;
  tenantId: string;
  category: CompanyReferenceCategory;
  name: string;
  city: string | null;
  country: string | null;
  prompt: string | null;
  description: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  active: boolean;
  createdAt: string;
}

interface CompanyReferenceRow {
  id: string;
  tenant_id: string;
  category: CompanyReferenceCategory;
  name: string;
  city: string | null;
  country: string | null;
  prompt: string | null;
  description: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  active: boolean;
  created_at: string;
}

function fromRow(row: CompanyReferenceRow): CompanyReference {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    category: row.category,
    name: row.name,
    city: row.city,
    country: row.country,
    prompt: row.prompt,
    description: row.description,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    website: row.website,
    address: row.address,
    active: row.active,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS = `id, tenant_id, category, name, city, country, prompt, description, contact_name, phone, email, website, address, active, created_at`;

export interface ListCompanyReferencesFilter {
  category?: CompanyReferenceCategory;
  // Default: só as ativas (`active = true`). `undefined` filtra por ativas, `true`/`false` força o valor.
  active?: boolean;
}

export async function listCompanyReferences(tenantId: string, filter: ListCompanyReferencesFilter = {}): Promise<CompanyReference[]> {
  const conditions = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];

  if (filter.category) {
    params.push(filter.category);
    conditions.push(`category = $${params.length}`);
  }
  params.push(filter.active ?? true);
  conditions.push(`active = $${params.length}`);

  const { rows } = await getPool().query<CompanyReferenceRow>(
    `select ${SELECT_COLUMNS} from company_reference where ${conditions.join(' and ')} order by name`,
    params,
  );
  return rows.map(fromRow);
}

export async function getCompanyReference(tenantId: string, id: string): Promise<CompanyReference | null> {
  const { rows } = await getPool().query<CompanyReferenceRow>(
    `select ${SELECT_COLUMNS} from company_reference where tenant_id = $1 and id = $2 limit 1`,
    [tenantId, id],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

export interface CreateCompanyReferenceInput {
  tenantId: string;
  category: CompanyReferenceCategory;
  name: string;
  city: string | null;
  country: string | null;
  prompt: string | null;
  description: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  active: boolean;
}

export async function createCompanyReference(input: CreateCompanyReferenceInput): Promise<CompanyReference> {
  const { rows } = await getPool().query<CompanyReferenceRow>(
    `insert into company_reference
       (tenant_id, category, name, city, country, prompt, description, contact_name, phone, email, website, address, active)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     returning ${SELECT_COLUMNS}`,
    [
      input.tenantId,
      input.category,
      input.name,
      input.city,
      input.country,
      input.prompt,
      input.description,
      input.contactName,
      input.phone,
      input.email,
      input.website,
      input.address,
      input.active,
    ],
  );
  return fromRow(rows[0]);
}

// Update parcial: campos ausentes de `patch` mantêm o valor atual (`coalesce`), exceto os que
// aceitam `null` explicitamente (ex: limpar `city`) — para esses, o chamador manda o valor (mesmo
// que `null`) só quando quer alterá-lo, e omite a chave do objeto quando não quer tocar no campo.
export interface UpdateCompanyReferenceInput {
  category?: CompanyReferenceCategory;
  name?: string;
  city?: string | null;
  country?: string | null;
  prompt?: string | null;
  description?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  active?: boolean;
}

export async function updateCompanyReference(tenantId: string, id: string, patch: UpdateCompanyReferenceInput): Promise<CompanyReference | null> {
  const { rows } = await getPool().query<CompanyReferenceRow>(
    `update company_reference set
       category = coalesce($3, category),
       name = coalesce($4, name),
       city = case when $5 then $6 else city end,
       country = case when $7 then $8 else country end,
       prompt = case when $9 then $10 else prompt end,
       description = case when $11 then $12 else description end,
       contact_name = case when $13 then $14 else contact_name end,
       phone = case when $15 then $16 else phone end,
       email = case when $17 then $18 else email end,
       website = case when $19 then $20 else website end,
       address = case when $21 then $22 else address end,
       active = coalesce($23, active)
     where tenant_id = $1 and id = $2
     returning ${SELECT_COLUMNS}`,
    [
      tenantId,
      id,
      patch.category ?? null,
      patch.name ?? null,
      'city' in patch,
      patch.city ?? null,
      'country' in patch,
      patch.country ?? null,
      'prompt' in patch,
      patch.prompt ?? null,
      'description' in patch,
      patch.description ?? null,
      'contactName' in patch,
      patch.contactName ?? null,
      'phone' in patch,
      patch.phone ?? null,
      'email' in patch,
      patch.email ?? null,
      'website' in patch,
      patch.website ?? null,
      'address' in patch,
      patch.address ?? null,
      patch.active ?? null,
    ],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function deleteCompanyReference(tenantId: string, id: string): Promise<boolean> {
  const { rowCount } = await getPool().query(`delete from company_reference where tenant_id = $1 and id = $2`, [tenantId, id]);
  return (rowCount ?? 0) > 0;
}
