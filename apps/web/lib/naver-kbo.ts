/**
 * Naver Sports KBO 실시간 데이터 fetcher
 * - 일정/스코어/상태: /schedule/games
 * - 선발 투수/시즌 스탯: /schedule/games/{gameId}/preview
 *
 * 공식 KBO 페이지는 ASP.NET PostBack 기반이라 파싱이 어려움.
 * Naver 모바일 스포츠 API는 JSON으로 안정적이고 라이브 갱신됨.
 */

export interface NaverStarter {
  name: string
  era: string
  record: string
  pCode?: string
}

export interface NaverKboGame {
  gameId: string
  date: string
  scheduledAt: string
  status: string
  statusInfo: string
  homeTeamCode: string
  homeTeamName: string
  awayTeamCode: string
  awayTeamName: string
  homeScore: number
  awayScore: number
  stadium?: string
  homeStarter: NaverStarter | null
  awayStarter: NaverStarter | null
}

const SCHEDULE_URL = 'https://api-gw.sports.naver.com/schedule/games'
const PREVIEW_URL = (gameId: string) =>
  `https://api-gw.sports.naver.com/schedule/games/${gameId}/preview`

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 12; SM-S908N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
  Referer: 'https://m.sports.naver.com/',
  Accept: 'application/json',
}

export async function fetchKboGamesForDate(date: string): Promise<NaverKboGame[]> {
  const url = `${SCHEDULE_URL}?fields=basic&upperCategoryId=kbaseball&fromDate=${date}&toDate=${date}`
  const res = await fetch(url, { headers: HEADERS, cache: 'no-store' })
  if (!res.ok) return []
  const json = (await res.json()) as { result?: { games?: RawNaverGame[] } }
  const all = json.result?.games ?? []
  const kbo = all.filter((g) => g.categoryId === 'kbo')

  const enriched = await Promise.all(
    kbo.map(async (g) => {
      const starters = await fetchStarters(g.gameId)
      return {
        gameId: g.gameId,
        date: g.gameDate,
        scheduledAt: g.gameDateTime,
        status: g.statusCode,
        statusInfo: g.statusInfo ?? '',
        homeTeamCode: g.homeTeamCode,
        homeTeamName: g.homeTeamName,
        awayTeamCode: g.awayTeamCode,
        awayTeamName: g.awayTeamName,
        homeScore: g.homeTeamScore ?? 0,
        awayScore: g.awayTeamScore ?? 0,
        homeStarter: starters.home,
        awayStarter: starters.away,
      } satisfies NaverKboGame
    }),
  )
  return enriched
}

async function fetchStarters(
  gameId: string,
): Promise<{ home: NaverStarter | null; away: NaverStarter | null }> {
  try {
    const res = await fetch(PREVIEW_URL(gameId), { headers: HEADERS, cache: 'no-store' })
    if (!res.ok) return { home: null, away: null }
    const json = (await res.json()) as {
      result?: { previewData?: { homeStarter?: RawStarter; awayStarter?: RawStarter } }
    }
    const pd = json.result?.previewData ?? {}
    return {
      home: extractStarter(pd.homeStarter),
      away: extractStarter(pd.awayStarter),
    }
  } catch {
    return { home: null, away: null }
  }
}

function extractStarter(s: RawStarter | undefined): NaverStarter | null {
  if (!s?.playerInfo?.name) return null
  const stats = s.currentSeasonStats ?? {}
  return {
    name: s.playerInfo.name,
    era: stats.era ? String(stats.era) : '-',
    record: `${stats.w ?? 0}승 ${stats.l ?? 0}패`,
    pCode: s.playerInfo.pCode,
  }
}

/* ───────── Internal raw shapes (defensive) ───────── */
interface RawNaverGame {
  gameId: string
  categoryId: string
  gameDate: string
  gameDateTime: string
  statusCode: string
  statusInfo?: string
  homeTeamCode: string
  homeTeamName: string
  homeTeamScore?: number
  awayTeamCode: string
  awayTeamName: string
  awayTeamScore?: number
}

interface RawStarter {
  playerInfo?: { name?: string; pCode?: string }
  currentSeasonStats?: {
    era?: string | number
    w?: number
    l?: number
    [k: string]: unknown
  }
}
