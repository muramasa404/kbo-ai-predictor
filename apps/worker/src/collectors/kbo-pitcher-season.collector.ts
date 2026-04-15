import type { Collector, CollectorContext, CollectorResult } from '../core/types'
import { fetchHtml } from '../core/http'
import { sha256 } from '../core/hash'
import { SOURCE_URLS } from '../core/sources'
import { normalizeTeamName } from '../normalizers/team'
import { parseKboPitcherSeasonHtml } from '../parsers/kbo-pitcher-season.parser'

export interface KboPitcherSeasonInput {
  seasonYear: number
  gameType?: string
  teamCode?: string
  page?: number
}

export interface KboPitcherSeasonItem {
  playerName: string
  teamName: string
  era?: string
  games?: number
  gamesStarted?: number
  wins?: number
  losses?: number
  saves?: number
  holds?: number
  inningsPitched?: string
  strikeOuts?: number
  walks?: number
  whip?: string
}

export class KboPitcherSeasonCollector implements Collector<KboPitcherSeasonInput, KboPitcherSeasonItem> {
  readonly sourceName = 'kbo-pitcher-season' as const

  async collect(input: KboPitcherSeasonInput, context: CollectorContext): Promise<CollectorResult<KboPitcherSeasonItem>> {
    const url = new URL(SOURCE_URLS.kboPitcherSeason)
    const fetched = await fetchHtml(url.toString())
    const parsedItems = parseKboPitcherSeasonHtml(fetched.html)

    return {
      snapshot: {
        sourceName: this.sourceName,
        requestUrl: url.toString(),
        requestDateKey: String(input.seasonYear),
        responseStatus: fetched.status,
        contentHash: sha256(fetched.html),
        rawBody: fetched.html,
        collectedAt: context.requestedAt,
      },
      items: parsedItems.map((item) => ({
        ...item,
        teamName: normalizeTeamName(item.teamName),
      })),
    }
  }
}
