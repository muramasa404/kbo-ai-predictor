import { prisma } from '../../../../packages/db/src/client'
import { fetchHtml } from '../core/http'
import { sha256 } from '../core/hash'
import { parseKboHitterSeasonHtml } from '../parsers/kbo-hitter-season.parser'
import { parseKboPitcherSeasonHtml } from '../parsers/kbo-pitcher-season.parser'
import { normalizeTeamName } from '../normalizers/team'
import { PrismaHitterSeasonUpserter } from '../upserters/prisma-hitter-season.upserter'
import { PrismaPitcherSeasonUpserter } from '../upserters/prisma-pitcher-season.upserter'
import { PrismaSourceSnapshotUpserter } from '../upserters/prisma-source-snapshot.upserter'

const HITTER_BASE = 'https://www.koreabaseball.com/Record/Player/HitterBasic/Basic1.aspx?sort=HRA_RT'
const PITCHER_BASE = 'https://www.koreabaseball.com/Record/Player/PitcherBasic/Basic1.aspx'
const MAX_PAGES = 10
const snapshotUpserter = new PrismaSourceSnapshotUpserter()

async function main() {
  const season = await prisma.season.findFirst({ where: { year: 2026 } })
  if (!season) { console.error('Season 2026 not found.'); process.exit(1) }

  console.log(`=== Full Harvest for Season ${season.year} ===\n`)

  // 1. Hitters - all pages
  console.log('[1/3] Collecting ALL hitter pages...')
  const hitterUpserter = new PrismaHitterSeasonUpserter(season.id)
  let totalHitters = 0
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${HITTER_BASE}&page=${page}`
    const fetched = await fetchHtml(url)
    const items = parseKboHitterSeasonHtml(fetched.html)
      .map(item => ({ ...item, teamName: normalizeTeamName(item.teamName) }))

    if (items.length === 0) break

    await snapshotUpserter.upsert({
      sourceName: 'kbo-hitter-season',
      requestUrl: url,
      requestDateKey: `${season.year}-page${page}`,
      responseStatus: fetched.status,
      contentHash: sha256(fetched.html),
      rawBody: fetched.html,
      collectedAt: new Date().toISOString(),
    })
    await hitterUpserter.upsertHitterSeason(items)
    totalHitters += items.length
    console.log(`  Page ${page}: ${items.length} hitters`)

    if (items.length < 30) break
  }
  console.log(`  -> Total: ${totalHitters} hitters\n`)

  // 2. Pitchers - all pages
  console.log('[2/3] Collecting ALL pitcher pages...')
  const pitcherUpserter = new PrismaPitcherSeasonUpserter(season.id)
  let totalPitchers = 0
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${PITCHER_BASE}?page=${page}`
    const fetched = await fetchHtml(url)
    const items = parseKboPitcherSeasonHtml(fetched.html)
      .map(item => ({ ...item, teamName: normalizeTeamName(item.teamName) }))

    if (items.length === 0) break

    await snapshotUpserter.upsert({
      sourceName: 'kbo-pitcher-season',
      requestUrl: url,
      requestDateKey: `${season.year}-page${page}`,
      responseStatus: fetched.status,
      contentHash: sha256(fetched.html),
      rawBody: fetched.html,
      collectedAt: new Date().toISOString(),
    })
    await pitcherUpserter.upsertPitcherSeason(items)
    totalPitchers += items.length
    console.log(`  Page ${page}: ${items.length} pitchers`)

    if (items.length < 24) break
  }
  console.log(`  -> Total: ${totalPitchers} pitchers\n`)

  // 3. Team Rank (already works)
  console.log('[3/3] Team rank already collected.\n')

  // Summary
  const [players, hitters, pitchers, ranks, predictions, snapshots] = await Promise.all([
    prisma.player.count(),
    prisma.playerHitterSeasonStat.count(),
    prisma.playerPitcherSeasonStat.count(),
    prisma.teamRankDaily.count(),
    prisma.prediction.count(),
    prisma.sourceSnapshot.count(),
  ])

  console.log('=== DB Summary ===')
  console.log(`  Players:       ${players}`)
  console.log(`  Hitter Stats:  ${hitters}`)
  console.log(`  Pitcher Stats: ${pitchers}`)
  console.log(`  Team Ranks:    ${ranks}`)
  console.log(`  Predictions:   ${predictions}`)
  console.log(`  Snapshots:     ${snapshots}`)
  console.log(`  Total Records: ${players + hitters + pitchers + ranks + predictions + snapshots}`)

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('Fatal:', e)
  await prisma.$disconnect()
  process.exit(1)
})
