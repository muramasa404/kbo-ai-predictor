import { readFileSync } from 'node:fs'
import { prisma } from '../../../../packages/db/src/client'

interface MlPrediction {
  home: string
  away: string
  homeWinProb: number
  awayWinProb: number
  confidence: string
  reasons: string[]
}

interface MlOutput {
  modelVersion: string
  predictions: MlPrediction[]
}

async function main() {
  const raw = readFileSync('analysis/ml_predictions.json', 'utf-8')
  const ml: MlOutput = JSON.parse(raw)

  console.log(`Loading ML predictions: ${ml.modelVersion}`)
  console.log(`${ml.predictions.length} predictions to save\n`)

  const season = await prisma.season.findFirst({ where: { year: 2026 } })
  if (!season) { console.error('Season 2026 not found'); process.exit(1) }

  const allTeams = await prisma.team.findMany()
  const teamMap = new Map(allTeams.map(t => [t.nameKo, t]))

  // Clear old predictions
  await prisma.prediction.deleteMany({})

  for (const pred of ml.predictions) {
    const homeTeam = teamMap.get(pred.home)
    const awayTeam = teamMap.get(pred.away)
    if (!homeTeam || !awayTeam) {
      console.log(`  Skip: ${pred.away} @ ${pred.home} (team not found)`)
      continue
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const key = `ml_${homeTeam.id}_${awayTeam.id}_${today.toISOString().slice(0, 10)}`

    const game = await prisma.game.upsert({
      where: { sourceGameKey: key },
      create: {
        sourceGameKey: key, seasonId: season.id, gameDate: today,
        gameType: 'REGULAR_SEASON', homeTeamId: homeTeam.id, awayTeamId: awayTeam.id,
        scheduledAt: new Date(today.getTime() + 18.5 * 3600000), status: 'SCHEDULED',
      },
      update: {},
    })

    await prisma.prediction.create({
      data: {
        gameId: game.id,
        modelVersion: ml.modelVersion,
        predictedAt: new Date(),
        homeWinProb: pred.homeWinProb,
        awayWinProb: pred.awayWinProb,
        confidenceGrade: pred.confidence,
        topReasonsJson: pred.reasons,
      },
    })

    console.log(`  ${pred.away} @ ${pred.home}: ${(pred.homeWinProb * 100).toFixed(1)}% [${pred.confidence}]`)
  }

  console.log('\nAll predictions saved to DB.')
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error('Fatal:', e); await prisma.$disconnect(); process.exit(1) })
