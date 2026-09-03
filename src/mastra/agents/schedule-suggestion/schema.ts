import { z } from 'zod';

// Mesmo formato de um evento do daily_schedule (ver `agents/daily-schedule/schema.ts` ->
// `dailyScheduleEventSchema`) + "reason", que existe só pra ajudar o usuário a decidir se aprova a
// sugestão — ao aprovar, `title`/`content`/`type`/`observation` são gravados exatamente como um
// evento novo no dia (a UI descarta "reason" nesse momento).
export const scheduleSuggestionEventSchema = z.object({
  title: z.string().describe("Título curto da atividade sugerida (ex: 'Museu do Louvre')."),
  content: z
    .string()
    .describe(
      'Markdown com os detalhes da atividade sugerida (o que é, região/endereço aproximado, duração estimada). Mesmo padrão de conteúdo ' +
        'de um evento normal do roteiro — ao ser aprovada, esta sugestão é gravada exatamente como um evento novo do dia.',
    ),
  type: z
    .string()
    .describe(
      'Categoria da sugestão, mesma convenção do `type` usado nos eventos do daily_schedule (ex: experience, restaurant_reservation, other).',
    ),
  observation: z
    .string()
    .nullable()
    .describe('Mesmo campo usado nos eventos do roteiro — normalmente null pra uma sugestão nova, a menos que ela conflite com algo já confirmado.'),
  reason: z
    .string()
    .describe(
      'Por que esta sugestão faz sentido para este dia/período: proximidade geográfica com um evento já confirmado, sequência lógica de ' +
        'horário, período livre etc. Não é gravado no roteiro final — é só contexto para o usuário decidir se aprova.',
    ),
});

export const scheduleSuggestionPeriodSchema = z.object({
  has_existing_events: z.boolean().describe('true se este período (manhã/tarde/noite) já tem pelo menos um evento confirmado no roteiro atual.'),
  suggestions: z
    .array(scheduleSuggestionEventSchema)
    .describe(
      'Sugestões para este período: complementares (poucas, só o que agregar de verdade) se já houver evento confirmado, ou um conjunto de ' +
        'opções (normalmente 3) se o período estiver livre.',
    ),
});

export const scheduleSuggestionResultSchema = z.object({
  date: z.string().describe('YYYY-MM-DD — dia consultado.'),
  morning: scheduleSuggestionPeriodSchema.describe('Sugestões para o período entre 00:00 e 11:59.'),
  afternoon: scheduleSuggestionPeriodSchema.describe('Sugestões para o período entre 12:00 e 17:59.'),
  night: scheduleSuggestionPeriodSchema.describe('Sugestões para o período entre 18:00 e 23:59.'),
});

export type ScheduleSuggestionEvent = z.infer<typeof scheduleSuggestionEventSchema>;
export type ScheduleSuggestionPeriod = z.infer<typeof scheduleSuggestionPeriodSchema>;
export type ScheduleSuggestionResult = z.infer<typeof scheduleSuggestionResultSchema>;
