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
  modelTrust?: { sampleSize: number; accuracy: number | null; brierScore: number | null; windowLabel: string; modelVersion: string | null }
  predictions: Array<{ id: string; gameTime: string; homeTeam: string; awayTeam: string; favoredTeam: string; winProbability: number; confidence: string; topReasons: string[]; homeStarter?: { name: string; era: string; record: string } | null; awayStarter?: { name: string; era: string; record: string } | null; runTotal?: { expected: number; stdev: number; mae?: number | null; lines: Array<{ line: number; overProb: number; underProb: number }> } | null; firstInningLead?: { homeLeadProb: number; awayLeadProb: number; holdoutAccuracy?: number | null } | null; playerProps?: { method: string; assumedAtBats: number; assumedStarterIP: number; homeHitters: Array<{ name: string; seasonAvg: number; hit1PlusProb: number; hit2PlusProb: number; hrProb: number }>; awayHitters: Array<{ name: string; seasonAvg: number; hit1PlusProb: number; hit2PlusProb: number; hrProb: number }>; homeStarterK: { name: string; seasonKPer9: number; expectedK: number; k5PlusProb: number; k7PlusProb: number } | null; awayStarterK: { name: string; seasonKPer9: number; expectedK: number; k5PlusProb: number; k7PlusProb: number } | null } | null }>
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

      {data.modelTrust && <TrustStrip trust={data.modelTrust} />}

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

      {p.runTotal && p.runTotal.lines.length > 0 && <RunTotalPanel runTotal={p.runTotal} />}
      {p.firstInningLead && <FirstInningPanel fi={p.firstInningLead} homeTeam={p.homeTeam} awayTeam={p.awayTeam} /> }
      {p.playerProps && <PlayerPropsPanel pp={p.playerProps} homeTeam={p.homeTeam} awayTeam={p.awayTeam} />}

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
/* HCI TRUST STRIP — honest accuracy track  */
/* ═══════════════════════════════════════ */
type Trust = NonNullable<DashboardData['modelTrust']>
function TrustStrip({ trust }: { trust: Trust }) {
  if (!trust.sampleSize || trust.accuracy == null) {
    return (
      <section className="trust-strip trust-pending">
        <span className="material-icons-round trust-icon">psychology</span>
        <div className="trust-body">
          <span className="trust-title">AI 모델 정확도 계측 중</span>
          <span className="trust-sub">경기 결과가 누적되면 실제 적중률이 여기 표시됩니다.</span>
        </div>
      </section>
    )
  }
  const pct = Math.round(trust.accuracy * 100)
  const brier = trust.brierScore != null ? trust.brierScore.toFixed(3) : '-'
  const quality = trust.accuracy >= 0.58 ? 'trust-good' : trust.accuracy >= 0.52 ? 'trust-ok' : 'trust-weak'
  return (
    <section className={`trust-strip ${quality}`}>
      <span className="material-icons-round trust-icon">verified</span>
      <div className="trust-body">
        <span className="trust-title">최근 {trust.sampleSize}경기 적중률 <strong>{pct}%</strong> · Brier {brier}</span>
        <span className="trust-sub">
          {trust.modelVersion ?? '-'} · {trust.windowLabel}
        </span>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════ */
/* RUN TOTAL (over/under) panel            */
/* ═══════════════════════════════════════ */
type RunTotal = NonNullable<DashboardData['predictions'][number]['runTotal']>
function RunTotalPanel({ runTotal }: { runTotal: RunTotal }) {
  // Highlight the line whose probability is closest to 50/50 — that's the market-relevant one
  const headline = runTotal.lines.reduce((best, cur) =>
    Math.abs(cur.overProb - 0.5) < Math.abs(best.overProb - 0.5) ? cur : best
  , runTotal.lines[0])
  const leanOver = headline.overProb > 0.5
  return (
    <div className="rt-panel">
      <div className="rt-head">
        <span className="material-icons-round rt-icon">query_stats</span>
        <span className="rt-label">득점 합계 예측</span>
        <span className="rt-expected">예상 {runTotal.expected.toFixed(1)}점</span>
      </div>
      <div className="rt-headline">
        <span className="rt-line">{headline.line}점 기준</span>
        <div className="rt-bar-bg">
          <div className="rt-bar-fg" style={{ width: `${Math.round(headline.overProb * 100)}%`, background: leanOver ? '#0071e3' : '#ff453a' }} />
        </div>
        <div className="rt-bar-row">
          <span>over {(headline.overProb * 100).toFixed(1)}%</span>
          <span>under {(headline.underProb * 100).toFixed(1)}%</span>
        </div>
      </div>
      <div className="rt-lines">
        {runTotal.lines.map((l) => (
          <div key={l.line} className="rt-line-row">
            <span className="rt-line-key">{l.line}점</span>
            <span className="rt-line-over">↑{(l.overProb * 100).toFixed(0)}%</span>
            <span className="rt-line-under">↓{(l.underProb * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════ */
/* FIRST INNING LEAD panel                 */
/* ═══════════════════════════════════════ */
type FirstInning = NonNullable<DashboardData['predictions'][number]['firstInningLead']>
function FirstInningPanel({ fi, homeTeam, awayTeam }: { fi: FirstInning; homeTeam: string; awayTeam: string }) {
  const homePct = Math.round(fi.homeLeadProb * 100)
  const awayPct = 100 - homePct
  const leanHome = homePct >= 50
  const accNote = fi.holdoutAccuracy != null ? ` · 검증 정확도 ${(fi.holdoutAccuracy * 100).toFixed(0)}%` : ''
  return (
    <div className="fi-panel">
      <div className="fi-head">
        <span className="material-icons-round fi-icon">flag</span>
        <span className="fi-label">1회 리드 예측{accNote}</span>
        <span className="fi-lean">{leanHome ? homeTeam : awayTeam} 유리</span>
      </div>
      <div className="fi-bar-bg">
        <div className="fi-bar-fg" style={{ width: `${homePct}%` }} />
      </div>
      <div className="fi-row">
        <span>{awayTeam} {awayPct}%</span>
        <span>{homeTeam} {homePct}%</span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════ */
/* PLAYER PROPS panel (statistical v5.3.1) */
/* ═══════════════════════════════════════ */
type PlayerProps = NonNullable<DashboardData['predictions'][number]['playerProps']>
type HitterRow = PlayerProps['homeHitters'][number]
type StarterKRow = NonNullable<PlayerProps['homeStarterK']>

function PlayerPropsPanel({ pp, homeTeam, awayTeam }: { pp: PlayerProps; homeTeam: string; awayTeam: string }) {
  return (
    <div className="pp-panel">
      <div className="pp-head">
        <span className="material-icons-round pp-icon">person</span>
        <span className="pp-label">선수 Prop 확률</span>
        <span className="pp-method">AB {pp.assumedAtBats} / IP {pp.assumedStarterIP}</span>
      </div>

      <div className="pp-two-col">
        <PlayerPropsTeam title={awayTeam} hitters={pp.awayHitters} starterK={pp.awayStarterK} />
        <PlayerPropsTeam title={homeTeam} hitters={pp.homeHitters} starterK={pp.homeStarterK} />
      </div>
    </div>
  )
}

function PlayerPropsTeam({ title, hitters, starterK }: { title: string; hitters: HitterRow[]; starterK: StarterKRow | null }) {
  return (
    <div className="pp-col">
      <div className="pp-col-head">{title}</div>
      {hitters.length > 0 && (
        <div className="pp-list">
          {hitters.map((h) => (
            <div key={h.name} className="pp-row">
              <span className="pp-name">{h.name}</span>
              <span className="pp-stat" title="1안타 이상 확률">H1+ {(h.hit1PlusProb * 100).toFixed(0)}%</span>
              <span className="pp-stat" title="홈런 확률">HR {(h.hrProb * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}
      {starterK && (
        <div className="pp-starter">
          <span className="pp-starter-name">{starterK.name}</span>
          <span className="pp-stat" title="5K 이상 확률">K5+ {(starterK.k5PlusProb * 100).toFixed(0)}%</span>
          <span className="pp-stat" title="7K 이상 확률">K7+ {(starterK.k7PlusProb * 100).toFixed(0)}%</span>
        </div>
      )}
    </div>
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
