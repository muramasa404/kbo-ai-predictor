import type { KboScheduleItem } from '../collectors/kbo-schedule.collector'

export interface GameUpserter {
  upsertSchedule(items: KboScheduleItem[]): Promise<void>
}

export class NoopGameUpserter implements GameUpserter {
  async upsertSchedule(_items: KboScheduleItem[]): Promise<void> {
    return
  }
}
