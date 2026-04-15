import type { SourceSnapshotPayload } from '../core/types'

export interface SourceSnapshotUpserter {
  upsert(snapshot: SourceSnapshotPayload): Promise<void>
}

export class NoopSourceSnapshotUpserter implements SourceSnapshotUpserter {
  async upsert(_snapshot: SourceSnapshotPayload): Promise<void> {
    return
  }
}
