import { z } from 'zod';

export const dailyScheduleEventSchema = z.object({
  title: z.string().describe("Título curto do evento (ex: 'Voo LA 3318 GRU -> FOR')."),
  content: z
    .string()
    .describe(
      'Markdown com tudo relacionado a este evento neste horário: horários, localizador, endereço, contatos relevantes. Usar SOMENTE dados dos vouchers fornecidos — nunca inventar informação ausente.',
    ),
  type: z
    .string()
    .describe(
      'voucher_type_slug de origem deste evento (ex: flight, accommodation, transfer, restaurant_reservation, car_rental, ferry_boat, experience, other).',
    ),
  observation: z
    .string()
    .nullable()
    .describe(
      'Preencha SOMENTE quando outro voucher também tocar este mesmo evento e complementar ou contradizer esta informação (cite de qual voucher vem cada dado). null quando só houver uma fonte para este evento.',
    ),
});

export const dailyScheduleDaySchema = z.object({
  date: z.string().describe('YYYY-MM-DD'),
  title: z.string().describe('Frase curta resumindo o evento mais relevante deste dia.'),
  events: z.object({
    morning: z.array(dailyScheduleEventSchema).describe('Eventos entre 00:00 e 11:59.'),
    afternoon: z.array(dailyScheduleEventSchema).describe('Eventos entre 12:00 e 17:59.'),
    night: z.array(dailyScheduleEventSchema).describe('Eventos entre 18:00 e 23:59.'),
  }),
});

// Array ESPARSO — só dias com pelo menos um evento (ver AGENTS.md: dias vazios não são mais
// armazenados, `travel_start_at`/`travel_end_at` bastam pra saber quais dias existem sem evento).
export const dailyScheduleSchema = z.array(dailyScheduleDaySchema);

// Saída de toda chamada ao agente (rebuild completo ou update incremental): o array de dias com
// evento + o range da viagem, que pode se expandir a cada novo voucher (ex: um voo mais cedo do
// que qualquer coisa já vista empurra `travel_start_at` pra trás).
export const dailyScheduleUpdateSchema = z.object({
  schedule: dailyScheduleSchema,
  travel_start_at: z.string().nullable().describe('YYYY-MM-DD — primeiro dia da viagem, ou null se não houver nenhuma data conhecida ainda.'),
  travel_end_at: z.string().nullable().describe('YYYY-MM-DD — último dia da viagem, ou null se não houver nenhuma data conhecida ainda.'),
});

export type DailyScheduleEvent = z.infer<typeof dailyScheduleEventSchema>;
export type DailyScheduleDay = z.infer<typeof dailyScheduleDaySchema>;
export type DailySchedule = z.infer<typeof dailyScheduleSchema>;
export type DailyScheduleUpdate = z.infer<typeof dailyScheduleUpdateSchema>;
