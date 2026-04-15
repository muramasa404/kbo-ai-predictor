import { KboScheduleCollector } from '../collectors/kbo-schedule.collector'
import { ScheduleHarvestService } from '../services/schedule-harvest.service'
import { PrismaGameUpserter } from '../upserters/prisma-game.upserter'
import { PrismaSourceSnapshotUpserter } from '../upserters/prisma-source-snapshot.upserter'

export interface RunKboScheduleHarvestInput {
  seasonId: string
  year: number
  month: number
  date?: string
}

export async function runKboScheduleHarvest(input: RunKboScheduleHarvestInput): Promise<number> {
  const service = new ScheduleHarvestService(
    new KboScheduleCollector(),
    new PrismaSourceSnapshotUpserter(),
    new PrismaGameUpserter({ seasonId: input.seasonId }),
  )

  return service.run(
    {
      year: input.year,
      month: input.month,
      date: input.date,
      gameType: 'REGULAR_SEASON',
    },
    {
      mode: input.date ? 'intraday' : 'backfill',
      requestedAt: new Date().toISOString(),
      requestDateKey: input.date,
    },
  )
}
