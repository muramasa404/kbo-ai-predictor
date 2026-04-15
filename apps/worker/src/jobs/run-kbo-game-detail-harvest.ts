import { KboGameDetailCollector } from '../collectors/kbo-game-detail.collector'
import { GameDetailHarvestService } from '../services/game-detail-harvest.service'
import { PrismaPlayerGameLogUpserter } from '../upserters/prisma-player-game-log.upserter'
import { PrismaSourceSnapshotUpserter } from '../upserters/prisma-source-snapshot.upserter'

export interface RunKboGameDetailHarvestInput {
  gameId: string
  url: string
  gameDate?: string
}

export async function runKboGameDetailHarvest(input: RunKboGameDetailHarvestInput): Promise<number> {
  const service = new GameDetailHarvestService(
    new KboGameDetailCollector(),
    new PrismaSourceSnapshotUpserter(),
    new PrismaPlayerGameLogUpserter({ gameId: input.gameId }),
  )

  return service.run(
    {
      url: input.url,
      gameDate: input.gameDate,
    },
    {
      mode: 'intraday',
      requestedAt: new Date().toISOString(),
      requestDateKey: input.gameDate,
    },
  )
}
