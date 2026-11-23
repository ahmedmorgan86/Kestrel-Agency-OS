import test from 'node:test';
import assert from 'node:assert/strict';
import { closeDatabase, initDatabase } from '../server/db/database';
import { runMigrations } from '../server/db/migrations';
import { seedSystemConfiguration } from '../server/db/seed';
import { authenticateCredentials, bootstrapSuperAdmin } from '../server/services/auth';
import { encryptSecretJson, decryptSecretJson } from '../server/services/security';
import {
  cancelBackgroundJob,
  enqueueBackgroundJob,
  reclaimStaleLeases,
} from '../server/services/worker';

import { verifySupabaseConnection } from '../server/services/supabase';

test('database migrations, honest system config seed, auth bootstrap, credential encryption, and job queue lifecycle', async () => {
  const db = initDatabase(':memory:');
  const { applied } = runMigrations(db);
  assert.ok(applied.includes('001_initial_agency_os_schema'));
  assert.ok(applied.includes('003_morgan_academy'));
  assert.ok(applied.includes('004_morgan_group_identity'));
  assert.ok(applied.includes('005_morgan_technology_company_departments'));
  assert.ok(applied.includes('006_free_local_ai_defaults'));
  assert.ok(applied.includes('007_morgan_virtual_staff_profiles'));

  // Seed is idempotent, and the virtual workforce is clearly separate from client and activity data.
  seedSystemConfiguration(db);
  seedSystemConfiguration(db);

  const deptCount = (db.prepare('SELECT COUNT(*) as c FROM departments').get() as { c: number }).c;
  const agentCount = (db.prepare('SELECT COUNT(*) as c FROM agents').get() as { c: number }).c;
  const clientCount = (db.prepare('SELECT COUNT(*) as c FROM clients').get() as { c: number }).c;
  const runCount = (db.prepare('SELECT COUNT(*) as c FROM task_runs').get() as { c: number }).c;
  const supaInteg = db
    .prepare("SELECT status FROM integrations WHERE provider_code = 'supabase'")
    .get() as { status: string } | undefined;

  const meetingRoomCount = (db.prepare('SELECT COUNT(*) as c FROM meeting_rooms').get() as { c: number }).c;
  const employeeCount = (db.prepare('SELECT COUNT(*) as c FROM employees').get() as { c: number }).c;
  const courseCount = (db.prepare('SELECT COUNT(*) as c FROM academy_courses').get() as { c: number }).c;
  const enrollmentCount = (db.prepare('SELECT COUNT(*) as c FROM academy_enrollments').get() as { c: number }).c;

  assert.equal(deptCount, 13);
  assert.equal(meetingRoomCount, 4);
  assert.equal((db.prepare("SELECT name FROM meeting_rooms WHERE id = 'room_strategy_war_room'").get() as { name: string }).name, 'الاجتماع التحريري اليومي');
  assert.equal(agentCount, 14);
  const localAgentCount = (db.prepare("SELECT COUNT(*) as c FROM agents WHERE model_provider = 'ollama' AND model_identifier = 'qwen3.5:4b'").get() as { c: number }).c;
  assert.equal(localAgentCount, 14, 'The AI workforce uses the free local model by default');
  assert.equal(employeeCount, 30, 'The virtual company starts with 30 fictional, login-free employees');
  const roster = db.prepare(`SELECT id, user_id, full_name, email, job_title, manager_employee_id, profile_json
                             FROM employees WHERE id LIKE 'employee_virtual_%' ORDER BY id`).all() as Array<{
    id: string; user_id: string | null; full_name: string; email: string; job_title: string;
    manager_employee_id: string | null; profile_json: string;
  }>;
  assert.equal(roster.length, 30);
  assert.deepEqual(roster.map((employee) => employee.full_name), [
    'سلمى الحداد', 'كريم النجار', 'ليلى منصور', 'عمر فهمي', 'هبة السيد', 'ياسر عبدالله', 'نورا خليل', 'طارق مصطفى', 'دينا رمضان', 'مازن حسن',
    'رنا العلي', 'إياد صالح', 'سارة جمال', 'آدم زيدان', 'مريم شريف', 'بلال عيسى', 'جنى فوزي', 'هشام رأفت', 'لمى سعيد', 'وليد المصري',
    'آية كمال', 'زياد عادل', 'ملك ناصر', 'فادي منير', 'هدى بكر', 'أنس الشاذلي', 'روان عثمان', 'كنان رفعت', 'جود حمدي', 'سيف البدري',
  ]);
  assert.ok(roster.every((employee) => employee.user_id === null && employee.email.endsWith('@morgangroup.example')));
  const hairDescriptions = new Set<string>();
  assert.ok(roster.every((employee) => {
    const profile = JSON.parse(employee.profile_json) as { responsibilities?: unknown[]; appearance?: Record<string, unknown> };
    hairDescriptions.add(String(profile.appearance?.hair || ''));
    return (profile.responsibilities?.length ?? 0) >= 2 && Boolean(profile.appearance?.skin && profile.appearance?.hair && profile.appearance?.clothing && profile.appearance?.build);
  }), 'Every fictional employee has a specialty profile, responsibilities, and appearance description');
  assert.ok(hairDescriptions.size >= 20, 'Appearance descriptions must vary across the virtual team');
  assert.equal(roster[4]?.manager_employee_id, 'employee_virtual_02', 'The editor reports to the content director');
  assert.equal(roster[9]?.manager_employee_id, 'employee_virtual_05', 'The script writer reports to the editor');
  const rosterIds = new Set(roster.map((employee) => employee.id));
  for (const employee of roster) {
    const visited = new Set([employee.id]);
    let managerId = employee.manager_employee_id;
    while (managerId && rosterIds.has(managerId)) {
      assert.ok(!visited.has(managerId), `No reporting cycle may include ${employee.full_name}`);
      visited.add(managerId);
      managerId = roster.find((candidate) => candidate.id === managerId)?.manager_employee_id ?? null;
    }
    if (managerId) {
      assert.ok(db.prepare('SELECT id FROM employees WHERE id = ?').get(managerId), `Manager ${managerId} must exist`);
    }
  }
  assert.equal(courseCount, 4, 'The academy catalog is seeded with its learning paths');
  assert.equal(enrollmentCount, 0, 'No learning completions or enrollments are fabricated');
  const organization = db.prepare('SELECT name, tagline, brand_symbol FROM organizations WHERE id = ?').get('org_kestrel_agency') as { name: string; tagline: string; brand_symbol: string };
  assert.equal(organization.name, 'MORGAN GROUP');
  assert.equal(organization.tagline, 'Technology, built together');
  assert.equal(organization.brand_symbol, 'prism');

  const courseId = String((db.prepare('SELECT id FROM academy_courses ORDER BY sort_order LIMIT 1').get() as { id: string }).id);
  const employeeId = String((db.prepare('SELECT id FROM employees ORDER BY id LIMIT 1').get() as { id: string }).id);
  const stamp = new Date().toISOString();
  db.prepare(`INSERT INTO academy_enrollments (id, organization_id, course_id, employee_id, enrolled_at, updated_at)
              VALUES ('enrollment_test', 'org_kestrel_agency', ?, ?, ?, ?)`)
    .run(courseId, employeeId, stamp, stamp);
  db.prepare(`UPDATE academy_enrollments SET progress_percent = 100, status = 'completed', completed_at = ?, updated_at = ?
              WHERE id = 'enrollment_test'`)
    .run(stamp, stamp);
  const completedEnrollment = db.prepare(`SELECT progress_percent, status FROM academy_enrollments WHERE id = 'enrollment_test'`)
    .get() as { progress_percent: number; status: string };
  assert.equal(completedEnrollment.progress_percent, 100);
  assert.equal(completedEnrollment.status, 'completed');
  assert.equal(clientCount, 0, 'Production seed must contain zero fabricated clients');
  assert.equal(runCount, 0, 'Production seed must contain zero fabricated agent executions');
  assert.ok(supaInteg, 'Supabase integration must be seeded');
  assert.ok(db.prepare("SELECT id FROM integrations WHERE provider_code = 'ollama'").get(), 'Ollama local provider must be available without an API key');
  assert.equal((db.prepare("SELECT name FROM departments WHERE code = 'quality_assurance'").get() as { name: string }).name, 'الجودة والموافقات');

  const prevUrl = process.env.SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supaCheck = await verifySupabaseConnection();
  assert.equal(supaCheck.ok, false);
  assert.equal(supaCheck.configured, false);
  if (prevUrl) process.env.SUPABASE_URL = prevUrl;
  if (prevKey) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;

  // Admin bootstrap + scrypt auth verification
  const admin = bootstrapSuperAdmin({
    fullName: 'Ada Operations',
    email: 'ada@kestrel.internal',
    password: 'StrongPassword123!',
  });
  assert.ok(admin.roles.includes('super_admin'));
  assert.ok(admin.permissions.includes('approvals:decide'));
  seedSystemConfiguration(db);
  const adminEmployee = db.prepare('SELECT id FROM employees WHERE user_id = ?').get(admin.id) as { id: string };
  assert.equal(
    (db.prepare("SELECT manager_employee_id FROM employees WHERE id = 'employee_virtual_01'").get() as { manager_employee_id: string }).manager_employee_id,
    adminEmployee.id,
    'The operations director reports to the authenticated owner after owner setup'
  );

  assert.equal(authenticateCredentials('ada@kestrel.internal', 'WrongPassword'), null);
  const authed = authenticateCredentials('ada@kestrel.internal', 'StrongPassword123!');
  assert.equal(authed?.email, 'ada@kestrel.internal');

  // AES-256-GCM encryption at rest for integration tokens
  const ciphertext = encryptSecretJson({ accessToken: 'tok_secret_123' });
  assert.equal(ciphertext.includes('tok_secret_123'), false);
  const decrypted = decryptSecretJson<{ accessToken: string }>(ciphertext);
  assert.equal(decrypted.accessToken, 'tok_secret_123');

  // Durable job queue idempotency, cancellation, and expired lease recovery
  const j1 = enqueueBackgroundJob({
    jobType: 'agent_task_execution',
    payload: { agentId: 'agent_copywriter_agent', prompt: 'Draft post' },
    idempotencyKey: 'idem_test_1',
  });
  const j2 = enqueueBackgroundJob({
    jobType: 'agent_task_execution',
    payload: { agentId: 'agent_copywriter_agent', prompt: 'Draft post' },
    idempotencyKey: 'idem_test_1',
  });
  assert.equal(j1.jobId, j2.jobId);
  assert.equal(j2.deduplicated, true);

  assert.equal(cancelBackgroundJob(j1.jobId), true);

  // Simulate worker crash with expired lease
  const j3 = enqueueBackgroundJob({
    jobType: 'agent_task_execution',
    payload: { agentId: 'agent_copywriter_agent', prompt: 'Crash test' },
  });
  db.prepare(
    `UPDATE background_jobs SET status = 'running', attempts = 1, lease_owner = 'dead_worker', lease_expires_at = ? WHERE id = ?`
  ).run(new Date(Date.now() - 10_000).toISOString(), j3.jobId);

  const reclaimed = reclaimStaleLeases();
  assert.equal(reclaimed, 1);
  const row = db.prepare('SELECT status FROM background_jobs WHERE id = ?').get(j3.jobId) as { status: string };
  assert.equal(row.status, 'retrying');

  closeDatabase();
});
