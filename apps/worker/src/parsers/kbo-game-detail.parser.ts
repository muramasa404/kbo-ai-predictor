import type { KboGameDetailItem } from '../collectors/kbo-game-detail.collector'
import { extractTableRows } from './html'

const TEAM_NAMES = ['LG', '한화', 'SSG', '삼성', 'NC', 'KT', '롯데', 'KIA', '두산', '키움']

export function parseKboGameDetailHtml(html: string, gameDate?: string): KboGameDetailItem[] {
  const rows = extractTableRows(html)
  const items: KboGameDetailItem[] = []

  for (const cells of rows) {
    if (cells.length < 3) {
      continue
    }

    const teamName = cells.find((cell) => TEAM_NAMES.includes(cell))
    const playerName = findLikelyPlayerName(cells)
    if (!teamName || !playerName) {
      continue
    }

    const isPitcher = cells.some((cell) => /(투구수|이닝|삼진|볼넷)/.test(cell))
    const battingOrder = findLeadingOrder(cells[0])
    const positionPlayed = isPitcher ? 'P' : findPosition(cells)

    items.push({
      gameDate,
      playerName,
      teamName,
      roleType: isPitcher ? (battingOrder ? 'STARTING_PITCHER' : 'RELIEF_PITCHER') : 'HITTER',
      battingOrder,
      positionPlayed,
      startedFlag: Boolean(battingOrder) || positionPlayed === 'P',
      rawStatsJson: {
        cells,
      },
    })
  }

  return dedupe(items)
}

function findLikelyPlayerName(cells: string[]): string | undefined {
  return cells.find((cell) => {
    if (TEAM_NAMES.includes(cell)) {
      return false
    }

    if (/^[0-9.:-]+$/.test(cell)) {
      return false
    }

    return /^[가-힣A-Za-z]{2,}$/.test(cell)
  })
}

function findLeadingOrder(value: string): number | undefined {
  const match = value.match(/^(\d)/)
  if (!match) {
    return undefined
  }

  const parsed = Number.parseInt(match[1], 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

function findPosition(cells: string[]): string | undefined {
  return cells.find((cell) => /^(포수|내야수|외야수|1B|2B|3B|SS|LF|CF|RF|DH|C)$/.test(cell))
}

function dedupe(items: KboGameDetailItem[]): KboGameDetailItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = [item.gameDate ?? '', item.teamName, item.playerName, item.roleType].join('_')
    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}
