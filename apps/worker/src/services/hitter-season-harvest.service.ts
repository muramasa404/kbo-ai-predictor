import { KboHitterSeasonCollector, type KboHitterSeasonInput } from '../collectors/kbo-hitter-season.collector'
import type { CollectorContext } from '../core/types'
import { NoopHitterSeasonUpserter, type HitterSeasonUpserter } from '../upserters/hitter-season.upserter'
import { NoopSourceSnapshotUpserter, type SourceSnapshotUpserter } from '../upserters/source-snapshot.upserter'

export class HitterSeasonHarvestService {
  constructor(
    private readonly collector: KboHitterSeasonCollector = new KboHitterSeasonCollector(),
    private readonly snapshotUpserter: SourceSnapshotUpserter = new NoopSourceSnapshotUpserter(),
    private readonly hitterUpserter: HitterSeasonUpserter = new NoopHitterSeasonUpserter(),
  ) {}

  async run(input: KboHitterSeasonInput, context: CollectorContext): Promise<number> {
    const result = await this.collector.collect(input, context)
    await this.snapshotUpserter.upsert(result.snapshot)
    await this.hitterUpserter.upsertHitterSeason(result.items)
    return result.items.length
  }
}
