'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getTeamLogo, getTeamColor } from '@/lib/team-assets'

/*
 * Donald Norman HCI Principles applied:
 * 1. Visibility — Key info (date, score, status) always visible
 * 2. Feedback — Tab transitions, loading states, live indicator
 * 3. Mapping — Natural tab order: predict → rank → stats → system
 * 4. Consistency — Same card patterns across all tabs
 * 5. Affordance — Tappable elements look tappable
 * 6. Constraints — Scroll resets on tab change, preventing disorientation
 */

type Tab = 'home' | 'rank' | 'stats' | 'system'

interface DashboardData {
  date?: string
  hero: { title: string; copy: string; chips: string[] }
  predictions: Array<{ id: string; gameTime: string; homeTeam: string; awayTeam: string; favoredTeam: string; winProbability: number; confidence: string; topReasons: string[]; homeStarter?: { name: string; era: string; record: string } | null; awayStarter?: { name: string; era: string; record: string } | null }>
  teamRanks: Array<{ rank: number; teamName: string; wins: number; losses: number; draws: number; winPct: string; gamesBack: string; last10: string; streak: string }>
  allHitters: Array<{ rank: number; playerName: string; teamName: string; avg: string; games: number; hits: number; homeRuns: number; rbi: number }>
  allPitchers: Array<{ rank: number; playerName: string; teamName: string; era: string; games: number; wins: number; losses: number; strikeOuts: number; whip: string }>
  modelInfo: { version: string; description: string; accuracy: string; features: string[]; lastTrained: string }
}

interface DbStatus {
  tables: Array<{ name: string; count: number }>
  totalRecords: number
  lastCollected: string | null
}

const TODAY = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' })

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [data, setData] = useState<DashboardData | null>(null)
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null)
  const [updatedAt, setUpdatedAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [statsSegment, setStatsSegment] = useState<'hitters' | 'pitchers'>('hitters')
  const contentRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    try {
      const [dashRes, dbRes] = await Promise.all([fetch('/api/dashboard'), fetch('/api/db-status')])
      if (dashRes.ok) { setData(await dashRes.json()); setUpdatedAt(formatNow()) }
      if (dbRes.ok) setDbStatus(await dbRes.json())
    } catch { /* silent */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [refresh])

  // Norman: Constraints — scroll to top on tab change to prevent disorientation
  const switchTab = (t: Tab) => {
    setTab(t)
    contentRef.current?.scrollTo({ top: 0, behavior: 'instant' })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  if (loading) {
    return (
      <div className="loader">
        <div className="spinner" />
        <p>데이터를 불러오는 중...</p>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="statusbar">
        <span className="live-dot" />
        <span className="statusbar-text">LIVE</span>
        <span className="statusbar-time">{updatedAt} 업데이트</span>
      </header>

      <main className="content" ref={contentRef}>
        {tab === 'home' && data && <HomeTab data={data} />}
        {tab === 'rank' && data && <RankTab ranks={data.teamRanks} />}
        {tab === 'stats' && data && <StatsTab hitters={data.allHitters} pitchers={data.allPitchers} segment={statsSegment} setSegment={setStatsSegment} />}
        {tab === 'system' && <SystemTab db={dbStatus} model={data?.modelInfo} updatedAt={updatedAt} />}
      </main>

      <nav className="tabbar">
        {([
          { key: 'home' as Tab, label: '예측', icon: 'sports_baseball' },
          { key: 'rank' as Tab, label: '순위', icon: 'emoji_events' },
          { key: 'stats' as Tab, label: '기록', icon: 'leaderboard' },
          { key: 'system' as Tab, label: '시스템', icon: 'dashboard' },
        ]).map((t) => (
          <button type="button" key={t.key} className={`tabbar-btn ${tab === t.key ? 'active' : ''}`} onClick={() => switchTab(t.key)}>
            <span className="material-icons-round tabbar-icon">{t.icon}</span>
            <span className="tabbar-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

/* ═══════════════════════════════════════ */
/* HOME TAB                                */
/* ═══════════════════════════════════════ */
function HomeTab({ data }: { data: DashboardData }) {
  return (
    <div className="fade-in">
      {/* Logo Hero — Norman: Visibility, brand identity first */}
      <section className="hero-mobile">
        <div className="logo-mark">
          <span className="material-icons-round logo-icon">sports_baseball</span>
        </div>
        <h1 className="logo-text">KBO AI<br />Predictor</h1>
        <p className="hero-date">{TODAY}</p>
        <div className="chip-row">
          {data.hero.chips.map((c) => <span key={c} className="chip-sm">{c}</span>)}
        </div>
      </section>

      {/* Predictions — the primary content */}
      <section className="section-m">
        {data.predictions.map((p, i) => (
          <MatchCard key={p.id} p={p} index={i} />
        ))}
      </section>

      {/* Model info at bottom — Norman: progressive disclosure, detail last */}
      {data.modelInfo && (
        <section className="model-footer slide-up">
          <button type="button" className="model-toggle" onClick={(e) => {
            const target = (e.currentTarget.nextElementSibling as HTMLElement)
            target.classList.toggle('open')
            e.currentTarget.classList.toggle('open')
          }}>
            <span className="material-icons-round">psychology</span>
            <span>{data.modelInfo.version}</span>
            <span className="material-icons-round toggle-arrow">expand_more</span>
          </button>
          <div className="model-expand">
            <p className="model-desc">{data.modelInfo.description}</p>
            <p className="model-accuracy">{data.modelInfo.accuracy}</p>
            <div className="model-features">
              {data.modelInfo.features.map((f) => <span key={f} className="feature-tag">{f}</span>)}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════ */
/* MATCH CARD with collapsible AI 결과     */
/* ═══════════════════════════════════════ */
function MatchCard({ p, index }: { p: DashboardData['predictions'][number]; index: number }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <article className="match-card slide-up" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="match-date-row">
        <span className="material-icons-round match-date-icon">schedule</span>
        <span className="match-date-text">{TODAY} {p.gameTime}</span>
      </div>

      <div className="match-teams">
        <div className="match-team">
          <img src={getTeamLogo(p.awayTeam)} alt={p.awayTeam} className="logo-m" onError={hideImg} />
          <span className="team-label">{p.awayTeam}</span>
          {p.awayStarter && (
            <span className="starter-label">
              <span className="material-icons-round starter-icon">sports_baseball</span>
              {p.awayStarter.name} · {p.awayStarter.era}
            </span>
          )}
        </div>
        <div className="match-center">
          <span className="match-vs-label">VS</span>
        </div>
        <div className="match-team">
          <img src={getTeamLogo(p.homeTeam)} alt={p.homeTeam} className="logo-m" onError={hideImg} />
          <span className="team-label">{p.homeTeam}</span>
          {p.homeStarter && (
            <span className="starter-label">
              <span className="material-icons-round starter-icon">sports_baseball</span>
              {p.homeStarter.name} · {p.homeStarter.era}
            </span>
          )}
        </div>
      </div>

      <div className="prob-section">
        <div className="prob-bars">
          <div className="prob-away-bar" style={{ width: `${100 - p.winProbability}%`, background: getTeamColor(p.awayTeam) }} />
          <div className="prob-home-bar" style={{ width: `${p.winProbability}%`, background: getTeamColor(p.homeTeam) }} />
        </div>
        <div className="prob-row">
          <span className="prob-pct">{100 - p.winProbability}%</span>
          <span className="conf-pill">{p.confidence}</span>
          <span className="prob-pct">{p.winProbability}%</span>
        </div>
      </div>

      <button type="button" className="ai-toggle" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        <span className="material-icons-round ai-toggle-spark">auto_awesome</span>
        <span className="ai-toggle-label">AI 결과</span>
        <span className="material-icons-round ai-toggle-arrow">{expanded ? 'expand_less' : 'expand_more'}</span>
      </button>
      {expanded && (
        <ul className="reasons">
          {p.topReasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
    </article>
  )
}

/* ═══════════════════════════════════════ */
/* RANK TAB                                */
/* ═══════════════════════════════════════ */
function RankTab({ ranks }: { ranks: DashboardData['teamRanks'] }) {
  return (
    <div className="fade-in">
      <h2 className="tab-title">2026 KBO 팀 순위</h2>
      <p className="tab-sub">{TODAY} 기준</p>

      <div className="rank-table">
        <div className="rank-header">
          <span className="rh" style={{ width: 32, textAlign: 'center' }}>#</span>
          <span className="rh" style={{ flex: 1 }}>팀</span>
          <span className="rh" style={{ width: 64, textAlign: 'center' }}>승-패-무</span>
          <span className="rh" style={{ width: 48, textAlign: 'center' }}>승률</span>
          <span className="rh" style={{ width: 36, textAlign: 'center' }}>차</span>
        </div>
        {ranks.map((r, i) => (
          <div key={r.teamName} className={`rank-row slide-up ${i < 3 ? 'rank-top3' : ''}`} style={{ animationDelay: `${i * 40}ms` }}>
            <span className="rank-cell" style={{ width: 32, textAlign: 'center', fontWeight: 800, color: i < 3 ? '#d4a00a' : 'var(--text-3)' }}>{r.rank}</span>
            <div className="rank-cell" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <img src={getTeamLogo(r.teamName)} alt="" className="logo-xs" onError={hideImg} />
              <span style={{ fontWeight: 600 }}>{r.teamName}</span>
            </div>
            <span className="rank-cell" style={{ width: 64, textAlign: 'center', fontSize: 13, color: 'var(--text-2)' }}>{r.wins}-{r.losses}-{r.draws}</span>
            <span className="rank-cell" style={{ width: 48, textAlign: 'center', fontWeight: 700 }}>{r.winPct}</span>
            <span className="rank-cell" style={{ width: 36, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>{r.gamesBack === '0.0' ? '-' : r.gamesBack}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════ */
/* STATS TAB (Hitters + Pitchers merged)  */
/* ═══════════════════════════════════════ */
function StatsTab({ hitters, pitchers, segment, setSegment }: {
  hitters: DashboardData['allHitters']
  pitchers: DashboardData['allPitchers']
  segment: 'hitters' | 'pitchers'
  setSegment: (s: 'hitters' | 'pitchers') => void
}) {
  return (
    <div className="fade-in">
      <h2 className="tab-title">선수 기록</h2>

      {/* Segmented Control — Norman: Mapping, clear binary choice */}
      <div className="segment-control">
        <button type="button" className={`segment-btn ${segment === 'hitters' ? 'active' : ''}`} onClick={() => setSegment('hitters')}>
          <span className="material-icons-round" style={{ fontSize: 16 }}>sports_cricket</span>
          타자 ({hitters.length})
        </button>
        <button type="button" className={`segment-btn ${segment === 'pitchers' ? 'active' : ''}`} onClick={() => setSegment('pitchers')}>
          <span className="material-icons-round" style={{ fontSize: 16 }}>sports_handball</span>
          투수 ({pitchers.length})
        </button>
      </div>

      {segment === 'hitters' && (
        <div className="player-list">
          {hitters.map((h, i) => (
            <div key={`${h.playerName}-${h.teamName}`} className={`player-row slide-up ${tierClass(h.rank)}`} style={{ animationDelay: `${Math.min(i, 15) * 30}ms` }}>
              <span className={`player-rank ${h.rank <= 3 ? 'top3' : ''}`}>{h.rank}</span>
              <img src={getTeamLogo(h.teamName)} alt="" className="logo-xxs" onError={hideImg} />
              <div className="player-info">
                <span className="player-name">{h.playerName}</span>
                <span className="player-team">{h.teamName}</span>
              </div>
              <div className="player-stats">
                <span className="stat-main">{h.avg}</span>
                <span className="stat-sub">{h.hits}안타 {h.homeRuns}HR {h.rbi}타점</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {segment === 'pitchers' && (
        <div className="player-list">
          {pitchers.map((p, i) => (
            <div key={`${p.playerName}-${p.teamName}`} className={`player-row slide-up ${tierClass(p.rank)}`} style={{ animationDelay: `${Math.min(i, 15) * 30}ms` }}>
              <span className={`player-rank ${p.rank <= 3 ? 'top3' : ''}`}>{p.rank}</span>
              <img src={getTeamLogo(p.teamName)} alt="" className="logo-xxs" onError={hideImg} />
              <div className="player-info">
                <span className="player-name">{p.playerName}</span>
                <span className="player-team">{p.teamName}</span>
              </div>
              <div className="player-stats">
                <span className="stat-main">{p.era}</span>
                <span className="stat-sub">{p.wins}승{p.losses}패 {p.strikeOuts}K</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════ */
/* SYSTEM TAB (was "DB")                   */
/* Norman: Visibility — show what matters  */
/* ═══════════════════════════════════════ */
function SystemTab({ db, model, updatedAt }: { db: DbStatus | null; model?: DashboardData['modelInfo']; updatedAt: string }) {
  if (!db) return <div className="fade-in"><p style={{ padding: 20, color: 'var(--text-3)' }}>시스템 정보를 불러오는 중...</p></div>

  return (
    <div className="fade-in">
      <h2 className="tab-title">시스템 현황</h2>
      <p className="tab-sub">마지막 업데이트: {updatedAt}</p>

      {/* Status Cards — Norman: Visibility, key numbers at a glance */}
      <div className="sys-grid">
        <div className="sys-card">
          <span className="material-icons-round sys-icon">storage</span>
          <span className="sys-num">{db.totalRecords.toLocaleString()}</span>
          <span className="sys-label">전체 데이터</span>
        </div>
        <div className="sys-card">
          <span className="material-icons-round sys-icon">table_chart</span>
          <span className="sys-num">{db.tables.filter(t => t.count > 0).length}</span>
          <span className="sys-label">활성 테이블</span>
        </div>
        <div className="sys-card">
          <span className="material-icons-round sys-icon">update</span>
          <span className="sys-num">{db.lastCollected ? formatCollected(db.lastCollected) : '-'}</span>
          <span className="sys-label">최근 수집</span>
        </div>
      </div>

      {/* Data Collection Status */}
      <h3 className="section-h3">
        <span className="material-icons-round" style={{ fontSize: 18 }}>checklist</span>
        데이터 수집 현황
      </h3>
      <div className="sys-table">
        {db.tables.map((t, i) => {
          const maxCount = Math.max(...db.tables.map(x => x.count), 1)
          const isActive = t.count > 0
          return (
            <div key={t.name} className={`sys-row slide-up ${isActive ? '' : 'inactive'}`} style={{ animationDelay: `${i * 30}ms` }}>
              <span className={`material-icons-round sys-status-icon ${isActive ? 'active' : ''}`}>
                {isActive ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span className="sys-tname">{t.name}</span>
              <span className="sys-tcount">{t.count > 0 ? t.count.toLocaleString() : '-'}</span>
              <div className="sys-bar-bg">
                <div className="sys-bar-fg" style={{ width: `${(t.count / maxCount) * 100}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* AI Model Info */}
      {model && (
        <>
          <h3 className="section-h3" style={{ marginTop: 24 }}>
            <span className="material-icons-round" style={{ fontSize: 18 }}>psychology</span>
            AI 모델
          </h3>
          <div className="sys-model-card">
            <div className="sys-model-row"><span>버전</span><strong>{model.version}</strong></div>
            <div className="sys-model-row"><span>분석 요소</span><span>{model.features.length}개 팩터</span></div>
            <div className="sys-model-row"><span>학습일</span><span>{model.lastTrained}</span></div>
            <p className="sys-model-desc">{model.description}</p>
          </div>
        </>
      )}
    </div>
  )
}

/* ═══ UTILS ═══ */
function tierClass(rank: number) {
  if (rank <= 10) return 'tier-gold'
  if (rank <= 20) return 'tier-silver'
  return 'tier-normal'
}

function hideImg(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = 'none'
}

function formatNow() {
  return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function formatCollected(iso: string) {
  const d = new Date(iso)
  const now = Date.now()
  const diff = Math.floor((now - d.getTime()) / 60000)
  if (diff < 1) return '방금'
  if (diff < 60) return `${diff}분 전`
  if (diff < 1440) return `${Math.floor(diff / 60)}시간 전`
  return `${Math.floor(diff / 1440)}일 전`
}
