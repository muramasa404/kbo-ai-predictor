import { KboPlayerMasterCollector } from '../collectors/kbo-player-master.collector'
import { PlayerMasterHarvestService } from '../services/player-master-harvest.service'
import { PrismaPlayerMasterUpserter } from '../upserters/prisma-player-master.upserter'
import { PrismaSourceSnapshotUpserter } from '../upserters/prisma-source-snapshot.upserter'

export interface RunKboPlayerMasterHarvestInput {
  teamCode?: string
  page?: number
}

export async function runKboPlayerMasterHarvest(input: RunKboPlayerMasterHarvestInput): Promise<number> {
  const service = new PlayerMasterHarvestService(
    new KboPlayerMasterCollector(),
    new PrismaSourceSnapshotUpserter(),
    new PrismaPlayerMasterUpserter(),
  )

  return service.run(
    {
      teamCode: input.teamCode,
      page: input.page,
    },
    {
      mode: 'daily',
      requestedAt: new Date().toISOString(),
    },
  )
}
