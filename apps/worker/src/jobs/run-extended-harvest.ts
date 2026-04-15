import { collectExtendedStats } from '../collectors/kbo-extended-stats.collector'
import { PrismaSourceSnapshotUpserter } from '../upserters/prisma-source-snapshot.upserter'

async function main() {
  console.log('=== Extended KBO Stats Harvest ===\n')

  const result = await collectExtendedStats()

  // Save snapshots
  const snapshotUpserter = new PrismaSourceSnapshotUpserter()
  for (const snap of result.snapshots) {
    await snapshotUpserter.upsert(snap)
  }

  console.log(`Hitters:  ${result.hitters.length} (19+ columns each)`)
  console.log(`Pitchers: ${result.pitchers.length} (21+ columns each)`)
  console.log(`Runners:  ${result.runners.length}\n`)

  // Sample hitter data
  console.log('--- Top 5 Hitters (extended) ---')
  result.hitters.slice(0, 5).forEach(h => {
    console.log(`  ${h.playerName}(${h.teamName}) AVG:${h.avg} HR:${h.hr} RBI:${h.rbi} BB:${h.bb} SO:${h.so} SB:${h.sb} ISOP:${h.isop ?? '-'} GPA:${h.gpa ?? '-'}`)
  })

  console.log('\n--- Top 5 Pitchers (extended) ---')
  result.pitchers.slice(0, 5).forEach(p => {
    console.log(`  ${p.playerName}(${p.teamName}) ERA:${p.era} W:${p.wins} L:${p.losses} SO:${p.so} BB:${p.bb} WHIP:${((p.hitsAllowed + p.bb) / Math.max(p.ip, 1)).toFixed(2)} TBF:${p.tbf} HR:${p.hrAllowed}`)
  })

  console.log('\n--- Top 5 Runners ---')
  result.runners.slice(0, 5).forEach(r => {
    const pct = r.sba > 0 ? ((r.sb / r.sba) * 100).toFixed(0) : '0'
    console.log(`  ${r.playerName}(${r.teamName}) SB:${r.sb}/${r.sba} (${pct}%)`)
  })

  console.log('\n=== Harvest Complete ===')

  // Return for use in prediction engine
  return result
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })

export { main as runExtendedHarvest }
