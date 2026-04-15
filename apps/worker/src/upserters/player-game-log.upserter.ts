import type { KboGameDetailItem } from '../collectors/kbo-game-detail.collector'

export interface PlayerGameLogUpserter {
  upsertPlayerGameLogs(items: KboGameDetailItem[]): Promise<void>
}

export class NoopPlayerGameLogUpserter implements PlayerGameLogUpserter {
  async upsertPlayerGameLogs(_items: KboGameDetailItem[]): Promise<void> {
    return
  }
}
