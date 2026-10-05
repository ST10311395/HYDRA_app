/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 */
import { Router } from 'express';
import { registerAdminRoutes } from '../controllers/adminController';
import { registerAiRoutes } from '../controllers/aiController';
import { registerAuthRoutes } from '../controllers/authController';
import { registerContentRoutes } from '../controllers/contentController';
import { registerFileRoutes } from '../controllers/fileController';
import { registerFinanceRoutes } from '../controllers/financeController';
import { registerJobRoutes } from '../controllers/jobController';
import { registerOperationsRoutes } from '../controllers/operationsController';

/** Versioned REST API (/api/v1). Every route is declared through `defineRoute` (auth + validation + OpenAPI). */
export function apiRouter(): Router {
  const r = Router();
  registerAuthRoutes(r);
  registerContentRoutes(r);
  registerJobRoutes(r);
  registerFinanceRoutes(r);
  registerOperationsRoutes(r);
  registerAdminRoutes(r);
  registerAiRoutes(r);
  registerFileRoutes(r);
  return r;
}
