import type { KboPlayerMasterItem } from '../collectors/kbo-player-master.collector'
import { extractTableRows } from './html'

export function parseKboPlayerMasterHtml(html: string): KboPlayerMasterItem[] {
  const rows = extractTableRows(html)

  return rows
    .filter((cells) => cells.length >= 3)
    .filter((cells) => isPlayerRow(cells))
    .map((cells) => ({
      nameKo: cells[0],
      teamName: cells[1],
      positionPrimary: cells[2],
      throwsHand: cells[3],
      batsHand: cells[4],
      birthDate: cells[5] ? normalizeBirthDate(cells[5]) : undefined,
      heightCm: cells[6] ? toInt(cells[6]) : undefined,
      weightKg: cells[7] ? toInt(cells[7]) : undefined,
      debutYear: cells[8] ? toInt(cells[8]) : undefined,
    }))
}

function isPlayerRow(cells: string[]): boolean {
  return cells[0] !== '선수명' && cells[0].length >= 2
}

function normalizeBirthDate(value: string): string | undefined {
  const match = value.match(/(\d{4})[.-](\d{1,2})[.-](\d{1,2})/)
  if (!match) {
    return undefined
  }

  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

function toInt(value: string): number | undefined {
  const digits = value.replace(/[^\d]/g, '')
  if (!digits) {
    return undefined
  }

  const parsed = Number.parseInt(digits, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}
