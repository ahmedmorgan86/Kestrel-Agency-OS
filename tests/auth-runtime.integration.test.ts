import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import { closeDatabase, initDatabase } from '../server/db/database';
import { runMigrations } from '../server/db/migrations';
import { seedSystemConfiguration } from '../server/db/seed';
import { authAndOrgRouter } from '../server/routes/authAndOrg';
import { hqAndMeetingsRouter } from '../server/routes/hqAndMeetings';
import { attachAuthMiddleware } from '../server/services/auth';

function createApiServer(): Server {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', attachAuthMiddleware);
  app.use('/api', authAndOrgRouter);
  app.use('/api', hqAndMeetingsRouter);
  return app.listen(0, '127.0.0.1');
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}/api`;
}

async function stop(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test('owner-only API rejects anonymous access and keeps the session across a database restart', async (t) => {
  const previousDbPath = process.env.SQLITE_DB_PATH;
  const previousSessionSecret = process.env.SESSION_SECRET;
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'morgan-auth-runtime-'));
  const dbPath = path.join(testRoot, 'private-company.sqlite');
  process.env.SQLITE_DB_PATH = dbPath;
  process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');

  let server: Server | null = null;
  t.after(async () => {
    if (server) await stop(server);
    closeDatabase();
    if (previousDbPath === undefined) delete process.env.SQLITE_DB_PATH;
    else process.env.SQLITE_DB_PATH = previousDbPath;
    if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSessionSecret;
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  runMigrations(initDatabase());
  seedSystemConfiguration(initDatabase());
  server = createApiServer();
  let baseUrl = await listen(server);

  for (const route of ['/organization', '/hq/state', '/meetings']) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 401, `${route} must require an owner session`);
  }

  const bootstrap = await fetch(`${baseUrl}/auth/bootstrap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fullName: 'مالك تجريبي',
      email: 'chairman@example.test',
      password: 'Temporary-Only-Password-4821',
      organizationName: 'MORGAN GROUP TEST',
    }),
  });
  assert.equal(bootstrap.status, 201);
  const { token } = (await bootstrap.json()) as { token: string };
  assert.ok(token);

  const hq = await fetch(`${baseUrl}/hq/state`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(hq.status, 200, 'the owner can read the protected headquarters state');

  await stop(server);
  server = null;
  closeDatabase();

  runMigrations(initDatabase(dbPath));
  seedSystemConfiguration(initDatabase());
  server = createApiServer();
  baseUrl = await listen(server);

  const organization = await fetch(`${baseUrl}/organization`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(organization.status, 200, 'the owner session survives a database/server restart');
  const organizationPayload = (await organization.json()) as { organization?: { name?: string } };
  assert.equal(organizationPayload.organization?.name, 'MORGAN GROUP TEST');

  const secondBootstrap = await fetch(`${baseUrl}/auth/bootstrap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fullName: 'حساب إضافي',
      email: 'second@example.test',
      password: 'Temporary-Only-Password-4822',
    }),
  });
  assert.equal(secondBootstrap.status, 409, 'the initialized private workspace cannot bootstrap another owner');
});
