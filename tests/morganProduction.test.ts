import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer, type Server } from 'node:http';
import { parseNewsRss } from '../server/services/morganProduction';
import { closeDatabase, initDatabase } from '../server/db/database';
import { runMigrations } from '../server/db/migrations';
import { seedSystemConfiguration } from '../server/db/seed';
import { authAndOrgRouter } from '../server/routes/authAndOrg';
import { studioAndGovRouter } from '../server/routes/studioAndGov';
import { attachAuthMiddleware, createSessionForUser } from '../server/services/auth';
import { hashPassword } from '../server/services/security';

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

test('production assigns a task-sized AI team and binds owner decisions to the exact saved version', async (t) => {
  const oldDb = process.env.SQLITE_DB_PATH;
  const oldSecret = process.env.SESSION_SECRET;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'morgan-production-'));
  process.env.SQLITE_DB_PATH = path.join(root, 'private.sqlite');
  process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  let server: Server | undefined;
  let ollamaServer: Server | undefined;
  const previousOllamaUrl = process.env.OLLAMA_BASE_URL;
  const previousOllamaModel = process.env.OLLAMA_MODEL;
  t.after(async () => {
    if (server) await closeTestServer(server);
    if (ollamaServer) await closeTestServer(ollamaServer);
    closeDatabase();
    if (oldDb === undefined) delete process.env.SQLITE_DB_PATH; else process.env.SQLITE_DB_PATH = oldDb;
    if (oldSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = oldSecret;
    if (previousOllamaUrl === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = previousOllamaUrl;
    if (previousOllamaModel === undefined) delete process.env.OLLAMA_MODEL; else process.env.OLLAMA_MODEL = previousOllamaModel;
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
  assert.equal((db.prepare('SELECT owner_user_id FROM organizations WHERE id=?').get('org_kestrel_agency') as { owner_user_id: string }).owner_user_id, user.id);
  assert.equal((db.prepare("SELECT COUNT(*) AS count FROM employees WHERE id LIKE 'employee_virtual_%' AND json_extract(profile_json,'$.profileType')='ai_agent'").get() as { count: number }).count, 30);

  const secondUserId = 'usr_morgan_test_non_owner';
  const ts = new Date().toISOString();
  db.prepare(`INSERT INTO users(id,organization_id,email,full_name,password_hash,status,created_at,updated_at)
    VALUES(?,?,?,?,?,'active',?,?)`).run(secondUserId, 'org_kestrel_agency', 'director@morgan.test', 'مدير غير مالك', hashPassword('Non-Owner-Test-Password-4821'), ts, ts);
  db.prepare('INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES(?,?,?)').run(secondUserId, 'role_super_admin', ts);
  const nonOwnerSession = createSessionForUser(secondUserId, { ipAddress: '127.0.0.1', userAgent: 'production-test' });

  const started = await fetch(`${api}/morgan-production`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ niche: 'تقنية تعليمية', audience: 'طلاب الجامعات', platform: 'instagram', format: 'reel' }),
  });
  assert.equal(started.status, 202);
  const { runId, assignedEmployeeCount } = await started.json() as { runId: string; assignedEmployeeCount: number };
  assert.equal(assignedEmployeeCount, 7);
  const assignments = db.prepare('SELECT t.assigned_employee_id,e.full_name FROM tasks t JOIN employees e ON e.id=t.assigned_employee_id WHERE json_extract(t.inputs_json, \'$.productionRunId\')=? ORDER BY e.full_name').all(runId) as Array<{ assigned_employee_id: string; full_name: string }>;
  assert.equal(assignments.length, 7);
  assert.ok(assignments.every((assignment) => assignment.assigned_employee_id.startsWith('employee_virtual_')));
  assert.deepEqual(new Set(assignments.map((assignment) => assignment.full_name)), new Set(['نورا خليل', 'ياسر عبدالله', 'مازن حسن', 'آدم زيدان', 'فادي منير', 'هشام رأفت', 'لمى سعيد']));

  const deliverable = { content: { title: 'نسخة مراجعة', caption: 'نص للاختبار' }, qualityReview: { readyForOwner: true } };
  const serialized = JSON.stringify(deliverable);
  const versionHash = crypto.createHash('sha256').update(serialized).digest('hex');
  db.prepare("UPDATE morgan_production_runs SET status='owner_review',deliverable_json=?,version_hash=? WHERE id=?").run(serialized, versionHash, runId);
  const nonOwnerDecision = await fetch(`${api}/morgan-production/${runId}/decision`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${nonOwnerSession.rawToken}` },
    body: JSON.stringify({ decision: 'accepted', comments: '' }),
  });
  assert.equal(nonOwnerDecision.status, 403, 'a privileged non-owner cannot make the final content decision');
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
  assert.equal((db.prepare('SELECT count(*) count FROM tasks WHERE json_extract(inputs_json, \'$.productionRunId\')=?').get(nextRunId) as { count: number }).count, 7);

  const qaStart = await fetch(`${api}/morgan-production`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ niche: 'تعليم البرمجة', audience: 'مبتدئون', platform: 'tiktok', format: 'reel' }),
  });
  const qaRun = await qaStart.json() as { runId: string };
  const rejectedDeliverable = JSON.stringify({ content: { title: 'نسخة مرفوضة', caption: 'نص' }, qualityReview: { readyForOwner: false, unsupportedClaims: ['ادعاء بلا مصدر'] } });
  const rejectedHash = crypto.createHash('sha256').update(rejectedDeliverable).digest('hex');
  db.prepare("UPDATE morgan_production_runs SET status='owner_review',deliverable_json=?,version_hash=? WHERE id=?").run(rejectedDeliverable, rejectedHash, qaRun.runId);
  const rejectAccepted = await fetch(`${api}/morgan-production/${qaRun.runId}/decision`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ decision: 'accepted' }),
  });
  assert.equal(rejectAccepted.status, 409, 'an internally rejected draft cannot be accepted even when its deliverable remains visible in owner review');
  const qaRedo = await fetch(`${api}/morgan-production/${qaRun.runId}/decision`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ decision: 'changes_requested', comments: 'احذف الادعاء غير الموثق.' }),
  });
  assert.equal(qaRedo.status, 200, 'the owner can request a new round after internal QA rejection');

  ollamaServer = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ models: [{ name: 'qwen3.5:4b' }] }));
  });
  await new Promise<void>((resolve) => ollamaServer!.listen(0, '127.0.0.1', resolve));
  const ollamaAddress = ollamaServer.address();
  assert.ok(ollamaAddress && typeof ollamaAddress !== 'string');
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${ollamaAddress.port}`;
  process.env.OLLAMA_MODEL = 'qwen3.5:4b';
  const failedStart = await fetch(`${api}/morgan-production`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ niche: 'أدوات الإنتاج الإبداعي', audience: 'صناع المحتوى', platform: 'instagram', format: 'reel' }),
  });
  const failedRun = await failedStart.json() as { runId: string };
  db.prepare("UPDATE morgan_production_runs SET status='failed',error_message='تعذر الاتصال مؤقتاً' WHERE id=?").run(failedRun.runId);
  const nonOwnerRetry = await fetch(`${api}/morgan-production/${failedRun.runId}/retry`, {
    method: 'POST', headers: { authorization: `Bearer ${nonOwnerSession.rawToken}` },
  });
  assert.equal(nonOwnerRetry.status, 403, 'a privileged non-owner cannot requeue a failed production run');
  const ownerRetry = await fetch(`${api}/morgan-production/${failedRun.runId}/retry`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(ownerRetry.status, 202);
  const retryBody = await ownerRetry.json() as { runId: string; assignedEmployeeCount: number };
  assert.equal(retryBody.assignedEmployeeCount, 7);
  const retryRun = db.prepare('SELECT parent_run_id,iteration,status FROM morgan_production_runs WHERE id=?').get(retryBody.runId) as { parent_run_id: string; iteration: number; status: string };
  assert.equal(retryRun.parent_run_id, failedRun.runId);
  assert.equal(retryRun.iteration, 2);
  assert.equal(retryRun.status, 'queued');
  assert.equal((db.prepare('SELECT count(*) count FROM tasks WHERE json_extract(inputs_json, \'$.productionRunId\')=?').get(retryBody.runId) as { count: number }).count, 7);
});
