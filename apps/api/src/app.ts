/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 * OpenJS Foundation. 2026. Node.js documentation. Available at: https://nodejs.org/docs/latest/api/ [Accessed 12 September 2026].
 * PostgreSQL Global Development Group. 2026. PostgreSQL documentation. Available at: https://www.postgresql.org/docs/ [Accessed 26 August 2026].
 */
import cors from 'cors';
import express, { type Express, type Request } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { isAllowedOrigin } from './config/cors';
import { config } from './config/env';
import { logger } from './config/logger';
import { getPool } from './db/pool';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimits';
import { requestContext } from './middleware/requestContext';
import { openApiDocument } from './openapi/document';
import { API_PREFIX } from './routes/define';
import { apiRouter } from './routes';

export function createApp(): Express {
  const cfg = config();
  const app = express();
  app.disable('x-powered-by');
  if (cfg.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as Request).requestId,
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      serializers: {
        req: (req: { method: string; url: string }) => ({
          method: req.method,
          url: req.url.split('?')[0],
        }),
      },
    }),
  );

  // API docs are served before the strict API CSP so Swagger UI can load its own assets.
  app.get('/api/docs.json', (_req, res) => {
    res.json(openApiDocument());
  });
  app.use(
    '/api/docs',
    helmet({ contentSecurityPolicy: false }),
    swaggerUi.serve,
    swaggerUi.setup(undefined, { swaggerUrl: '/api/docs.json', customSiteTitle: 'HYDRA API' }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      // Dev: Expo web on localhost may load files from the API's LAN address (cross-site).
      crossOriginResourcePolicy: { policy: cfg.isProduction ? 'same-site' : 'cross-origin' },
      hsts: cfg.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );

  // CORS allowlist (+ LAN origins in development). Native mobile clients send no Origin header.
  app.use(
    cors({
      origin: (origin, cb) => cb(null, isAllowedOrigin(origin, cfg)),
      credentials: false,
      exposedHeaders: ['X-Request-Id', 'X-Row-Count', 'Content-Disposition'],
    }),
  );

  // Body limits; raw bytes kept for webhook signature verification.
  app.use(
    express.json({
      limit: '256kb',
      verify: (req, _res, buf) => {
        (req as Request).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));

  app.get('/health', async (_req, res) => {
    try {
      await getPool().query('SELECT 1');
      res.json({ status: 'ok', database: 'ok', time: new Date().toISOString(), version: '1.0.0' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unreachable' });
    }
  });

  app.use(API_PREFIX, apiLimiter, apiRouter());
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
