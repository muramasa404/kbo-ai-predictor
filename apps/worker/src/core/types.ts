export type CollectorMode = 'backfill' | 'daily' | 'intraday' | 'repair'

export type SourceName =
  | 'kbo-schedule'
  | 'kbo-team-rank-daily'
  | 'kbo-hitter-season'
  | 'kbo-pitcher-season'
  | 'kbo-top5'
  | 'kbo-player-master'
  | 'naver-schedule'
  | 'kbo-game-detail'

export interface CollectorContext {
  mode: CollectorMode
  requestedAt: string
  requestDateKey?: string
}

export interface SourceSnapshotPayload {
  sourceName: SourceName
  requestUrl: string
  requestDateKey?: string
  responseStatus?: number
  contentHash?: string
  rawBody?: string
  collectedAt: string
}

export interface CollectorResult<T> {
  snapshot: SourceSnapshotPayload
  items: T[]
}

export interface Collector<TInput, TItem> {
  readonly sourceName: SourceName
  collect(input: TInput, context: CollectorContext): Promise<CollectorResult<TItem>>
}
