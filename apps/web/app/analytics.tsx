'use client'

import { useEffect } from 'react'

const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? ''
const NAVER_ID = process.env.NEXT_PUBLIC_NAVER_ANALYTICS_ID ?? ''

export function Analytics() {
  useEffect(() => {
    if (GA_ID) loadGoogleAnalytics(GA_ID)
    if (NAVER_ID) loadNaverAnalytics(NAVER_ID)
  }, [])
  return null
}

function loadGoogleAnalytics(id: string) {
  if (document.getElementById('ga4-src')) return
  const tag = document.createElement('script')
  tag.id = 'ga4-src'
  tag.async = true
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
  document.head.appendChild(tag)

  const w = window as unknown as { dataLayer: unknown[]; gtag: (...args: unknown[]) => void }
  w.dataLayer = w.dataLayer || []
  w.gtag = function gtag(...args: unknown[]) { w.dataLayer.push(args) }
  w.gtag('js', new Date())
  w.gtag('config', id)
}

function loadNaverAnalytics(id: string) {
  if (document.getElementById('naver-wa-src')) return
  const w = window as unknown as { wcs_add?: Record<string, string>; wcs?: { inflow: (arg: string) => void }; wcs_do?: () => void }
  w.wcs_add = w.wcs_add ?? {}
  w.wcs_add.wa = id
  const tag = document.createElement('script')
  tag.id = 'naver-wa-src'
  tag.async = true
  tag.src = 'https://wcs.naver.net/wcslog.js'
  tag.onload = () => { if (w.wcs_do) w.wcs_do() }
  document.head.appendChild(tag)
}
