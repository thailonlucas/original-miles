import type { CustomerTypeCategory } from '../../luna-customer-type/schema';
import { customerTypeCategoryDescriptions } from '../../luna-customer-type/category-descriptions';
import type { HiveOpsPriorityTag } from '../../../hiveops/types';
import { CRITICAL_TAGS, TABULACAO_TAGS_BY_CUSTOMER_TYPE, type TabulacaoTag } from '../schema';

// Datas já calculadas em código (nunca deixe o modelo fazer a conta de "hoje + N dias" — ver
// `buildDateThresholds` em `tags-agent.ts`) e injetadas aqui como texto, só pra comparação.
export type DateThresholds = {
  today: string;
  in2Days: string;
  in3Days: string;
  in5Days: string;
};

// Regra especial de UMA tag (ou par vendedor/comprador equivalente) — só entra no prompt se a tag
// correspondente estiver na lista de tags da vez (`buildSpecialRules`), então basta declarar aqui
// uma vez e vendedor, comprador, o merge e as tags críticas (`CRITICAL_TAGS`, agente de tags
// especiais) ficam cobertos automaticamente. Adicionar/remover uma regra especial é só mexer nesta
// lista, sem tocar em `buildSystemPrompt`/`buildSpecialTagsSystemPrompt`.
const SPECIAL_TAG_RULES: { appliesTo: TabulacaoTag[]; text: string }[] = [
  {
    appliesTo: ['cancelar_venda', 'cancelar_compra'],
    text: `### cancelar_compra / cancelar_venda
Utilize somente quando houver um pedido EXPLÍCITO para cancelar uma compra ou venda já realizada.
NÃO utilizar para dúvidas, reclamações, arrependimento implícito ou problemas gerais.`,
  },
  {
    appliesTo: ['cancelamento_reembolso'],
    text: `### cancelamento_reembolso
Utilize somente quando houver pedido explícito de cancelamento acompanhado de solicitação de reembolso.`,
  },
  {
    appliesTo: ['cadastro_de_eventos'],
    text: `### cadastro_de_eventos (MUITO IMPORTANTE)
Uso ÚNICO E EXCLUSIVO: pedido explícito de cadastro de um evento NOVO que ainda não está na
plataforma. Nada mais cai aqui — nem dúvida, nem evento já existente, nem qualquer outro sentido de
"cadastro". Nesse fluxo o bot SEMPRE pede nome do evento, link do evento e data do evento, e ao
final avisa o cliente que vai encaminhar o pedido pro time de cadastro — essa confirmação do bot é
o sinal mais claro de que é um caso legítimo. Utilize a tag somente quando o cliente pedir isso
EXPLICITAMENTE E as 3 informações (nome, link, data do evento) estiverem na conversa; se qualquer
uma estiver ausente, NÃO utilize esta tag (nem suas variantes de data, ver regra de data abaixo).
NÃO usar pra dúvidas, consultas ou eventos já existentes. NÃO usar só porque o cliente menciona um
evento que acontece hoje/essa semana — comprar ingresso, tirar dúvida ou participar de um evento
existente NÃO é pedido de cadastro, mesmo com data próxima. NÃO usar pra problemas de cadastro/conta
do próprio cliente (login, dados pessoais, aprovação de cadastro de usuário) — isso é
atualizar_conta_e_perfil, não cadastro de evento. Adicione essa tag independentemente da data do
evento — se o cliente quer cadastrar um evento, ela sempre entra.`,
  },
  {
    appliesTo: ['evento_hoje'],
    text: `### evento_hoje
Tag PRIORITÁRIA. Utilize somente quando o evento relacionado ao pedido do cliente acontece HOJE, o
cliente está na porta do evento/prestes a entrar, ou o evento é mais tarde no mesmo dia — sempre
verifique a data do evento que a pessoa está se referindo, sem confundir com a data da mensagem.
NÃO utilizar pra cadastro de eventos, eventos futuros ou simples menção ao evento.`,
  },
];

function buildSpecialRules(tags: readonly TabulacaoTag[]): string {
  return SPECIAL_TAG_RULES.filter((rule) => rule.appliesTo.some((tag) => tags.includes(tag)))
    .map((rule) => rule.text)
    .join('\n\n');
}

// Regra de data pra decidir entre cadastro_de_eventos_hoje (até 48h) / _essa_semana (depois das
// 48h, mesma semana) / cadastro_de_eventos (resto) — só depois de confirmar, pela regra de
// "cadastro_de_eventos" acima, que o cliente quer mesmo cadastrar um evento novo. Compartilhada
// pelo bloco de vendedor (`buildAvailableTagsBlock`) e pelo agente de tags especiais
// (`buildSpecialTagsSystemPrompt`), já que as 3 variantes são tags críticas nos dois.
function buildEventDateRule(dates: DateThresholds): string {
  return `Regra de data pra decidir entre as variantes de cadastro de evento — só aplique esta regra
DEPOIS de confirmar, pela regra de "cadastro_de_eventos" (nome + link + data do evento, pedido
explícito), que o cliente realmente quer cadastrar um evento novo. A proximidade da data sozinha
NUNCA justifica nenhuma variante desta tag:
- Se o evento acontece entre ${dates.today} e ${dates.in2Days}: cadastro_de_eventos_hoje
- Se o evento acontece entre ${dates.in3Days} e ${dates.in5Days}: cadastro_de_eventos_essa_semana
- Se o evento acontece depois de ${dates.in5Days}, ou a conversa não tiver uma data clara: cadastro_de_eventos`;
}

// Bloco de UM tipo (vendedor ou comprador) com a lista de tags disponíveis; só vendedor ganha a
// regra extra de decidir entre cadastro_de_eventos_hoje / _essa_semana / cadastro_de_eventos com
// base na data do evento (essas 3 variantes só existem na lista de vendedor).
function buildAvailableTagsBlock(customerType: 'vendedor' | 'comprador', dates: DateThresholds): string {
  const tags = TABULACAO_TAGS_BY_CUSTOMER_TYPE[customerType];
  const header = `Se for ${customerType}:\n${tags.join(';\n')};`;
  if (customerType !== 'vendedor') return header;

  return `${header}\n\n${buildEventDateRule(dates)}`;
}

export function buildSystemPrompt(customerType: CustomerTypeCategory, dates: DateThresholds): string {
  const isVendedor = customerType === 'vendedor';
  const isComprador = customerType === 'comprador';

  const availableTagsBlocks = isVendedor
    ? [buildAvailableTagsBlock('vendedor', dates)]
    : isComprador
      ? [buildAvailableTagsBlock('comprador', dates)]
      : [buildAvailableTagsBlock('vendedor', dates), buildAvailableTagsBlock('comprador', dates)];

  const allTags = isVendedor
    ? TABULACAO_TAGS_BY_CUSTOMER_TYPE.vendedor
    : isComprador
      ? TABULACAO_TAGS_BY_CUSTOMER_TYPE.comprador
      : [...TABULACAO_TAGS_BY_CUSTOMER_TYPE.vendedor, ...TABULACAO_TAGS_BY_CUSTOMER_TYPE.comprador];

  return `Você é um classificador de tags de atendimentos de suporte da Buyticket. Analise TODO o
histórico da conversa e retorne TODAS as tags aplicáveis, usando EXCLUSIVAMENTE a lista abaixo.

Hoje é ${dates.today}.

## Cliente deste atendimento
Este atendimento já foi classificado como "${customerType}": ${customerTypeCategoryDescriptions[customerType]}

## Tags disponíveis
${availableTagsBlocks.join('\n\n')}

## Objetivo
Seu objetivo NÃO é achar a melhor tag — é identificar TODAS as tags com evidência clara na
conversa. Uma conversa pode ter nenhuma, uma ou várias tags; não pare após achar a primeira.
Avalie cada tag da lista individualmente: existe evidência clara e todas as condições pra usá-la
foram satisfeitas? Se sim, inclua; se não, ignore.

## Regras gerais
- Use EXCLUSIVAMENTE as tags disponíveis acima, nunca invente novas.
- Inclua a tag do assunto principal e todas as adicionais com evidência clara — sem limite de
  quantidade.
- Seja conservador: na dúvida, NÃO inclua a tag.

${buildSpecialRules(allTags)}`;
}

// Prompt do agente de tags especiais/críticas (o 2º dos 2 agentes — ver `agents/tags/AGENTS.md`).
// Roda em paralelo ao de tags de operação (`buildSystemPrompt` acima) e NÃO depende do
// `tipo_cliente`: `evento_hoje` e as variantes de cadastro de evento importam igual pra qualquer
// tipo. `priorityTags` vem de `getHiveOps().getPriorityTags()` — tags configuráveis pelo time de
// suporte (tabela `tags`, `type: 'priority'`), somadas às 4 tags críticas fixas (`CRITICAL_TAGS`).
export function buildSpecialTagsSystemPrompt(priorityTags: readonly HiveOpsPriorityTag[], dates: DateThresholds): string {
  const availableTags = [...CRITICAL_TAGS, ...priorityTags.map((tag) => tag.title)];
  const priorityTagDetails = priorityTags.map((tag) => `## ${tag.title}: ${tag.description}`).join('\n');

  return `Você é o classificador de tags críticas/prioritárias dos atendimentos de suporte da
Buyticket — a fonte de verdade com maior importância no fluxo pra essas tags. Analise TODO o
histórico da conversa e retorne TODAS as tags com evidência clara, usando EXCLUSIVAMENTE a lista
abaixo. Essas tags não dependem do tipo de cliente — reavalie sempre, mesmo que outra etapa já
tenha classificado o atendimento.

Hoje é ${dates.today}.

## Tags disponíveis
${availableTags.join(';\n')};

${buildEventDateRule(dates)}

## Objetivo
Seu objetivo NÃO é achar a melhor tag — é identificar TODAS as tags com evidência clara na
conversa. Uma conversa pode ter nenhuma, uma ou várias tags; não pare após achar a primeira.
Avalie cada tag da lista individualmente: existe evidência clara e todas as condições pra usá-la
foram satisfeitas? Se sim, inclua; se não, ignore.

## Regras gerais
- Use EXCLUSIVAMENTE as tags disponíveis acima, nunca invente novas.
- Seja conservador: na dúvida, NÃO inclua a tag.

${buildSpecialRules(CRITICAL_TAGS)}${priorityTagDetails ? `\n\n${priorityTagDetails}` : ''}`;
}
