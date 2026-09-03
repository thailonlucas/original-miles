import { getApprovedSuggestions, getTravelSchedule, getVoucherSummaries } from '../../services/travel-db';
import { isRelevant } from '../daily-schedule/rebuild-daily-schedule';
import { dailyScheduleSchema, type DailyScheduleDay } from '../daily-schedule/schema';
import { suggestActivitiesForDay } from './schedule-suggestion-agent';
import type { ScheduleSuggestionResult } from './schema';

// Usado só pelo endpoint `POST /travel_agent/schedule-suggestion` — não grava nada no banco (ao
// contrário de `generate-daily-schedule.ts`/`rebuild-daily-schedule.ts`), então não precisa do
// `withTravelScheduleLock`: só lê o `daily_schedule`/vouchers/histórico de decisões atuais e
// devolve sugestões pro usuário aprovar depois, num fluxo separado
// (`routes/schedule-suggestion-decision-routes.ts`).
export async function suggestDayActivities(tenantId: string, travelId: string, day: string): Promise<ScheduleSuggestionResult> {
  const [scheduleState, vouchers, decisionHistory] = await Promise.all([
    getTravelSchedule(tenantId, travelId),
    getVoucherSummaries(tenantId, travelId),
    // "Inteligência" da viagem: sugestões já aprovadas/rejeitadas pelo cliente em chamadas
    // anteriores, pra calibrar o padrão das próximas sugestões (ver `prompts/system-prompt.ts`).
    getApprovedSuggestions(tenantId, travelId),
  ]);

  // `dailySchedule` é `unknown[]` (ver `TravelScheduleState`) — revalida contra o schema real antes
  // de procurar o dia, em vez de confiar cegamente no formato salvo.
  const parsedSchedule = dailyScheduleSchema.safeParse(scheduleState.dailySchedule);
  const fullSchedule: DailyScheduleDay[] = parsedSchedule.success ? parsedSchedule.data : [];
  const existingDay: DailyScheduleDay | null = fullSchedule.find((d) => d.date === day) ?? null;

  return suggestActivitiesForDay(day, existingDay, fullSchedule, vouchers.filter(isRelevant), decisionHistory, tenantId);
}
