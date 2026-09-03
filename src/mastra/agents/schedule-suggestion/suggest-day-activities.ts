import { getTravelSchedule, getVoucherSummaries } from '../../services/travel-db';
import { isRelevant } from '../daily-schedule/rebuild-daily-schedule';
import { dailyScheduleSchema, type DailyScheduleDay } from '../daily-schedule/schema';
import { suggestActivitiesForDay } from './schedule-suggestion-agent';
import type { ScheduleSuggestionResult } from './schema';

// Usado só pelo endpoint `POST /travel_agent/schedule-suggestion` — não grava nada no banco (ao
// contrário de `generate-daily-schedule.ts`/`rebuild-daily-schedule.ts`), então não precisa do
// `withTravelScheduleLock`: só lê o `daily_schedule`/vouchers atuais e devolve sugestões pro
// usuário aprovar depois, num fluxo separado.
export async function suggestDayActivities(tenantId: string, travelId: string, day: string): Promise<ScheduleSuggestionResult> {
  const [scheduleState, vouchers] = await Promise.all([getTravelSchedule(tenantId, travelId), getVoucherSummaries(tenantId, travelId)]);

  // `dailySchedule` é `unknown[]` (ver `TravelScheduleState`) — revalida contra o schema real antes
  // de procurar o dia, em vez de confiar cegamente no formato salvo.
  const parsedSchedule = dailyScheduleSchema.safeParse(scheduleState.dailySchedule);
  const existingDay: DailyScheduleDay | null = parsedSchedule.success ? (parsedSchedule.data.find((d) => d.date === day) ?? null) : null;

  return suggestActivitiesForDay(day, existingDay, vouchers.filter(isRelevant), tenantId);
}
