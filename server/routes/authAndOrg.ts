import { Router } from 'express';
import { z } from 'zod';
import { getDb, nowIso } from '../db/database';
import { DEFAULT_ORG_ID } from '../db/seed';
import {
  authenticateCredentials,
  bootstrapSuperAdmin,
  createSessionForUser,
  extractBearerOrCookieToken,
  getSessionCount,
  requireAuth,
  requirePermission,
  revokeSessionByToken,
  type AuthedRequest,
} from '../services/auth';
import { generateId, hashPassword } from '../services/security';
import { writeAuditLog } from '../services/audit';
import { getStorageStats } from '../services/storage';
import { getWorkerHealth } from '../services/worker';
import { calculateFinancialSummary } from '../../src/domain/finance';

export const authAndOrgRouter = Router();

function setSessionCookie(res: Parameters<Parameters<typeof authAndOrgRouter.post>[1]>[1], token: string, isSecure: boolean) {
  res.cookie('kestrel_session', token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

authAndOrgRouter.get('/auth/status', (req: AuthedRequest, res) => {
  const userCount = getSessionCount();
  res.json({
    initialized: userCount > 0,
    authenticated: Boolean(req.authUser),
    user: req.authUser ?? null,
  });
});

const bootstrapSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required (min 2 chars).').max(120),
  email: z.string().trim().email('Valid email address is required.'),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
  organizationName: z.string().trim().min(2).max(140).optional(),
});

authAndOrgRouter.post('/auth/bootstrap', (req: AuthedRequest, res) => {
  const parsed = bootstrapSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid bootstrap payload.' });
    return;
  }
  try {
    const user = bootstrapSuperAdmin(parsed.data);
    const { rawToken, expiresAt } = createSessionForUser(user.id, {
      ipAddress: req.ip || '',
      userAgent: String(req.headers['user-agent'] || ''),
    });
    const isSecure = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https';
    setSessionCookie(res, rawToken, isSecure);
    res.status(201).json({ user, token: rawToken, expiresAt });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Bootstrap failed.' });
  }
});

const loginSchema = z.object({
  email: z.string().trim().email('Valid email address is required.'),
  password: z.string().min(1, 'Password is required.'),
});

authAndOrgRouter.post('/auth/login', (req: AuthedRequest, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid login credentials.' });
    return;
  }
  const user = authenticateCredentials(parsed.data.email, parsed.data.password);
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }
  const { rawToken, expiresAt } = createSessionForUser(user.id, {
    ipAddress: req.ip || '',
    userAgent: String(req.headers['user-agent'] || ''),
  });
  const isSecure = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https';
  setSessionCookie(res, rawToken, isSecure);

  writeAuditLog({
    db: getDb(),
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: user.id,
    actorLabel: user.email,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
  });

  res.json({ user, token: rawToken, expiresAt });
});

authAndOrgRouter.post('/auth/logout', (req: AuthedRequest, res) => {
  const token = extractBearerOrCookieToken(req);
  if (token) {
    revokeSessionByToken(token);
  }
  res.clearCookie('kestrel_session', { path: '/' });
  res.json({ ok: true });
});

// Live Database-Derived Main Dashboard
authAndOrgRouter.get('/dashboard', requireAuth, (_req: AuthedRequest, res) => {
  const db = getDb();
  const now = nowIso();

  const count = (sql: string, ...params: (string | number)[]) => {
    const row = db.prepare(sql).get(...params) as { c: number };
    return Number(row?.c ?? 0);
  };

  const activeClients = count(`SELECT COUNT(*) as c FROM clients WHERE status = 'active' AND archived_at IS NULL`);
  const activeProjects = count(`SELECT COUNT(*) as c FROM projects WHERE status = 'active'`);
  const pendingTasks = count(`SELECT COUNT(*) as c FROM tasks WHERE status IN ('queued','assigned','running','validating','waiting_for_input','waiting_for_approval','in_review','retrying')`);
  const overdueTasks = count(`SELECT COUNT(*) as c FROM tasks WHERE due_date IS NOT NULL AND due_date < ? AND status NOT IN ('completed','cancelled')`, now.slice(0, 10));
  const pendingApprovals = count(`SELECT COUNT(*) as c FROM approval_requests WHERE status = 'pending'`);
  const publishedContent = count(`SELECT COUNT(*) as c FROM content_items WHERE status = 'published'`);
  const failedExecutions = count(`SELECT COUNT(*) as c FROM task_runs WHERE status = 'failed'`);
  const activeAgents = count(`SELECT COUNT(*) as c FROM agents WHERE status = 'active'`);
  const totalAgents = count(`SELECT COUNT(*) as c FROM agents`);
  const totalEmployees = count(`SELECT COUNT(*) as c FROM employees WHERE employment_status = 'active'`);
  const totalDepartments = count(`SELECT COUNT(*) as c FROM departments`);

  const agentWorkload = db
    .prepare(
      `SELECT a.id, a.name, a.job_title, a.status, a.model_identifier,
              (SELECT COUNT(*) FROM tasks t WHERE t.assigned_agent_id = a.id AND t.status NOT IN ('completed','cancelled')) as open_tasks,
              (SELECT COUNT(*) FROM task_runs r WHERE r.agent_id = a.id) as total_runs,
              (SELECT COALESCE(SUM(r.cost_usd), 0) FROM task_runs r WHERE r.agent_id = a.id) as total_cost_usd
       FROM agents a
       ORDER BY open_tasks DESC, total_runs DESC, a.name ASC`
    )
    .all();

  const invoices = db
    .prepare('SELECT id, client_id as clientId, amount_cents as amountCents, status FROM invoices')
    .all() as Array<{ id: string; clientId: string; amountCents: number; status: 'draft' | 'issued' | 'paid' | 'overdue' | 'void' }>;
  const payments = db
    .prepare('SELECT id, invoice_id as invoiceId, client_id as clientId, amount_cents as amountCents FROM payments')
    .all() as Array<{ id: string; invoiceId: string; clientId: string; amountCents: number }>;
  const expenses = db
    .prepare('SELECT id, client_id as clientId, project_id as projectId, category, amount_cents as amountCents, is_estimate as isEstimate FROM expenses')
    .all() as Array<{ id: string; clientId: string | null; projectId: string | null; category: string; amountCents: number; isEstimate: number }>;
  const usageRecords = db
    .prepare('SELECT id, client_id as clientId, project_id as projectId, cost_usd as costUsd FROM usage_records')
    .all() as Array<{ id: string; clientId: string | null; projectId: string | null; costUsd: number }>;

  const finance = calculateFinancialSummary({
    invoices,
    payments,
    expenses: expenses.map((e) => ({ ...e, isEstimate: Boolean(e.isEstimate) })),
    usageRecords,
  });

  const integrations = db
    .prepare('SELECT provider_code, display_name, category, status, last_verified_at, last_error FROM integrations ORDER BY category, display_name')
    .all();

  const recentActivity = db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 15')
    .all();

  res.json({
    metrics: {
      activeClients,
      activeProjects,
      pendingTasks,
      overdueTasks,
      pendingApprovals,
      publishedContent,
      failedExecutions,
      activeAgents,
      totalAgents,
      totalEmployees,
      totalDepartments,
    },
    finance,
    agentWorkload,
    integrations,
    recentActivity,
    worker: getWorkerHealth(),
  });
});

// Organization
authAndOrgRouter.get('/organization', requireAuth, (_req, res) => {
  const db = getDb();
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(DEFAULT_ORG_ID);
  const departments = db.prepare('SELECT * FROM departments ORDER BY name').all();
  const employeeCount = (db.prepare('SELECT COUNT(*) as c FROM employees').get() as { c: number }).c;
  const agentCount = (db.prepare('SELECT COUNT(*) as c FROM agents').get() as { c: number }).c;
  res.json({ organization: org, departments, employeeCount, agentCount });
});

authAndOrgRouter.patch('/organization', requirePermission('org:manage'), (req: AuthedRequest, res) => {
  const schema = z.object({
    name: z.string().trim().min(2).max(140).optional(),
    legalName: z.string().trim().max(180).optional(),
    website: z.string().trim().max(240).optional(),
    timezone: z.string().trim().max(64).optional(),
    defaultCurrency: z.string().trim().length(3).optional(),
    governancePolicy: z.record(z.string(), z.boolean()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid organization payload.' });
    return;
  }
  const db = getDb();
  const existing = db.prepare('SELECT * FROM organizations WHERE id = ?').get(DEFAULT_ORG_ID) as Record<string, string>;
  const ts = nowIso();
  db.prepare(
    `UPDATE organizations
     SET name = ?, legal_name = ?, website = ?, timezone = ?, default_currency = ?, governance_policy_json = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    parsed.data.name ?? existing.name,
    parsed.data.legalName ?? existing.legal_name,
    parsed.data.website ?? existing.website,
    parsed.data.timezone ?? existing.timezone,
    parsed.data.defaultCurrency ?? existing.default_currency,
    parsed.data.governancePolicy ? JSON.stringify(parsed.data.governancePolicy) : existing.governance_policy_json,
    ts,
    DEFAULT_ORG_ID
  );

  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'organization.updated',
    entityType: 'organization',
    entityId: DEFAULT_ORG_ID,
    metadata: parsed.data,
  });

  res.json({ organization: db.prepare('SELECT * FROM organizations WHERE id = ?').get(DEFAULT_ORG_ID) });
});

// Departments
authAndOrgRouter.get('/departments', requireAuth, (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT d.*,
              (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id) as employee_count,
              (SELECT COUNT(*) FROM agents a WHERE a.department_id = d.id) as agent_count
       FROM departments d
       ORDER BY d.name ASC`
    )
    .all();
  res.json({ departments: rows });
});

authAndOrgRouter.post('/departments', requirePermission('org:manage'), (req: AuthedRequest, res) => {
  const schema = z.object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(400).default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid department.' });
    return;
  }
  const db = getDb();
  const id = generateId('dept');
  const code = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + id.slice(-4);
  const ts = nowIso();
  db.prepare(
    `INSERT INTO departments (id, organization_id, code, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, DEFAULT_ORG_ID, code, parsed.data.name, parsed.data.description, ts, ts);

  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'department.created',
    entityType: 'department',
    entityId: id,
    metadata: { name: parsed.data.name },
  });

  res.status(201).json({ department: db.prepare('SELECT * FROM departments WHERE id = ?').get(id) });
});

// Employees
authAndOrgRouter.get('/employees', requireAuth, (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT e.*, d.name as department_name,
              (SELECT GROUP_CONCAT(r.name, ', ')
               FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id
               WHERE ur.user_id = e.user_id) as role_names
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       ORDER BY e.created_at DESC`
    )
    .all();
  res.json({ employees: rows });
});

authAndOrgRouter.post('/employees', requirePermission('users:manage'), (req: AuthedRequest, res) => {
  const schema = z.object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email(),
    jobTitle: z.string().trim().min(2).max(120),
    departmentId: z.string().nullable().optional(),
    roleCode: z.enum(['super_admin', 'agency_director', 'account_manager', 'creative_lead', 'analyst']).default('account_manager'),
    monthlyCostUsd: z.number().min(0).max(500000).default(0),
    initialPassword: z.string().min(8).max(128).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid employee data.' });
    return;
  }

  const db = getDb();
  const ts = nowIso();
  const email = parsed.data.email.toLowerCase();
  const empId = generateId('emp');
  let userId: string | null = null;

  try {
    if (parsed.data.initialPassword) {
      userId = generateId('usr');
      db.prepare(
        `INSERT INTO users (id, organization_id, email, full_name, password_hash, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
      ).run(userId, DEFAULT_ORG_ID, email, parsed.data.fullName, hashPassword(parsed.data.initialPassword), ts, ts);
      db.prepare('INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES (?, ?, ?)').run(
        userId,
        `role_${parsed.data.roleCode}`,
        ts
      );
    }

    db.prepare(
      `INSERT INTO employees (
        id, organization_id, user_id, department_id, full_name, email, job_title,
        employment_status, monthly_cost_cents, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
    ).run(
      empId,
      DEFAULT_ORG_ID,
      userId,
      parsed.data.departmentId ?? null,
      parsed.data.fullName,
      email,
      parsed.data.jobTitle,
      Math.round(parsed.data.monthlyCostUsd * 100),
      ts,
      ts
    );

    writeAuditLog({
      db,
      correlationId: req.correlationId,
      actorType: 'human',
      actorId: req.authUser!.id,
      actorLabel: req.authUser!.email,
      action: 'employee.created',
      entityType: 'employee',
      entityId: empId,
      metadata: { email, roleCode: parsed.data.roleCode, hasLogin: Boolean(userId) },
    });

    res.status(201).json({ employee: db.prepare('SELECT * FROM employees WHERE id = ?').get(empId) });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Employee email already exists.' });
  }
});

// Roles & Permissions Matrix
authAndOrgRouter.get('/roles', requireAuth, (_req, res) => {
  const db = getDb();
  const roles = db.prepare('SELECT * FROM roles ORDER BY name').all() as Array<Record<string, unknown>>;
  const permissions = db.prepare('SELECT * FROM permissions ORDER BY category, code').all();
  const mappings = db
    .prepare(
      `SELECT rp.role_id, p.code
       FROM role_permissions rp INNER JOIN permissions p ON p.id = rp.permission_id`
    )
    .all() as Array<{ role_id: string; code: string }>;

  const permsByRole = new Map<string, string[]>();
  for (const m of mappings) {
    const arr = permsByRole.get(m.role_id) ?? [];
    arr.push(m.code);
    permsByRole.set(m.role_id, arr);
  }

  res.json({
    roles: roles.map((r) => ({ ...r, permissions: permsByRole.get(String(r.id)) ?? [] })),
    permissions,
  });
});

// Notifications
authAndOrgRouter.get('/notifications', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM notifications
       WHERE user_id IS NULL OR user_id = ?
       ORDER BY created_at DESC LIMIT 100`
    )
    .all(req.authUser!.id);
  res.json({ notifications: rows });
});

authAndOrgRouter.post('/notifications/:id/read', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET read_at = ? WHERE id = ?').run(nowIso(), req.params.id);
  res.json({ ok: true });
});

authAndOrgRouter.post('/notifications/read-all', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  db.prepare(
    'UPDATE notifications SET read_at = ? WHERE read_at IS NULL AND (user_id IS NULL OR user_id = ?)'
  ).run(nowIso(), req.authUser!.id);
  res.json({ ok: true });
});

// Immutable Audit Logs
authAndOrgRouter.get('/audit-logs', requirePermission('audit:read'), (req, res) => {
  const db = getDb();
  const entityType = typeof req.query.entityType === 'string' ? req.query.entityType.trim() : '';
  const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  let sql = 'SELECT * FROM audit_logs WHERE 1=1';
  const params: string[] = [];
  if (entityType) {
    sql += ' AND entity_type = ?';
    params.push(entityType);
  }
  if (search) {
    sql += ' AND (action LIKE ? OR actor_label LIKE ? OR entity_id LIKE ? OR correlation_id LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY created_at DESC LIMIT 200';
  res.json({ logs: db.prepare(sql).all(...params) });
});

// System Health & Monitoring
authAndOrgRouter.get('/system/health', requirePermission('system:health'), (_req, res) => {
  const db = getDb();
  const started = Date.now();
  let dbHealthy = false;
  let migrationCount = 0;
  try {
    const m = db.prepare('SELECT COUNT(*) as c FROM schema_migrations').get() as { c: number };
    migrationCount = m.c;
    dbHealthy = true;
  } catch {
    dbHealthy = false;
  }
  const dbLatencyMs = Date.now() - started;

  const avgAiLatency = db
    .prepare('SELECT AVG(latency_ms) as avg_ms, COUNT(*) as total_runs, SUM(CASE WHEN status = \'failed\' THEN 1 ELSE 0 END) as failed_runs, COALESCE(SUM(cost_usd), 0) as total_ai_cost FROM task_runs')
    .get();
  const recentEvents = db
    .prepare('SELECT * FROM system_events ORDER BY created_at DESC LIMIT 40')
    .all();
  const jobs = db
    .prepare('SELECT * FROM background_jobs ORDER BY created_at DESC LIMIT 40')
    .all();
  const integrations = db
    .prepare('SELECT provider_code, display_name, status, last_verified_at, last_error FROM integrations')
    .all();

  res.json({
    status: dbHealthy ? 'operational' : 'degraded',
    checkedAt: nowIso(),
    database: {
      engine: 'sqlite_wal',
      healthy: dbHealthy,
      latencyMs: dbLatencyMs,
      appliedMigrations: migrationCount,
    },
    worker: getWorkerHealth(),
    storage: getStorageStats(),
    aiTelemetry: avgAiLatency,
    integrations,
    recentJobs: jobs,
    recentEvents,
  });
});
