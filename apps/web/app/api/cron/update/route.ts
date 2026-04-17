import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'
import { fetchKboGamesForDate } from '../../../../lib/naver-kbo'

export const maxDuration = 60

/**
 * Light-weight refresher for today's game rows.
 *
 * This endpoint used to also write predictions, but as of kap_model_v4.3.0
 * the XGBoost training+inference pipeline in GitHub Actions writes
 * predictions directly to Supabase every hour. So this route only needs to
 * keep today's Game rows fresh — useful as a fallback when GitHub Actions is
 * down or hasn't run yet on a given day.
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

    let upserted = 0
    const skipped: string[] = []

    for (const g of naverGames) {
      const home = teamByName.get(g.homeTeamName)
      const away = teamByName.get(g.awayTeamName)
      if (!home || !away) {
        skipped.push(`${g.gameId}: team not in DB (${g.homeTeamName}/${g.awayTeamName})`)
        continue
      }

      await prisma.game.upsert({
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
    }

    // Legacy synthetic games from earlier architectures
    const legacy = await prisma.game.deleteMany({
      where: { OR: [{ sourceGameKey: { startsWith: 'auto_' } }, { sourceGameKey: { startsWith: 'ml_' } }] },
    })

    return NextResponse.json({
      success: true,
      date: todayStr,
      naverGames: naverGames.length,
      upserted,
      legacyCleaned: legacy.count,
      skipped,
      note: 'Predictions are written by the Python ML pipeline (kap_model_v4.3.0) in GitHub Actions.',
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

function mapStatus(naverStatus: string): 'SCHEDULED' | 'LIVE' | 'FINAL' | 'CANCELLED' | 'POSTPONED' {
  switch (naverStatus) {
    case 'STARTED': return 'LIVE'
    case 'RESULT': return 'FINAL'
    case 'CANCEL': return 'CANCELLED'
    case 'POSTPONED': return 'POSTPONED'
    default: return 'SCHEDULED'
  }
}
