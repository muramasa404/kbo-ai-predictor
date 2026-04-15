import type { KboHitterSeasonItem } from '../collectors/kbo-hitter-season.collector'
import { extractTableRows } from './html'

export function parseKboHitterSeasonHtml(html: string): KboHitterSeasonItem[] {
  const rows = extractTableRows(html)

  return rows
    .filter((cells) => cells.length >= 15)
    .filter((cells) => isNumeric(cells[0]) && cells[2].length > 0)
    .map((cells) => ({
      playerName: cells[1],
      teamName: cells[2],
      avg: cells[3],
      games: toInt(cells[4]),
      plateAppearances: toInt(cells[5]),
      atBats: toInt(cells[6]),
      runs: toInt(cells[7]),
      hits: toInt(cells[8]),
      doubles: toInt(cells[9]),
      triples: toInt(cells[10]),
      homeRuns: toInt(cells[11]),
      totalBases: toInt(cells[12]),
      runsBattedIn: toInt(cells[13]),
    }))
}

function toInt(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

function isNumeric(value: string): boolean {
  return /^\d+$/.test(value)
}
