import { prisma } from '../../../../packages/db/src/client'
import type { Prisma } from '@prisma/client'
import type { KboGameDetailItem } from '../collectors/kbo-game-detail.collector'
import type { PlayerGameLogUpserter } from './player-game-log.upserter'

export interface PrismaPlayerGameLogUpserterInput {
  gameId: string
}

export class PrismaPlayerGameLogUpserter implements PlayerGameLogUpserter {
  constructor(private readonly input: PrismaPlayerGameLogUpserterInput) {}

  async upsertPlayerGameLogs(items: KboGameDetailItem[]): Promise<void> {
    for (const item of items) {
      const team = await prisma.team.findFirst({ where: { nameKo: item.teamName } })
      const player = await prisma.player.findFirst({ where: { nameKo: item.playerName } })

      if (!team || !player) {
        continue
      }

      await prisma.playerGameLog.upsert({
        where: {
          gameId_playerId: {
            gameId: this.input.gameId,
            playerId: player.id,
          },
        },
        create: {
          gameId: this.input.gameId,
          playerId: player.id,
          teamId: team.id,
          roleType: item.roleType,
          battingOrder: item.battingOrder,
          positionPlayed: item.positionPlayed,
          startedFlag: item.startedFlag,
          rawStatsJson: toInputJson(item.rawStatsJson),
        },
        update: {
          roleType: item.roleType,
          battingOrder: item.battingOrder,
          positionPlayed: item.positionPlayed,
          startedFlag: item.startedFlag,
          rawStatsJson: toInputJson(item.rawStatsJson),
        },
      })
    }
  }
}

function toInputJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}
