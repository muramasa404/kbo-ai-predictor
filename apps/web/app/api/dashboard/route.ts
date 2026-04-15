import { NextResponse } from 'next/server'
import { getDashboardPayload } from '@/lib/services/dashboard'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') ?? getTodayDate()
  const payload = await getDashboardPayload(date)

  return NextResponse.json(payload)
}

function getTodayDate(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
