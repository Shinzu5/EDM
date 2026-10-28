/**
 * @medidata/shared — canonical API contract.
 *
 * NOTE: `types.ts` and `constants.ts` both export a `Role` type. The barrel
 * re-exports the type from types.ts (same underlying shape: a string union of
 * the ROLES values), so consumers get one consistent `Role`.
 */
export * from './schemas.js';
export * from './types.js';
export {
  API_BASE,
  API_PORT,
  WEB_PORT,
  ROLES,
  ENDPOINTS,
  type Role as RoleName,
} from './constants.js';

import { pino } from 'pino';

/** Shared structured logger (pino). Apps may wrap with their own options. */
export const logger = pino({
  name: 'medidata',
  level: process.env?.LOG_LEVEL ?? 'info',
});
