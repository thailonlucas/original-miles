import type { VoucherSummary } from '../../../services/travel-db';
import type { DailyScheduleDay } from '../../daily-schedule/schema';

function formatVoucherList(vouchers: VoucherSummary[]): string {
  return JSON.stringify(
    vouchers.map((v) => ({ id: v.id, voucher_type_slug: v.voucherTypeSlug, title: v.title, content: v.content })),
    null,
    2,
  );
}

export function buildSuggestionInstructions(): string {
  return `Você sugere atividades para UM dia específico do roteiro de uma viagem, pro cliente decidir se aprova — sugestões aprovadas viram eventos reais do roteiro (mesmo formato de um evento normal).

## O que fazer

1. Antes de sugerir qualquer coisa, abra (com "openVoucher") os vouchers relevantes pra descobrir em que cidade/região a viagem está naquele dia (acomodação, transfer, passeio, voo etc.) — nunca invente a localização, baseie-se só no que os vouchers abertos mostrarem. Reaproveite o conteúdo já aberto se precisar consultar o mesmo voucher de novo.
2. Avalie os três períodos do dia (morning, afternoon, night) separadamente, usando os eventos JÁ CONFIRMADOS deste dia (roteiro atual, na mensagem do usuário) como referência:
   - Se o período já tem evento confirmado: marque "has_existing_events": true e sugira só atividades ADICIONAIS que façam sentido de verdade com o que já está confirmado — ex: algo próximo geograficamente de um passeio já marcado, ou que encaixe na janela de tempo livre entre dois eventos do mesmo período. Não repita, não contradiga e não sobreponha horário com o que já está agendado. Se não houver nada que agregue de verdade, devolva "suggestions" vazio — não force sugestão fraca só pra preencher.
   - Se o período está livre: marque "has_existing_events": false e proponha cerca de 3 opções plausíveis e viáveis pra aquele período, considerando a cidade/região da viagem naquele dia.
3. Toda sugestão precisa ser plausível e viável de verdade — coisas que realmente existem/fazem sentido no destino identificado (pode usar seu conhecimento geral sobre o destino pra isso), nunca extrapoladas de vouchers que não tratam de passeios/atividades (ex: não sugerir algo a partir de um voucher de seguro-viagem).
4. Preencha "reason" de cada sugestão com o motivo objetivo dela fazer sentido nesse dia/período (ex: "fica a 10 min a pé do ponto de encontro do passeio de barco já confirmado desta manhã", "noite livre — opção de jantar típico da região").
5. "type" segue a mesma convenção usada nos eventos do roteiro (ex: experience, restaurant_reservation, other).
6. "content" deve ser markdown com os detalhes da atividade (o que é, região/endereço aproximado, duração estimada) — mesmo padrão de um evento normal do roteiro, já que sugestões aprovadas são gravadas exatamente como um evento novo.
7. "observation" segue a mesma regra dos eventos do roteiro: normalmente null; preencha só se a sugestão precisar registrar algum conflito/ressalva em relação a um evento já confirmado.`;
}

export function buildSuggestionUserMessage(day: string, existingDay: DailyScheduleDay | null, vouchers: VoucherSummary[]): string {
  return `Dia consultado: ${day}

Eventos já confirmados neste dia (roteiro atual — pode não existir ainda se o dia inteiro está livre):
${existingDay ? JSON.stringify(existingDay.events, null, 2) : '(nenhum evento confirmado neste dia ainda — os três períodos estão livres)'}

Vouchers desta viagem (abra com "openVoucher" os que precisar pra descobrir localização/contexto do dia):
${formatVoucherList(vouchers)}

Monte as sugestões para manhã, tarde e noite deste dia.`;
}
