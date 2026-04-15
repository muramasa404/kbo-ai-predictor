import { NextResponse } from 'next/server'
import { prisma } from '../../../../lib/prisma'

/**
 * KBO 경기 일정 + 결과 수집 API
 * 수동 호출 또는 외부 스케줄러에서 호출
 * GET /api/cron/collect?date=2026-04-15
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)

  try {
    // KBO 일정 페이지 크롤링
    const html = await fetch('https://www.koreabaseball.com/Schedule/Schedule.aspx', {
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    }).then(r => r.text())

    // 테이블에서 경기 정보 추출
    const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    const games: Array<{ time: string; away: string; home: string; score?: string; status: string }> = []

    for (const row of rows) {
      const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map(c => c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim())

      // KBO 일정 테이블: 시간, 원정, vs, 홈, 결과, 구장 등
      if (cells.length >= 5 && /^\d{2}:\d{2}$/.test(cells[0])) {
        const status = cells[4]?.includes('종료') ? 'FINAL' :
                       cells[4]?.includes('취소') ? 'CANCELLED' :
                       cells[4]?.includes('경기') ? 'LIVE' : 'SCHEDULED'
        games.push({
          time: cells[0],
          away: cells[1],
          home: cells[3],
          score: cells[4] ?? '',
          status,
        })
      }
    }

    return NextResponse.json({
      success: true,
      date,
      gamesFound: games.length,
      games,
      note: games.length === 0 ? 'KBO 페이지가 ASP.NET PostBack 기반이라 일정 파싱이 제한적입니다. 수동 데이터 수집을 병행해주세요.' : undefined,
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  }
}
