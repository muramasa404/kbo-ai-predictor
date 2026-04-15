import { KboPitcherSeasonCollector } from '../collectors/kbo-pitcher-season.collector'
import { PitcherSeasonHarvestService } from '../services/pitcher-season-harvest.service'
import { PrismaPitcherSeasonUpserter } from '../upserters/prisma-pitcher-season.upserter'
import { PrismaSourceSnapshotUpserter } from '../upserters/prisma-source-snapshot.upserter'

export interface RunKboPitcherSeasonHarvestInput {
  seasonId: string
  seasonYear: number
}

export async function runKboPitcherSeasonHarvest(input: RunKboPitcherSeasonHarvestInput): Promise<number> {
  const service = new PitcherSeasonHarvestService(
    new KboPitcherSeasonCollector(),
    new PrismaSourceSnapshotUpserter(),
    new PrismaPitcherSeasonUpserter(input.seasonId),
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
