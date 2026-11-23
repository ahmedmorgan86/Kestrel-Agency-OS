import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import { parseNewsRss } from '../server/services/morganProduction';
import { closeDatabase, initDatabase } from '../server/db/database';
import { runMigrations } from '../server/db/migrations';
import { seedSystemConfiguration } from '../server/db/seed';
import { authAndOrgRouter } from '../server/routes/authAndOrg';
import { studioAndGovRouter } from '../server/routes/studioAndGov';
import { attachAuthMiddleware } from '../server/services/auth';

function productionTestServer(): Server {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', attachAuthMiddleware);
  app.use('/api', authAndOrgRouter);
  app.use('/api', studioAndGovRouter);
  return app.listen(0, '127.0.0.1');
}

async function closeTestServer(server: Server): Promise<void> {
  if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('parses recent Arabic RSS reports with their real source links and publishers', () => {
  const now = Date.parse('2026-11-23T12:00:00.000Z');
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title><![CDATA[اتجاه حديث &amp; مهم]]></title><link>https://news.google.com/rss/articles/real-article</link><pubDate>Mon, 23 Nov 2026 10:00:00 GMT</pubDate><source url="https://example.com">ناشر فعلي</source><description>تفاصيل &amp; سياق</description></item>
    <item><title>قديم جداً</title><link>https://news.google.com/rss/articles/old</link><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate><source>ناشر</source></item>
    <item><title>رابط غير صالح</title><link>http://example.com/not-google</link><pubDate>Mon, 23 Nov 2026 10:00:00 GMT</pubDate></item>
    <item><title>دون تاريخ</title><link>https://news.google.com/rss/articles/no-date</link><source>ناشر</source></item>
  </channel></rss>`;
  const sources = parseNewsRss(xml, now);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].title, 'اتجاه حديث & مهم');
  assert.equal(sources[0].publisher, 'ناشر فعلي');
  assert.equal(sources[0].url, 'https://news.google.com/rss/articles/real-article');
  assert.match(sources[0].snippet, /تفاصيل/);
});

test('deduplicates repeated headlines and caps fetched signals at ten', () => {
  const date = 'Mon, 23 Nov 2026 10:00:00 GMT';
  const items = Array.from({ length: 14 }, (_, i) => `<item><title>${i < 2 ? 'عنوان مكرر' : `عنوان ${i}`}</title><link>https://news.google.com/rss/articles/${i}</link><pubDate>${date}</pubDate></item>`).join('');
  const sources = parseNewsRss(`<rss><channel>${items}</channel></rss>`, Date.parse('2026-11-23T12:00:00.000Z'));
  assert.equal(sources.length, 10);
  assert.equal(sources.filter((source) => source.title === 'عنوان مكرر').length, 1);
});

test('production assigns five specialists and binds owner decisions to the exact saved version', async (t) => {
  const oldDb = process.env.SQLITE_DB_PATH;
  const oldSecret = process.env.SESSION_SECRET;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'morgan-production-'));
  process.env.SQLITE_DB_PATH = path.join(root, 'private.sqlite');
  process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  let server: Server | undefined;
  t.after(async () => {
    if (server) await closeTestServer(server);
    closeDatabase();
    if (oldDb === undefined) delete process.env.SQLITE_DB_PATH; else process.env.SQLITE_DB_PATH = oldDb;
    if (oldSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = oldSecret;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const db = initDatabase();
  runMigrations(db);
  seedSystemConfiguration(db);
  server = productionTestServer();
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const api = `http://127.0.0.1:${address.port}/api`;
  const bootstrap = await fetch(`${api}/auth/bootstrap`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fullName: 'المالك', email: 'owner@morgan.test', password: 'Only-For-Test-4821' }),
  });
  assert.equal(bootstrap.status, 201);
  const { token, user } = await bootstrap.json() as { token: string; user: { id: string } };

  const started = await fetch(`${api}/morgan-production`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ niche: 'تقنية تعليمية', audience: 'طلاب الجامعات', platform: 'instagram', format: 'reel' }),
  });
  assert.equal(started.status, 202);
  const { runId, assignedEmployeeCount } = await started.json() as { runId: string; assignedEmployeeCount: number };
  assert.equal(assignedEmployeeCount, 5);
  const assignments = db.prepare('SELECT t.assigned_employee_id,e.full_name FROM tasks t JOIN employees e ON e.id=t.assigned_employee_id WHERE json_extract(t.inputs_json, \'$.productionRunId\')=? ORDER BY e.full_name').all(runId) as Array<{ assigned_employee_id: string; full_name: string }>;
  assert.equal(assignments.length, 5);
  assert.ok(assignments.every((assignment) => assignment.assigned_employee_id.startsWith('employee_virtual_')));

  const deliverable = { content: { title: 'نسخة مراجعة', caption: 'نص للاختبار' }, qualityReview: { readyForOwner: true } };
  const serialized = JSON.stringify(deliverable);
  const versionHash = crypto.createHash('sha256').update(serialized).digest('hex');
  db.prepare("UPDATE morgan_production_runs SET status='owner_review',deliverable_json=?,version_hash=? WHERE id=?").run(serialized, versionHash, runId);
  const accepted = await fetch(`${api}/morgan-production/${runId}/decision`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ decision: 'accepted', comments: '' }),
  });
  assert.equal(accepted.status, 200);
  assert.equal((db.prepare('SELECT status FROM morgan_production_runs WHERE id=?').get(runId) as { status: string }).status, 'accepted');
  const decision = db.prepare('SELECT version_hash,decision,decided_by_user_id FROM morgan_production_decisions WHERE run_id=?').get(runId) as { version_hash: string; decision: string; decided_by_user_id: string };
  assert.equal(decision.version_hash, versionHash);
  assert.equal(decision.decision, 'accepted');
  assert.equal(decision.decided_by_user_id, user.id);
  const publishCount = (db.prepare('SELECT count(*) count FROM publishing_jobs').get() as { count: number }).count;
  assert.equal(publishCount, 0, 'accepting never publishes or schedules content');

  const secondStart = await fetch(`${api}/morgan-production`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ niche: 'علوم مبسطة', audience: 'شباب', platform: 'youtube', format: 'short_video' }),
  });
  const second = await secondStart.json() as { runId: string };
  const secondDeliverable = JSON.stringify({ content: { title: 'جولة ثانية', caption: 'نسخة أخرى' }, qualityReview: { readyForOwner: true } });
  const secondHash = crypto.createHash('sha256').update(secondDeliverable).digest('hex');
  db.prepare("UPDATE morgan_production_runs SET status='owner_review',deliverable_json=?,version_hash=? WHERE id=?").run(secondDeliverable, secondHash, second.runId);
  const returned = await fetch(`${api}/morgan-production/${second.runId}/decision`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ decision: 'changes_requested', comments: 'اجعل المقدمة أقصر وأوضح.' }),
  });
  assert.equal(returned.status, 200);
  const { nextRunId } = await returned.json() as { nextRunId: string };
  const nextRun = db.prepare('SELECT parent_run_id,iteration,status,review_note FROM morgan_production_runs WHERE id=?').get(nextRunId) as { parent_run_id: string; iteration: number; status: string; review_note: string };
  assert.equal(nextRun.parent_run_id, second.runId);
  assert.equal(nextRun.iteration, 2);
  assert.equal(nextRun.status, 'queued');
  assert.equal(nextRun.review_note, 'اجعل المقدمة أقصر وأوضح.');
  assert.equal((db.prepare('SELECT count(*) count FROM tasks WHERE json_extract(inputs_json, \'$.productionRunId\')=?').get(nextRunId) as { count: number }).count, 5);

  const qaStart = await fetch(`${api}/morgan-production`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ niche: 'تعليم البرمجة', audience: 'مبتدئون', platform: 'tiktok', format: 'reel' }),
  });
  const qaRun = await qaStart.json() as { runId: string };
  const rejectedDeliverable = JSON.stringify({ content: { title: 'نسخة مرفوضة', caption: 'نص' }, qualityReview: { readyForOwner: false, unsupportedClaims: ['ادعاء بلا مصدر'] } });
  const rejectedHash = crypto.createHash('sha256').update(rejectedDeliverable).digest('hex');
  db.prepare("UPDATE morgan_production_runs SET status='failed',deliverable_json=?,version_hash=? WHERE id=?").run(rejectedDeliverable, rejectedHash, qaRun.runId);
  const rejectAccepted = await fetch(`${api}/morgan-production/${qaRun.runId}/decision`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ decision: 'accepted' }),
  });
  assert.equal(rejectAccepted.status, 409, 'an internally rejected draft cannot be accepted');
  const qaRedo = await fetch(`${api}/morgan-production/${qaRun.runId}/decision`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ decision: 'changes_requested', comments: 'احذف الادعاء غير الموثق.' }),
  });
  assert.equal(qaRedo.status, 200, 'the owner can request a new round after internal QA rejection');
});
