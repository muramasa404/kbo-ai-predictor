import type { Collector, CollectorContext, CollectorResult } from '../core/types'
import { fetchHtml } from '../core/http'
import { sha256 } from '../core/hash'
import { SOURCE_URLS } from '../core/sources'
import { normalizeGameStatus } from '../normalizers/game-status'
import { normalizeTeamName } from '../normalizers/team'
import { parseKboScheduleHtml } from '../parsers/kbo-schedule.parser'

export interface KboScheduleInput {
  year: number
  month: number
  date?: string
  teamCode?: string
  gameType?: string
}

export interface KboScheduleItem {
  gameDate: string
  scheduledAt?: string
  homeTeamName: string
  awayTeamName: string
  status: string
  stadium?: string
  broadcastNames: string[]
  note?: string
  sourceGameKey?: string
}

export class KboScheduleCollector implements Collector<KboScheduleInput, KboScheduleItem> {
  readonly sourceName = 'kbo-schedule' as const

  async collect(input: KboScheduleInput, context: CollectorContext): Promise<CollectorResult<KboScheduleItem>> {
    const url = new URL(SOURCE_URLS.kboSchedule)
    if (input.date) {
      url.searchParams.set('date', input.date)
    }

    const fetched = await fetchHtml(url.toString())
    const parsedItems = parseKboScheduleHtml(fetched.html, input.date)
    const normalizedItems = parsedItems.map((item) => ({
      ...item,
      homeTeamName: normalizeTeamName(item.homeTeamName),
      awayTeamName: normalizeTeamName(item.awayTeamName),
      status: normalizeGameStatus(item.status),
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
