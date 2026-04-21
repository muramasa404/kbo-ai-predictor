import { NextResponse } from 'next/server'
import { getDashboardPayload } from '@/lib/services/dashboard'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const today = getTodayDate()
  const date = searchParams.get('date') ?? today
  const payload = await getDashboardPayload(date)

  const res = NextResponse.json(payload)
  // Past dates are immutable — Vercel's edge cache can hold them for a day
  // and serve stale while revalidating. Today still hits the origin every
  // request so live scores stay fresh.
  if (date < today) {
    res.headers.set(
      'Cache-Control',
      'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
    )
  } else {
    res.headers.set('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=120')
  }
  return res
}

function getTodayDate(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
