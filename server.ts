import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { initDatabase } from './server/db/database';
import { runMigrations } from './server/db/migrations';
import { seedSystemConfiguration } from './server/db/seed';
import { attachAuthMiddleware } from './server/services/auth';
import {
  createRateLimiter,
  logStructured,
  securityHeadersMiddleware,
} from './server/services/security';
import { startWorkerLoop, stopWorkerLoop } from './server/services/worker';
import { authAndOrgRouter } from './server/routes/authAndOrg';
import { clientsAndWorkRouter } from './server/routes/clientsAndWork';
import { studioAndGovRouter } from './server/routes/studioAndGov';
import { distributionAndFinanceRouter } from './server/routes/distributionAndFinance';
import { hqAndMeetingsRouter } from './server/routes/hqAndMeetings';

export async function createAppServer() {
  const db = initDatabase();
  const { applied } = runMigrations(db);
  seedSystemConfiguration(db);

  logStructured('info', 'database_ready', { newlyAppliedMigrations: applied });

  const app = express();
  app.set('trust proxy', 1);
  app.use(securityHeadersMiddleware);
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());
  app.use('/api', createRateLimiter({ windowMs: 60_000, maxRequests: 300 }));
  app.use('/api', attachAuthMiddleware);

  // Public health probe (no secrets exposed)
  app.get('/api/healthz', (_req, res) => {
    res.json({ ok: true, service: 'kestrel-agency-os', ts: new Date().toISOString() });
  });

  // Mount modular API routers
  app.use('/api', authAndOrgRouter);
  app.use('/api', clientsAndWorkRouter);
  app.use('/api', studioAndGovRouter);
  app.use('/api', distributionAndFinanceRouter);
  app.use('/api', hqAndMeetingsRouter);

  // Structured API error handler (never leaks stack traces or secrets to client)
  app.use(
    '/api',
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const message = err instanceof Error ? err.message : 'Unexpected server error.';
      logStructured('error', 'api_unhandled_error', { message });
      res.status(500).json({ error: message });
    }
  );

  // Mount Vite middleware in development or serve production dist/
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve('server.ts');

if (isMain) {
  const port = Number(process.env.PORT || 3000);
  createAppServer()
    .then((app) => {
      startWorkerLoop();
      const server = app.listen(port, '0.0.0.0', () => {
        logStructured('info', 'server_listening', { port, env: process.env.NODE_ENV || 'development' });
      });

      const shutdown = () => {
        stopWorkerLoop();
        server.close(() => process.exit(0));
      };
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    })
    .catch((err) => {
      logStructured('error', 'server_startup_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    });
}
