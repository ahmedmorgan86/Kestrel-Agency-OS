import dotenv from 'dotenv';
import { startNeonMorganWorker, stopNeonMorganWorker } from '../server/services/neonMorganWorker';

dotenv.config({ path: '.env.local' });
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run the MORGAN GROUP Neon worker.');
}

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
