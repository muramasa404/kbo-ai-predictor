import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

export const maxDuration = 60 // Vercel Pro: 60s, Hobby: 10s

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const season = await prisma.season.findFirst({ where: { year: 2026 } })
    if (!season) return NextResponse.json({ error: 'No season' }, { status: 404 })

    // Fast: only use team rankings for prediction
    const ranks = await prisma.teamRankDaily.findMany({
      where: { seasonId: season.id }, orderBy: { rank: 'asc' }, include: { team: true },
    })
    if (ranks.length < 4) return NextResponse.json({ error: 'Insufficient data' }, { status: 404 })

    const todayStr = new Date().toISOString().slice(0, 10)
    const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0)
    const half = Math.floor(ranks.length / 2)
    let count = 0

    for (let i = 0; i < Math.min(half, 5); i++) {
      const home = ranks[i]
      const away = ranks[i + half]
      const hPct = Number(home.winPct) || 0.5
      const aPct = Number(away.winPct) || 0.5
      const homeProb = Math.max(0.05, Math.min(0.95, hPct / (hPct + aPct) + 0.035))
      const conf = Math.abs(homeProb - 0.5) >= 0.15 ? '높음' : Math.abs(homeProb - 0.5) >= 0.05 ? '중상' : '보통'

      const gameKey = `auto_${home.teamId}_${away.teamId}_${todayStr}`
      const game = await prisma.game.upsert({
        where: { sourceGameKey: gameKey },
        create: {
          id: crypto.randomUUID(), sourceGameKey: gameKey, seasonId: season.id,
          gameDate: todayDate, gameType: 'REGULAR_SEASON',
          homeTeamId: home.teamId, awayTeamId: away.teamId,
          scheduledAt: new Date(todayDate.getTime() + 18.5 * 3600000),
          status: 'SCHEDULED', updatedAt: new Date(),
        },
        update: { updatedAt: new Date() },
      })

      await prisma.prediction.create({
        data: {
          id: crypto.randomUUID(), gameId: game.id, modelVersion: 'kap_model_v4.0.1',
          predictedAt: new Date(), homeWinProb: homeProb, awayWinProb: 1 - homeProb,
          confidenceGrade: conf, topReasonsJson: [
            `[자동갱신] ${todayStr}`,
            `[승률] ${home.team.nameKo} .${hPct.toFixed(3).slice(2)} vs ${away.team.nameKo} .${aPct.toFixed(3).slice(2)}`,
            `[홈 어드밴티지] +3.5%`,
          ],
        },
      })
      count++
    }

    return NextResponse.json({ success: true, predictions: count, date: todayStr })
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}
