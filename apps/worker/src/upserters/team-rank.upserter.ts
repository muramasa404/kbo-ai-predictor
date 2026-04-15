import type { KboTeamRankDailyItem } from '../collectors/kbo-team-rank-daily.collector'

export interface TeamRankUpserter {
  upsertTeamRanks(items: KboTeamRankDailyItem[]): Promise<void>
}

export class NoopTeamRankUpserter implements TeamRankUpserter {
  async upsertTeamRanks(_items: KboTeamRankDailyItem[]): Promise<void> {
    return
  }
}
