import './globals.css'
import type { Metadata } from 'next'
import { Analytics } from './analytics'

export const metadata: Metadata = {
  title: 'KBO AI Predictor',
  description: 'KBO 승부예측 AI 서비스',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#1d1d1f" />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
