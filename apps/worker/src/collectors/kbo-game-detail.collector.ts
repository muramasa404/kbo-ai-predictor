import type { Collector, CollectorContext, CollectorResult } from '../core/types'
import { fetchHtml } from '../core/http'
import { sha256 } from '../core/hash'

export interface KboGameDetailInput {
  url: string
  gameDate?: string
}

export interface KboGameDetailItem {
  gameDate?: string
  playerName: string
  teamName: string
  roleType: 'HITTER' | 'STARTING_PITCHER' | 'RELIEF_PITCHER'
  battingOrder?: number
  positionPlayed?: string
  startedFlag: boolean
  rawStatsJson: Record<string, unknown>
}

export class KboGameDetailCollector implements Collector<KboGameDetailInput, KboGameDetailItem> {
  readonly sourceName = 'kbo-game-detail' as const

  async collect(input: KboGameDetailInput, context: CollectorContext): Promise<CollectorResult<KboGameDetailItem>> {
    const fetched = await fetchHtml(input.url)
    const { parseKboGameDetailHtml } = await import('../parsers/kbo-game-detail.parser')
    const items = parseKboGameDetailHtml(fetched.html, input.gameDate)

    return {
      snapshot: {
        sourceName: this.sourceName,
        requestUrl: input.url,
        requestDateKey: input.gameDate ?? context.requestDateKey,
        responseStatus: fetched.status,
        contentHash: sha256(fetched.html),
        rawBody: fetched.html,
        collectedAt: context.requestedAt,
      },
      items,
    }
  }
}
