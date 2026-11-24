import dotenv from 'dotenv';
import { startNeonMorganWorker, stopNeonMorganWorker } from '../server/services/neonMorganWorker';

// Keep the long-running local worker on an explicitly configured database.
// .env.local may point at the app's default (production) Neon branch.
dotenv.config({ path: '.env.worker.local' });
dotenv.config({ path: '.env.local' });
dotenv.config();

const workerDatabaseUrl = process.env.MORGAN_WORKER_DATABASE_URL;
if (!workerDatabaseUrl) {
  throw new Error('Set MORGAN_WORKER_DATABASE_URL in the ignored .env.worker.local file; the worker never inherits DATABASE_URL.');
}

let workerDatabaseName = '';
try {
  workerDatabaseName = decodeURIComponent(new URL(workerDatabaseUrl).pathname.replace(/^\//, ''));
} catch {
  throw new Error('MORGAN_WORKER_DATABASE_URL must be a valid PostgreSQL connection URL.');
}
if (workerDatabaseName !== 'morgan_pipeline_review' && process.env.MORGAN_WORKER_ALLOW_PRODUCTION !== 'true') {
  throw new Error('The local worker is restricted to the isolated morgan_pipeline_review database. Set MORGAN_WORKER_ALLOW_PRODUCTION=true only for an intentional production worker.');
}
process.env.DATABASE_URL = workerDatabaseUrl;

if (!startNeonMorganWorker()) {
  throw new Error('Set MORGAN_NEON_WORKER_ENABLED=true to start the MORGAN GROUP worker.');
}

console.info('MORGAN GROUP free local production worker started.');

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await stopNeonMorganWorker();
  process.exit(0);
};

process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
