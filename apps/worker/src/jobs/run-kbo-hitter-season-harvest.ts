import { KboHitterSeasonCollector } from '../collectors/kbo-hitter-season.collector'
import { HitterSeasonHarvestService } from '../services/hitter-season-harvest.service'
import { PrismaHitterSeasonUpserter } from '../upserters/prisma-hitter-season.upserter'
import { PrismaSourceSnapshotUpserter } from '../upserters/prisma-source-snapshot.upserter'

export interface RunKboHitterSeasonHarvestInput {
  seasonId: string
  seasonYear: number
}

export async function runKboHitterSeasonHarvest(input: RunKboHitterSeasonHarvestInput): Promise<number> {
  const service = new HitterSeasonHarvestService(
    new KboHitterSeasonCollector(),
    new PrismaSourceSnapshotUpserter(),
    new PrismaHitterSeasonUpserter(input.seasonId),
  )

  return service.run(
    { seasonYear: input.seasonYear, gameType: 'REGULAR_SEASON' },
    {
      mode: 'daily',
      requestedAt: new Date().toISOString(),
      requestDateKey: String(input.seasonYear),
    },
  )
}
