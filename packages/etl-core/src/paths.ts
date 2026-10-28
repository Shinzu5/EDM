/** Repository-relative path helpers (work both from src/ via tsx and dist/ via tsc). */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** <repo-root>/fixtures — package dirs are always <root>/{packages,apps}/<pkg>/src. */
export function defaultFixturesDir(): string {
  return path.resolve(here, '..', '..', '..', 'fixtures');
}

/** <repo-root>/packages/db/sql */
export function defaultSqlDir(): string {
  return path.resolve(here, '..', '..', 'db', 'sql');
}
