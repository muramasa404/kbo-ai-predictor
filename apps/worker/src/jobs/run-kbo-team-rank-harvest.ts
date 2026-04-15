import { KboTeamRankDailyCollector } from '../collectors/kbo-team-rank-daily.collector'
import { TeamRankHarvestService } from '../services/team-rank-harvest.service'
import { PrismaSourceSnapshotUpserter } from '../upserters/prisma-source-snapshot.upserter'
import { PrismaTeamRankUpserter } from '../upserters/prisma-team-rank.upserter'

export interface RunKboTeamRankHarvestInput {
  seasonId: string
  date: string
  seasonYear: number
}

export async function runKboTeamRankHarvest(input: RunKboTeamRankHarvestInput): Promise<number> {
  const service = new TeamRankHarvestService(
    new KboTeamRankDailyCollector(),
    new PrismaSourceSnapshotUpserter(),
    new PrismaTeamRankUpserter(input.seasonId),
  )

  return service.run(
    { date: input.date, seasonYear: input.seasonYear },
    {
      mode: 'daily',
      requestedAt: new Date().toISOString(),
      requestDateKey: input.date,
    },
  )
}
