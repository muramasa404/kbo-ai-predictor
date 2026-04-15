import { prisma } from '../../../../packages/db/src/client'
import { runKboHitterSeasonHarvest } from './run-kbo-hitter-season-harvest'
import { runKboPitcherSeasonHarvest } from './run-kbo-pitcher-season-harvest'
import { runKboTeamRankHarvest } from './run-kbo-team-rank-harvest'

async function main() {
  const season = await prisma.season.findFirst({ where: { year: 2026 } })
  if (!season) {
    console.error('Season 2026 not found. Run seed first.')
    process.exit(1)
  }

  console.log(`Season: ${season.year} (${season.id})`)
  console.log('---')

  // 1. Hitter Season Stats (auto-creates Player records)
  try {
    console.log('[1/3] Collecting hitter season stats...')
    const hitterCount = await runKboHitterSeasonHarvest({
      seasonId: season.id,
      seasonYear: season.year,
    })
    console.log(`  -> ${hitterCount} hitter records collected`)
  } catch (e) {
    console.error('  -> Hitter season FAILED:', (e as Error).message)
  }

  // 2. Pitcher Season Stats (auto-creates Player records)
  try {
    console.log('[2/3] Collecting pitcher season stats...')
    const pitcherCount = await runKboPitcherSeasonHarvest({
      seasonId: season.id,
      seasonYear: season.year,
    })
    console.log(`  -> ${pitcherCount} pitcher records collected`)
  } catch (e) {
    console.error('  -> Pitcher season FAILED:', (e as Error).message)
  }

  // 3. Team Rank Daily
  try {
    console.log('[3/3] Collecting team rank daily...')
    const rankCount = await runKboTeamRankHarvest({
      seasonId: season.id,
      seasonYear: season.year,
      date: new Date().toISOString().slice(0, 10),
    })
    console.log(`  -> ${rankCount} team rank records collected`)
  } catch (e) {
    console.error('  -> Team rank FAILED:', (e as Error).message)
  }

  // Summary
  const [players, hitters, pitchers, ranks] = await Promise.all([
    prisma.player.count(),
    prisma.playerHitterSeasonStat.count(),
    prisma.playerPitcherSeasonStat.count(),
    prisma.teamRankDaily.count(),
  ])

  console.log('---')
  console.log('DB Summary:')
  console.log(`  Players: ${players}`)
  console.log(`  Hitter Stats: ${hitters}`)
  console.log(`  Pitcher Stats: ${pitchers}`)
  console.log(`  Team Ranks: ${ranks}`)
  console.log('Harvest complete.')
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('Fatal:', e)
  await prisma.$disconnect()
  process.exit(1)
})
