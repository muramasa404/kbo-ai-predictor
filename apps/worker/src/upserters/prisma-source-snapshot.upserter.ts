import { prisma } from '../../../../packages/db/src/client'
import type { SourceSnapshotPayload } from '../core/types'
import type { SourceSnapshotUpserter } from './source-snapshot.upserter'

export class PrismaSourceSnapshotUpserter implements SourceSnapshotUpserter {
  async upsert(snapshot: SourceSnapshotPayload): Promise<void> {
    await prisma.sourceSnapshot.create({
      data: {
        sourceName: snapshot.sourceName,
        requestUrl: snapshot.requestUrl,
        requestDateKey: snapshot.requestDateKey,
        responseStatus: snapshot.responseStatus,
        contentHash: snapshot.contentHash,
        rawBody: snapshot.rawBody,
        collectedAt: new Date(snapshot.collectedAt),
      },
    })
  }
}
