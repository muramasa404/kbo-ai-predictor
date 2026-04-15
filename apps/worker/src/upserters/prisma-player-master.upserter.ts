import { prisma } from '../../../../packages/db/src/client'
import type { KboPlayerMasterItem } from '../collectors/kbo-player-master.collector'
import type { PlayerMasterUpserter } from './player-master.upserter'

export class PrismaPlayerMasterUpserter implements PlayerMasterUpserter {
  async upsertPlayers(items: KboPlayerMasterItem[]): Promise<void> {
    for (const item of items) {
      const team = item.teamName ? await prisma.team.findFirst({ where: { nameKo: item.teamName } }) : null
      const sourcePlayerId = item.sourcePlayerId ?? buildFallbackSourcePlayerId(item)

      const player = await prisma.player.upsert({
        where: { sourcePlayerId },
        create: {
          sourcePlayerId,
          currentTeamId: team?.id,
          nameKo: item.nameKo,
          positionPrimary: item.positionPrimary,
          throwsHand: normalizeHand(item.throwsHand),
          batsHand: normalizeHand(item.batsHand),
        },
        update: {
          currentTeamId: team?.id,
          nameKo: item.nameKo,
          positionPrimary: item.positionPrimary,
          throwsHand: normalizeHand(item.throwsHand),
          batsHand: normalizeHand(item.batsHand),
        },
      })

      await prisma.playerProfile.upsert({
        where: { playerId: player.id },
        create: {
          playerId: player.id,
          birthDate: item.birthDate ? new Date(`${item.birthDate}T00:00:00+09:00`) : null,
          debutYear: item.debutYear,
          heightCm: item.heightCm,
          weightKg: item.weightKg,
        },
        update: {
          birthDate: item.birthDate ? new Date(`${item.birthDate}T00:00:00+09:00`) : undefined,
          debutYear: item.debutYear,
          heightCm: item.heightCm,
          weightKg: item.weightKg,
        },
      })
    }
  }
}

function buildFallbackSourcePlayerId(item: KboPlayerMasterItem): string {
  return [item.nameKo, item.teamName ?? 'UNKNOWN', item.birthDate ?? 'UNKNOWN'].join('_')
}

function normalizeHand(value?: string): 'R' | 'L' | 'S' | 'U' {
  if (!value) {
    return 'U'
  }

  if (/[우R]/i.test(value)) {
    return 'R'
  }

  if (/[좌L]/i.test(value)) {
    return 'L'
  }

  if (/S/i.test(value)) {
    return 'S'
  }

  return 'U'
}
