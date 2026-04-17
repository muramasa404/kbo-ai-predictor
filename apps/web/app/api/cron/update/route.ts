import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { fetchKboGamesForDate } from '../../../../lib/naver-kbo'

export const maxDuration = 60

/**
 * 오늘 KBO 일정 + 발표된 선발투수를 Naver Sports에서 가져와
 * Game / Prediction 레코드로 저장한다.
 * 매시간 GitHub Actions가 호출하며 Vercel cron(매일)도 사용.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const today = todayKstDate()
    const todayStr = todayKstStr()

    const [season, teams, naverGames] = await Promise.all([
      prisma.season.findFirst({ where: { year: 2026 } }),
      prisma.team.findMany(),
      fetchKboGamesForDate(todayStr),
    ])
    if (!season) return NextResponse.json({ error: 'No season' }, { status: 404 })

    const teamByName = new Map(teams.map((t) => [t.nameKo, t]))
    const teamRanks = await prisma.teamRankDaily.findMany({ where: { seasonId: season.id }, include: { team: true } })
    const rankByTeam = new Map(teamRanks.map((r) => [r.team.nameKo, r]))

    let upserted = 0
    let predicted = 0
    const skipped: string[] = []

    for (const g of naverGames) {
      const home = teamByName.get(g.homeTeamName)
      const away = teamByName.get(g.awayTeamName)
      if (!home || !away) {
        skipped.push(`${g.gameId}: team not in DB (${g.homeTeamName}/${g.awayTeamName})`)
        continue
      }

      const game = await prisma.game.upsert({
        where: { sourceGameKey: g.gameId },
        create: {
          id: crypto.randomUUID(),
          sourceGameKey: g.gameId,
          seasonId: season.id,
          gameDate: today,
          gameType: 'REGULAR_SEASON',
          homeTeamId: home.id,
          awayTeamId: away.id,
          scheduledAt: new Date(g.scheduledAt),
          status: mapStatus(g.status),
          updatedAt: new Date(),
        },
        update: {
          scheduledAt: new Date(g.scheduledAt),
          status: mapStatus(g.status),
          updatedAt: new Date(),
        },
      })
      upserted++

      const homeRank = rankByTeam.get(g.homeTeamName)
      const awayRank = rankByTeam.get(g.awayTeamName)
      const hPct = homeRank ? Number(homeRank.winPct) || 0.5 : 0.5
      const aPct = awayRank ? Number(awayRank.winPct) || 0.5 : 0.5
      const homeEra = g.homeStarter ? Number(g.homeStarter.era) : NaN
      const awayEra = g.awayStarter ? Number(g.awayStarter.era) : NaN
      const eraAdj = computeEraAdjustment(homeEra, awayEra)
      const homeProb = clamp(hPct / (hPct + aPct) + 0.035 + eraAdj, 0.05, 0.95)
      const conf = Math.abs(homeProb - 0.5) >= 0.15 ? '높음' : Math.abs(homeProb - 0.5) >= 0.05 ? '중상' : '보통'

      const reasons: string[] = [
        `[일정] ${g.homeTeamName} vs ${g.awayTeamName} · ${g.scheduledAt.slice(11, 16)}`,
        homeRank && awayRank
          ? `[승률] ${g.homeTeamName} .${pct(hPct)} vs ${g.awayTeamName} .${pct(aPct)}`
          : `[승률] 데이터 부족`,
      ]
      if (g.homeStarter && g.awayStarter) {
        reasons.push(`[선발 (KBO 발표)] ${g.homeTeamName} ${g.homeStarter.name}(ERA ${g.homeStarter.era}, ${g.homeStarter.record}) vs ${g.awayTeamName} ${g.awayStarter.name}(ERA ${g.awayStarter.era}, ${g.awayStarter.record})`)
      } else {
        reasons.push('[선발] 발표 전 — 시즌 ERA 1위 투수로 추정')
      }
      if (eraAdj !== 0) {
        const sign = eraAdj > 0 ? '+' : ''
        reasons.push(`[선발 ERA 보정] 홈 ${sign}${(eraAdj * 100).toFixed(1)}%`)
      }
      reasons.push('[홈 어드밴티지] +3.5%')

      // Replace today's prediction for this game (idempotent)
      await prisma.prediction.deleteMany({ where: { gameId: game.id, predictedAt: { gte: startOfDayUtc(today) } } })
      await prisma.prediction.create({
        data: {
          id: crypto.randomUUID(),
          gameId: game.id,
          modelVersion: 'kap_model_v4.2.0',
          predictedAt: new Date(),
          homeWinProb: homeProb,
          awayWinProb: 1 - homeProb,
          confidenceGrade: conf,
          topReasonsJson: reasons,
        },
      })
      predicted++
    }

    // Cleanup legacy fake games (auto_* sourceGameKey from previous architecture)
    const legacy = await prisma.game.deleteMany({ where: { sourceGameKey: { startsWith: 'auto_' } } })

    return NextResponse.json({
      success: true,
      date: todayStr,
      naverGames: naverGames.length,
      upserted,
      predicted,
      legacyCleaned: legacy.count,
      skipped,
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}

function todayKstStr(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function todayKstDate(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfDayUtc(d: Date): Date {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

function mapStatus(naverStatus: string): 'SCHEDULED' | 'LIVE' | 'FINAL' | 'CANCELLED' | 'POSTPONED' {
  switch (naverStatus) {
    case 'STARTED': return 'LIVE'
    case 'RESULT': return 'FINAL'
    case 'CANCEL': return 'CANCELLED'
    case 'POSTPONED': return 'POSTPONED'
    default: return 'SCHEDULED'
  }
}

function computeEraAdjustment(homeEra: number, awayEra: number): number {
  if (Number.isNaN(homeEra) || Number.isNaN(awayEra)) return 0
  const diff = (awayEra - homeEra) * 0.03
  return clamp(diff, -0.06, 0.06)
}

function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, v)) }
function pct(v: number): string { return v.toFixed(3).slice(2) }
