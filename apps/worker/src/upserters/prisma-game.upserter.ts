import { prisma } from '../../../../packages/db/src/client'
import type { KboScheduleItem } from '../collectors/kbo-schedule.collector'
import type { GameUpserter } from './game.upserter'

export interface PrismaGameUpserterInput {
  seasonId: string
}

export class PrismaGameUpserter implements GameUpserter {
  constructor(private readonly input: PrismaGameUpserterInput) {}

  async upsertSchedule(items: KboScheduleItem[]): Promise<void> {
    for (const item of items) {
      const homeTeam = await prisma.team.findFirst({ where: { nameKo: item.homeTeamName } })
      const awayTeam = await prisma.team.findFirst({ where: { nameKo: item.awayTeamName } })

      if (!homeTeam || !awayTeam) {
        continue
      }

      const sourceGameKey = item.sourceGameKey ?? `${item.gameDate}_${item.awayTeamName}_${item.homeTeamName}`
      const scheduledAt = item.scheduledAt ? new Date(`${item.gameDate}T${item.scheduledAt}:00+09:00`) : undefined

      const game = await prisma.game.upsert({
        where: { sourceGameKey },
        create: {
          sourceGameKey,
          seasonId: this.input.seasonId,
          gameDate: new Date(`${item.gameDate}T00:00:00+09:00`),
          gameType: 'REGULAR_SEASON',
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          scheduledAt,
          status: normalizePrismaGameStatus(item.status),
        },
        update: {
          scheduledAt,
          status: normalizePrismaGameStatus(item.status),
        },
      })

      await prisma.gameResult.upsert({
        where: { gameId: game.id },
        create: { gameId: game.id },
        update: {},
      })
    }
  }
}

function normalizePrismaGameStatus(status: string): 'SCHEDULED' | 'LIVE' | 'FINAL' | 'CANCELLED' | 'POSTPONED' | 'SUSPENDED' {
  if (status === 'FINAL') {
    return 'FINAL'
  }

  if (status === 'LIVE') {
    return 'LIVE'
  }

  if (status === 'CANCELLED') {
    return 'CANCELLED'
  }

  return 'SCHEDULED'
}
