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
}
