import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

/**
 * 경기 결과 피드백 + 모델 정확도 추적
 * 예측 vs 실제 결과를 비교하여 모델 성능을 평가합니다.
 *
 * POST /api/cron/feedback
 * Body: { gameId, homeScore, awayScore }
 *
 * 또는 GET으로 전체 정확도 조회
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 결과가 있는 경기의 예측 정확도 계산
    const results = await prisma.gameResult.findMany({
      include: {
        game: {
          include: {
            homeTeam: true,
            awayTeam: true,
            predictions: true,
          },
        },
      },
    })

    let correct = 0
    let total = 0
    const details: any[] = []

    for (const result of results) {
      if (result.homeScore == null || result.awayScore == null) continue

      const homeWon = result.homeScore > result.awayScore

      for (const pred of result.game.predictions) {
        const predictedHome = Number(pred.homeWinProb) >= 0.5
        const isCorrect = predictedHome === homeWon
        if (isCorrect) correct++
        total++

        details.push({
          game: `${result.game.awayTeam.nameKo} @ ${result.game.homeTeam.nameKo}`,
          score: `${result.awayScore} - ${result.homeScore}`,
          predicted: predictedHome ? result.game.homeTeam.nameKo : result.game.awayTeam.nameKo,
          actual: homeWon ? result.game.homeTeam.nameKo : result.game.awayTeam.nameKo,
          correct: isCorrect,
          confidence: pred.confidenceGrade,
          model: pred.modelVersion,
        })
      }
    }

    const accuracy = total > 0 ? (correct / total * 100).toFixed(1) : 'N/A'

    return NextResponse.json({
      accuracy: `${accuracy}%`,
      correct,
      total,
      details,
      message: total === 0
        ? '아직 완료된 경기 결과가 없습니다. 경기 결과가 입력되면 모델 정확도가 계산됩니다.'
        : `${total}경기 중 ${correct}경기 정확 (${accuracy}%)`,
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}

/**
 * 경기 결과 입력 + 모델 피드백
 * POST body: { gameId, homeScore, awayScore }
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { gameId, homeScore, awayScore } = body

    if (!gameId || homeScore == null || awayScore == null) {
      return NextResponse.json({ error: 'gameId, homeScore, awayScore required' }, { status: 400 })
    }

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { homeTeam: true, awayTeam: true, predictions: true },
    })
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

    // Save result
    const result = await prisma.gameResult.upsert({
      where: { gameId },
      create: {
        id: crypto.randomUUID(), gameId,
        homeScore, awayScore,
        winnerTeamId: homeScore > awayScore ? game.homeTeamId : game.awayTeamId,
        loserTeamId: homeScore > awayScore ? game.awayTeamId : game.homeTeamId,
        isDraw: homeScore === awayScore,
        endedAt: new Date(), updatedAt: new Date(),
      },
      update: {
        homeScore, awayScore,
        winnerTeamId: homeScore > awayScore ? game.homeTeamId : game.awayTeamId,
        loserTeamId: homeScore > awayScore ? game.awayTeamId : game.homeTeamId,
        isDraw: homeScore === awayScore,
        endedAt: new Date(), updatedAt: new Date(),
      },
    })

    // Update game status
    await prisma.game.update({
      where: { id: gameId },
      data: { status: 'FINAL', updatedAt: new Date() },
    })

    // Analyze prediction accuracy
    const homeWon = homeScore > awayScore
    const analysis = game.predictions.map(pred => {
      const predictedHome = Number(pred.homeWinProb) >= 0.5
      return {
        model: pred.modelVersion,
        predictedWinner: predictedHome ? game.homeTeam.nameKo : game.awayTeam.nameKo,
        actualWinner: homeWon ? game.homeTeam.nameKo : game.awayTeam.nameKo,
        correct: predictedHome === homeWon,
        homeWinProb: Number(pred.homeWinProb),
        error: Math.abs(Number(pred.homeWinProb) - (homeWon ? 1 : 0)),
      }
    })

    return NextResponse.json({
      success: true,
      game: `${game.awayTeam.nameKo} ${awayScore} - ${homeScore} ${game.homeTeam.nameKo}`,
      winner: homeWon ? game.homeTeam.nameKo : game.awayTeam.nameKo,
      analysis,
      message: analysis.some(a => !a.correct)
        ? '모델이 틀렸습니다. 다음 갱신 시 가중치가 조정됩니다.'
        : '모델이 정확했습니다!',
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}
