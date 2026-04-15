const KBO_HITTER_BASIC_URL = 'https://www.koreabaseball.com/Record/Player/HitterBasic/Basic1.aspx'
const DEFAULT_SORT = 'HRA_RT'

export interface KboHitterBasicItem {
  rank: number
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
  sacrificeBunts?: number
  sacrificeFlies?: number
}

export interface KboHitterBasicPayload {
  sort: string
  sourceUrl: string
  collectedAt: string
  items: KboHitterBasicItem[]
}

export async function getKboHitterBasic(sort = DEFAULT_SORT): Promise<KboHitterBasicPayload> {
  const url = new URL(KBO_HITTER_BASIC_URL)
  url.searchParams.set('sort', sort)

  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      pragma: 'no-cache',
      'cache-control': 'no-cache',
    },
  })

  if (!response.ok) {
    throw new Error(`KBO hitter basic fetch failed: ${response.status}`)
  }

  const html = await response.text()

  return {
    sort,
    sourceUrl: url.toString(),
    collectedAt: new Date().toISOString(),
    items: parseKboHitterBasicHtml(html),
  }
}

function parseKboHitterBasicHtml(html: string): KboHitterBasicItem[] {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]

  return rows
    .map((row) => [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => stripTags(cell[1])))
    .filter((cells) => cells.length >= 16)
    .filter((cells) => /^\d+$/.test(cells[0]) && cells[1].length > 0 && cells[2].length > 0)
    .map((cells) => ({
      rank: Number.parseInt(cells[0], 10),
      playerName: cells[1],
      teamName: cells[2],
      avg: cells[3],
      games: toInt(cells[4]),
      plateAppearances: toInt(cells[5]),
      atBats: toInt(cells[6]),
      runs: toInt(cells[7]),
      hits: toInt(cells[8]),
      doubles: toInt(cells[9]),
      triples: toInt(cells[10]),
      homeRuns: toInt(cells[11]),
      totalBases: toInt(cells[12]),
      runsBattedIn: toInt(cells[13]),
      sacrificeBunts: toInt(cells[14]),
      sacrificeFlies: toInt(cells[15]),
    }))
}

function stripTags(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
}

function toInt(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}
