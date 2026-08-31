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

/**
 * HiveOps is Buyticket's internal system of record (playbooks, knowledge bases, incidents,
 * tasks, conversation state/memory). This interface is the only thing the rest of the app
 * depends on — swap `SupabaseHiveOpsProvider` for a different backend without touching a
 * single agent, tool, or webhook.
 */
export interface HiveOpsProvider {
  getActiveSkills(): Promise<HiveOpsSkill[]>;
  getSkillBySlug(slug: string): Promise<HiveOpsSkillDetail | null>;
  getActiveIncidents(): Promise<HiveOpsIncident[]>;
  getActiveKnowledgeBases(): Promise<HiveOpsKnowledgeBase[]>;
  createTask(task: CreateHiveOpsTaskInput): Promise<{ id: string }>;
  upsertConversationMemory(input: UpsertConversationMemoryInput): Promise<void>;
  getHandoffTagTitles(): Promise<string[]>;
  getPriorityTags(): Promise<HiveOpsPriorityTag[]>;
  findConversationByExternalId(externalId: string): Promise<{ id: string } | null>;
  getAgentConfig(): Promise<HiveOpsAgentConfig>;
  getBypassKeywords(): Promise<string[]>;
}
