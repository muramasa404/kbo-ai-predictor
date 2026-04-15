import type { KboPitcherSeasonItem } from '../collectors/kbo-pitcher-season.collector'

export interface PitcherSeasonUpserter {
  upsertPitcherSeason(items: KboPitcherSeasonItem[]): Promise<void>
}

export class NoopPitcherSeasonUpserter implements PitcherSeasonUpserter {
  async upsertPitcherSeason(_items: KboPitcherSeasonItem[]): Promise<void> {
    return
  }
}
