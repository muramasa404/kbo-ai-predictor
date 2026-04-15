import { KboGameDetailCollector, type KboGameDetailInput } from '../collectors/kbo-game-detail.collector'
import type { CollectorContext } from '../core/types'
import { NoopSourceSnapshotUpserter, type SourceSnapshotUpserter } from '../upserters/source-snapshot.upserter'
import { NoopPlayerGameLogUpserter, type PlayerGameLogUpserter } from '../upserters/player-game-log.upserter'

export class GameDetailHarvestService {
  constructor(
    private readonly collector: KboGameDetailCollector = new KboGameDetailCollector(),
    private readonly snapshotUpserter: SourceSnapshotUpserter = new NoopSourceSnapshotUpserter(),
    private readonly playerGameLogUpserter: PlayerGameLogUpserter = new NoopPlayerGameLogUpserter(),
  ) {}

  async run(input: KboGameDetailInput, context: CollectorContext): Promise<number> {
    const result = await this.collector.collect(input, context)
    await this.snapshotUpserter.upsert(result.snapshot)
    await this.playerGameLogUpserter.upsertPlayerGameLogs(result.items)
    return result.items.length
  }
}
