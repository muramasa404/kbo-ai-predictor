import type { Collector, CollectorContext, CollectorResult } from '../core/types'
import { fetchHtml } from '../core/http'
import { sha256 } from '../core/hash'
import { SOURCE_URLS } from '../core/sources'
import { normalizeTeamName } from '../normalizers/team'
import { parseKboTeamRankDailyHtml } from '../parsers/kbo-team-rank-daily.parser'

export interface KboTeamRankDailyInput {
  date: string
  seasonYear: number
}

export interface KboTeamRankDailyItem {
  rankDate: string
  teamName: string
  rank: number
  games: number
  wins: number
  losses: number
  draws: number
  winPct: string
  gamesBack?: string
  last10?: string
  streak?: string
  homeRecord?: string
  awayRecord?: string
}

export class KboTeamRankDailyCollector implements Collector<KboTeamRankDailyInput, KboTeamRankDailyItem> {
  readonly sourceName = 'kbo-team-rank-daily' as const

  async collect(input: KboTeamRankDailyInput, context: CollectorContext): Promise<CollectorResult<KboTeamRankDailyItem>> {
    const url = new URL(SOURCE_URLS.kboTeamRankDaily)
    const fetched = await fetchHtml(url.toString())
    const parsedItems = parseKboTeamRankDailyHtml(fetched.html, input.date)
    const normalizedItems = parsedItems.map((item) => ({
      ...item,
      teamName: normalizeTeamName(item.teamName),
    }))

    return {
      snapshot: {
        sourceName: this.sourceName,
        requestUrl: url.toString(),
        requestDateKey: input.date ?? context.requestDateKey,
        responseStatus: fetched.status,
        contentHash: sha256(fetched.html),
        rawBody: fetched.html,
        collectedAt: context.requestedAt,
      },
      items: normalizedItems,
    }
  }
}
