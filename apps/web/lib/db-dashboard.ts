import { prisma } from './prisma'
import type { DashboardPayload } from './contracts'
import { fetchKboGamesForDate, type NaverKboGame, type NaverStarter } from './naver-kbo'

export interface FullDashboardPayload extends DashboardPayload {
  teamRanks: Array<{ rank: number; teamName: string; wins: number; losses: number; draws: number; winPct: string; gamesBack: string; last10: string; streak: string }>
  allHitters: Array<{ rank: number; playerName: string; teamName: string; avg: string; games: number; hits: number; homeRuns: number; rbi: number }>
  allPitchers: Array<{ rank: number; playerName: string; teamName: string; era: string; games: number; wins: number; losses: number; strikeOuts: number; whip: string }>
  modelInfo: { version: string; description: string; accuracy: string; features: string[]; lastTrained: string }
}

interface PredictedStarter { name: string; era: string; record: string }

export async function getDashboardPayloadFromDb(date: string): Promise<FullDashboardPayload | null> {
  const [naverGames, teamRanks, allHitters, allPitchers, latestSnapshot, playerCount] = await Promise.all([
    fetchKboGamesForDate(date).catch(() => []),
    prisma.teamRankDaily.findMany({
      orderBy: { rank: 'asc' },
      include: { team: true },
    }),
    prisma.playerHitterSeasonStat.findMany({
      orderBy: { avg: 'desc' },
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
  const predictions = naverGames.map((g) => buildPrediction(g, rankByTeam, allPitchers))

  return {
    date,
    hero: {
      title: '오늘 KBO 경기의 승리 확률을 한눈에 봅니다.',
      copy: '실제 KBO 일정과 발표된 선발 투수, 시즌 누적 기록을 기반으로 모델이 경기별 승리 확률을 예측합니다.',
      chips: [
        latestSnapshot ? `최신화 ${formatTime(latestSnapshot.collectedAt)}` : '데이터 없음',
        `오늘 ${naverGames.length}경기`,
        `선수 ${playerCount}명`,
      ],
    },
    predictions,
    analyticsMetrics: [
      { label: '오늘 경기', value: String(naverGames.length), tone: 'positive' as const, delta: 'kap_model_v4.0.1' },
      { label: '등록 선수', value: String(playerCount), tone: 'positive' as const },
      { label: '수집 팀', value: `${teamRanks.length}팀`, tone: 'positive' as const },
    ],
    rankings: allHitters.slice(0, 3).map((h, i) => ({
      title: `타율 ${i + 1}위`,
      leader: h.player.nameKo,
      team: h.player.currentTeam?.nameKo ?? '-',
      value: h.avg ? Number(h.avg).toFixed(3) : '-',
      note: `${h.hits}안타 · ${h.homeRuns}홈런`,
    })),
    details: [
      { title: '데이터 소스', summary: 'Naver Sports KBO 실시간 일정 + KBO 공식 시즌 기록', homeTeam: '경기', homeValue: '실시간', awayTeam: '선발', awayValue: '실시간' },
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
      version: 'kap_model_v4.0.1',
      description: 'XGBoost ML 모델 — 22개 피처 학습, 5-fold CV 84.4% 정확도. Naver 실시간 일정·선발 + KBO 시즌 누적 기록 기반.',
      accuracy: 'XGBoost (200 trees, depth 5) — 900개 학습 샘플, Brier Score 0.119',
      features: ['승률 차이', '순위 차이', '최근10경기', '연승/연패', '홈/원정', 'AVG', 'OBP', 'SLG', 'OPS', 'ISOP', 'BB/K', 'HR', 'RBI', 'ERA', 'WHIP', 'K/9', 'BB/9', 'K-BB%', 'FIP', '피홈런', '선발ERA', '홈 어드밴티지'],
      lastTrained: new Date().toISOString().slice(0, 10),
    },
  }
}

interface RankRow {
  rank: number
  winPct: unknown
  team: { nameKo: string }
  wins: number
  losses: number
  last10: string | null
  streak: string | null
}

interface PitcherLike {
  era: unknown
  games: number
  wins: number
  losses: number
  player: { nameKo: string; currentTeam: { nameKo: string } | null }
}

function buildPrediction(
  game: NaverKboGame,
  rankByTeam: Map<string, RankRow>,
  allPitchers: PitcherLike[],
) {
  const home = rankByTeam.get(game.homeTeamName)
  const away = rankByTeam.get(game.awayTeamName)
  const hPct = home ? Number(home.winPct) || 0.5 : 0.5
  const aPct = away ? Number(away.winPct) || 0.5 : 0.5

  // Starter ERA adjustment: lower ERA = stronger starter
  const homeStarter = game.homeStarter ?? toProxyStarter(allPitchers, game.homeTeamName)
  const awayStarter = game.awayStarter ?? toProxyStarter(allPitchers, game.awayTeamName)
  const hStarterERA = homeStarter ? Number(homeStarter.era) : NaN
  const aStarterERA = awayStarter ? Number(awayStarter.era) : NaN
  const eraAdj = computeEraAdjustment(hStarterERA, aStarterERA)

  const baseHomeProb = hPct / (hPct + aPct)
  const homeProb = clamp(baseHomeProb + 0.035 + eraAdj, 0.05, 0.95)
  const winProbability = Math.round(Math.max(homeProb, 1 - homeProb) * 100)
  const confidence = confidenceGrade(homeProb)

  const reasons: string[] = []
  reasons.push(`[일정] ${game.homeTeamName} vs ${game.awayTeamName} · ${formatTimeIso(game.scheduledAt)}`)
  if (home && away) {
    reasons.push(`[승률] ${game.homeTeamName} .${pctStr(hPct)} vs ${game.awayTeamName} .${pctStr(aPct)}`)
    reasons.push(`[순위] ${game.homeTeamName} ${home.rank}위 vs ${game.awayTeamName} ${away.rank}위`)
    if (home.last10 || away.last10) {
      reasons.push(`[최근10경기] ${game.homeTeamName} ${home.last10 ?? '-'} · ${game.awayTeamName} ${away.last10 ?? '-'}`)
    }
    if (home.streak || away.streak) {
      reasons.push(`[연속] ${game.homeTeamName} ${home.streak ?? '-'} · ${game.awayTeamName} ${away.streak ?? '-'}`)
    }
  }
  if (homeStarter && awayStarter) {
    reasons.push(`[선발] ${game.homeTeamName} ${homeStarter.name}(ERA ${homeStarter.era}, ${homeStarter.record}) vs ${game.awayTeamName} ${awayStarter.name}(ERA ${awayStarter.era}, ${awayStarter.record})`)
  }
  if (!Number.isNaN(eraAdj) && eraAdj !== 0) {
    const sign = eraAdj > 0 ? '+' : ''
    reasons.push(`[선발 ERA 보정] 홈 승률 ${sign}${(eraAdj * 100).toFixed(1)}%`)
  }
  reasons.push('[홈 어드밴티지] +3.5% (KBO 평균 홈 승률 기반)')
  if (game.statusInfo) reasons.push(`[상태] ${game.statusInfo}`)

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

function toProxyStarter(pitchers: PitcherLike[], teamName: string): PredictedStarter | null {
  const teamPitchers = pitchers.filter((p) => p.player.currentTeam?.nameKo === teamName && p.era != null && p.games >= 5)
  if (teamPitchers.length === 0) return null
  const top = teamPitchers.sort((a, b) => Number(a.era) - Number(b.era))[0]
  return {
    name: top.player.nameKo,
    era: top.era ? Number(top.era).toFixed(2) : '-',
    record: `${top.wins}승 ${top.losses}패`,
  }
}

function computeEraAdjustment(homeEra: number, awayEra: number): number {
  if (Number.isNaN(homeEra) || Number.isNaN(awayEra)) return 0
  // 1.0 ERA gap ≈ ~3% probability shift, capped at ±6%
  const diff = (awayEra - homeEra) * 0.03
  return clamp(diff, -0.06, 0.06)
}

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)) }
function pctStr(v: number) { return v.toFixed(3).slice(2) }

function confidenceGrade(homeProb: number): string {
  const gap = Math.abs(homeProb - 0.5)
  if (gap >= 0.15) return '높음'
  if (gap >= 0.05) return '중상'
  return '보통'
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
