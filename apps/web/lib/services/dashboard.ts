import type { DashboardPayload } from '../contracts'
import { getDashboardPayloadFromDb } from '../db-dashboard'
import { getKboHitterBasic } from './kbo-hitter-basic'
import { createMockDashboardPayload } from '../mock-data'

export async function getDashboardPayload(date: string): Promise<DashboardPayload> {
  try {
    if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
      return await createFallbackDashboardPayload(date)
    }

    const dbPayload = await getDashboardPayloadFromDb(date)
    return dbPayload ?? (await createFallbackDashboardPayload(date))
  } catch {
    return await createFallbackDashboardPayload(date)
  }
}

async function createFallbackDashboardPayload(date: string): Promise<DashboardPayload> {
  const payload = createMockDashboardPayload(date)

  try {
    const liveHitters = await getKboHitterBasic()
    const liveRankings = liveHitters.items.slice(0, 3).map((item) => ({
      title: `타자 랭킹 ${item.rank}위`,
      leader: item.playerName,
      team: item.teamName,
      value: item.avg ? `${item.avg}` : '-',
      note: `${item.hits ?? 0}안타 · ${item.homeRuns ?? 0}홈런 · 실시간 KBO 수집`,
    }))

    if (liveRankings.length > 0) {
      return {
        ...payload,
        hero: {
          ...payload.hero,
          chips: [...payload.hero.chips.slice(0, 2), '실시간 KBO 타자 기록 반영'],
        },
        rankings: liveRankings,
      }
    }
  } catch {
    return payload
  }

  return payload
}
