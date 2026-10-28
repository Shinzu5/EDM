/**
 * @medidata/db — Prisma client singleton + full type/enum re-exports.
 *
 * Every workspace that needs database access imports `prisma` (the shared
 * PrismaClient instance) and model/enum types from `@medidata/db`.
 *
 * ESM-safe: this package is `"type": "module"` and is consumed as TypeScript
 * source via tsx (apps) or compiled via tsc (packages).
 */
import { PrismaClient } from '@prisma/client';

const prismaOptions = {
  log: (process.env?.NODE_ENV ?? 'development') === 'production' ? ['error' as const] : ['warn' as const, 'error' as const],
};

export const prisma = new PrismaClient(prismaOptions);

/** Disconnect cleanly on graceful shutdown. */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.once('beforeExit', () => {
  void prisma.$disconnect();
});

// All model types, enums (UserRole, Sex, EncounterType, ClaimStatus, ResultStatus,
// SourceSystem, JobStatus, Severity, Classification), input types and the `Prisma`
// namespace.
export * from '@prisma/client';
