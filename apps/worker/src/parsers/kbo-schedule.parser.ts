import type { KboScheduleItem } from '../collectors/kbo-schedule.collector'
import { extractTableRows } from './html'

const TEAM_NAMES = ['LG', '한화', 'SSG', '삼성', 'NC', 'KT', '롯데', 'KIA', '두산', '키움']

export function parseKboScheduleHtml(html: string, fallbackDate?: string): KboScheduleItem[] {
  const rows = extractTableRows(html)
  const items: KboScheduleItem[] = []
  let currentDate = fallbackDate

  for (const cells of rows) {
    if (cells.length < 4) {
      continue
    }

    if (looksLikeDate(cells[0])) {
      currentDate = normalizeDate(cells[0]) ?? currentDate
    }

    const gameCell = cells.find((cell) => containsKnownTeam(cell))
    if (!gameCell || !currentDate) {
      continue
    }

    const teams = parseTeams(gameCell)
    if (!teams) {
      continue
    }

    items.push({
      gameDate: currentDate,
      scheduledAt: findTime(cells),
      awayTeamName: teams.awayTeamName,
      homeTeamName: teams.homeTeamName,
      status: findStatus(cells),
      stadium: findStadium(cells),
      broadcastNames: findBroadcastNames(cells),
      note: cells[cells.length - 1] || undefined,
      sourceGameKey: [currentDate, teams.awayTeamName, teams.homeTeamName, findTime(cells) ?? ''].join('_'),
    })
  }

  return dedupeScheduleItems(items)
}

function looksLikeDate(value: string): boolean {
  return /\d{4}[.-]\d{1,2}[.-]\d{1,2}|\d{1,2}[./-]\d{1,2}/.test(value)
}

function normalizeDate(value: string): string | undefined {
  const full = value.match(/(\d{4})[.-](\d{1,2})[.-](\d{1,2})/)
  if (full) {
    return `${full[1]}-${full[2].padStart(2, '0')}-${full[3].padStart(2, '0')}`
  }

  return undefined
}

function containsKnownTeam(value: string): boolean {
  return TEAM_NAMES.some((teamName) => value.includes(teamName))
}

function parseTeams(value: string): { awayTeamName: string; homeTeamName: string } | undefined {
  const teams = TEAM_NAMES.filter((teamName) => value.includes(teamName))
  if (teams.length < 2) {
    return undefined
  }

  const [awayTeamName, homeTeamName] = teams.slice(0, 2)
  return { awayTeamName, homeTeamName }
}

function findTime(cells: string[]): string | undefined {
  return cells.find((cell) => /\b\d{1,2}:\d{2}\b/.test(cell))
}

function findStatus(cells: string[]): string {
  return cells.find((cell) => /(예정|종료|취소|우천|연기|LIVE|경기전|경기종료)/i.test(cell)) ?? 'SCHEDULED'
}

function findStadium(cells: string[]): string | undefined {
  return cells[cells.length - 2] || undefined
}

function findBroadcastNames(cells: string[]): string[] {
  return cells.filter((cell) => /SPOTV|KBS|MBC|SBS|tvN|IB SPORTS|라디오/i.test(cell))
}

function dedupeScheduleItems(items: KboScheduleItem[]): KboScheduleItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.sourceGameKey ?? `${item.gameDate}_${item.awayTeamName}_${item.homeTeamName}_${item.scheduledAt ?? ''}`
    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}
