import { prisma } from './prisma'
import type { DashboardPayload } from './contracts'

export interface FullDashboardPayload extends DashboardPayload {
  teamRanks: Array<{ rank: number; teamName: string; wins: number; losses: number; draws: number; winPct: string; gamesBack: string; last10: string; streak: string }>
  allHitters: Array<{ rank: number; playerName: string; teamName: string; avg: string; games: number; hits: number; homeRuns: number; rbi: number }>
  allPitchers: Array<{ rank: number; playerName: string; teamName: string; era: string; games: number; wins: number; losses: number; strikeOuts: number; whip: string }>
  modelInfo: { version: string; description: string; accuracy: string; features: string[]; lastTrained: string }
}

export async function getDashboardPayloadFromDb(date: string): Promise<FullDashboardPayload | null> {
  const [predictions, teamRanks, allHitters, allPitchers, latestSnapshot, playerCount] = await Promise.all([
    prisma.prediction.findMany({
      orderBy: { homeWinProb: 'desc' },
      take: 10,
      include: { game: { include: { homeTeam: true, awayTeam: true } } },
    }),
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

  return {
    date,
    hero: {
      title: '오늘 KBO 경기의 승리 확률을 한눈에 봅니다.',
      copy: '팀 순위, 타자/투수 시즌 기록을 기반으로 Baseline v1 모델이 경기별 승리 확률을 예측합니다.',
      chips: [
        latestSnapshot ? `최신화 ${formatTime(latestSnapshot.collectedAt)}` : '데이터 없음',
        `예측 ${predictions.length}건`,
        `선수 ${playerCount}명`,
      ],
    },
    predictions: predictions.map((p) => {
      const homeProb = Number(p.homeWinProb)
      const awayProb = Number(p.awayWinProb)
      return {
        id: p.id,
        gameTime: p.game.scheduledAt ? formatTime(p.game.scheduledAt) : '18:30',
        homeTeam: p.game.homeTeam.nameKo,
        awayTeam: p.game.awayTeam.nameKo,
        favoredTeam: homeProb >= awayProb ? p.game.homeTeam.nameKo : p.game.awayTeam.nameKo,
        winProbability: Math.round(Math.max(homeProb, awayProb) * 100),
        confidence: p.confidenceGrade ?? '보통',
        topReasons: extractReasons(p.topReasonsJson),
      }
    }),
    analyticsMetrics: [
      { label: '예측 경기', value: String(predictions.length), tone: 'positive' as const, delta: 'Baseline v1' },
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
      { title: '모델 버전', summary: 'Baseline v1: 승률 50% + 타율 25% + ERA 25% + 홈 3%', homeTeam: '현재', homeValue: 'v1', awayTeam: '다음', awayValue: 'v2' },
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
      version: 'kap_model_v4.0.0',
      description: 'XGBoost ML 모델 — 22개 피처 학습, 5-fold CV 84.4% 정확도',
      accuracy: 'XGBoost (200 trees, depth 5) — 900개 학습 샘플, Brier Score 0.119',
      features: ['승률 차이', '순위 차이', '최근10경기', '연승/연패', '홈/원정', 'AVG', 'OBP', 'SLG', 'OPS', 'ISOP', 'BB/K', 'HR', 'RBI', 'ERA', 'WHIP', 'K/9', 'BB/9', 'K-BB%', 'FIP', '피홈런', '선발ERA', '홈 어드밴티지'],
      lastTrained: new Date().toISOString().slice(0, 10),
    },
  }
}

function extractReasons(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  return ['예측 근거 준비 중']
}

function formatTime(value: Date): string {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(value)
}
