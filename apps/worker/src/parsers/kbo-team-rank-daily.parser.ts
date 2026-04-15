import type { KboTeamRankDailyItem } from '../collectors/kbo-team-rank-daily.collector'
import { extractTableRows } from './html'

const TEAM_NAMES = ['SSG', 'NC', 'KT', '삼성', 'LG', '한화', '두산', '롯데', 'KIA', '키움']

export function parseKboTeamRankDailyHtml(html: string, rankDate: string): KboTeamRankDailyItem[] {
  const rows = extractTableRows(html)

  return rows
    .filter((cells) => cells.length >= 11)
    .filter((cells) => TEAM_NAMES.includes(cells[1]))
    .map((cells) => ({
      rankDate,
      rank: toInt(cells[0]),
      teamName: cells[1],
      games: toInt(cells[2]),
      wins: toInt(cells[3]),
      losses: toInt(cells[4]),
      draws: toInt(cells[5]),
      winPct: cells[6],
      gamesBack: cells[7],
      last10: cells[8],
      streak: cells[9],
      homeRecord: cells[10],
      awayRecord: cells[11],
    }))
}

function toInt(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? 0 : parsed
}
