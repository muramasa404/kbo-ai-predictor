import { prisma } from '../../../../packages/db/src/client'
import type { KboTeamRankDailyItem } from '../collectors/kbo-team-rank-daily.collector'
import type { TeamRankUpserter } from './team-rank.upserter'

export class PrismaTeamRankUpserter implements TeamRankUpserter {
  constructor(private readonly seasonId: string) {}

  async upsertTeamRanks(items: KboTeamRankDailyItem[]): Promise<void> {
    for (const item of items) {
      const team = await prisma.team.findFirst({ where: { nameKo: item.teamName } })
      if (!team) {
        continue
      }

      await prisma.teamRankDaily.upsert({
        where: {
          rankDate_teamId: {
            rankDate: new Date(`${item.rankDate}T00:00:00+09:00`),
            teamId: team.id,
          },
        },
        create: {
          seasonId: this.seasonId,
          teamId: team.id,
          rankDate: new Date(`${item.rankDate}T00:00:00+09:00`),
          rank: item.rank,
          games: item.games,
          wins: item.wins,
          losses: item.losses,
          draws: item.draws,
          winPct: item.winPct,
          gamesBack: item.gamesBack,
          last10: item.last10,
          streak: item.streak,
          homeRecord: item.homeRecord,
          awayRecord: item.awayRecord,
        },
        update: {
          rank: item.rank,
          games: item.games,
          wins: item.wins,
          losses: item.losses,
          draws: item.draws,
          winPct: item.winPct,
          gamesBack: item.gamesBack,
          last10: item.last10,
          streak: item.streak,
          homeRecord: item.homeRecord,
          awayRecord: item.awayRecord,
        },
      })
    }
  }
}
