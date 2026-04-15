import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ALLOWED_ORIGINS = [
  'http://localhost:8082',   // Expo Web dev
  'http://localhost:3456',   // Next.js dev
  'http://localhost:19006',  // Expo Web alt port
]

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin') ?? ''
  const response = NextResponse.next()

  // Dev: allow listed origins. Production: restrict to deployed domain
  const isAllowed = process.env.NODE_ENV === 'development' || ALLOWED_ORIGINS.includes(origin)
  if (isAllowed) {
    response.headers.set('Access-Control-Allow-Origin', origin || '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  }

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200, headers: response.headers })
  }

  return response
}

export const config = {
  matcher: '/api/:path*',
}
