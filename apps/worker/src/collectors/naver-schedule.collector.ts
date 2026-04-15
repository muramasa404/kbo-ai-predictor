import type { Collector, CollectorContext, CollectorResult } from '../core/types'
import { fetchHtml } from '../core/http'
import { sha256 } from '../core/hash'
import { SOURCE_URLS } from '../core/sources'

export interface NaverScheduleInput {
  date: string
}

export interface NaverScheduleItem {
  date: string
  homeTeamName: string
  awayTeamName: string
  status?: string
  previewUrl?: string
  gameCenterUrl?: string
  probableHomeStarterName?: string
  probableAwayStarterName?: string
}

export class NaverScheduleCollector implements Collector<NaverScheduleInput, NaverScheduleItem> {
  readonly sourceName = 'naver-schedule' as const

  async collect(input: NaverScheduleInput, context: CollectorContext): Promise<CollectorResult<NaverScheduleItem>> {
    const url = new URL(SOURCE_URLS.naverSchedule)
    url.searchParams.set('category', 'kbo')
    url.searchParams.set('date', input.date)

    const fetched = await fetchHtml(url.toString())

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
      items: [],
    }
  }
}
