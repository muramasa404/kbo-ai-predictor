import type { Collector, CollectorContext, CollectorResult } from '../core/types'
import { fetchHtml } from '../core/http'
import { sha256 } from '../core/hash'
import { SOURCE_URLS } from '../core/sources'
import { normalizeTeamName } from '../normalizers/team'
import { parseKboPlayerMasterHtml } from '../parsers/kbo-player-master.parser'

export interface KboPlayerMasterInput {
  teamCode?: string
  page?: number
}

export interface KboPlayerMasterItem {
  sourcePlayerId?: string
  nameKo: string
  teamName?: string
  positionPrimary?: string
  throwsHand?: string
  batsHand?: string
  birthDate?: string
  heightCm?: number
  weightKg?: number
  debutYear?: number
}

export class KboPlayerMasterCollector implements Collector<KboPlayerMasterInput, KboPlayerMasterItem> {
  readonly sourceName = 'kbo-player-master' as const

  async collect(input: KboPlayerMasterInput, context: CollectorContext): Promise<CollectorResult<KboPlayerMasterItem>> {
    const url = new URL(SOURCE_URLS.kboPlayerSearch)
    if (input.teamCode) {
      url.searchParams.set('teamCode', input.teamCode)
    }

    if (typeof input.page === 'number') {
      url.searchParams.set('page', String(input.page))
    }

    const fetched = await fetchHtml(url.toString())
    const parsedItems = parseKboPlayerMasterHtml(fetched.html)
    const normalizedItems = parsedItems.map((item) => ({
      ...item,
      teamName: item.teamName ? normalizeTeamName(item.teamName) : undefined,
    }))

    return {
      snapshot: {
        sourceName: this.sourceName,
        requestUrl: url.toString(),
        requestDateKey: context.requestDateKey,
        responseStatus: fetched.status,
        contentHash: sha256(fetched.html),
        rawBody: fetched.html,
        collectedAt: context.requestedAt,
      },
      items: normalizedItems,
    }
  }
}
