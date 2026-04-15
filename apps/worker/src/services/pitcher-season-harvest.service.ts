import { KboPitcherSeasonCollector, type KboPitcherSeasonInput } from '../collectors/kbo-pitcher-season.collector'
import type { CollectorContext } from '../core/types'
import { NoopPitcherSeasonUpserter, type PitcherSeasonUpserter } from '../upserters/pitcher-season.upserter'
import { NoopSourceSnapshotUpserter, type SourceSnapshotUpserter } from '../upserters/source-snapshot.upserter'

export class PitcherSeasonHarvestService {
  constructor(
    private readonly collector: KboPitcherSeasonCollector = new KboPitcherSeasonCollector(),
    private readonly snapshotUpserter: SourceSnapshotUpserter = new NoopSourceSnapshotUpserter(),
    private readonly pitcherUpserter: PitcherSeasonUpserter = new NoopPitcherSeasonUpserter(),
  ) {}

  async run(input: KboPitcherSeasonInput, context: CollectorContext): Promise<number> {
    const result = await this.collector.collect(input, context)
    await this.snapshotUpserter.upsert(result.snapshot)
    await this.pitcherUpserter.upsertPitcherSeason(result.items)
    return result.items.length
  }
}
