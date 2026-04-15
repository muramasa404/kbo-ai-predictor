import { prisma } from '../../../../packages/db/src/client'
import type { KboHitterSeasonItem } from '../collectors/kbo-hitter-season.collector'
import type { HitterSeasonUpserter } from './hitter-season.upserter'

export class PrismaHitterSeasonUpserter implements HitterSeasonUpserter {
  constructor(private readonly seasonId: string) {}

  async upsertHitterSeason(items: KboHitterSeasonItem[]): Promise<void> {
    // Pre-load all teams to avoid N+1 queries
    const allTeams = await prisma.team.findMany()
    const teamMap = new Map(allTeams.flatMap(t => [
      [t.nameKo, t],
      [t.code, t],
    ]))

    for (const item of items) {
      const team = teamMap.get(item.teamName)
      const player = await this.findOrCreatePlayer(item.playerName, item.teamName, team?.id)

      await prisma.playerHitterSeasonStat.upsert({
        where: {
          seasonId_playerId: { seasonId: this.seasonId, playerId: player.id },
        },
        create: {
          seasonId: this.seasonId,
          playerId: player.id,
          teamId: team?.id,
          games: item.games ?? 0,
          plateAppearances: item.plateAppearances ?? 0,
          atBats: item.atBats ?? 0,
          runs: item.runs ?? 0,
          hits: item.hits ?? 0,
          doubles: item.doubles ?? 0,
          triples: item.triples ?? 0,
          homeRuns: item.homeRuns ?? 0,
          runsBattedIn: item.runsBattedIn ?? 0,
          avg: item.avg,
        },
        update: {
          teamId: team?.id,
          games: item.games ?? 0,
          plateAppearances: item.plateAppearances ?? 0,
          atBats: item.atBats ?? 0,
          runs: item.runs ?? 0,
          hits: item.hits ?? 0,
          doubles: item.doubles ?? 0,
          triples: item.triples ?? 0,
          homeRuns: item.homeRuns ?? 0,
          runsBattedIn: item.runsBattedIn ?? 0,
          avg: item.avg,
        },
      })
    }
  }

  private async findOrCreatePlayer(name: string, teamName: string, teamId?: string) {
    const sourcePlayerId = `${name}_${teamName}`
    return prisma.player.upsert({
      where: { sourcePlayerId },
      create: { sourcePlayerId, nameKo: name, currentTeamId: teamId, roleType: 'HITTER' },
      update: { currentTeamId: teamId },
    })
  }
}
