/**
 * Naver Sports KBO live data fetcher.
 *
 * Combines:
 *   /schedule/games                         (schedule + status + scores)
 *   /schedule/games/{gameId}/preview        (starter, standings, h2h, lineups, top players, previous games)
 *
 * Naver returns published lineups / starters the moment each club announces
 * them (typically 1-2h before first pitch), plus full-season stats and head-
 * to-head context that the official KBO site only renders via JavaScript.
 */

export interface NaverStarter {
  name: string
  era: string
  record: string
  whip?: string
  strikeOuts?: number
  walks?: number
  inningsPitched?: string
  pCode?: string
  vsOpponent?: { era: string; record: string; inningsPitched: string } | null
}

export interface NaverStandings {
  rank: number
  wins: number
  losses: number
  draws: number
  winPct: string
  teamEra: string
  teamAvg: string
  teamHr: number
  recentSeriesOutcome?: { w: number; l: number; d: number }
}

export interface NaverTopPlayer {
  name: string
  seasonAvg: string
  seasonHr: number
  seasonRbi: number
  recentAvg: string
  recentHr: number
  recentRbi: number
  vsOpponentAvg: string
  vsOpponentHr: number
}

export interface NaverPreviousGame {
  date: string
  opponent: string
  homeAway: 'HOME' | 'AWAY'
  result: 'W' | 'L' | 'D'
  scoreFor: number
  scoreAgainst: number
}

export interface NaverHeadToHead {
  homeWins: number
  homeLosses: number
  homeDraws: number
  awayWins: number
  awayLosses: number
  awayDraws: number
}

export interface NaverLineupEntry {
  name: string
  position: string
  batsThrows: string
  backnum: string
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
  homeStandings: NaverStandings | null
  awayStandings: NaverStandings | null
  homeTopPlayer: NaverTopPlayer | null
  awayTopPlayer: NaverTopPlayer | null
  homePreviousGames: NaverPreviousGame[]
  awayPreviousGames: NaverPreviousGame[]
  homeLineup: NaverLineupEntry[]
  awayLineup: NaverLineupEntry[]
  headToHead: NaverHeadToHead | null
}

const SCHEDULE_URL = 'https://api-gw.sports.naver.com/schedule/games'
const PREVIEW_URL = (gameId: string) => `https://api-gw.sports.naver.com/schedule/games/${gameId}/preview`

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 12; SM-S908N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
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

  return Promise.all(kbo.map((g) => enrichGame(g)))
}

async function enrichGame(g: RawNaverGame): Promise<NaverKboGame> {
  const preview = await fetchPreview(g.gameId)
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
    homeStarter: preview.homeStarter,
    awayStarter: preview.awayStarter,
    homeStandings: preview.homeStandings,
    awayStandings: preview.awayStandings,
    homeTopPlayer: preview.homeTopPlayer,
    awayTopPlayer: preview.awayTopPlayer,
    homePreviousGames: preview.homePreviousGames,
    awayPreviousGames: preview.awayPreviousGames,
    homeLineup: preview.homeLineup,
    awayLineup: preview.awayLineup,
    headToHead: preview.headToHead,
  }
}

interface ParsedPreview {
  homeStarter: NaverStarter | null
  awayStarter: NaverStarter | null
  homeStandings: NaverStandings | null
  awayStandings: NaverStandings | null
  homeTopPlayer: NaverTopPlayer | null
  awayTopPlayer: NaverTopPlayer | null
  homePreviousGames: NaverPreviousGame[]
  awayPreviousGames: NaverPreviousGame[]
  homeLineup: NaverLineupEntry[]
  awayLineup: NaverLineupEntry[]
  headToHead: NaverHeadToHead | null
}

const EMPTY_PREVIEW: ParsedPreview = {
  homeStarter: null, awayStarter: null,
  homeStandings: null, awayStandings: null,
  homeTopPlayer: null, awayTopPlayer: null,
  homePreviousGames: [], awayPreviousGames: [],
  homeLineup: [], awayLineup: [],
  headToHead: null,
}

async function fetchPreview(gameId: string): Promise<ParsedPreview> {
  try {
    const res = await fetch(PREVIEW_URL(gameId), { headers: HEADERS, cache: 'no-store' })
    if (!res.ok) return EMPTY_PREVIEW
    const json = (await res.json()) as { result?: { previewData?: RawPreview } }
    const pd = json.result?.previewData
    if (!pd) return EMPTY_PREVIEW

    const homeCode = pd.gameInfo?.hCode
    const awayCode = pd.gameInfo?.aCode

    return {
      homeStarter: parseStarter(pd.homeStarter),
      awayStarter: parseStarter(pd.awayStarter),
      homeStandings: parseStandings(pd.homeStandings),
      awayStandings: parseStandings(pd.awayStandings),
      homeTopPlayer: parseTopPlayer(pd.homeTopPlayer),
      awayTopPlayer: parseTopPlayer(pd.awayTopPlayer),
      homePreviousGames: (pd.homeTeamPreviousGames ?? []).map((x) => parsePreviousGame(x, homeCode)).filter(Boolean) as NaverPreviousGame[],
      awayPreviousGames: (pd.awayTeamPreviousGames ?? []).map((x) => parsePreviousGame(x, awayCode)).filter(Boolean) as NaverPreviousGame[],
      homeLineup: (pd.homeTeamLineUp?.fullLineUp ?? []).map(parseLineupEntry),
      awayLineup: (pd.awayTeamLineUp?.fullLineUp ?? []).map(parseLineupEntry),
      headToHead: parseHeadToHead(pd.seasonVsResult, homeCode, awayCode),
    }
  } catch {
    return EMPTY_PREVIEW
  }
}

function parseStarter(s: RawStarter | undefined): NaverStarter | null {
  if (!s?.playerInfo?.name) return null
  const stats = s.currentSeasonStats ?? {}
  const vs = s.currentSeasonStatsOnOpponents
  const vsOpponent = vs && Number(vs.gameCount) > 0
    ? { era: String(vs.era ?? '-'), record: `${vs.w ?? 0}승 ${vs.l ?? 0}패`, inningsPitched: String(vs.inn ?? '0') }
    : null
  return {
    name: s.playerInfo.name,
    era: stats.era ? String(stats.era) : '-',
    record: `${stats.w ?? 0}승 ${stats.l ?? 0}패`,
    whip: stats.whip ? String(stats.whip) : undefined,
    strikeOuts: typeof stats.kk === 'number' ? stats.kk : undefined,
    walks: typeof stats.bb === 'number' ? stats.bb : undefined,
    inningsPitched: stats.inn ? String(stats.inn) : undefined,
    pCode: s.playerInfo.pCode,
    vsOpponent,
  }
}

function parseStandings(s: RawStandings | undefined): NaverStandings | null {
  if (!s || typeof s.rank !== 'number') return null
  return {
    rank: s.rank,
    wins: s.w ?? 0,
    losses: s.l ?? 0,
    draws: s.d ?? 0,
    winPct: s.wra ? String(s.wra) : '0',
    teamEra: s.era ? String(s.era) : '-',
    teamAvg: s.hra ? String(s.hra) : '-',
    teamHr: s.hr ?? 0,
    recentSeriesOutcome: s.seriesOutcome ? { w: s.seriesOutcome.w ?? 0, l: s.seriesOutcome.l ?? 0, d: s.seriesOutcome.d ?? 0 } : undefined,
  }
}

function parseTopPlayer(p: RawTopPlayer | undefined): NaverTopPlayer | null {
  if (!p?.playerInfo?.name) return null
  const season = p.currentSeasonStats ?? {}
  const recent = p.recentFiveGamesStats ?? {}
  const vs = p.currentSeasonStatsOnOpponents ?? {}
  return {
    name: p.playerInfo.name,
    seasonAvg: season.hra ? String(season.hra) : '-',
    seasonHr: typeof season.hr === 'number' ? season.hr : 0,
    seasonRbi: typeof season.rbi === 'number' ? season.rbi : 0,
    recentAvg: recent.hra ? String(recent.hra) : '-',
    recentHr: typeof recent.hr === 'number' ? recent.hr : 0,
    recentRbi: typeof recent.rbi === 'number' ? recent.rbi : 0,
    vsOpponentAvg: vs.hra ? String(vs.hra) : '-',
    vsOpponentHr: typeof vs.hr === 'number' ? vs.hr : 0,
  }
}

function parsePreviousGame(g: RawPreviousGame, perspectiveCode: string | undefined): NaverPreviousGame | null {
  if (!perspectiveCode) return null
  const isHome = g.hCode === perspectiveCode
  const scoreFor = isHome ? g.hScore : g.aScore
  const scoreAgainst = isHome ? g.aScore : g.hScore
  const opponent = isHome ? g.aName : g.hName
  const result: 'W' | 'L' | 'D' = scoreFor > scoreAgainst ? 'W' : scoreFor < scoreAgainst ? 'L' : 'D'
  return {
    date: String(g.gdate ?? ''),
    opponent: opponent ?? '-',
    homeAway: isHome ? 'HOME' : 'AWAY',
    result,
    scoreFor: scoreFor ?? 0,
    scoreAgainst: scoreAgainst ?? 0,
  }
}

function parseLineupEntry(e: RawLineupEntry): NaverLineupEntry {
  return {
    name: e.playerName ?? '-',
    position: e.positionName ?? e.position ?? '-',
    batsThrows: e.batsThrows ?? e.hitType ?? '-',
    backnum: e.backnum ?? '-',
  }
}

function parseHeadToHead(raw: RawHeadToHead | undefined, homeCode: string | undefined, awayCode: string | undefined): NaverHeadToHead | null {
  if (!raw || !homeCode || !awayCode) return null
  const homeWins = toInt(raw.hw); const homeLosses = toInt(raw.hl); const homeDraws = toInt(raw.hd)
  const awayWins = toInt(raw.aw); const awayLosses = toInt(raw.al); const awayDraws = toInt(raw.ad)
  if (homeWins + homeLosses + homeDraws + awayWins + awayLosses + awayDraws === 0) return null
  return { homeWins, homeLosses, homeDraws, awayWins, awayLosses, awayDraws }
}

function toInt(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0 }

/* ───────── Internal raw shapes ───────── */
interface RawNaverGame {
  gameId: string; categoryId: string; gameDate: string; gameDateTime: string
  statusCode: string; statusInfo?: string
  homeTeamCode: string; homeTeamName: string; homeTeamScore?: number
  awayTeamCode: string; awayTeamName: string; awayTeamScore?: number
}

interface RawPreview {
  gameInfo?: { hCode?: string; aCode?: string; hName?: string; aName?: string }
  homeStarter?: RawStarter; awayStarter?: RawStarter
  homeStandings?: RawStandings; awayStandings?: RawStandings
  homeTopPlayer?: RawTopPlayer; awayTopPlayer?: RawTopPlayer
  homeTeamPreviousGames?: RawPreviousGame[]; awayTeamPreviousGames?: RawPreviousGame[]
  homeTeamLineUp?: { fullLineUp?: RawLineupEntry[] }; awayTeamLineUp?: { fullLineUp?: RawLineupEntry[] }
  seasonVsResult?: RawHeadToHead
}

interface RawStarter {
  playerInfo?: { name?: string; pCode?: string }
  currentSeasonStats?: { era?: unknown; w?: number; l?: number; whip?: unknown; kk?: number; bb?: number; inn?: unknown }
  currentSeasonStatsOnOpponents?: { era?: unknown; w?: number | string; l?: number | string; inn?: unknown; gameCount?: number | string }
}

interface RawStandings {
  rank?: number; w?: number; l?: number; d?: number
  wra?: unknown; era?: unknown; hra?: unknown; hr?: number
  seriesOutcome?: { w?: number; l?: number; d?: number }
}

interface RawTopPlayer {
  playerInfo?: { name?: string }
  currentSeasonStats?: { hra?: unknown; hr?: number; rbi?: number }
  recentFiveGamesStats?: { hra?: unknown; hr?: number; rbi?: number }
  currentSeasonStatsOnOpponents?: { hra?: unknown; hr?: number }
}

interface RawPreviousGame { hCode: string; aCode: string; hName?: string; aName?: string; hScore: number; aScore: number; gdate?: number | string }
interface RawLineupEntry { playerName?: string; positionName?: string; position?: string; batsThrows?: string; hitType?: string; backnum?: string }
interface RawHeadToHead { hw?: unknown; hl?: unknown; hd?: unknown; aw?: unknown; al?: unknown; ad?: unknown }
