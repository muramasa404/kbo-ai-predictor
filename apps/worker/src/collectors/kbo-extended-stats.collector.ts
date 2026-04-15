import { fetchHtml } from '../core/http'
import { sha256 } from '../core/hash'
import { normalizeTeamName } from '../normalizers/team'
import { extractTableRows } from '../parsers/html'
import type { SourceSnapshotPayload } from '../core/types'

const URLS = {
  hitterBasicOld: 'https://www.koreabaseball.com/Record/Player/HitterBasic/BasicOld.aspx',
  hitterDetail1: 'https://www.koreabaseball.com/Record/Player/HitterBasic/Detail1.aspx',
  pitcherBasicOld: 'https://www.koreabaseball.com/Record/Player/PitcherBasic/BasicOld.aspx',
  pitcherDetail1: 'https://www.koreabaseball.com/Record/Player/PitcherBasic/Detail1.aspx',
  runner: 'https://www.koreabaseball.com/Record/Player/Runner/Basic.aspx',
}

export interface ExtendedHitterStat {
  playerName: string
  teamName: string
  avg: number
  games: number
  pa: number
  ab: number
  hits: number
  doubles: number
  triples: number
  hr: number
  rbi: number
  sb: number
  cs: number
  bb: number
  hbp: number
  so: number
  gdp: number
  errors: number
  // Detail1 fields (joined by name+team)
  xbh?: number
  goAo?: number
  gwRbi?: number
  bbK?: number
  pPa?: number
  isop?: number
  xr?: number
  gpa?: number
}

export interface ExtendedPitcherStat {
  playerName: string
  teamName: string
  era: number
  games: number
  cg: number
  sho: number
  wins: number
  losses: number
  saves: number
  holds: number
  winPct: number
  tbf: number
  ip: number
  hitsAllowed: number
  hrAllowed: number
  bb: number
  hbp: number
  so: number
  runs: number
  earnedRuns: number
  // Detail1 fields
  gs?: number
  wgs?: number
  wgr?: number
  gf?: number
  svo?: number
  gdp?: number
  goAo?: number
}

export interface RunnerStat {
  playerName: string
  teamName: string
  games: number
  sba: number
  sb: number
  cs: number
  sbPct: number
}

export interface ExtendedStatsResult {
  hitters: ExtendedHitterStat[]
  pitchers: ExtendedPitcherStat[]
  runners: RunnerStat[]
  snapshots: SourceSnapshotPayload[]
}

function toNum(v: string): number {
  const n = parseFloat(v.replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

export async function collectExtendedStats(): Promise<ExtendedStatsResult> {
  const now = new Date().toISOString()
  const snapshots: SourceSnapshotPayload[] = []

  // Fetch all pages in parallel
  const [hbRes, hdRes, pbRes, pdRes, rnRes] = await Promise.all([
    fetchHtml(URLS.hitterBasicOld),
    fetchHtml(URLS.hitterDetail1),
    fetchHtml(URLS.pitcherBasicOld),
    fetchHtml(URLS.pitcherDetail1),
    fetchHtml(URLS.runner),
  ])

  for (const [name, res, url] of [
    ['kbo-hitter-basic-old', hbRes, URLS.hitterBasicOld],
    ['kbo-hitter-detail1', hdRes, URLS.hitterDetail1],
    ['kbo-pitcher-basic-old', pbRes, URLS.pitcherBasicOld],
    ['kbo-pitcher-detail1', pdRes, URLS.pitcherDetail1],
    ['kbo-runner', rnRes, URLS.runner],
  ] as const) {
    snapshots.push({
      sourceName: 'kbo-hitter-season',
      requestUrl: url,
      requestDateKey: name,
      responseStatus: res.status,
      contentHash: sha256(res.html),
      rawBody: undefined, // skip storing large HTML to save space
      collectedAt: now,
    })
  }

  // Parse hitter basic old (19 cols)
  const hbRows = extractTableRows(hbRes.html)
    .filter(c => c.length >= 19 && /^\d+$/.test(c[0]))
  const hitterMap = new Map<string, ExtendedHitterStat>()
  for (const c of hbRows) {
    const key = `${c[1]}_${normalizeTeamName(c[2])}`
    hitterMap.set(key, {
      playerName: c[1], teamName: normalizeTeamName(c[2]),
      avg: toNum(c[3]), games: toNum(c[4]), pa: toNum(c[5]), ab: toNum(c[6]),
      hits: toNum(c[7]), doubles: toNum(c[8]), triples: toNum(c[9]), hr: toNum(c[10]),
      rbi: toNum(c[11]), sb: toNum(c[12]), cs: toNum(c[13]),
      bb: toNum(c[14]), hbp: toNum(c[15]), so: toNum(c[16]),
      gdp: toNum(c[17]), errors: toNum(c[18]),
    })
  }

  // Merge hitter detail1 (14 cols)
  const hdRows = extractTableRows(hdRes.html)
    .filter(c => c.length >= 14 && /^\d+$/.test(c[0]))
  for (const c of hdRows) {
    const key = `${c[1]}_${normalizeTeamName(c[2])}`
    const h = hitterMap.get(key)
    if (h) {
      h.xbh = toNum(c[4])
      h.goAo = toNum(c[7])
      h.gwRbi = toNum(c[8])
      h.bbK = toNum(c[9])
      h.pPa = toNum(c[10])
      h.isop = toNum(c[11])
      h.xr = toNum(c[12])
      h.gpa = toNum(c[13])
    }
  }

  // Parse pitcher basic old (21 cols)
  const pbRows = extractTableRows(pbRes.html)
    .filter(c => c.length >= 21 && /^\d+$/.test(c[0]))
  const pitcherMap = new Map<string, ExtendedPitcherStat>()
  for (const c of pbRows) {
    const key = `${c[1]}_${normalizeTeamName(c[2])}`
    pitcherMap.set(key, {
      playerName: c[1], teamName: normalizeTeamName(c[2]),
      era: toNum(c[3]), games: toNum(c[4]), cg: toNum(c[5]), sho: toNum(c[6]),
      wins: toNum(c[7]), losses: toNum(c[8]), saves: toNum(c[9]), holds: toNum(c[10]),
      winPct: toNum(c[11]), tbf: toNum(c[12]), ip: toNum(c[13]),
      hitsAllowed: toNum(c[14]), hrAllowed: toNum(c[15]),
      bb: toNum(c[16]), hbp: toNum(c[17]), so: toNum(c[18]),
      runs: toNum(c[19]), earnedRuns: toNum(c[20]),
    })
  }

  // Merge pitcher detail1 (14 cols)
  const pdRows = extractTableRows(pdRes.html)
    .filter(c => c.length >= 14 && /^\d+$/.test(c[0]))
  for (const c of pdRows) {
    const key = `${c[1]}_${normalizeTeamName(c[2])}`
    const p = pitcherMap.get(key)
    if (p) {
      p.gs = toNum(c[4])
      p.wgs = toNum(c[5])
      p.wgr = toNum(c[6])
      p.gf = toNum(c[7])
      p.svo = toNum(c[8])
      p.gdp = toNum(c[10])
      p.goAo = toNum(c[13])
    }
  }

  // Parse runner (10 cols)
  const rnRows = extractTableRows(rnRes.html)
    .filter(c => c.length >= 10 && /^\d+$/.test(c[0]))
  const runners: RunnerStat[] = rnRows.map(c => ({
    playerName: c[1], teamName: normalizeTeamName(c[2]),
    games: toNum(c[3]), sba: toNum(c[4]), sb: toNum(c[5]),
    cs: toNum(c[6]), sbPct: toNum(c[7]),
  }))

  return {
    hitters: Array.from(hitterMap.values()),
    pitchers: Array.from(pitcherMap.values()),
    runners,
    snapshots,
  }
}
