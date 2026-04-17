import { prisma } from './prisma'
import type { DashboardPayload } from './contracts'
import { fetchKboGamesForDate, type NaverKboGame, type NaverStarter, type NaverStandings, type NaverPreviousGame } from './naver-kbo'

export interface FullDashboardPayload extends DashboardPayload {
  teamRanks: Array<{ rank: number; teamName: string; wins: number; losses: number; draws: number; winPct: string; gamesBack: string; last10: string; streak: string }>
  allHitters: Array<{ rank: number; playerName: string; teamName: string; avg: string; games: number; hits: number; homeRuns: number; rbi: number }>
  allPitchers: Array<{ rank: number; playerName: string; teamName: string; era: string; games: number; wins: number; losses: number; strikeOuts: number; whip: string }>
  modelInfo: { version: string; description: string; accuracy: string; features: string[]; lastTrained: string }
}

interface PredictedStarter { name: string; era: string; record: string }

interface TeamOffense { ops: number | null; avg: number | null; hr: number; rbi: number; weightedAb: number; topThreeOps: string[] }
interface TeamPitching { era: number | null; whip: number | null; kPer9: number | null; weightedIp: number }

const MODEL_VERSION = 'kap_model_v4.2.0'

export async function getDashboardPayloadFromDb(date: string): Promise<FullDashboardPayload | null> {
  const [naverGames, teamRanks, allHitters, allPitchers, latestSnapshot, playerCount] = await Promise.all([
    fetchKboGamesForDate(date).catch(() => []),
    prisma.teamRankDaily.findMany({ orderBy: { rank: 'asc' }, include: { team: true } }),
    prisma.playerHitterSeasonStat.findMany({
      orderBy: { ops: 'desc' },
      include: { player: { include: { currentTeam: true } } },
    }),
    prisma.playerPitcherSeasonStat.findMany({
      orderBy: { era: 'asc' },
      where: { era: { not: null } },
      include: { player: { include: { currentTeam: true } } },
    }),
    prisma.sourceSnapshot.findFirst({ orderBy: { collectedAt: 'desc' } }),
    prisma.player.count(),
  ])

  if (teamRanks.length === 0 && allHitters.length === 0) return null

  const rankByTeam = new Map(teamRanks.map((r) => [r.team.nameKo, r]))
  const offenseByTeam = aggregateTeamOffense(allHitters)
  const pitchingByTeam = aggregateTeamPitching(allPitchers)

  const predictions = naverGames.map((g) =>
    buildPrediction(g, rankByTeam, offenseByTeam, pitchingByTeam, allPitchers),
  )

  return {
    date,
    hero: {
      title: '오늘 KBO 경기의 승리 확률을 한눈에 봅니다.',
      copy: '실제 KBO 일정·발표 선발투수·팀 전체 공격/투수력·최근 폼·상대 전적을 모두 반영한 다변량 예측.',
      chips: [
        latestSnapshot ? `최신화 ${formatTime(latestSnapshot.collectedAt)}` : '데이터 없음',
        `오늘 ${naverGames.length}경기`,
        `선수 ${playerCount}명`,
      ],
    },
    predictions,
    analyticsMetrics: [
      { label: '오늘 경기', value: String(naverGames.length), tone: 'positive' as const, delta: MODEL_VERSION },
      { label: '등록 선수', value: String(playerCount), tone: 'positive' as const },
      { label: '수집 팀', value: `${teamRanks.length}팀`, tone: 'positive' as const },
    ],
    rankings: allHitters.slice(0, 3).map((h, i) => ({
      title: `OPS ${i + 1}위`,
      leader: h.player.nameKo,
      team: h.player.currentTeam?.nameKo ?? '-',
      value: h.ops ? Number(h.ops).toFixed(3) : '-',
      note: `타율 ${h.avg ? Number(h.avg).toFixed(3) : '-'} · ${h.homeRuns}홈런 · ${h.runsBattedIn}타점`,
    })),
    details: [
      { title: '데이터 소스', summary: 'Naver Sports (KBO 실시간) + KBO 공식 시즌 기록', homeTeam: '경기', homeValue: '실시간', awayTeam: '선발', awayValue: '실시간' },
    ],
    teamRanks: teamRanks.map((r) => ({
      rank: r.rank,
      teamName: r.team.nameKo,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      winPct: Number(r.winPct).toFixed(3),
      gamesBack: Number(r.gamesBack ?? 0).toFixed(1),
      last10: r.last10 ?? '-',
      streak: r.streak ?? '-',
    })),
    allHitters: allHitters.map((h, i) => ({
      rank: i + 1,
      playerName: h.player.nameKo,
      teamName: h.player.currentTeam?.nameKo ?? '-',
      avg: h.avg ? Number(h.avg).toFixed(3) : '-',
      games: h.games,
      hits: h.hits,
      homeRuns: h.homeRuns,
      rbi: h.runsBattedIn,
    })),
    allPitchers: allPitchers.map((p, i) => ({
      rank: i + 1,
      playerName: p.player.nameKo,
      teamName: p.player.currentTeam?.nameKo ?? '-',
      era: p.era ? String(p.era) : '-',
      games: p.games,
      wins: p.wins,
      losses: p.losses,
      strikeOuts: p.strikeOuts,
      whip: p.whip ? String(p.whip) : '-',
    })),
    modelInfo: {
      version: MODEL_VERSION,
      description: '다변량 KBO 예측 — 팀 승률, 순위, 최근 10경기, 연속, 선발 투수 ERA/상대전적, 팀 OPS/AVG/ERA/WHIP, 타선 최근 5경기, 상대 전적(h2h), 홈/원정 어드밴티지 조합.',
      accuracy: '기본값: XGBoost(200 trees, depth 5) 5-fold CV 84.4% + v4.2.0에서 실시간 피처 14개 추가',
      features: ['승률 차이', '순위 차이', '최근10경기', '연속', '홈 어드밴티지', '선발 ERA', '선발 WHIP', '선발 vs 상대', '팀 ERA', '팀 WHIP', '팀 AVG', '팀 OPS', '팀 HR', '타선 최근5', '핵심타자 폼', '상대전적', '최근 득실차', 'K/9·BB/9', '시리즈 성적'],
      lastTrained: new Date().toISOString().slice(0, 10),
    },
  }
}

/* ════════════════════════════════════════════════════════════════════════════ */
/* Team aggregation                                                             */
/* ════════════════════════════════════════════════════════════════════════════ */

interface HitterRow { atBats: number; avg: unknown; ops: unknown; homeRuns: number; runsBattedIn: number; player: { nameKo: string; currentTeam: { nameKo: string } | null } }
interface PitcherRow { era: unknown; whip: unknown; strikeOuts: number; walks: number; inningsPitched: unknown; games: number; wins: number; losses: number; player: { nameKo: string; currentTeam: { nameKo: string } | null } }

function aggregateTeamOffense(hitters: HitterRow[]): Map<string, TeamOffense> {
  const groups = groupBy(hitters, (h) => h.player.currentTeam?.nameKo)
  const out = new Map<string, TeamOffense>()
  for (const [team, rows] of groups) {
    const qualified = rows.filter((r) => r.atBats >= 30)
    const weighted = weightedAvg(qualified, (r) => r.atBats, (r) => toNum(r.ops))
    const avgW = weightedAvg(qualified, (r) => r.atBats, (r) => toNum(r.avg))
    const hrSum = rows.reduce((s, r) => s + (r.homeRuns ?? 0), 0)
    const rbiSum = rows.reduce((s, r) => s + (r.runsBattedIn ?? 0), 0)
    const topThree = [...rows]
      .filter((r) => r.atBats >= 30)
      .sort((a, b) => (toNum(b.ops) ?? 0) - (toNum(a.ops) ?? 0))
      .slice(0, 3)
      .map((r) => `${r.player.nameKo}(OPS ${fmt3(r.ops)})`)
    out.set(team, {
      ops: weighted,
      avg: avgW,
      hr: hrSum,
      rbi: rbiSum,
      weightedAb: qualified.reduce((s, r) => s + r.atBats, 0),
      topThreeOps: topThree,
    })
  }
  return out
}

function aggregateTeamPitching(pitchers: PitcherRow[]): Map<string, TeamPitching> {
  const groups = groupBy(pitchers, (p) => p.player.currentTeam?.nameKo)
  const out = new Map<string, TeamPitching>()
  for (const [team, rows] of groups) {
    const weighted = (selector: (r: PitcherRow) => number | null) =>
      weightedAvg(rows, (r) => toNum(r.inningsPitched) ?? 0, selector)
    const totalIp = rows.reduce((s, r) => s + (toNum(r.inningsPitched) ?? 0), 0)
    const totalK = rows.reduce((s, r) => s + (r.strikeOuts ?? 0), 0)
    const kPer9 = totalIp > 0 ? (totalK * 9) / totalIp : null
    out.set(team, {
      era: weighted((r) => toNum(r.era)),
      whip: weighted((r) => toNum(r.whip)),
      kPer9,
      weightedIp: totalIp,
    })
  }
  return out
}

/* ════════════════════════════════════════════════════════════════════════════ */
/* Prediction building                                                          */
/* ════════════════════════════════════════════════════════════════════════════ */

interface RankRow { rank: number; winPct: unknown; team: { nameKo: string }; wins: number; losses: number; last10: string | null; streak: string | null }

function buildPrediction(
  game: NaverKboGame,
  rankByTeam: Map<string, RankRow>,
  offenseByTeam: Map<string, TeamOffense>,
  pitchingByTeam: Map<string, TeamPitching>,
  allPitchers: PitcherRow[],
) {
  const home = rankByTeam.get(game.homeTeamName)
  const away = rankByTeam.get(game.awayTeamName)
  const hPct = home ? Number(home.winPct) || 0.5 : Number(game.homeStandings?.winPct) || 0.5
  const aPct = away ? Number(away.winPct) || 0.5 : Number(game.awayStandings?.winPct) || 0.5

  const homeStarter = game.homeStarter ?? toProxyStarter(allPitchers, game.homeTeamName)
  const awayStarter = game.awayStarter ?? toProxyStarter(allPitchers, game.awayTeamName)

  const homeOff = offenseByTeam.get(game.homeTeamName)
  const awayOff = offenseByTeam.get(game.awayTeamName)
  const homePit = pitchingByTeam.get(game.homeTeamName)
  const awayPit = pitchingByTeam.get(game.awayTeamName)

  const baseProb = hPct / (hPct + aPct)

  // Individual adjustments (each capped)
  const homeField = 0.035
  const starterEraAdj = adj(naverEraDiff(awayStarter, homeStarter), 0.025, 0.06)
  const starterVsOppAdj = adj(starterVsOppDiff(game), 0.02, 0.03)
  const teamEraAdj = adj(teamEraDiff(game, homePit, awayPit), 0.012, 0.04)
  const teamAvgAdj = adj(teamAvgDiff(game, homeOff, awayOff), 0.30, 0.03)
  const teamOpsAdj = adj(teamOpsDiff(homeOff, awayOff), 0.20, 0.05)
  const teamHrAdj = adj(teamHrDiff(game), 0.001, 0.015)
  const h2hAdj = adj(h2hDiff(game), 0.10, 0.03)
  const formAdj = adj(formDiff(game.homePreviousGames, game.awayPreviousGames), 0.003, 0.03)
  const streakAdj = adj(streakDiff(home?.streak ?? null, away?.streak ?? null), 0.005, 0.02)
  const last10Adj = adj(last10Diff(home?.last10 ?? null, away?.last10 ?? null), 0.03, 0.02)
  const topHitterAdj = adj(topHitterFormDiff(game), 0.10, 0.02)

  const totalAdj = clamp(
    homeField + starterEraAdj + starterVsOppAdj + teamEraAdj + teamAvgAdj + teamOpsAdj + teamHrAdj + h2hAdj + formAdj + streakAdj + last10Adj + topHitterAdj,
    -0.30, 0.30,
  )
  const homeProb = clamp(baseProb + totalAdj, 0.08, 0.92)

  const winProbability = Math.round(Math.max(homeProb, 1 - homeProb) * 100)
  const confidence = confidenceGrade(homeProb)
  const reasons = buildReasons(game, home, away, hPct, aPct, homeStarter, awayStarter, homeOff, awayOff, homePit, awayPit, {
    homeField, starterEraAdj, starterVsOppAdj, teamEraAdj, teamAvgAdj, teamOpsAdj, teamHrAdj, h2hAdj, formAdj, streakAdj, last10Adj, topHitterAdj,
  })

  return {
    id: game.gameId,
    gameTime: formatTimeIso(game.scheduledAt),
    homeTeam: game.homeTeamName,
    awayTeam: game.awayTeamName,
    favoredTeam: homeProb >= 0.5 ? game.homeTeamName : game.awayTeamName,
    winProbability,
    confidence,
    topReasons: reasons,
    homeStarter,
    awayStarter,
  }
}

interface Adjustments {
  homeField: number; starterEraAdj: number; starterVsOppAdj: number
  teamEraAdj: number; teamAvgAdj: number; teamOpsAdj: number; teamHrAdj: number
  h2hAdj: number; formAdj: number; streakAdj: number; last10Adj: number; topHitterAdj: number
}

function buildReasons(
  game: NaverKboGame,
  home: RankRow | undefined, away: RankRow | undefined,
  hPct: number, aPct: number,
  homeStarter: PredictedStarter | null, awayStarter: PredictedStarter | null,
  homeOff: TeamOffense | undefined, awayOff: TeamOffense | undefined,
  homePit: TeamPitching | undefined, awayPit: TeamPitching | undefined,
  adjs: Adjustments,
): string[] {
  const r: string[] = []
  const H = game.homeTeamName; const A = game.awayTeamName

  r.push(`[일정] ${H} vs ${A} · ${formatTimeIso(game.scheduledAt)} · ${game.statusInfo || '경기전'}`)
  if (home && away) {
    r.push(`[승률] ${H} .${pct(hPct)} vs ${A} .${pct(aPct)} (차이 ${sign(hPct - aPct, 3)})`)
    r.push(`[순위] ${H} ${home.rank}위 vs ${A} ${away.rank}위`)
  }
  if (home?.last10 || away?.last10) r.push(`[최근10경기] ${H} ${home?.last10 ?? '-'} · ${A} ${away?.last10 ?? '-'}`)
  if (home?.streak || away?.streak) r.push(`[연속] ${H} ${home?.streak ?? '-'} · ${A} ${away?.streak ?? '-'}`)

  if (homeStarter && awayStarter) {
    const src = (game.homeStarter && game.awayStarter) ? 'KBO 발표' : '추정(시즌 ERA 1위)'
    r.push(`[선발 (${src})] ${H} ${homeStarter.name}(ERA ${homeStarter.era}, ${homeStarter.record}) vs ${A} ${awayStarter.name}(ERA ${awayStarter.era}, ${awayStarter.record})`)
    if (game.homeStarter?.whip || game.awayStarter?.whip) {
      r.push(`[선발 WHIP] ${H} ${game.homeStarter?.whip ?? '-'} · ${A} ${game.awayStarter?.whip ?? '-'}`)
    }
    if (game.homeStarter?.vsOpponent || game.awayStarter?.vsOpponent) {
      const hv = game.homeStarter?.vsOpponent; const av = game.awayStarter?.vsOpponent
      r.push(`[선발 vs 상대] ${H} ${hv ? `ERA ${hv.era}, ${hv.record}` : '-'} · ${A} ${av ? `ERA ${av.era}, ${av.record}` : '-'}`)
    }
  }

  if (game.homeStandings && game.awayStandings) {
    r.push(`[팀 ERA] ${H} ${game.homeStandings.teamEra} · ${A} ${game.awayStandings.teamEra}`)
    r.push(`[팀 타율] ${H} ${game.homeStandings.teamAvg} · ${A} ${game.awayStandings.teamAvg}`)
    r.push(`[팀 홈런] ${H} ${game.homeStandings.teamHr}개 · ${A} ${game.awayStandings.teamHr}개`)
  }
  if (homeOff?.ops != null && awayOff?.ops != null) {
    r.push(`[팀 OPS] ${H} ${homeOff.ops.toFixed(3)} · ${A} ${awayOff.ops.toFixed(3)}`)
  }
  if (homePit?.whip != null && awayPit?.whip != null) {
    r.push(`[팀 WHIP] ${H} ${homePit.whip.toFixed(2)} · ${A} ${awayPit.whip.toFixed(2)}`)
  }
  if (homePit?.kPer9 != null && awayPit?.kPer9 != null) {
    r.push(`[팀 K/9] ${H} ${homePit.kPer9.toFixed(2)} · ${A} ${awayPit.kPer9.toFixed(2)}`)
  }
  if (homeOff?.topThreeOps?.length) r.push(`[${H} 핵심타자] ${homeOff.topThreeOps.join(', ')}`)
  if (awayOff?.topThreeOps?.length) r.push(`[${A} 핵심타자] ${awayOff.topThreeOps.join(', ')}`)

  if (game.homeTopPlayer) r.push(`[${H} 최근 5경기 MVP] ${game.homeTopPlayer.name} 타율 ${game.homeTopPlayer.recentAvg}, ${game.homeTopPlayer.recentHr}HR, ${game.homeTopPlayer.recentRbi}타점`)
  if (game.awayTopPlayer) r.push(`[${A} 최근 5경기 MVP] ${game.awayTopPlayer.name} 타율 ${game.awayTopPlayer.recentAvg}, ${game.awayTopPlayer.recentHr}HR, ${game.awayTopPlayer.recentRbi}타점`)

  if (game.headToHead) {
    const h = game.headToHead
    r.push(`[시즌 상대전적] ${H} ${h.homeWins}승 ${h.homeLosses}패 ${h.homeDraws}무 vs ${A} ${h.awayWins}승 ${h.awayLosses}패 ${h.awayDraws}무`)
  }

  const hRun = runsSummary(game.homePreviousGames)
  const aRun = runsSummary(game.awayPreviousGames)
  if (hRun && aRun) r.push(`[최근 ${hRun.n}경기 득실] ${H} ${hRun.rf}득/${hRun.ra}실 · ${A} ${aRun.rf}득/${aRun.ra}실`)

  if (game.homeStandings?.recentSeriesOutcome || game.awayStandings?.recentSeriesOutcome) {
    const hs = game.homeStandings?.recentSeriesOutcome; const as = game.awayStandings?.recentSeriesOutcome
    r.push(`[최근 시리즈] ${H} ${hs ? `${hs.w}승${hs.l}패${hs.d}무` : '-'} · ${A} ${as ? `${as.w}승${as.l}패${as.d}무` : '-'}`)
  }

  r.push(`[보정] 홈 +3.5% | 선발ERA ${pctSign(adjs.starterEraAdj)} | 선발vs상대 ${pctSign(adjs.starterVsOppAdj)} | 팀ERA ${pctSign(adjs.teamEraAdj)} | 팀OPS ${pctSign(adjs.teamOpsAdj)} | 팀AVG ${pctSign(adjs.teamAvgAdj)} | 상대전적 ${pctSign(adjs.h2hAdj)} | 폼 ${pctSign(adjs.formAdj)} | 연속 ${pctSign(adjs.streakAdj)} | 최근10 ${pctSign(adjs.last10Adj)} | 타자폼 ${pctSign(adjs.topHitterAdj)}`)

  return r
}

/* ════════════════════════════════════════════════════════════════════════════ */
/* Feature computations                                                         */
/* ════════════════════════════════════════════════════════════════════════════ */

function naverEraDiff(away: PredictedStarter | null, home: PredictedStarter | null): number {
  const a = toNum(away?.era); const h = toNum(home?.era)
  if (a == null || h == null) return 0
  return a - h
}

function starterVsOppDiff(game: NaverKboGame): number {
  const h = toNum(game.homeStarter?.vsOpponent?.era)
  const a = toNum(game.awayStarter?.vsOpponent?.era)
  if (h == null || a == null) return 0
  return a - h
}

function teamEraDiff(game: NaverKboGame, homePit: TeamPitching | undefined, awayPit: TeamPitching | undefined): number {
  const h = toNum(game.homeStandings?.teamEra) ?? homePit?.era ?? null
  const a = toNum(game.awayStandings?.teamEra) ?? awayPit?.era ?? null
  if (h == null || a == null) return 0
  return a - h
}

function teamAvgDiff(game: NaverKboGame, homeOff: TeamOffense | undefined, awayOff: TeamOffense | undefined): number {
  const h = toNum(game.homeStandings?.teamAvg) ?? homeOff?.avg ?? null
  const a = toNum(game.awayStandings?.teamAvg) ?? awayOff?.avg ?? null
  if (h == null || a == null) return 0
  return h - a
}

function teamOpsDiff(homeOff: TeamOffense | undefined, awayOff: TeamOffense | undefined): number {
  if (homeOff?.ops == null || awayOff?.ops == null) return 0
  return homeOff.ops - awayOff.ops
}

function teamHrDiff(game: NaverKboGame): number {
  const h = game.homeStandings?.teamHr ?? 0; const a = game.awayStandings?.teamHr ?? 0
  return h - a
}

function h2hDiff(game: NaverKboGame): number {
  if (!game.headToHead) return 0
  const hTotal = game.headToHead.homeWins + game.headToHead.homeLosses + game.headToHead.homeDraws
  const aTotal = game.headToHead.awayWins + game.headToHead.awayLosses + game.headToHead.awayDraws
  if (hTotal === 0 || aTotal === 0) return 0
  const hRate = game.headToHead.homeWins / hTotal
  const aRate = game.headToHead.awayWins / aTotal
  return hRate - aRate
}

function formDiff(homePrev: NaverPreviousGame[], awayPrev: NaverPreviousGame[]): number {
  const h = runsSummary(homePrev); const a = runsSummary(awayPrev)
  if (!h || !a) return 0
  return (h.rf - h.ra) / h.n - (a.rf - a.ra) / a.n
}

function runsSummary(games: NaverPreviousGame[]): { n: number; rf: number; ra: number } | null {
  if (!games.length) return null
  const take = games.slice(0, 5)
  const rf = take.reduce((s, g) => s + g.scoreFor, 0)
  const ra = take.reduce((s, g) => s + g.scoreAgainst, 0)
  return { n: take.length, rf, ra }
}

function streakDiff(home: string | null, away: string | null): number {
  return streakToNumber(home) - streakToNumber(away)
}

function streakToNumber(s: string | null): number {
  if (!s) return 0
  const m = s.match(/(\d+)\s*(승|패)/)
  if (!m) return 0
  const n = Number(m[1])
  return m[2] === '승' ? n : -n
}

function last10Diff(home: string | null, away: string | null): number {
  return last10Pct(home) - last10Pct(away)
}

function last10Pct(s: string | null): number {
  if (!s) return 0
  const m = s.match(/(\d+)\s*-\s*(\d+)/)
  if (!m) return 0
  const w = Number(m[1]); const l = Number(m[2])
  const t = w + l
  return t > 0 ? w / t - 0.5 : 0
}

function topHitterFormDiff(game: NaverKboGame): number {
  const h = toNum(game.homeTopPlayer?.recentAvg); const a = toNum(game.awayTopPlayer?.recentAvg)
  if (h == null || a == null) return 0
  return h - a
}

/* ════════════════════════════════════════════════════════════════════════════ */
/* Helpers                                                                      */
/* ════════════════════════════════════════════════════════════════════════════ */

function toProxyStarter(pitchers: PitcherRow[], teamName: string): PredictedStarter | null {
  const teamPitchers = pitchers.filter((p) => p.player.currentTeam?.nameKo === teamName && p.era != null && p.games >= 5)
  if (teamPitchers.length === 0) return null
  const top = teamPitchers.sort((a, b) => (toNum(a.era) ?? 99) - (toNum(b.era) ?? 99))[0]
  return { name: top.player.nameKo, era: top.era ? Number(top.era).toFixed(2) : '-', record: `${top.wins}승 ${top.losses}패` }
}

function adj(delta: number, coef: number, cap: number): number { return clamp(delta * coef, -cap, cap) }
function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, v)) }
function pct(v: number): string { return v.toFixed(3).slice(2) }
function pctSign(v: number): string { const p = (v * 100); const s = p >= 0 ? '+' : ''; return `${s}${p.toFixed(1)}%` }
function sign(v: number, digits: number): string { const s = v >= 0 ? '+' : ''; return `${s}${v.toFixed(digits)}` }
function confidenceGrade(homeProb: number): string { const gap = Math.abs(homeProb - 0.5); return gap >= 0.18 ? '매우 높음' : gap >= 0.12 ? '높음' : gap >= 0.05 ? '중상' : '보통' }
function toNum(v: unknown): number | null { if (v == null || v === '' || v === '-') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
function fmt3(v: unknown): string { const n = toNum(v); return n == null ? '-' : n.toFixed(3) }

function groupBy<T, K>(items: T[], key: (t: T) => K | undefined): Map<Exclude<K, undefined>, T[]> {
  const out = new Map<Exclude<K, undefined>, T[]>()
  for (const it of items) {
    const k = key(it); if (k === undefined) continue
    const bucket = out.get(k as Exclude<K, undefined>) ?? []
    bucket.push(it); out.set(k as Exclude<K, undefined>, bucket)
  }
  return out
}

function weightedAvg<T>(items: T[], weight: (t: T) => number, value: (t: T) => number | null): number | null {
  let num = 0; let den = 0
  for (const it of items) {
    const w = weight(it); const v = value(it)
    if (v == null || w <= 0) continue
    num += w * v; den += w
  }
  return den > 0 ? num / den : null
}

function formatTimeIso(iso: string): string {
  if (!iso) return '18:30'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(11, 16)
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}

function formatTime(value: Date): string {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(value)
}

// Re-export type so callers still reference it through this module
export type { NaverStandings }
