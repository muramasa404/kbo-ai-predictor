/** API 응답 타입 정의 — any 제거 */

export interface Prediction {
  id: string
  gameTime: string
  homeTeam: string
  awayTeam: string
  favoredTeam: string
  winProbability: number
  confidence: string
  topReasons: string[]
}

export interface TeamRank {
  rank: number
  teamName: string
  wins: number
  losses: number
  draws: number
  winPct: string
  gamesBack: string
  last10: string
  streak: string
}

export interface PlayerHitter {
  rank: number
  playerName: string
  teamName: string
  avg: string
  games: number
  hits: number
  homeRuns: number
  rbi: number
}

export interface PlayerPitcher {
  rank: number
  playerName: string
  teamName: string
  era: string
  games: number
  wins: number
  losses: number
  strikeOuts: number
  whip: string
}

export interface ModelInfo {
  version: string
  description: string
  accuracy: string
  features: string[]
  lastTrained: string
}

export interface DashboardData {
  hero: { title: string; copy: string; chips: string[] }
  predictions: Prediction[]
  teamRanks: TeamRank[]
  allHitters: PlayerHitter[]
  allPitchers: PlayerPitcher[]
  modelInfo: ModelInfo
}

export interface DbStatus {
  tables: Array<{ name: string; count: number }>
  totalRecords: number
  lastCollected: string | null
}
