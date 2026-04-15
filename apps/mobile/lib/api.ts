import type { DashboardData, DbStatus } from './types'

// Vercel 배포 API — 단일 소스
const API_BASE = 'https://web-muramasa404s-projects.vercel.app'

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json()
}

export function fetchDashboard(): Promise<DashboardData> {
  return fetchJson<DashboardData>('/api/dashboard')
}

export function fetchDbStatus(): Promise<DbStatus> {
  return fetchJson<DbStatus>('/api/db-status')
}
