import { enumerateDateRange } from '../core/dates'
import { NaverScheduleCollector } from '../collectors/naver-schedule.collector'

export interface BackfillNaverScheduleInput {
  from: string
  to: string
}

export async function backfillNaverSchedule(input: BackfillNaverScheduleInput): Promise<void> {
  const collector = new NaverScheduleCollector()
  const dates = enumerateDateRange(input.from, input.to)

  for (const date of dates) {
    await collector.collect(
      { date },
      {
        mode: 'backfill',
        requestedAt: new Date().toISOString(),
        requestDateKey: date,
      },
    )
  }
}
