import { Router } from 'express';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { getDb, nowIso } from '../db/database';
import { DEFAULT_ORG_ID } from '../db/seed';
import { requireAuth, requirePermission, type AuthedRequest } from '../services/auth';
import { generateId } from '../services/security';
import { writeAuditLog } from '../services/audit';
import { enqueueBackgroundJob } from '../services/worker';
import { TASK_STATUSES } from '../../src/domain/workflows';

export const clientsAndWorkRouter = Router();

// --- CLIENTS CRM ---
clientsAndWorkRouter.get('/clients', requirePermission('clients:read'), (req, res) => {
  const db = getDb();
  const includeArchived = req.query.includeArchived === 'true';
  const rows = db
    .prepare(
      `SELECT c.*,
              e.full_name as account_manager_name,
              (SELECT COUNT(*) FROM client_brands b WHERE b.client_id = c.id) as brand_count,
              (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id) as project_count,
              (SELECT COUNT(*) FROM client_social_accounts s WHERE s.client_id = c.id) as social_account_count
       FROM clients c
       LEFT JOIN employees e ON e.id = c.account_manager_employee_id
       ${includeArchived ? '' : 'WHERE c.archived_at IS NULL'}
       ORDER BY c.created_at DESC`
    )
    .all();
  res.json({ clients: rows });
});

clientsAndWorkRouter.get('/clients/:id', requirePermission('clients:read'), (req, res) => {
  const db = getDb();
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) {
    res.status(404).json({ error: 'Client not found.' });
    return;
  }
  const contacts = db.prepare('SELECT * FROM client_contacts WHERE client_id = ? ORDER BY is_primary DESC, created_at ASC').all(req.params.id);
  const brands = db.prepare('SELECT * FROM client_brands WHERE client_id = ? ORDER BY created_at DESC').all(req.params.id);
  const projects = db.prepare('SELECT * FROM projects WHERE client_id = ? ORDER BY created_at DESC').all(req.params.id);
  const campaigns = db.prepare('SELECT * FROM campaigns WHERE client_id = ? ORDER BY created_at DESC').all(req.params.id);
  const socialAccounts = db.prepare('SELECT * FROM client_social_accounts WHERE client_id = ? ORDER BY created_at DESC').all(req.params.id);
  const invoices = db.prepare('SELECT * FROM invoices WHERE client_id = ? ORDER BY issued_date DESC').all(req.params.id);
  res.json({ client, contacts, brands, projects, campaigns, socialAccounts, invoices });
});

clientsAndWorkRouter.post('/clients', requirePermission('clients:write'), (req: AuthedRequest, res) => {
  const schema = z.object({
    name: z.string().trim().min(2, 'Client name is required.').max(140),
    legalName: z.string().trim().max(180).default(''),
    industry: z.string().trim().min(2, 'Industry is required.').max(100),
    status: z.enum(['onboarding', 'active', 'paused', 'offboarded']).default('active'),
    accountManagerEmployeeId: z.string().nullable().optional(),
    servicePackage: z.string().trim().max(140).default(''),
    monthlyRetainerUsd: z.number().min(0).max(10_000_000).default(0),
    billingEmail: z.string().trim().email().or(z.literal('')).default(''),
    contractStartDate: z.string().nullable().optional(),
    contractRenewalDate: z.string().nullable().optional(),
    notes: z.string().trim().max(4000).default(''),
    primaryContactName: z.string().trim().max(120).optional(),
    primaryContactEmail: z.string().trim().email().or(z.literal('')).optional(),
    primaryContactPhone: z.string().trim().max(40).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid client payload.' });
    return;
  }
  const db = getDb();
  const id = generateId('cli');
  const ts = nowIso();
  db.prepare(
    `INSERT INTO clients (
      id, organization_id, name, legal_name, industry, status, account_manager_employee_id,
      service_package, monthly_retainer_cents, billing_email, contract_start_date,
      contract_renewal_date, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    DEFAULT_ORG_ID,
    parsed.data.name,
    parsed.data.legalName,
    parsed.data.industry,
    parsed.data.status,
    parsed.data.accountManagerEmployeeId ?? null,
    parsed.data.servicePackage,
    Math.round(parsed.data.monthlyRetainerUsd * 100),
    parsed.data.billingEmail,
    parsed.data.contractStartDate ?? null,
    parsed.data.contractRenewalDate ?? null,
    parsed.data.notes,
    ts,
    ts
  );

  if (parsed.data.primaryContactName) {
    db.prepare(
      `INSERT INTO client_contacts (id, client_id, full_name, role_title, email, phone, is_primary, created_at)
       VALUES (?, ?, ?, 'Primary Contact', ?, ?, 1, ?)`
    ).run(
      generateId('cct'),
      id,
      parsed.data.primaryContactName,
      parsed.data.primaryContactEmail ?? '',
      parsed.data.primaryContactPhone ?? '',
      ts
    );
  }

  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'client.created',
    entityType: 'client',
    entityId: id,
    metadata: { name: parsed.data.name, industry: parsed.data.industry },
  });

  res.status(201).json({ client: db.prepare('SELECT * FROM clients WHERE id = ?').get(id) });
});

clientsAndWorkRouter.patch('/clients/:id', requirePermission('clients:write'), (req: AuthedRequest, res) => {
  const schema = z.object({
    name: z.string().trim().min(2).max(140).optional(),
    industry: z.string().trim().min(2).max(100).optional(),
    status: z.enum(['onboarding', 'active', 'paused', 'offboarded']).optional(),
    servicePackage: z.string().trim().max(140).optional(),
    monthlyRetainerUsd: z.number().min(0).optional(),
    notes: z.string().trim().max(4000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update.' });
    return;
  }
  const db = getDb();
  const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id) as Record<string, SQLInputValue> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Client not found.' });
    return;
  }
  const ts = nowIso();
  db.prepare(
    `UPDATE clients SET name = ?, industry = ?, status = ?, service_package = ?, monthly_retainer_cents = ?, notes = ?, updated_at = ? WHERE id = ?`
  ).run(
    parsed.data.name ?? existing.name,
    parsed.data.industry ?? existing.industry,
    parsed.data.status ?? existing.status,
    parsed.data.servicePackage ?? existing.service_package,
    parsed.data.monthlyRetainerUsd !== undefined
      ? Math.round(parsed.data.monthlyRetainerUsd * 100)
      : existing.monthly_retainer_cents,
    parsed.data.notes ?? existing.notes,
    ts,
    req.params.id
  );
  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'client.updated',
    entityType: 'client',
    entityId: req.params.id,
    metadata: parsed.data,
  });
  res.json({ client: db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id) });
});

clientsAndWorkRouter.delete('/clients/:id', requirePermission('clients:delete'), (req: AuthedRequest, res) => {
  const db = getDb();
  const ts = nowIso();
  const result = db
    .prepare(`UPDATE clients SET archived_at = ?, status = 'offboarded', updated_at = ? WHERE id = ? AND archived_at IS NULL`)
    .run(ts, ts, req.params.id);
  if (Number(result.changes) === 0) {
    res.status(404).json({ error: 'Client not found or already archived.' });
    return;
  }
  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'client.archived',
    entityType: 'client',
    entityId: req.params.id,
  });
  res.json({ ok: true, archivedAt: ts });
});

// --- VERSIONED BRAND PROFILES ---
clientsAndWorkRouter.get('/brands', requirePermission('brands:read'), (req, res) => {
  const db = getDb();
  const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : '';
  const brands = db
    .prepare(
      `SELECT b.*, c.name as client_name
       FROM client_brands b
       INNER JOIN clients c ON c.id = b.client_id
       ${clientId ? 'WHERE b.client_id = ?' : ''}
       ORDER BY b.updated_at DESC`
    )
    .all(...(clientId ? [clientId] : [])) as Array<Record<string, unknown>>;

  const versions = db
    .prepare('SELECT * FROM client_brand_versions ORDER BY version_number DESC')
    .all() as Array<Record<string, unknown>>;

  const versionsByBrand = new Map<string, Array<Record<string, unknown>>>();
  for (const v of versions) {
    const key = String(v.brand_id);
    const list = versionsByBrand.get(key) ?? [];
    list.push(v);
    versionsByBrand.set(key, list);
  }

  res.json({
    brands: brands.map((b) => ({
      ...b,
      versions: versionsByBrand.get(String(b.id)) ?? [],
    })),
  });
});

const brandProfileSchema = z.object({
  clientId: z.string().min(1, 'Client selection is required.'),
  name: z.string().trim().min(2, 'Brand name is required.').max(140),
  description: z.string().trim().max(2000).default(''),
  industry: z.string().trim().max(100).default(''),
  targetAudience: z.string().trim().max(1000).default(''),
  positioning: z.string().trim().max(1000).default(''),
  personality: z.string().trim().max(500).default(''),
  toneOfVoice: z.string().trim().max(500).default(''),
  preferredLanguage: z.string().trim().max(60).default('English'),
  dialect: z.string().trim().max(60).default(''),
  writingStyle: z.string().trim().max(500).default(''),
  preferredExpressions: z.array(z.string()).default([]),
  prohibitedExpressions: z.array(z.string()).default([]),
  hashtagPreferences: z.array(z.string()).default([]),
  ctaPreferences: z.array(z.string()).default([]),
  colorPalette: z.array(z.string()).default([]),
  changeSummary: z.string().trim().max(300).default('Initial brand profile version'),
});

clientsAndWorkRouter.post('/brands', requirePermission('brands:write'), (req: AuthedRequest, res) => {
  const parsed = brandProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid brand profile.' });
    return;
  }
  const db = getDb();
  const brandId = generateId('brd');
  const versionId = generateId('brdv');
  const ts = nowIso();

  db.prepare(
    `INSERT INTO client_brands (id, client_id, name, description, industry, current_version_number, approved_version_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
  ).run(brandId, parsed.data.clientId, parsed.data.name, parsed.data.description, parsed.data.industry, versionId, ts, ts);

  db.prepare(
    `INSERT INTO client_brand_versions (
      id, brand_id, version_number, target_audience, positioning, personality, tone_of_voice,
      preferred_language, dialect, writing_style, preferred_expressions_json, prohibited_expressions_json,
      hashtag_preferences_json, cta_preferences_json, color_palette_json, created_by_user_id, change_summary, created_at
    ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    versionId,
    brandId,
    parsed.data.targetAudience,
    parsed.data.positioning,
    parsed.data.personality,
    parsed.data.toneOfVoice,
    parsed.data.preferredLanguage,
    parsed.data.dialect,
    parsed.data.writingStyle,
    JSON.stringify(parsed.data.preferredExpressions),
    JSON.stringify(parsed.data.prohibitedExpressions),
    JSON.stringify(parsed.data.hashtagPreferences),
    JSON.stringify(parsed.data.ctaPreferences),
    JSON.stringify(parsed.data.colorPalette),
    req.authUser!.id,
    parsed.data.changeSummary,
    ts
  );

  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'brand.created',
    entityType: 'client_brand',
    entityId: brandId,
    metadata: { name: parsed.data.name, versionNumber: 1 },
  });

  res.status(201).json({ id: brandId, versionId });
});

clientsAndWorkRouter.post('/brands/:id/versions', requirePermission('brands:write'), (req: AuthedRequest, res) => {
  const schema = brandProfileSchema.omit({ clientId: true, name: true }).extend({
    changeSummary: z.string().trim().min(3, 'Change summary is required for versioned brand updates.').max(300),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid brand version.' });
    return;
  }
  const db = getDb();
  const brand = db.prepare('SELECT * FROM client_brands WHERE id = ?').get(req.params.id) as
    | { id: string; current_version_number: number }
    | undefined;
  if (!brand) {
    res.status(404).json({ error: 'Brand not found.' });
    return;
  }
  const nextVersion = brand.current_version_number + 1;
  const versionId = generateId('brdv');
  const ts = nowIso();

  db.prepare(
    `INSERT INTO client_brand_versions (
      id, brand_id, version_number, target_audience, positioning, personality, tone_of_voice,
      preferred_language, dialect, writing_style, preferred_expressions_json, prohibited_expressions_json,
      hashtag_preferences_json, cta_preferences_json, color_palette_json, created_by_user_id, change_summary, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    versionId,
    brand.id,
    nextVersion,
    parsed.data.targetAudience,
    parsed.data.positioning,
    parsed.data.personality,
    parsed.data.toneOfVoice,
    parsed.data.preferredLanguage,
    parsed.data.dialect,
    parsed.data.writingStyle,
    JSON.stringify(parsed.data.preferredExpressions),
    JSON.stringify(parsed.data.prohibitedExpressions),
    JSON.stringify(parsed.data.hashtagPreferences),
    JSON.stringify(parsed.data.ctaPreferences),
    JSON.stringify(parsed.data.colorPalette),
    req.authUser!.id,
    parsed.data.changeSummary,
    ts
  );

  db.prepare(
    `UPDATE client_brands SET current_version_number = ?, approved_version_id = ?, updated_at = ? WHERE id = ?`
  ).run(nextVersion, versionId, ts, brand.id);

  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'brand.version_created',
    entityType: 'client_brand',
    entityId: brand.id,
    metadata: { versionNumber: nextVersion, changeSummary: parsed.data.changeSummary },
  });

  res.status(201).json({ versionId, versionNumber: nextVersion });
});

// --- PROJECTS ---
clientsAndWorkRouter.get('/projects', requirePermission('projects:read'), (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.*, c.name as client_name, b.name as brand_name,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
              (SELECT COUNT(*) FROM content_items ci WHERE ci.project_id = p.id) as content_count
       FROM projects p
       INNER JOIN clients c ON c.id = p.client_id
       LEFT JOIN client_brands b ON b.id = p.brand_id
       ORDER BY p.created_at DESC`
    )
    .all();
  res.json({ projects: rows });
});

clientsAndWorkRouter.post('/projects', requirePermission('projects:write'), (req: AuthedRequest, res) => {
  const schema = z.object({
    clientId: z.string().min(1, 'Client is required.'),
    brandId: z.string().nullable().optional(),
    name: z.string().trim().min(2, 'Project name is required.').max(140),
    objectives: z.string().trim().max(2000).default(''),
    scope: z.string().trim().max(2000).default(''),
    deliverables: z.array(z.string()).default([]),
    budgetUsd: z.number().min(0).max(10_000_000).default(0),
    startDate: z.string().nullable().optional(),
    targetEndDate: z.string().nullable().optional(),
    status: z.enum(['planning', 'active', 'on_hold', 'completed', 'archived']).default('active'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid project.' });
    return;
  }
  const db = getDb();
  const id = generateId('prj');
  const ts = nowIso();
  db.prepare(
    `INSERT INTO projects (
      id, organization_id, client_id, brand_id, name, objectives, scope, deliverables_json,
      budget_cents, start_date, target_end_date, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    DEFAULT_ORG_ID,
    parsed.data.clientId,
    parsed.data.brandId ?? null,
    parsed.data.name,
    parsed.data.objectives,
    parsed.data.scope,
    JSON.stringify(parsed.data.deliverables),
    Math.round(parsed.data.budgetUsd * 100),
    parsed.data.startDate ?? null,
    parsed.data.targetEndDate ?? null,
    parsed.data.status,
    ts,
    ts
  );
  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'project.created',
    entityType: 'project',
    entityId: id,
    metadata: { name: parsed.data.name, clientId: parsed.data.clientId },
  });
  res.status(201).json({ project: db.prepare('SELECT * FROM projects WHERE id = ?').get(id) });
});

clientsAndWorkRouter.patch('/projects/:id', requirePermission('projects:write'), (req: AuthedRequest, res) => {
  const schema = z.object({
    status: z.enum(['planning', 'active', 'on_hold', 'completed', 'archived']).optional(),
    name: z.string().trim().min(2).max(140).optional(),
    budgetUsd: z.number().min(0).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid project update.' });
    return;
  }
  const db = getDb();
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as Record<string, SQLInputValue> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  db.prepare('UPDATE projects SET name = ?, status = ?, budget_cents = ?, updated_at = ? WHERE id = ?').run(
    parsed.data.name ?? existing.name,
    parsed.data.status ?? existing.status,
    parsed.data.budgetUsd !== undefined ? Math.round(parsed.data.budgetUsd * 100) : existing.budget_cents,
    nowIso(),
    req.params.id
  );
  res.json({ project: db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) });
});

// --- CAMPAIGNS ---
clientsAndWorkRouter.get('/campaigns', requirePermission('projects:read'), (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT cp.*, c.name as client_name, b.name as brand_name, p.name as project_name,
              (SELECT COUNT(*) FROM content_items ci WHERE ci.campaign_id = cp.id) as content_count
       FROM campaigns cp
       INNER JOIN clients c ON c.id = cp.client_id
       LEFT JOIN client_brands b ON b.id = cp.brand_id
       LEFT JOIN projects p ON p.id = cp.project_id
       ORDER BY cp.created_at DESC`
    )
    .all();
  res.json({ campaigns: rows });
});

clientsAndWorkRouter.post('/campaigns', requirePermission('projects:write'), (req: AuthedRequest, res) => {
  const schema = z.object({
    clientId: z.string().min(1),
    brandId: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
    name: z.string().trim().min(2).max(140),
    objective: z.string().trim().max(1000).default(''),
    targetAudience: z.string().trim().max(600).default(''),
    platforms: z.array(z.string()).default([]),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    budgetUsd: z.number().min(0).default(0),
    creativeDirection: z.string().trim().max(2000).default(''),
    kpis: z.array(z.string()).default([]),
    status: z.enum(['planning', 'active', 'paused', 'completed', 'archived']).default('planning'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid campaign.' });
    return;
  }
  const db = getDb();
  const id = generateId('cmp');
  const ts = nowIso();
  db.prepare(
    `INSERT INTO campaigns (
      id, organization_id, client_id, brand_id, project_id, name, objective, target_audience,
      platforms_json, start_date, end_date, budget_cents, creative_direction, kpis_json,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    DEFAULT_ORG_ID,
    parsed.data.clientId,
    parsed.data.brandId ?? null,
    parsed.data.projectId ?? null,
    parsed.data.name,
    parsed.data.objective,
    parsed.data.targetAudience,
    JSON.stringify(parsed.data.platforms),
    parsed.data.startDate ?? null,
    parsed.data.endDate ?? null,
    Math.round(parsed.data.budgetUsd * 100),
    parsed.data.creativeDirection,
    JSON.stringify(parsed.data.kpis),
    parsed.data.status,
    ts,
    ts
  );
  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'campaign.created',
    entityType: 'campaign',
    entityId: id,
    metadata: { name: parsed.data.name },
  });
  res.status(201).json({ campaign: db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) });
});

// --- TASKS & WORKFLOW ENGINE ---
clientsAndWorkRouter.get('/tasks', requirePermission('tasks:read'), (req, res) => {
  const db = getDb();
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  let sql = `
    SELECT t.*, c.name as client_name, p.name as project_name,
           d.name as department_name, a.name as agent_name, u.full_name as assigned_user_name,
           (SELECT r.status FROM task_runs r WHERE r.task_id = t.id ORDER BY r.started_at DESC LIMIT 1) as latest_run_status
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN departments d ON d.id = t.department_id
    LEFT JOIN agents a ON a.id = t.assigned_agent_id
    LEFT JOIN users u ON u.id = t.assigned_user_id
    WHERE 1=1
  `;
  const params: string[] = [];
  if (status) {
    sql += ' AND t.status = ?';
    params.push(status);
  }
  if (search) {
    sql += ' AND (t.title LIKE ? OR t.description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY t.created_at DESC';
  res.json({ tasks: db.prepare(sql).all(...params) });
});

clientsAndWorkRouter.post('/tasks', requirePermission('tasks:write'), (req: AuthedRequest, res) => {
  const schema = z.object({
    title: z.string().trim().min(2, 'Task title is required.').max(200),
    description: z.string().trim().max(4000).default(''),
    taskType: z.string().trim().max(60).default('operational'),
    clientId: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
    campaignId: z.string().nullable().optional(),
    contentItemId: z.string().nullable().optional(),
    departmentId: z.string().nullable().optional(),
    assignedUserId: z.string().nullable().optional(),
    assignedAgentId: z.string().nullable().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    dueDate: z.string().nullable().optional(),
    requiresApproval: z.boolean().default(true),
    dependsOnTaskId: z.string().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid task.' });
    return;
  }
  const db = getDb();
  const id = generateId('tsk');
  const ts = nowIso();
  const initialStatus = parsed.data.assignedAgentId || parsed.data.assignedUserId ? 'assigned' : 'queued';

  db.prepare(
    `INSERT INTO tasks (
      id, organization_id, title, description, task_type, client_id, project_id, campaign_id,
      content_item_id, department_id, assigned_user_id, assigned_agent_id, priority, due_date,
      requires_approval, status, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    DEFAULT_ORG_ID,
    parsed.data.title,
    parsed.data.description,
    parsed.data.taskType,
    parsed.data.clientId ?? null,
    parsed.data.projectId ?? null,
    parsed.data.campaignId ?? null,
    parsed.data.contentItemId ?? null,
    parsed.data.departmentId ?? null,
    parsed.data.assignedUserId ?? null,
    parsed.data.assignedAgentId ?? null,
    parsed.data.priority,
    parsed.data.dueDate ?? null,
    parsed.data.requiresApproval ? 1 : 0,
    initialStatus,
    req.authUser!.id,
    ts,
    ts
  );

  if (parsed.data.dependsOnTaskId) {
    db.prepare('INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)').run(
      id,
      parsed.data.dependsOnTaskId
    );
  }

  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'task.created',
    entityType: 'task',
    entityId: id,
    metadata: { title: parsed.data.title, assignedAgentId: parsed.data.assignedAgentId },
  });

  res.status(201).json({ task: db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) });
});

clientsAndWorkRouter.patch('/tasks/:id', requirePermission('tasks:write'), (req: AuthedRequest, res) => {
  const schema = z.object({
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    assignedAgentId: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid task update.' });
    return;
  }
  const db = getDb();
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Record<string, SQLInputValue> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }
  db.prepare(
    `UPDATE tasks SET status = ?, priority = ?, assigned_agent_id = ?, due_date = ?, updated_at = ? WHERE id = ?`
  ).run(
    parsed.data.status ?? existing.status,
    parsed.data.priority ?? existing.priority,
    parsed.data.assignedAgentId !== undefined ? parsed.data.assignedAgentId : existing.assigned_agent_id,
    parsed.data.dueDate !== undefined ? parsed.data.dueDate : existing.due_date,
    nowIso(),
    req.params.id
  );
  res.json({ task: db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) });
});

clientsAndWorkRouter.post('/tasks/:id/execute', requirePermission('agents:run'), (req: AuthedRequest, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!task) {
    res.status(404).json({ error: 'Task not found.' });
    return;
  }
  if (!task.assigned_agent_id) {
    res.status(400).json({ error: 'Task has no assigned AI agent. Assign an agent before dispatching.' });
    return;
  }
  // Check unmet dependencies
  const unmet = db
    .prepare(
      `SELECT t.id, t.title, t.status FROM task_dependencies td
       INNER JOIN tasks t ON t.id = td.depends_on_task_id
       WHERE td.task_id = ? AND t.status != 'completed'`
    )
    .all(req.params.id) as Array<{ id: string; title: string; status: string }>;
  if (unmet.length > 0) {
    res.status(409).json({
      error: `Blocked by incomplete dependency: "${unmet[0].title}" (status: ${unmet[0].status}).`,
    });
    return;
  }

  const { jobId } = enqueueBackgroundJob({
    jobType: 'agent_task_execution',
    correlationId: req.correlationId,
    payload: {
      taskId: task.id,
      agentId: task.assigned_agent_id,
      clientId: task.client_id,
      projectId: task.project_id,
      contentItemId: task.content_item_id,
    },
  });

  db.prepare(`UPDATE tasks SET status = 'queued', updated_at = ? WHERE id = ?`).run(nowIso(), String(task.id));
  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'task.dispatched_to_worker',
    entityType: 'task',
    entityId: String(task.id),
    metadata: { jobId, agentId: task.assigned_agent_id },
  });

  res.status(202).json({ jobId, status: 'queued' });
});

clientsAndWorkRouter.get('/tasks/:id/comments', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT cm.*, u.full_name as author_name
       FROM comments cm INNER JOIN users u ON u.id = cm.author_user_id
       WHERE cm.entity_type = 'task' AND cm.entity_id = ?
       ORDER BY cm.created_at ASC`
    )
    .all(req.params.id);
  res.json({ comments: rows });
});

clientsAndWorkRouter.post('/tasks/:id/comments', requirePermission('tasks:write'), (req: AuthedRequest, res) => {
  const schema = z.object({ body: z.string().trim().min(1).max(2000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Comment text is required.' });
    return;
  }
  const db = getDb();
  const id = generateId('cmt');
  db.prepare(
    `INSERT INTO comments (id, entity_type, entity_id, author_user_id, body, created_at)
     VALUES (?, 'task', ?, ?, ?, ?)`
  ).run(id, req.params.id, req.authUser!.id, parsed.data.body, nowIso());
  res.status(201).json({ id });
});

// --- TREND INTELLIGENCE & COMPETITOR RESEARCH ---
clientsAndWorkRouter.get('/trends', requireAuth, (_req, res) => {
  const db = getDb();
  const trends = db
    .prepare(
      `SELECT t.*, c.name as client_name
       FROM trends t LEFT JOIN clients c ON c.id = t.related_client_id
       ORDER BY t.observed_at DESC`
    )
    .all();
  res.json({ trends });
});

clientsAndWorkRouter.post('/trends', requirePermission('content:write'), (req: AuthedRequest, res) => {
  const schema = z.object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(5).max(2000),
    sourceName: z.string().trim().min(2).max(120),
    sourceUrl: z.string().trim().url('A valid real source URL is required (never invent URLs).'),
    platform: z.string().trim().default('multi'),
    geographicRelevance: z.string().trim().default('Global'),
    language: z.string().trim().default('English'),
    industry: z.string().trim().default('General'),
    epistemicStatus: z.enum(['verified', 'source_reported', 'ai_interpretation', 'unverified']).default('source_reported'),
    supportingEvidence: z.string().trim().max(2000).default(''),
    confidenceLevel: z.enum(['low', 'medium', 'high']).default('medium'),
    relevanceScore: z.number().int().min(0).max(100).optional(),
    riskAssessment: z.string().trim().max(1000).default(''),
    contentOpportunities: z.string().trim().max(1000).default(''),
    relatedClientId: z.string().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid trend record.' });
    return;
  }
  const db = getDb();
  const id = generateId('trd');
  const ts = nowIso();
  db.prepare(
    `INSERT INTO trends (
      id, organization_id, title, description, source_name, source_url, observed_at,
      platform, geographic_relevance, language, industry, epistemic_status,
      supporting_evidence, confidence_level, relevance_score, risk_assessment,
      content_opportunities, related_client_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    DEFAULT_ORG_ID,
    parsed.data.title,
    parsed.data.description,
    parsed.data.sourceName,
    parsed.data.sourceUrl,
    ts,
    parsed.data.platform,
    parsed.data.geographicRelevance,
    parsed.data.language,
    parsed.data.industry,
    parsed.data.epistemicStatus,
    parsed.data.supportingEvidence,
    parsed.data.confidenceLevel,
    parsed.data.relevanceScore ?? null,
    parsed.data.riskAssessment,
    parsed.data.contentOpportunities,
    parsed.data.relatedClientId ?? null,
    ts
  );
  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'trend.recorded',
    entityType: 'trend',
    entityId: id,
    metadata: { sourceUrl: parsed.data.sourceUrl, epistemicStatus: parsed.data.epistemicStatus },
  });
  res.status(201).json({ trend: db.prepare('SELECT * FROM trends WHERE id = ?').get(id) });
});

clientsAndWorkRouter.post('/trends/research', requirePermission('agents:run'), (req: AuthedRequest, res) => {
  const schema = z.object({
    topic: z.string().trim().min(3, 'Research topic or industry query is required.').max(300),
    industry: z.string().trim().max(100).default('General'),
    platform: z.string().trim().max(40).default('multi'),
    clientId: z.string().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid research request.' });
    return;
  }
  const { jobId } = enqueueBackgroundJob({
    jobType: 'trend_research',
    correlationId: req.correlationId,
    payload: {
      agentId: 'agent_research_agent',
      title: `Grounded Trend Research: ${parsed.data.topic}`,
      prompt: `Research current verified social media trends and industry developments for: "${parsed.data.topic}" in industry "${parsed.data.industry}" (platform focus: ${parsed.data.platform}). Report only grounded facts from search sources, list source URLs, note observation date, and clearly separate AI interpretation from source-reported facts.`,
      useGoogleSearch: true,
      recordTrends: true,
      industry: parsed.data.industry,
      platform: parsed.data.platform,
      clientId: parsed.data.clientId ?? null,
    },
  });
  res.status(202).json({ jobId, status: 'queued' });
});

clientsAndWorkRouter.get('/competitors', requireAuth, (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT cp.*, c.name as client_name
       FROM competitors cp LEFT JOIN clients c ON c.id = cp.client_id
       ORDER BY cp.observed_at DESC`
    )
    .all();
  res.json({ competitors: rows });
});

clientsAndWorkRouter.post('/competitors', requirePermission('content:write'), (req: AuthedRequest, res) => {
  const schema = z.object({
    clientId: z.string().nullable().optional(),
    name: z.string().trim().min(2).max(140),
    websiteUrl: z.string().trim().url().or(z.literal('')).default(''),
    platforms: z.array(z.string()).default([]),
    positioningSummary: z.string().trim().max(2000).default(''),
    observedStrengths: z.string().trim().max(2000).default(''),
    observedGaps: z.string().trim().max(2000).default(''),
    sourceUrls: z.array(z.string().url()).default([]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid competitor record.' });
    return;
  }
  const db = getDb();
  const id = generateId('cmpk');
  const ts = nowIso();
  db.prepare(
    `INSERT INTO competitors (
      id, organization_id, client_id, name, website_url, platforms_json,
      positioning_summary, observed_strengths, observed_gaps, source_urls_json,
      observed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    DEFAULT_ORG_ID,
    parsed.data.clientId ?? null,
    parsed.data.name,
    parsed.data.websiteUrl,
    JSON.stringify(parsed.data.platforms),
    parsed.data.positioningSummary,
    parsed.data.observedStrengths,
    parsed.data.observedGaps,
    JSON.stringify(parsed.data.sourceUrls),
    ts,
    ts
  );
  res.status(201).json({ competitor: db.prepare('SELECT * FROM competitors WHERE id = ?').get(id) });
});
