export function normalizeGameStatus(value: string): string {
  const normalized = value.trim().toUpperCase()

  if (normalized.includes('취소') || normalized.includes('우천') || normalized.includes('연기')) {
    return 'CANCELLED'
  }

  if (normalized.includes('종료')) {
    return 'FINAL'
  }

  if (normalized.includes('LIVE')) {
    return 'LIVE'
  }

  return 'SCHEDULED'
}
