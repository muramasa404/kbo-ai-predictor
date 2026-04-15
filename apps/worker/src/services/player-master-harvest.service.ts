import { KboPlayerMasterCollector, type KboPlayerMasterInput } from '../collectors/kbo-player-master.collector'
import type { CollectorContext } from '../core/types'
import { NoopPlayerMasterUpserter, type PlayerMasterUpserter } from '../upserters/player-master.upserter'
import { NoopSourceSnapshotUpserter, type SourceSnapshotUpserter } from '../upserters/source-snapshot.upserter'

export class PlayerMasterHarvestService {
  constructor(
    private readonly collector: KboPlayerMasterCollector = new KboPlayerMasterCollector(),
    private readonly snapshotUpserter: SourceSnapshotUpserter = new NoopSourceSnapshotUpserter(),
    private readonly playerUpserter: PlayerMasterUpserter = new NoopPlayerMasterUpserter(),
  ) {}

  async run(input: KboPlayerMasterInput, context: CollectorContext): Promise<number> {
    const result = await this.collector.collect(input, context)
    await this.snapshotUpserter.upsert(result.snapshot)
    await this.playerUpserter.upsertPlayers(result.items)
    return result.items.length
  }
}
