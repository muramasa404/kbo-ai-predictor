import type { Collector, CollectorContext, CollectorResult } from '../core/types'
import { fetchHtml } from '../core/http'
import { sha256 } from '../core/hash'
import { SOURCE_URLS } from '../core/sources'
import { normalizeTeamName } from '../normalizers/team'
import { parseKboHitterSeasonHtml } from '../parsers/kbo-hitter-season.parser'

export interface KboHitterSeasonInput {
  seasonYear: number
  gameType?: string
  teamCode?: string
  page?: number
}

export interface KboHitterSeasonItem {
  playerName: string
  teamName: string
  avg?: string
  games?: number
  plateAppearances?: number
  atBats?: number
  runs?: number
  hits?: number
  doubles?: number
  triples?: number
  homeRuns?: number
  totalBases?: number
  runsBattedIn?: number
}

export class KboHitterSeasonCollector implements Collector<KboHitterSeasonInput, KboHitterSeasonItem> {
  readonly sourceName = 'kbo-hitter-season' as const

  async collect(input: KboHitterSeasonInput, context: CollectorContext): Promise<CollectorResult<KboHitterSeasonItem>> {
    const url = new URL(SOURCE_URLS.kboHitterSeason)
    const fetched = await fetchHtml(url.toString())
    const parsedItems = parseKboHitterSeasonHtml(fetched.html)

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
      items: parsedItems.map((item) => ({ ...item, teamName: normalizeTeamName(item.teamName) })),
    }
  }
}
