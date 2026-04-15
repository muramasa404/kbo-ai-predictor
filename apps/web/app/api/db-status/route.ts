import { NextResponse } from 'next/server'
import { prisma } from '../../../lib/prisma'

export async function GET() {
  try {
    const [
      playerCount,
      hitterStatCount,
      pitcherStatCount,
      teamRankCount,
      predictionCount,
      gameCount,
      snapshotCount,
      latestSnapshot,
      teams,
    ] = await Promise.all([
      prisma.player.count(),
      prisma.playerHitterSeasonStat.count(),
      prisma.playerPitcherSeasonStat.count(),
      prisma.teamRankDaily.count(),
      prisma.prediction.count(),
      prisma.game.count(),
      prisma.sourceSnapshot.count(),
      prisma.sourceSnapshot.findFirst({ orderBy: { collectedAt: 'desc' } }),
      prisma.team.findMany({ orderBy: { code: 'asc' } }),
    ])

    return NextResponse.json({
      tables: [
        { name: 'Player', count: playerCount },
        { name: 'HitterSeasonStat', count: hitterStatCount },
        { name: 'PitcherSeasonStat', count: pitcherStatCount },
        { name: 'TeamRankDaily', count: teamRankCount },
        { name: 'Prediction', count: predictionCount },
        { name: 'Game', count: gameCount },
        { name: 'SourceSnapshot', count: snapshotCount },
      ],
      teams: teams.map((t) => ({ code: t.code, name: t.nameKo })),
      lastCollected: latestSnapshot?.collectedAt ?? null,
      totalRecords: playerCount + hitterStatCount + pitcherStatCount + teamRankCount + predictionCount + gameCount + snapshotCount,
    })
  } catch (error) {
    console.error('db-status error:', error)
    return NextResponse.json(
      { error: 'Database connection failed', message: String(error) },
      { status: 500 },
    )
  }
}
