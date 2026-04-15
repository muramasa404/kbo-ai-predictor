import { KboTeamRankDailyCollector, type KboTeamRankDailyInput } from '../collectors/kbo-team-rank-daily.collector'
import type { CollectorContext } from '../core/types'
import { NoopSourceSnapshotUpserter, type SourceSnapshotUpserter } from '../upserters/source-snapshot.upserter'
import { NoopTeamRankUpserter, type TeamRankUpserter } from '../upserters/team-rank.upserter'

export class TeamRankHarvestService {
  constructor(
    private readonly collector: KboTeamRankDailyCollector = new KboTeamRankDailyCollector(),
    private readonly snapshotUpserter: SourceSnapshotUpserter = new NoopSourceSnapshotUpserter(),
    private readonly rankUpserter: TeamRankUpserter = new NoopTeamRankUpserter(),
  ) {}

  async run(input: KboTeamRankDailyInput, context: CollectorContext): Promise<number> {
    const result = await this.collector.collect(input, context)
    await this.snapshotUpserter.upsert(result.snapshot)
    await this.rankUpserter.upsertTeamRanks(result.items)
    return result.items.length
  }
}
