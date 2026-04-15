import { prisma } from '../../../../packages/db/src/client'
import { PredictionService } from '../services/prediction.service'

async function main() {
  const season = await prisma.season.findFirst({ where: { year: 2026 } })
  if (!season) {
    console.error('Season 2026 not found.')
    process.exit(1)
  }

  console.log(`Generating predictions for season ${season.year}...`)
  const service = new PredictionService()
  const count = await service.generatePredictions(season.id)
  console.log(`${count} predictions generated.`)

  const predictions = await prisma.prediction.findMany({
    include: { game: { include: { homeTeam: true, awayTeam: true } } },
    orderBy: { homeWinProb: 'desc' },
  })

  for (const p of predictions) {
    const homeProb = (Number(p.homeWinProb) * 100).toFixed(1)
    const awayProb = (Number(p.awayWinProb) * 100).toFixed(1)
    console.log(`  ${p.game.awayTeam.nameKo} @ ${p.game.homeTeam.nameKo}: ${homeProb}% vs ${awayProb}% [${p.confidenceGrade}]`)
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('Fatal:', e)
  await prisma.$disconnect()
  process.exit(1)
})
