import type { KboPitcherSeasonItem } from '../collectors/kbo-pitcher-season.collector'
import { extractTableRows } from './html'

export function parseKboPitcherSeasonHtml(html: string): KboPitcherSeasonItem[] {
  const rows = extractTableRows(html)

  return rows
    .filter((cells) => cells.length >= 12)
    .filter((cells) => /^\d+$/.test(cells[0]) && cells[2].length > 0)
    .map((cells) => ({
      playerName: cells[1],
      teamName: cells[2],
      era: cells[3],
      games: toInt(cells[4]),
      gamesStarted: toInt(cells[5]),
      wins: toInt(cells[6]),
      losses: toInt(cells[7]),
      saves: toInt(cells[8]),
      holds: toInt(cells[9]),
      inningsPitched: cells[10],
      strikeOuts: toInt(cells[11]),
      walks: toInt(cells[12]),
      whip: cells[13],
    }))
}

function toInt(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}
