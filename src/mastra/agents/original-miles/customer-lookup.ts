import { zendeskRequest } from '../../services/zendesk';

interface ZendeskUser {
  id: number;
  user_fields?: Record<string, unknown>;
}

interface ZendeskUserSearchResponse {
  users: ZendeskUser[];
}

export async function searchCustomerOnZendeskByPhone(phone: string): Promise<Record<string, unknown> | null> {
  const response = await zendeskRequest<ZendeskUserSearchResponse>(
    `users/search.json?query=${encodeURIComponent(`phone:${phone}`)}`,
  );

  return response.users[0]?.user_fields ?? null;
}
