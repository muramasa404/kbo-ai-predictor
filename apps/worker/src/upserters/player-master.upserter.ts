import type { KboPlayerMasterItem } from '../collectors/kbo-player-master.collector'

export interface PlayerMasterUpserter {
  upsertPlayers(items: KboPlayerMasterItem[]): Promise<void>
}

export class NoopPlayerMasterUpserter implements PlayerMasterUpserter {
  async upsertPlayers(_items: KboPlayerMasterItem[]): Promise<void> {
    return
  }
}
