import { formatNow } from '../../../config/time';
import type { HiveOpsIncident, HiveOpsKnowledgeBase, HiveOpsSkill } from '../../../hiveops';

// Casada com o formato de `buildContextPrompt` abaixo — se o texto do "mensagem de sistema"
// entre a mensagem do usuário e a lista de habilidades mudar, atualize este regex também.
const CONTEXT_PROMPT_USER_MESSAGE_PATTERN = /^Mensagem enviada pelo usuário às[^\n]*:\n([\s\S]*?)\n\n\(Sempre verifique/;

function formatSkillsList(skills: HiveOpsSkill[]): string {
  return skills.map((skill, index) => `${index} - '${skill.slug}': ${skill.intent}`).join('\n');
}

function formatKnowledgeBasesList(knowledgeBases: HiveOpsKnowledgeBase[]): string {
  return knowledgeBases.map((kb, index) => `${index} - '${kb.slug}': ${kb.description}`).join('\n\n');
}

function formatIncidentsSection(incidents: HiveOpsIncident[]): string {
  if (incidents.length === 0) return '';

  const incidentsList = incidents.map((incident) => `- ${incident.title}: ${incident.content}`).join('\n');
  return `Incidências ativas no momento (considere isso ao responder o cliente):\n${incidentsList}\n\n`;
}

export type CustomerLookupResult = { found: true; userFields: Record<string, unknown> } | { found: false } | null;

// `null` = não é a 1ª mensagem da conversa, então a busca nem rodou (não precisa rodar de novo).
function formatCustomerDataSection(customerData: CustomerLookupResult): string {
  if (customerData === null) return '';

  if (!customerData.found) {
    return 'Dados do cliente (busca automática): indisponíveis. Dados indisponíveis. Siga com a triagem e o que o prompt e a base de conhecimento mandar.\n\n';
  }

  return `Dados do cliente (busca automática, user_fields):\n${JSON.stringify(customerData.userFields, null, 2)}\n\n`;
}

// LunaContextProcessor embrulha o texto (habilidades, bases de conhecimento, etc.) só no prompt
// enviado ao model via processLLMRequest — isso nunca é persistido. Esta função só existe pra
// desembrulhar mensagens antigas que ficaram gravadas assim antes dessa mudança.
export function extractUserMessageFromContextPrompt(text: string): string {
  const match = CONTEXT_PROMPT_USER_MESSAGE_PATTERN.exec(text);
  return match ? match[1] : text;
}

export function buildContextPrompt(
  userMessage: string,
  now: Date,
  skills: HiveOpsSkill[],
  knowledgeBases: HiveOpsKnowledgeBase[],
  incidents: HiveOpsIncident[],
  customerData: CustomerLookupResult,
): string {
  const skillsList = formatSkillsList(skills);
  const knowledgeBasesList = formatKnowledgeBasesList(knowledgeBases);
  const incidentsSection = formatIncidentsSection(incidents);
  const customerDataSection = formatCustomerDataSection(customerData);

  return `Mensagem enviada pelo usuário às ${formatNow(now)}:
${userMessage}

${customerDataSection}Habilidades disponíveis:
${skillsList}

Escolha o knowledge_base_slug conforme o contexto:
${knowledgeBasesList}

${incidentsSection}
[Mensagem do sistema: Se o cliente pedir para falar com o atendente, não diga que irá transferir de imediato, primeiro você precisa atender o problema para direcionar para o especialista correto. Somente após a análise concluída, você deve informar que irá transferir]
`;
}
// (Sempre verifique alguma F.A.Q e habilidade antes de responder. SEMPRE pesquise a dúvida do cliente mesmo se a informação já estiver no system message)
