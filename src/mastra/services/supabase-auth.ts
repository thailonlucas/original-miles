import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { requireEnv } from '../config/require-env';

// Client separado do `services/supabase.ts` (que usa SUPABASE_SERVICE_ROLE_KEY): este aqui usa a
// chave publishable/anon só para validar o access_token do usuário via `auth.getUser(token)` —
// não é usado para nenhuma query de dados (isso é `services/travel-db.ts`, com o Postgres direto).
let client: SupabaseClient | undefined;

function getAuthClient(): SupabaseClient {
  if (!client) {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = requireEnv(
      { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY },
      'Supabase Auth',
    );
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}

export class UnauthorizedError extends Error {
  constructor(message = 'unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export interface AuthenticatedUser {
  id: string;
  email: string;
}

// Valida o `access_token` do Supabase Auth mandado pelo frontend em `Authorization: Bearer
// <access_token>` (ver AGENTS.md das rotas de travel_agent). Chama /auth/v1/user via supabase-js
// em vez de verificar o JWT localmente — custa um round-trip extra por request, mas evita ter
// que lidar com rotação de chave de assinatura/JWKS aqui.
export async function verifySupabaseAccessToken(accessToken: string): Promise<AuthenticatedUser> {
  const { data, error } = await getAuthClient().auth.getUser(accessToken);
  if (error || !data.user?.email) {
    throw new UnauthorizedError();
  }
  return { id: data.user.id, email: data.user.email };
}

// Extrai o token de um header `Authorization: Bearer <token>`. Lança `UnauthorizedError` se o
// header estiver ausente ou em formato errado — mesmo erro que uma verificação de token inválido,
// pra rota tratar os dois casos com uma resposta 401 igual.
export function extractBearerToken(authorizationHeader: string | undefined | null): string {
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader ?? '');
  if (!match) {
    throw new UnauthorizedError();
  }
  return match[1];
}
