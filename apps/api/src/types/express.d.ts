/**
 * Express Request augmentation: req.auth is attached by middleware/auth.ts.
 */
import type { AuthContext } from '../middleware/auth.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
