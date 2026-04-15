import { prisma } from '../../../../packages/db/src/client'
import type { KboPitcherSeasonItem } from '../collectors/kbo-pitcher-season.collector'
import type { PitcherSeasonUpserter } from './pitcher-season.upserter'

export class PrismaPitcherSeasonUpserter implements PitcherSeasonUpserter {
  constructor(private readonly seasonId: string) {}

  async upsertPitcherSeason(items: KboPitcherSeasonItem[]): Promise<void> {
    // Pre-load all teams to avoid N+1 queries
    const allTeams = await prisma.team.findMany()
    const teamMap = new Map(allTeams.flatMap(t => [
      [t.nameKo, t],
      [t.code, t],
    ]))

    for (const item of items) {
      const team = teamMap.get(item.teamName)
      const player = await this.findOrCreatePlayer(item.playerName, item.teamName, team?.id)

      await prisma.playerPitcherSeasonStat.upsert({
        where: {
          seasonId_playerId: { seasonId: this.seasonId, playerId: player.id },
        },
        create: {
          seasonId: this.seasonId,
          playerId: player.id,
          teamId: team?.id,
          games: item.games ?? 0,
          gamesStarted: item.gamesStarted ?? 0,
          wins: item.wins ?? 0,
          losses: item.losses ?? 0,
          saves: item.saves ?? 0,
          holds: item.holds ?? 0,
          inningsPitched: parseInningsPitched(item.inningsPitched),
          strikeOuts: item.strikeOuts ?? 0,
          walks: item.walks ?? 0,
          era: item.era,
          whip: item.whip,
        },
        update: {
          teamId: team?.id,
          games: item.games ?? 0,
          gamesStarted: item.gamesStarted ?? 0,
          wins: item.wins ?? 0,
          losses: item.losses ?? 0,
          saves: item.saves ?? 0,
          holds: item.holds ?? 0,
          inningsPitched: parseInningsPitched(item.inningsPitched),
          strikeOuts: item.strikeOuts ?? 0,
          walks: item.walks ?? 0,
          era: item.era,
          whip: item.whip,
        },
      })
    }
  }

  private async findOrCreatePlayer(name: string, teamName: string, teamId?: string) {
    const sourcePlayerId = `${name}_${teamName}`
    return prisma.player.upsert({
      where: { sourcePlayerId },
      create: { sourcePlayerId, nameKo: name, currentTeamId: teamId, roleType: 'STARTING_PITCHER' },
      update: { currentTeamId: teamId },
    })
  }
}

/** "16 1/3" → "16.33", "7 2/3" → "7.67", "45" → "45" */
function parseInningsPitched(value?: string): string | undefined {
  if (!value) return undefined
  const parts = value.trim().split(/\s+/)
  const whole = parseInt(parts[0], 10)
  if (isNaN(whole)) return undefined
  if (parts.length === 1) return String(whole)
  const match = parts[1]?.match(/^(\d+)\/(\d+)$/)
  if (!match) return String(whole)
  const num = parseInt(match[1], 10)
  const den = parseInt(match[2], 10)
  if (den === 0) return String(whole)
  return (whole + num / den).toFixed(2)
}
