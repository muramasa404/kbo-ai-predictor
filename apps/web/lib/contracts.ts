export interface OverUnderLine {
  line: number
  overProb: number
  underProb: number
}

export interface RunTotalPrediction {
  expected: number
  stdev: number
  mae?: number | null
  lines: OverUnderLine[]
}

export interface FirstInningLeadPrediction {
  homeLeadProb: number
  awayLeadProb: number
  holdoutAccuracy?: number | null
}

export interface HitterPropRow {
  name: string
  seasonAvg: number
  hit1PlusProb: number
  hit2PlusProb: number
  hrProb: number
}

export interface StarterKPropRow {
  name: string
  seasonKPer9: number
  expectedK: number
  k5PlusProb: number
  k7PlusProb: number
}

export interface PlayerPropsPayload {
  method: string
  assumedAtBats: number
  assumedStarterIP: number
  homeHitters: HitterPropRow[]
  awayHitters: HitterPropRow[]
  homeStarterK: StarterKPropRow | null
  awayStarterK: StarterKPropRow | null
}

export interface PredictionCardData {
  id: string
  gameTime: string
  awayTeam: string
  homeTeam: string
  favoredTeam: string
  winProbability: number
  confidence: string
  topReasons: string[]
  homeStarter?: { name: string; era: string; record: string } | null
  awayStarter?: { name: string; era: string; record: string } | null
  runTotal?: RunTotalPrediction | null
  firstInningLead?: FirstInningLeadPrediction | null
  playerProps?: PlayerPropsPayload | null
  liveState?: 'scheduled' | 'live' | 'final' | 'cancelled'
  statusInfo?: string
  homeScore?: number | null
  awayScore?: number | null
}

export interface MetricCardData {
  label: string
  value: string
  delta?: string
  tone?: 'positive' | 'negative'
}

export interface RankingCardData {
  title: string
  leader: string
  team: string
  value: string
  note: string
}

export interface DetailCardData {
  title: string
  summary: string
  homeTeam: string
  homeValue: string
  awayTeam: string
  awayValue: string
}

export interface ModelTrust {
  sampleSize: number          // number of past games used
  accuracy: number | null     // 0..1
  brierScore: number | null   // 0..1 (lower is better)
  windowLabel: string         // human-readable range
  modelVersion: string | null
}

export interface AvailableDate {
  date: string                // YYYY-MM-DD (KST)
  gameCount: number
  hasResults: boolean
  isToday: boolean
}

export interface DashboardPayload {
  date: string
  hero: {
    title: string
    copy: string
    chips: string[]
  }
  predictions: PredictionCardData[]
  analyticsMetrics: MetricCardData[]
  rankings: RankingCardData[]
  details: DetailCardData[]
  modelTrust?: ModelTrust
  availableDates?: AvailableDate[]
}
