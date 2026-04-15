import type { CollectorContext } from '../core/types'
import { NoopSourceSnapshotUpserter, type SourceSnapshotUpserter } from '../upserters/source-snapshot.upserter'
import { NoopGameUpserter, type GameUpserter } from '../upserters/game.upserter'
import { KboScheduleCollector, type KboScheduleInput } from '../collectors/kbo-schedule.collector'

export class ScheduleHarvestService {
  constructor(
    private readonly collector: KboScheduleCollector = new KboScheduleCollector(),
    private readonly snapshotUpserter: SourceSnapshotUpserter = new NoopSourceSnapshotUpserter(),
    private readonly gameUpserter: GameUpserter = new NoopGameUpserter(),
  ) {}

  async run(input: KboScheduleInput, context: CollectorContext): Promise<number> {
    const result = await this.collector.collect(input, context)
    await this.snapshotUpserter.upsert(result.snapshot)
    await this.gameUpserter.upsertSchedule(result.items)
    return result.items.length
  }
}
