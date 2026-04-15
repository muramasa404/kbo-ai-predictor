/**
 * Migrate all data from local Docker PostgreSQL to Supabase
 * Reads from local DB, transforms IDs to match Supabase team IDs, writes to Supabase
 */
import { prisma } from '../../../../packages/db/src/client'

async function main() {
  console.log('=== Migrate Local → Supabase ===\n')

  // 1. Read all data from local DB
  const season = await prisma.season.findFirst({ where: { year: 2026 } })
  if (!season) { console.error('No season'); process.exit(1) }

  const localTeams = await prisma.team.findMany()
  const localPlayers = await prisma.player.findMany()
  const localHitters = await prisma.playerHitterSeasonStat.findMany()
  const localPitchers = await prisma.playerPitcherSeasonStat.findMany()
  const localRanks = await prisma.teamRankDaily.findMany()
  const localGames = await prisma.game.findMany()
  const localPredictions = await prisma.prediction.findMany()

  console.log(`Local data: ${localTeams.length} teams, ${localPlayers.length} players`)
  console.log(`  ${localHitters.length} hitters, ${localPitchers.length} pitchers`)
  console.log(`  ${localRanks.length} ranks, ${localGames.length} games, ${localPredictions.length} predictions\n`)

  // For now, output INSERT SQL that can be run via Supabase execute_sql
  // This avoids needing the Supabase DB password

  const seasonId = '7ea3c5cf-36cb-48d3-b75c-7daa7123c1d1'

  // Map local team IDs to Supabase team IDs (by code)
  const supabaseTeams: Record<string, string> = {
    'HH': '6779d821-3251-4937-8251-8f9eee82b82d',
    'KIA': '2f445962-767d-4f50-9898-fdeeee10d403',
    'KT': 'b14c050a-56d3-4738-8e3f-9ac17e8dc4cd',
    'KW': '489a209b-b730-48ff-abbe-18526271bd85',
    'LG': '5716b69d-a2ac-4e61-a0b1-31488f2f207b',
    'LT': 'cc1d1f2c-c0fe-479c-82ea-a259aed37c34',
    'NC': '82ea77a3-dc3c-409c-b010-69e52666dd7b',
    'OB': 'dc1cc76a-58df-4e86-a9ff-ee348b89fbe1',
    'SS': 'edd8284c-77d8-435b-a01b-9b3d3d3db061',
    'SSG': 'dc0647a4-0ad9-4b26-bb83-9a90ff010027',
  }

  // Create local team ID → Supabase team ID map
  const teamIdMap = new Map<string, string>()
  for (const lt of localTeams) {
    const sbId = supabaseTeams[lt.code]
    if (sbId) teamIdMap.set(lt.id, sbId)
  }

  function mapTeamId(localId: string | null): string | null {
    if (!localId) return null
    return teamIdMap.get(localId) ?? null
  }

  function esc(v: string | null | undefined): string {
    if (v == null) return 'NULL'
    return `'${v.replace(/'/g, "''")}'`
  }

  // Generate SQL
  const sql: string[] = []

  // Players
  for (const p of localPlayers) {
    sql.push(`INSERT INTO "Player" ("id","sourcePlayerId","currentTeamId","nameKo","throwsHand","batsHand","roleType","isActive","createdAt","updatedAt") VALUES (${esc(p.id)},${esc(p.sourcePlayerId)},${esc(mapTeamId(p.currentTeamId))},${esc(p.nameKo)},'${p.throwsHand}','${p.batsHand}','${p.roleType}',${p.isActive},now(),now()) ON CONFLICT ("sourcePlayerId") DO NOTHING;`)
  }

  // Team Ranks
  for (const r of localRanks) {
    sql.push(`INSERT INTO "TeamRankDaily" ("id","seasonId","teamId","rankDate","rank","games","wins","losses","draws","winPct","gamesBack","last10","streak","homeRecord","awayRecord","createdAt","updatedAt") VALUES (gen_random_uuid(),${esc(seasonId)},${esc(mapTeamId(r.teamId))},'${r.rankDate.toISOString()}',${r.rank},${r.games},${r.wins},${r.losses},${r.draws},${r.winPct},${r.gamesBack},${esc(r.last10)},${esc(r.streak)},${esc(r.homeRecord)},${esc(r.awayRecord)},now(),now()) ON CONFLICT ("rankDate","teamId") DO NOTHING;`)
  }

  // Hitter stats
  for (const h of localHitters) {
    sql.push(`INSERT INTO "PlayerHitterSeasonStat" ("id","seasonId","playerId","teamId","games","plateAppearances","atBats","runs","hits","doubles","triples","homeRuns","runsBattedIn","walks","strikeOuts","avg","createdAt","updatedAt") VALUES (gen_random_uuid(),${esc(seasonId)},${esc(h.playerId)},${esc(mapTeamId(h.teamId ?? ''))},${h.games},${h.plateAppearances},${h.atBats},${h.runs},${h.hits},${h.doubles},${h.triples},${h.homeRuns},${h.runsBattedIn},${h.walks},${h.strikeOuts},${h.avg},now(),now()) ON CONFLICT ("seasonId","playerId") DO NOTHING;`)
  }

  // Pitcher stats
  for (const p of localPitchers) {
    sql.push(`INSERT INTO "PlayerPitcherSeasonStat" ("id","seasonId","playerId","teamId","games","gamesStarted","inningsPitched","wins","losses","saves","holds","strikeOuts","walks","era","whip","createdAt","updatedAt") VALUES (gen_random_uuid(),${esc(seasonId)},${esc(p.playerId)},${esc(mapTeamId(p.teamId ?? ''))},${p.games},${p.gamesStarted},${p.inningsPitched},${p.wins},${p.losses},${p.saves},${p.holds},${p.strikeOuts},${p.walks},${p.era},${p.whip},now(),now()) ON CONFLICT ("seasonId","playerId") DO NOTHING;`)
  }

  // Games
  for (const g of localGames) {
    sql.push(`INSERT INTO "Game" ("id","sourceGameKey","seasonId","gameDate","gameType","homeTeamId","awayTeamId","scheduledAt","status","createdAt","updatedAt") VALUES (${esc(g.id)},${esc(g.sourceGameKey)},${esc(seasonId)},'${g.gameDate.toISOString()}','${g.gameType}',${esc(mapTeamId(g.homeTeamId))},${esc(mapTeamId(g.awayTeamId))},'${g.scheduledAt?.toISOString() ?? g.gameDate.toISOString()}','${g.status}',now(),now()) ON CONFLICT ("sourceGameKey") DO NOTHING;`)
  }

  // Predictions
  for (const p of localPredictions) {
    const reasons = JSON.stringify(p.topReasonsJson).replace(/'/g, "''")
    sql.push(`INSERT INTO "Prediction" ("id","gameId","modelVersion","predictedAt","homeWinProb","awayWinProb","confidenceGrade","topReasonsJson","createdAt") VALUES (gen_random_uuid(),${esc(p.gameId)},${esc(p.modelVersion)},'${p.predictedAt.toISOString()}',${p.homeWinProb},${p.awayWinProb},${esc(p.confidenceGrade)},'${reasons}'::jsonb,now()) ON CONFLICT DO NOTHING;`)
  }

  // Write SQL file
  const fs = await import('node:fs')
  fs.writeFileSync('analysis/supabase_data.sql', sql.join('\n'), 'utf-8')
  console.log(`Generated ${sql.length} INSERT statements → analysis/supabase_data.sql`)

  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
