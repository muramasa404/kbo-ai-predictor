import type { KboHitterSeasonItem } from '../collectors/kbo-hitter-season.collector'

export interface HitterSeasonUpserter {
  upsertHitterSeason(items: KboHitterSeasonItem[]): Promise<void>
}

export class NoopHitterSeasonUpserter implements HitterSeasonUpserter {
  async upsertHitterSeason(_items: KboHitterSeasonItem[]): Promise<void> {
    return
  }
}
