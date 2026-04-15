const DAY_MS = 24 * 60 * 60 * 1000

export function enumerateDateRange(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00+09:00`)
  const end = new Date(`${to}T00:00:00+09:00`)
  const dates: string[] = []

  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += DAY_MS) {
    dates.push(formatDate(new Date(cursor)))
  }

  return dates
}

export function formatDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}
