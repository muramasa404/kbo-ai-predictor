import { NextResponse } from 'next/server'
import { getKboHitterBasic } from '@/lib/services/kbo-hitter-basic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const sort = searchParams.get('sort') ?? 'HRA_RT'

  try {
    const payload = await getKboHitterBasic(sort)
    return NextResponse.json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json(
      {
        message: 'KBO 타자 기본 기록 조회에 실패했습니다.',
        detail: message,
      },
      { status: 502 },
    )
  }
}
