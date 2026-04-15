import { createContext, useContext, useCallback, useEffect, useState } from 'react'
import { fetchDashboard, fetchDbStatus } from './api'
import type { DashboardData, DbStatus } from './types'

interface DataState {
  data: DashboardData | null
  dbStatus: DbStatus | null
  loading: boolean
  error: string | null
  updatedAt: string
  refresh: () => Promise<void>
}

const DataContext = createContext<DataState>({
  data: null, dbStatus: null, loading: true, error: null, updatedAt: '', refresh: async () => {},
})

export function useData() {
  return useContext(DataContext)
}

export function useDataProvider(): DataState {
  const [data, setData] = useState<DashboardData | null>(null)
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState('')

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const [dashRes, dbRes] = await Promise.all([fetchDashboard(), fetchDbStatus()])
      setData(dashRes)
      setDbStatus(dbRes)
      setUpdatedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }))
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러올 수 없습니다')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [refresh])

  return { data, dbStatus, loading, error, updatedAt, refresh }
}

export { DataContext }
