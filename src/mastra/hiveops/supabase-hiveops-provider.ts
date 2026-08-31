import { getSupabaseClient, requireAgentId, requireTenantId, unwrapOrThrow } from '../services/supabase';
import type { HiveOpsProvider } from './hiveops-provider';
import type {
  CreateHiveOpsTaskInput,
  HiveOpsAgentConfig,
  HiveOpsIncident,
  HiveOpsKnowledgeBase,
  HiveOpsPriorityTag,
  HiveOpsSkill,
  HiveOpsSkillDetail,
  UpsertConversationMemoryInput,
} from './types';

const ASSIGNED_TO = '53692070-e875-43de-96b4-0f020b8acdf9';

export class SupabaseHiveOpsProvider implements HiveOpsProvider {
  async getActiveSkills(): Promise<HiveOpsSkill[]> {
    const tenantId = requireTenantId('Luna skills (playbooks)');

    const data = await unwrapOrThrow<HiveOpsSkill[]>(
      getSupabaseClient().from('playbooks').select('slug, intent').eq('active', true).eq('tenant_id', tenantId),
      'load Luna skills from Supabase',
    );

    return data ?? [];
  }

  async getSkillBySlug(slug: string): Promise<HiveOpsSkillDetail | null> {
    const tenantId = requireTenantId('Luna skills (playbooks)');

    return unwrapOrThrow<HiveOpsSkillDetail>(
      getSupabaseClient()
        .from('playbooks')
        .select('name, intent, slots, rules, fallback, notes')
        .eq('active', true)
        .eq('tenant_id', tenantId)
        .eq('slug', slug)
        .maybeSingle(),
      `load Luna skill "${slug}" from Supabase`,
    );
  }

  async getActiveIncidents(): Promise<HiveOpsIncident[]> {
    const tenantId = requireTenantId('Luna incidents');

    const data = await unwrapOrThrow<HiveOpsIncident[]>(
      getSupabaseClient().from('incidents').select('title, content').eq('active', true).eq('tenant_id', tenantId),
      'load Luna incidents from Supabase',
    );

    return data ?? [];
  }

  async getActiveKnowledgeBases(): Promise<HiveOpsKnowledgeBase[]> {
    const tenantId = requireTenantId('Luna knowledge bases');

    const data = await unwrapOrThrow<HiveOpsKnowledgeBase[]>(
      getSupabaseClient()
        .from('knowledge_bases')
        .select('slug, description')
        .eq('active', true)
        .eq('is_available_for_bots', true)
        .eq('tenant_id', tenantId),
      'load Luna knowledge bases from Supabase',
    );

    return data ?? [];
  }

  async createTask(task: CreateHiveOpsTaskInput): Promise<{ id: string }> {
    const tenantId = requireTenantId('Luna tasks');

    const data = await unwrapOrThrow<{ id: string }>(
      getSupabaseClient()
        .from('tasks')
        .insert({
          tenant_id: tenantId,
          executor_type: 'user',
          priority: task.priority,
          status: 'pending',
          assigned_to: ASSIGNED_TO,
          input: task.input,
          conversation_id: task.conversationId,
          type: task.type,
        })
        .select('id')
        .single(),
      'create Luna task',
    );

    if (!data) {
      throw new Error('Failed to create Luna task: insert returned no row');
    }

    return data;
  }

  async upsertConversationMemory({ conversationId, resourceId, ...fields }: UpsertConversationMemoryInput): Promise<void> {
    const tenantId = requireTenantId('Luna conversation memory');

    await unwrapOrThrow(
      getSupabaseClient()
        .from('conversation_memory')
        .upsert(
          {
            tenant_id: tenantId,
            conversation_id: conversationId,
            resource_id: resourceId ?? null,
            ...fields,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'conversation_id' },
        ),
      'upsert conversation memory',
    );
  }

  async getHandoffTagTitles(): Promise<string[]> {
    const tenantId = requireTenantId('Zendesk blocklist check');

    const data = await unwrapOrThrow<{ title: string }[]>(
      getSupabaseClient().from('tags').select('title').eq('active', true).eq('type', 'handoff').eq('tenant_id', tenantId),
      'load handoff tags',
    );

    return (data ?? []).map((tag) => tag.title);
  }

  async getPriorityTags(): Promise<HiveOpsPriorityTag[]> {
    const tenantId = requireTenantId('Tags especiais/prioritárias');

    const data = await unwrapOrThrow<{ title: string; description: string | null }[]>(
      getSupabaseClient().from('tags').select('title, description').eq('active', true).eq('type', 'priority').eq('tenant_id', tenantId),
      'load priority tags',
    );

    return (data ?? []).map((tag) => ({ title: tag.title, description: tag.description ?? '' }));
  }

  async findConversationByExternalId(externalId: string): Promise<{ id: string } | null> {
    const tenantId = requireTenantId('Zendesk conversation state');

    return unwrapOrThrow<{ id: string }>(
      getSupabaseClient().from('conversations').select('id').eq('tenant_id', tenantId).eq('external_id', externalId).maybeSingle(),
      'load conversation state',
    );
  }

  async getAgentConfig(): Promise<HiveOpsAgentConfig> {
    const agentId = requireAgentId('Luna agent config');

    const data = await unwrapOrThrow<{ system_prompt: string; guardrail_prompt: string }>(
      getSupabaseClient().from('agents').select('system_prompt, guardrail_prompt').eq('id', agentId).single(),
      'load Luna agent config from Supabase',
    );

    if (!data) {
      throw new Error(`Failed to load Luna agent config: no row in "agents" for id ${agentId}`);
    }

    return { systemPrompt: data.system_prompt, guardrailPrompt: data.guardrail_prompt };
  }

  async getBypassKeywords(): Promise<string[]> {
    const agentId = requireAgentId('Luna bypass keywords');

    const data = await unwrapOrThrow<{ bypass_keys: string[] | null }>(
      getSupabaseClient().from('agents').select('bypass_keys').eq('id', agentId).single(),
      'load Luna bypass keywords from Supabase',
    );

    return data?.bypass_keys ?? [];
  }
}
