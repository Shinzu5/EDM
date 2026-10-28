/**
 * Idempotent staging loader: lands raw rows into `staging.RawSourceRecord`.
 *
 * The table's composite unique key is (sourceSystem, recordType,
 * sourceRecordId, checksum) — so re-running the same extraction upserts the
 * same row instead of duplicating it, while a genuinely CHANGED payload lands
 * as a new version (history-preserving landing zone).
 */
import type { Prisma, PrismaClient } from '@medidata/db';
import type { EtlContext, RawRow, StagingLoadResult } from './types.js';
import { checksumOf } from './checksum.js';

const BATCH_SIZE = 50;

export async function loadToStaging(
  rows: RawRow[],
  ctx: EtlContext,
): Promise<StagingLoadResult> {
  const now = ctx.now ? ctx.now() : new Date();
  const result: StagingLoadResult = { attempted: rows.length, created: 0, updated: 0 };

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await ctx.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const row of batch) {
        const checksum = checksumOf(row.payload);
        const where = {
          sourceSystem_recordType_sourceRecordId_checksum: {
            sourceSystem: row.sourceSystem,
            recordType: row.recordType,
            sourceRecordId: row.sourceRecordId,
            checksum,
          },
        };
        const existing = await tx.rawSourceRecord.findUnique({ where, select: { id: true } });
        await tx.rawSourceRecord.upsert({
          where,
          update: {
            payload: row.payload as Prisma.InputJsonValue,
            checksum,
            isProcessed: true,
            extractedAt: now,
          },
          create: {
            sourceSystem: row.sourceSystem,
            recordType: row.recordType,
            sourceRecordId: row.sourceRecordId,
            payload: row.payload as Prisma.InputJsonValue,
            checksum,
            isProcessed: true,
            extractedAt: now,
          },
        });
        if (existing) result.updated += 1;
        else result.created += 1;
      }
    });
  }
  return result;
}
