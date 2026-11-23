import { Router } from 'express';
import type { SQLInputValue } from 'node:sqlite';
import multer from 'multer';
import { z } from 'zod';
import { getDb, nowIso } from '../db/database';
import { DEFAULT_ORG_ID } from '../db/seed';
import { requireAuth, requirePermission, type AuthedRequest } from '../services/auth';
import { generateId } from '../services/security';
import { createNotification, writeAuditLog } from '../services/audit';
import {
  assertContentTransition,
  CONTENT_STATUSES,
  type ContentStatus,
} from '../../src/domain/workflows';
import {
  computeContentVersionHash,
  evaluateApprovalDecision,
  shouldInvalidateApproval,
} from '../../src/domain/approvals';
import {
  buildSignedAssetUrl,
  MAX_UPLOAD_BYTES,
  resolveSignedAssetFile,
  storeBufferAsAsset,
} from '../services/storage';
import { dispatchRealVideoGeneration, generateRealImage } from '../services/aiProviders';
import { cancelBackgroundJob, enqueueBackgroundJob } from '../services/worker';
import { getMorganProductionReadiness } from '../services/morganProduction';

export const studioAndGovRouter = Router();

const MORGAN_PRODUCTION_STAFF = [
  { name: 'نورا خليل', title: 'تحليل الاتجاهات وتوثيق المصادر' },
  { name: 'ياسر عبدالله', title: 'استراتيجية الجمهور والمنصة' },
  { name: 'مازن حسن', title: 'كتابة النص والسيناريو' },
  { name: 'آدم زيدان', title: 'الاتجاه البصري وقائمة اللقطات' },
  { name: 'فادي منير', title: 'مراجعة اللغة والادعاءات ومخاطر المنصة' },
];

function createMorganRun(input: {
  niche: string; audience: string; platform: string; format: string; userId: string;
  parentRunId?: string | null; iteration?: number; reviewNote?: string;
}): string {
  const db = getDb();
  const id = generateId('mrun');
  const ts = nowIso();
  const taskIds: string[] = [];
  db.prepare(`INSERT INTO morgan_production_runs
    (id, organization_id, niche, audience, platform, format, status, parent_run_id, review_note, iteration, created_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?)`)
    .run(id, DEFAULT_ORG_ID, input.niche, input.audience, input.platform, input.format,
      input.parentRunId ?? null, input.reviewNote ?? '', input.iteration ?? 1, input.userId, ts, ts);
  for (const member of MORGAN_PRODUCTION_STAFF) {
    const employee = db.prepare('SELECT id, department_id FROM employees WHERE full_name = ? AND employment_status = \'active\'')
      .get(member.name) as { id: string; department_id: string | null } | undefined;
    if (!employee) throw new Error(`موظف سير الإنتاج غير موجود: ${member.name}`);
    const taskId = generateId('task');
    db.prepare(`INSERT INTO tasks (id, organization_id, title, description, task_type, department_id, assigned_employee_id, priority, status, inputs_json, created_by_user_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'content_production', ?, ?, 'high', 'queued', ?, ?, ?, ?)`)
      .run(taskId, DEFAULT_ORG_ID, member.title, `إنتاج ${input.format} عن ${input.niche} لمنصة ${input.platform}`,
        employee.department_id, employee.id, JSON.stringify({ productionRunId: id }), input.userId, ts, ts);
    taskIds.push(taskId);
  }
  db.prepare('UPDATE morgan_production_runs SET task_ids_json=? WHERE id=?').run(JSON.stringify(taskIds), id);
  enqueueBackgroundJob({
    jobType: 'morgan_content_pipeline',
    payload: { runId: id },
    idempotencyKey: `morgan-production:${id}`,
  });
  return id;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

// --- CONTENT STUDIO & IMMUTABLE VERSIONING ---
studioAndGovRouter.get('/content', requirePermission('content:read'), (req, res) => {
  const db = getDb();
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : '';
  let sql = `
    SELECT ci.*, c.name as client_name, b.name as brand_name, p.name as project_name,
           cv.version_hash, cv.brief, cv.caption, cv.script, cv.hashtags_json, cv.cta, cv.media_asset_ids_json
    FROM content_items ci
    INNER JOIN clients c ON c.id = ci.client_id
    INNER JOIN client_brands b ON b.id = ci.brand_id
    LEFT JOIN projects p ON p.id = ci.project_id
    LEFT JOIN content_versions cv ON cv.id = ci.current_version_id
    WHERE 1=1
  `;
  const params: string[] = [];
  if (status) {
    sql += ' AND ci.status = ?';
    params.push(status);
  }
  if (clientId) {
    sql += ' AND ci.client_id = ?';
    params.push(clientId);
  }
  sql += ' ORDER BY ci.updated_at DESC';
  res.json({ items: db.prepare(sql).all(...params) });
});

studioAndGovRouter.get('/content/:id', requirePermission('content:read'), (req, res) => {
  const db = getDb();
  const item = db
    .prepare(
      `SELECT ci.*, c.name as client_name, b.name as brand_name, p.name as project_name
       FROM content_items ci
       INNER JOIN clients c ON c.id = ci.client_id
       INNER JOIN client_brands b ON b.id = ci.brand_id
       LEFT JOIN projects p ON p.id = ci.project_id
       WHERE ci.id = ?`
    )
    .get(req.params.id);
  if (!item) {
    res.status(404).json({ error: 'Content item not found.' });
    return;
  }
  const versions = db
    .prepare('SELECT * FROM content_versions WHERE content_item_id = ? ORDER BY version_number DESC')
    .all(req.params.id);
  const approvals = db
    .prepare(
      `SELECT ar.*, ad.decision, ad.comments, ad.decided_at, u.full_name as reviewer_name
       FROM approval_requests ar
       LEFT JOIN approval_decisions ad ON ad.approval_request_id = ar.id
       LEFT JOIN users u ON u.id = ad.reviewer_user_id
       WHERE ar.entity_type = 'content_item' AND ar.entity_id = ?
       ORDER BY ar.created_at DESC`
    )
    .all(req.params.id);
  const publishingJobs = db
    .prepare('SELECT * FROM publishing_jobs WHERE content_item_id = ? ORDER BY created_at DESC')
    .all(req.params.id);

  res.json({ item, versions, approvals, publishingJobs });
});

studioAndGovRouter.post('/content', requirePermission('content:write'), (req: AuthedRequest, res) => {
  const schema = z.object({
    clientId: z.string().min(1, 'Client is required.'),
    brandId: z.string().min(1, 'Brand profile is required.'),
    projectId: z.string().nullable().optional(),
    campaignId: z.string().nullable().optional(),
    platform: z.enum(['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin']),
    contentFormat: z.string().trim().min(2).max(60),
    title: z.string().trim().min(2, 'Content title is required.').max(200),
    brief: z.string().trim().max(4000).default(''),
    caption: z.string().trim().max(6000).default(''),
    script: z.string().trim().max(8000).default(''),
    hashtags: z.array(z.string()).default([]),
    cta: z.string().trim().max(400).default(''),
    mediaAssetIds: z.array(z.string()).default([]),
    scheduledFor: z.string().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid content item.' });
    return;
  }

  const db = getDb();
  const itemId = generateId('cnt');
  const versionId = generateId('cntv');
  const ts = nowIso();
  const versionHash = computeContentVersionHash({
    platform: parsed.data.platform,
    format: parsed.data.contentFormat,
    title: parsed.data.title,
    brief: parsed.data.brief,
    caption: parsed.data.caption,
    script: parsed.data.script,
    hashtags: parsed.data.hashtags,
    cta: parsed.data.cta,
    mediaAssetIds: parsed.data.mediaAssetIds,
  });

  db.prepare(
    `INSERT INTO content_items (
      id, organization_id, client_id, brand_id, project_id, campaign_id, platform,
      content_format, title, status, current_version_id, current_version_number,
      owner_user_id, scheduled_for, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'idea', ?, 1, ?, ?, ?, ?)`
  ).run(
    itemId,
    DEFAULT_ORG_ID,
    parsed.data.clientId,
    parsed.data.brandId,
    parsed.data.projectId ?? null,
    parsed.data.campaignId ?? null,
    parsed.data.platform,
    parsed.data.contentFormat,
    parsed.data.title,
    versionId,
    req.authUser!.id,
    parsed.data.scheduledFor ?? null,
    ts,
    ts
  );

  db.prepare(
    `INSERT INTO content_versions (
      id, content_item_id, version_number, version_hash, title, brief, caption, script,
      hashtags_json, cta, media_asset_ids_json, created_by_actor_type, created_by_actor_id,
      change_note, created_at
    ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 'human', ?, 'Initial version', ?)`
  ).run(
    versionId,
    itemId,
    versionHash,
    parsed.data.title,
    parsed.data.brief,
    parsed.data.caption,
    parsed.data.script,
    JSON.stringify(parsed.data.hashtags),
    parsed.data.cta,
    JSON.stringify(parsed.data.mediaAssetIds),
    req.authUser!.id,
    ts
  );

  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'content.created',
    entityType: 'content_item',
    entityId: itemId,
    metadata: { title: parsed.data.title, platform: parsed.data.platform, versionHash },
  });

  res.status(201).json({ id: itemId, versionId, versionHash });
});

studioAndGovRouter.patch('/content/:id', requirePermission('content:write'), (req: AuthedRequest, res) => {
  const schema = z.object({
    title: z.string().trim().min(2).max(200).optional(),
    brief: z.string().trim().max(4000).optional(),
    caption: z.string().trim().max(6000).optional(),
    script: z.string().trim().max(8000).optional(),
    hashtags: z.array(z.string()).optional(),
    cta: z.string().trim().max(400).optional(),
    mediaAssetIds: z.array(z.string()).optional(),
    scheduledFor: z.string().nullable().optional(),
    status: z.enum(CONTENT_STATUSES).optional(),
    changeNote: z.string().trim().max(300).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid content update.' });
    return;
  }

  const db = getDb();
  const item = db.prepare('SELECT * FROM content_items WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!item) {
    res.status(404).json({ error: 'Content item not found.' });
    return;
  }
  const latestVersion = db
    .prepare('SELECT * FROM content_versions WHERE id = ?')
    .get(String(item.current_version_id)) as Record<string, unknown>;

  const ts = nowIso();
  const nextFields = {
    platform: String(item.platform),
    format: String(item.content_format),
    title: parsed.data.title ?? String(latestVersion.title),
    brief: parsed.data.brief ?? String(latestVersion.brief),
    caption: parsed.data.caption ?? String(latestVersion.caption),
    script: parsed.data.script ?? String(latestVersion.script),
    hashtags: parsed.data.hashtags ?? (JSON.parse(String(latestVersion.hashtags_json || '[]')) as string[]),
    cta: parsed.data.cta ?? String(latestVersion.cta),
    mediaAssetIds:
      parsed.data.mediaAssetIds ?? (JSON.parse(String(latestVersion.media_asset_ids_json || '[]')) as string[]),
  };

  const nextHash = computeContentVersionHash(nextFields);
  const materialChanged = shouldInvalidateApproval(String(latestVersion.version_hash), nextHash);

  let nextVersionId = String(item.current_version_id);
  let nextVersionNum = Number(item.current_version_number);
  let nextStatus = String(item.status) as ContentStatus;
  let approvalInvalidated = false;

  if (materialChanged) {
    nextVersionNum += 1;
    nextVersionId = generateId('cntv');
    db.prepare(
      `INSERT INTO content_versions (
        id, content_item_id, version_number, version_hash, title, brief, caption, script,
        hashtags_json, cta, media_asset_ids_json, created_by_actor_type, created_by_actor_id,
        change_note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'human', ?, ?, ?)`
    ).run(
      nextVersionId,
      String(item.id),
      nextVersionNum,
      nextHash,
      nextFields.title,
      nextFields.brief,
      nextFields.caption,
      nextFields.script,
      JSON.stringify(nextFields.hashtags),
      nextFields.cta,
      JSON.stringify(nextFields.mediaAssetIds),
      req.authUser!.id,
      parsed.data.changeNote || `Updated to version ${nextVersionNum}`,
      ts
    );

    // Material change MUST invalidate prior pending/approved requests for earlier hashes!
    const inv = db
      .prepare(
        `UPDATE approval_requests
         SET status = 'invalidated', updated_at = ?
         WHERE entity_type = 'content_item' AND entity_id = ? AND status IN ('pending','approved')`
      )
      .run(ts, String(item.id));
    if (Number(inv.changes) > 0 || nextStatus === 'approved' || nextStatus === 'scheduled') {
      approvalInvalidated = true;
      if (nextStatus === 'approved' || nextStatus === 'scheduled' || nextStatus === 'human_review') {
        nextStatus = 'draft';
      }
    }
  }

  // Validate explicit workflow status transition
  if (parsed.data.status && parsed.data.status !== nextStatus) {
    const validApproval = db
      .prepare(
        `SELECT ad.id FROM approval_decisions ad
         INNER JOIN approval_requests ar ON ar.id = ad.approval_request_id
         WHERE ar.entity_type = 'content_item' AND ar.entity_id = ?
           AND ar.status = 'approved' AND ad.decision = 'approved' AND ad.version_hash = ?
         LIMIT 1`
      )
      .get(String(item.id), nextHash);

    const check = assertContentTransition(nextStatus, parsed.data.status, {
      hasValidHumanApproval: Boolean(validApproval),
      hasExternalPostEvidence: false,
    });
    if (!check.ok) {
      res.status(409).json({ error: check.reason });
      return;
    }
    nextStatus = parsed.data.status;
  }

  db.prepare(
    `UPDATE content_items
     SET title = ?, status = ?, current_version_id = ?, current_version_number = ?,
         scheduled_for = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    nextFields.title,
    nextStatus,
    nextVersionId,
    nextVersionNum,
    parsed.data.scheduledFor !== undefined ? parsed.data.scheduledFor : (item.scheduled_for as SQLInputValue),
    ts,
    String(item.id)
  );

  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: materialChanged ? 'content.version_created' : 'content.status_updated',
    entityType: 'content_item',
    entityId: String(item.id),
    metadata: { versionNumber: nextVersionNum, versionHash: nextHash, status: nextStatus, approvalInvalidated },
  });

  res.json({
    id: item.id,
    status: nextStatus,
    versionId: nextVersionId,
    versionNumber: nextVersionNum,
    versionHash: nextHash,
    approvalInvalidated,
  });
});

studioAndGovRouter.post('/content/:id/run-agent', requirePermission('agents:run'), (req: AuthedRequest, res) => {
  const schema = z.object({
    agentId: z.string().min(1),
    instructions: z.string().trim().max(2000).default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Agent ID is required.' });
    return;
  }
  const db = getDb();
  const item = db.prepare('SELECT * FROM content_items WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!item) {
    res.status(404).json({ error: 'Content item not found.' });
    return;
  }
  const { jobId } = enqueueBackgroundJob({
    jobType: 'agent_task_execution',
    correlationId: req.correlationId,
    payload: {
      agentId: parsed.data.agentId,
      clientId: item.client_id,
      projectId: item.project_id,
      contentItemId: item.id,
      title: `Content Studio Run: ${String(item.title)}`,
      prompt:
        parsed.data.instructions ||
        `Review or produce platform-specific deliverable for content item "${String(item.title)}" (${String(item.platform)} / ${String(item.content_format)}).`,
    },
  });
  res.status(202).json({ jobId, status: 'queued' });
});

studioAndGovRouter.post('/content/:id/submit-approval', requirePermission('content:write'), (req: AuthedRequest, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM content_items WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!item) {
    res.status(404).json({ error: 'Content item not found.' });
    return;
  }
  const version = db
    .prepare('SELECT * FROM content_versions WHERE id = ?')
    .get(String(item.current_version_id)) as Record<string, unknown>;

  const ts = nowIso();
  const reqId = generateId('apreq');

  // Ensure content moves cleanly into human_review
  const currentStatus = String(item.status) as ContentStatus;
  if (currentStatus !== 'human_review') {
    const check = assertContentTransition(currentStatus, 'human_review');
    if (!check.ok) {
      res.status(409).json({
        error: `Content must pass Quality Assurance before submitting for Human Review. Current status: "${currentStatus}".`,
      });
      return;
    }
    db.prepare(`UPDATE content_items SET status = 'human_review', updated_at = ? WHERE id = ?`).run(ts, String(item.id));
  }

  db.prepare(
    `INSERT INTO approval_requests (
      id, organization_id, gate_type, entity_type, entity_id, content_version_id,
      version_hash, requested_by_actor_type, requested_by_actor_id, summary, status, created_at, updated_at
    ) VALUES (?, ?, 'content_publish', 'content_item', ?, ?, ?, 'human', ?, ?, 'pending', ?, ?)`
  ).run(
    reqId,
    DEFAULT_ORG_ID,
    String(item.id),
    String(version.id),
    String(version.version_hash),
    req.authUser!.id,
    `Publish approval for "${String(item.title)}" (v${String(version.version_number)} · ${String(item.platform)})`,
    ts,
    ts
  );

  createNotification(db, {
    severity: 'warning',
    title: 'Human Approval Requested',
    message: `"${String(item.title)}" v${String(version.version_number)} requires human review before publishing.`,
    entityType: 'approval_request',
    entityId: reqId,
  });

  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'approval.requested',
    entityType: 'approval_request',
    entityId: reqId,
    metadata: { contentItemId: item.id, versionId: version.id, versionHash: version.version_hash },
  });

  res.status(201).json({ approvalRequestId: reqId, versionHash: version.version_hash });
});

// --- APPROVAL CENTER (IMMUTABLE HUMAN DECISIONS) ---
studioAndGovRouter.get('/approvals', requirePermission('approvals:read'), (_req, res) => {
  const db = getDb();
  const requests = db
    .prepare(
      `SELECT ar.*, ci.title as content_title, ci.platform, ci.status as content_status,
              cv.version_number, cv.caption, cv.script, cv.cta, cv.version_hash as current_hash,
              ad.id as decision_id, ad.decision, ad.comments, ad.decided_at, u.full_name as reviewer_name
       FROM approval_requests ar
       LEFT JOIN content_items ci ON ar.entity_type = 'content_item' AND ci.id = ar.entity_id
       LEFT JOIN content_versions cv ON cv.id = ar.content_version_id
       LEFT JOIN approval_decisions ad ON ad.approval_request_id = ar.id
       LEFT JOIN users u ON u.id = ad.reviewer_user_id
       ORDER BY CASE WHEN ar.status = 'pending' THEN 0 ELSE 1 END, ar.created_at DESC`
    )
    .all();
  res.json({ approvals: requests });
});

studioAndGovRouter.post('/approvals/:id/decide', requirePermission('approvals:decide'), (req: AuthedRequest, res) => {
  const schema = z.object({
    decision: z.enum(['approved', 'rejected', 'changes_requested']),
    comments: z.string().trim().max(2000).default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid decision payload.' });
    return;
  }

  const db = getDb();
  const approvalReq = db
    .prepare('SELECT * FROM approval_requests WHERE id = ?')
    .get(req.params.id) as Record<string, unknown> | undefined;
  if (!approvalReq) {
    res.status(404).json({ error: 'Approval request not found.' });
    return;
  }

  let currentVersionHash = String(approvalReq.version_hash);
  if (approvalReq.entity_type === 'content_item') {
    const ci = db
      .prepare(
        `SELECT cv.version_hash FROM content_items ci
         INNER JOIN content_versions cv ON cv.id = ci.current_version_id
         WHERE ci.id = ?`
      )
      .get(String(approvalReq.entity_id)) as { version_hash: string } | undefined;
    if (ci) currentVersionHash = ci.version_hash;
  }

  const gateCheck = evaluateApprovalDecision({
    reviewerActorType: 'human',
    reviewerHasApprovalPermission: true,
    requestStatus: String(approvalReq.status) as 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'invalidated',
    expectedVersionHash: String(approvalReq.version_hash),
    currentVersionHash,
    decision: parsed.data.decision,
    comments: parsed.data.comments,
  });

  if (!gateCheck.allowed) {
    res.status(409).json({ error: gateCheck.reason });
    return;
  }

  const ts = nowIso();
  const decisionId = generateId('apdec');

  db.prepare(
    `INSERT INTO approval_decisions (
      id, approval_request_id, content_item_id, content_version_id, version_hash,
      reviewer_user_id, decision, comments, decided_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    decisionId,
    String(approvalReq.id),
    approvalReq.entity_type === 'content_item' ? String(approvalReq.entity_id) : null,
    approvalReq.content_version_id ? String(approvalReq.content_version_id) : null,
    String(approvalReq.version_hash),
    req.authUser!.id,
    parsed.data.decision,
    parsed.data.comments,
    ts
  );

  db.prepare('UPDATE approval_requests SET status = ?, updated_at = ? WHERE id = ?').run(
    parsed.data.decision,
    ts,
    String(approvalReq.id)
  );

  if (approvalReq.entity_type === 'content_item') {
    const nextContentStatus = parsed.data.decision === 'approved' ? 'approved' : 'changes_requested';
    db.prepare('UPDATE content_items SET status = ?, updated_at = ? WHERE id = ?').run(
      nextContentStatus,
      ts,
      String(approvalReq.entity_id)
    );
  }

  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: `approval.${parsed.data.decision}`,
    entityType: 'approval_decision',
    entityId: decisionId,
    metadata: {
      approvalRequestId: approvalReq.id,
      versionHash: approvalReq.version_hash,
      comments: parsed.data.comments,
    },
  });

  res.status(201).json({ decisionId, status: parsed.data.decision, versionHash: approvalReq.version_hash });
});

// --- PRIVATE MORGAN GROUP AUTOMATED CONTENT PRODUCTION ---
studioAndGovRouter.get('/morgan-production/readiness', requirePermission('content:read'), async (_req, res) => {
  res.json(await getMorganProductionReadiness());
});

studioAndGovRouter.get('/morgan-production', requirePermission('content:read'), (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM morgan_production_runs ORDER BY created_at DESC LIMIT 40').all() as Array<Record<string, unknown>>;
  res.json({ runs: rows.map((row) => ({
    ...row,
    sources: JSON.parse(String(row.source_items_json || '[]')),
    deliverable: JSON.parse(String(row.deliverable_json || '{}')),
    taskIds: JSON.parse(String(row.task_ids_json || '[]')),
  })) });
});

studioAndGovRouter.post('/morgan-production', requirePermission('content:write'), (req: AuthedRequest, res) => {
  const schema = z.object({
    niche: z.string().trim().min(3, 'اكتب المجال الذي تريد صناعة المحتوى عنه.').max(180),
    audience: z.string().trim().max(300).default(''),
    platform: z.enum(['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin']),
    format: z.enum(['reel', 'short_video', 'carousel', 'post', 'thread']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'بيانات التشغيل غير مكتملة.' });
  try {
    const runId = createMorganRun({ ...parsed.data, userId: req.authUser!.id });
    writeAuditLog({
      db: getDb(), correlationId: req.correlationId, actorType: 'human', actorId: req.authUser!.id,
      actorLabel: req.authUser!.email, action: 'morgan.production.started', entityType: 'morgan_production_run',
      entityId: runId, metadata: { niche: parsed.data.niche, platform: parsed.data.platform, format: parsed.data.format },
    });
    res.status(202).json({ runId, status: 'queued', assignedEmployeeCount: MORGAN_PRODUCTION_STAFF.length });
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : 'تعذر بدء الإنتاج.' });
  }
});

studioAndGovRouter.get('/morgan-production/:id', requirePermission('content:read'), (req, res) => {
  const db = getDb();
  const run = db.prepare('SELECT * FROM morgan_production_runs WHERE id=?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!run) return res.status(404).json({ error: 'طلب الإنتاج غير موجود.' });
  const taskIds = JSON.parse(String(run.task_ids_json || '[]')) as string[];
  const tasks = taskIds.length ? db.prepare(`SELECT t.id,t.title,t.status,t.updated_at,e.full_name employee_name
      FROM tasks t LEFT JOIN employees e ON e.id=t.assigned_employee_id WHERE t.id IN (${taskIds.map(() => '?').join(',')}) ORDER BY t.created_at`)
    .all(...taskIds) : [];
  const decisions = db.prepare(`SELECT d.decision,d.version_hash,d.comments,d.decided_by_user_id,d.decided_at,u.full_name reviewer_name
      FROM morgan_production_decisions d LEFT JOIN users u ON u.id=d.decided_by_user_id WHERE d.run_id=? ORDER BY d.decided_at DESC`).all(req.params.id);
  res.json({ run: {
    ...run,
    sources: JSON.parse(String(run.source_items_json || '[]')),
    deliverable: JSON.parse(String(run.deliverable_json || '{}')),
    tasks,
    decisions,
  } });
});

studioAndGovRouter.post('/morgan-production/:id/decision', requirePermission('approvals:decide'), (req: AuthedRequest, res) => {
  const schema = z.object({ decision: z.enum(['accepted', 'changes_requested']), comments: z.string().trim().max(2000).default('') });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'اختر القبول أو طلب إعادة الإنتاج.' });
  if (parsed.data.decision === 'changes_requested' && parsed.data.comments.length < 2) {
    return res.status(400).json({ error: 'اكتب ملاحظاتك المطلوبة لإعادة الإنتاج.' });
  }
  const db = getDb();
  const run = db.prepare('SELECT * FROM morgan_production_runs WHERE id=?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!run) return res.status(404).json({ error: 'طلب الإنتاج غير موجود.' });
  let priorDeliverable: Record<string, any> = {};
  try { priorDeliverable = JSON.parse(String(run.deliverable_json || '{}')); } catch { /* malformed runs cannot enter review */ }
  const internalQaRejected = run.status === 'failed' && Boolean(priorDeliverable.content?.title) && priorDeliverable.qualityReview?.readyForOwner === false;
  if (run.status !== 'owner_review' && !internalQaRejected) return res.status(409).json({ error: 'لا يمكن اتخاذ قرار قبل اكتمال الإنتاج والمراجعة الداخلية.' });
  if (internalQaRejected && parsed.data.decision !== 'changes_requested') return res.status(409).json({ error: 'أوقفت الجودة الداخلية هذه النسخة؛ يمكنك طلب إعادة إنتاجها فقط.' });
  const ts = nowIso();
  if (parsed.data.decision === 'accepted') {
    db.prepare("UPDATE morgan_production_runs SET status='accepted', review_note=?, updated_at=? WHERE id=?")
      .run(parsed.data.comments, ts, String(run.id));
  } else {
    db.prepare("UPDATE morgan_production_runs SET status='changes_requested', review_note=?, updated_at=? WHERE id=?")
      .run(parsed.data.comments, ts, String(run.id));
  }
  db.prepare(`INSERT INTO morgan_production_decisions (id,run_id,version_hash,decision,comments,decided_by_user_id,decided_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(generateId('mpd'), String(run.id), String(run.version_hash), parsed.data.decision, parsed.data.comments, req.authUser!.id, ts);
  writeAuditLog({ db, correlationId: req.correlationId, actorType: 'human', actorId: req.authUser!.id,
    actorLabel: req.authUser!.email, action: `morgan.production.${parsed.data.decision}`, entityType: 'morgan_production_run',
    entityId: String(run.id), metadata: { iteration: run.iteration, comments: parsed.data.comments, deliverable: run.deliverable_json },
  });
  let nextRunId: string | undefined;
  if (parsed.data.decision === 'changes_requested') {
    nextRunId = createMorganRun({
      niche: String(run.niche), audience: String(run.audience), platform: String(run.platform), format: String(run.format),
      userId: req.authUser!.id, parentRunId: String(run.id), iteration: Number(run.iteration) + 1, reviewNote: parsed.data.comments,
    });
  }
  res.json({ decision: parsed.data.decision, nextRunId });
});

// --- ASSET LIBRARY & SIGNED FILE STORAGE ---
studioAndGovRouter.get('/assets', requirePermission('assets:read'), (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT a.*, c.name as client_name, b.name as brand_name
       FROM assets a
       LEFT JOIN clients c ON c.id = a.client_id
       LEFT JOIN client_brands b ON b.id = a.brand_id
       ORDER BY a.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  res.json({
    assets: rows.map((r) => ({
      ...r,
      signedUrl: buildSignedAssetUrl(String(r.id)),
    })),
  });
});

studioAndGovRouter.post(
  '/assets/upload',
  requirePermission('assets:write'),
  upload.single('file'),
  (req: AuthedRequest, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file attached in multipart request.' });
      return;
    }
    try {
      const db = getDb();
      const stored = storeBufferAsAsset(db, {
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        title: String(req.body.title || req.file.originalname),
        clientId: req.body.clientId || null,
        brandId: req.body.brandId || null,
        projectId: req.body.projectId || null,
        sourceType: 'upload',
        uploadedByUserId: req.authUser!.id,
      });
      writeAuditLog({
        db,
        correlationId: req.correlationId,
        actorType: 'human',
        actorId: req.authUser!.id,
        actorLabel: req.authUser!.email,
        action: 'asset.uploaded',
        entityType: 'asset',
        entityId: stored.id,
        metadata: { byteSize: stored.byteSize, sha256: stored.sha256Checksum, mimeType: req.file.mimetype },
      });
      res.status(201).json(stored);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'File upload rejected.' });
    }
  }
);

studioAndGovRouter.post('/assets/generate-image', requirePermission('assets:write'), async (req: AuthedRequest, res) => {
  const schema = z.object({
    prompt: z.string().trim().min(5, 'Image generation prompt is required.').max(2000),
    title: z.string().trim().min(2).max(160),
    aspectRatio: z.enum(['1:1', '3:4', '4:3', '9:16', '16:9']).default('1:1'),
    model: z.string().default('gemini-3.1-flash-lite-image'),
    clientId: z.string().nullable().optional(),
    brandId: z.string().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid image generation request.' });
    return;
  }

  try {
    const generated = await generateRealImage({
      provider: 'gemini_image',
      model: parsed.data.model,
      prompt: parsed.data.prompt,
      aspectRatio: parsed.data.aspectRatio,
    });
    const db = getDb();
    const ext = generated.mimeType.includes('jpeg') ? '.jpg' : '.png';
    const stored = storeBufferAsAsset(db, {
      buffer: generated.imageBuffer,
      originalName: `generated${ext}`,
      mimeType: generated.mimeType,
      title: parsed.data.title,
      clientId: parsed.data.clientId ?? null,
      brandId: parsed.data.brandId ?? null,
      sourceType: 'ai_generated',
      providerMetadata: {
        provider: generated.provider,
        model: generated.model,
        aspectRatio: parsed.data.aspectRatio,
        latencyMs: generated.latencyMs,
        costUsd: generated.costUsd,
      },
      uploadedByUserId: req.authUser!.id,
    });

    db.prepare(
      `INSERT INTO usage_records (
        id, organization_id, client_id, provider, model, modality, cost_usd, rate_card_found, recorded_at
      ) VALUES (?, ?, ?, ?, ?, 'image', ?, 1, ?)`
    ).run(generateId('usg'), DEFAULT_ORG_ID, parsed.data.clientId ?? null, generated.provider, generated.model, generated.costUsd, nowIso());

    res.status(201).json({ ...stored, model: generated.model, costUsd: generated.costUsd });
  } catch (err) {
    res.status(503).json({
      error: err instanceof Error ? err.message : 'Image generation failed.',
    });
  }
});

studioAndGovRouter.post('/assets/generate-video', requirePermission('assets:write'), async (req: AuthedRequest, res) => {
  const schema = z.object({
    prompt: z.string().trim().min(5).max(2000),
    provider: z.string().default('video_generation'),
    aspectRatio: z.string().default('9:16'),
    durationSeconds: z.number().min(2).max(60).default(8),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid video generation request.' });
    return;
  }
  try {
    await dispatchRealVideoGeneration(parsed.data);
  } catch (err) {
    res.status(503).json({
      error: err instanceof Error ? err.message : 'Video provider unavailable.',
    });
  }
});

// Signed media download endpoint (validates HMAC signature & expiry)
studioAndGovRouter.get('/storage/files/:assetId', (req, res) => {
  const exp = Number(req.query.exp);
  const sig = String(req.query.sig || '');
  const resolved = resolveSignedAssetFile(getDb(), req.params.assetId, exp, sig);
  if (!resolved) {
    res.status(403).json({ error: 'Signed asset URL is invalid or expired.' });
    return;
  }
  res.setHeader('Content-Type', resolved.mimeType);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.sendFile(resolved.filePath);
});

// --- AI AGENT WORKFORCE & EXECUTIONS ---
studioAndGovRouter.get('/agents', requirePermission('agents:read'), (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT a.*, d.name as department_name,
              (SELECT COUNT(*) FROM task_runs r WHERE r.agent_id = a.id) as total_runs,
              (SELECT COUNT(*) FROM task_runs r WHERE r.agent_id = a.id AND r.status = 'completed') as completed_runs,
              (SELECT COUNT(*) FROM task_runs r WHERE r.agent_id = a.id AND r.status = 'failed') as failed_runs,
              (SELECT COALESCE(SUM(r.cost_usd), 0) FROM task_runs r WHERE r.agent_id = a.id) as total_cost_usd
       FROM agents a
       LEFT JOIN departments d ON d.id = a.department_id
       ORDER BY a.name ASC`
    )
    .all();
  res.json({ agents: rows });
});

studioAndGovRouter.get('/agents/:id', requirePermission('agents:read'), (req, res) => {
  const db = getDb();
  const agent = db
    .prepare(
      `SELECT a.*, d.name as department_name
       FROM agents a LEFT JOIN departments d ON d.id = a.department_id
       WHERE a.id = ?`
    )
    .get(req.params.id);
  if (!agent) {
    res.status(404).json({ error: 'Agent not found.' });
    return;
  }
  const versions = db
    .prepare('SELECT * FROM agent_versions WHERE agent_id = ? ORDER BY version_number DESC')
    .all(req.params.id);
  const runs = db
    .prepare('SELECT * FROM task_runs WHERE agent_id = ? ORDER BY started_at DESC LIMIT 30')
    .all(req.params.id);
  res.json({ agent, versions, runs });
});

studioAndGovRouter.patch('/agents/:id', requirePermission('agents:configure'), (req: AuthedRequest, res) => {
  const schema = z.object({
    status: z.enum(['active', 'paused']).optional(),
    systemInstructions: z.string().trim().min(10).max(8000).optional(),
    modelProvider: z.string().trim().min(2).max(60).optional(),
    modelIdentifier: z.string().trim().min(2).max(100).optional(),
    monthlyBudgetUsd: z.number().min(0).max(100_000).optional(),
    maxTokens: z.number().int().min(256).max(65536).optional(),
    timeoutSeconds: z.number().int().min(10).max(600).optional(),
    maxRetries: z.number().int().min(0).max(10).optional(),
    changeNote: z.string().trim().max(300).default('Configuration updated'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid agent configuration.' });
    return;
  }
  const db = getDb();
  const existing = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as Record<string, SQLInputValue> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Agent not found.' });
    return;
  }

  const ts = nowIso();
  const promptChanged =
    (parsed.data.systemInstructions && parsed.data.systemInstructions !== existing.system_instructions) ||
    (parsed.data.modelProvider && parsed.data.modelProvider !== existing.model_provider) ||
    (parsed.data.modelIdentifier && parsed.data.modelIdentifier !== existing.model_identifier);
  const nextVersion = promptChanged ? Number(existing.prompt_version) + 1 : Number(existing.prompt_version);

  db.prepare(
    `UPDATE agents
     SET status = ?, system_instructions = ?, prompt_version = ?, model_provider = ?,
         model_identifier = ?, monthly_budget_usd = ?, max_tokens = ?, timeout_seconds = ?,
         max_retries = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    parsed.data.status ?? existing.status,
    parsed.data.systemInstructions ?? existing.system_instructions,
    nextVersion,
    parsed.data.modelProvider ?? existing.model_provider,
    parsed.data.modelIdentifier ?? existing.model_identifier,
    parsed.data.monthlyBudgetUsd ?? existing.monthly_budget_usd,
    parsed.data.maxTokens ?? existing.max_tokens,
    parsed.data.timeoutSeconds ?? existing.timeout_seconds,
    parsed.data.maxRetries ?? existing.max_retries,
    ts,
    req.params.id
  );

  if (promptChanged) {
    db.prepare(
      `INSERT INTO agent_versions (
        id, agent_id, version_number, system_instructions, model_provider, model_identifier,
        allowed_tools_json, changed_by_user_id, change_note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      generateId('agv'),
      req.params.id,
      nextVersion,
      parsed.data.systemInstructions ?? existing.system_instructions,
      parsed.data.modelProvider ?? existing.model_provider,
      parsed.data.modelIdentifier ?? existing.model_identifier,
      existing.allowed_tools_json,
      req.authUser!.id,
      parsed.data.changeNote,
      ts
    );
  }

  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'agent.configured',
    entityType: 'agent',
    entityId: req.params.id,
    metadata: { promptVersion: nextVersion, status: parsed.data.status ?? existing.status },
  });

  res.json({ agent: db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) });
});

studioAndGovRouter.post('/agents/:id/run', requirePermission('agents:run'), (req: AuthedRequest, res) => {
  const schema = z.object({
    prompt: z.string().trim().min(5, 'Provide clear operational instructions for the agent.').max(4000),
    clientId: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid run payload.' });
    return;
  }
  const db = getDb();
  const agent = db.prepare('SELECT id, name, status FROM agents WHERE id = ?').get(req.params.id) as
    | { id: string; name: string; status: string }
    | undefined;
  if (!agent) {
    res.status(404).json({ error: 'Agent not found.' });
    return;
  }
  if (agent.status !== 'active') {
    res.status(409).json({ error: `Agent "${agent.name}" is paused. Activate it before running.` });
    return;
  }

  const { jobId } = enqueueBackgroundJob({
    jobType: 'agent_task_execution',
    correlationId: req.correlationId,
    payload: {
      agentId: agent.id,
      title: `Direct Dispatch: ${agent.name}`,
      prompt: parsed.data.prompt,
      clientId: parsed.data.clientId ?? null,
      projectId: parsed.data.projectId ?? null,
    },
  });

  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'agent.dispatched',
    entityType: 'agent',
    entityId: agent.id,
    metadata: { jobId },
  });

  res.status(202).json({ jobId, status: 'queued' });
});

studioAndGovRouter.get('/executions', requirePermission('agents:read'), (_req, res) => {
  const db = getDb();
  const runs = db
    .prepare(
      `SELECT r.*, a.name as agent_name, t.title as task_title
       FROM task_runs r
       INNER JOIN agents a ON a.id = r.agent_id
       LEFT JOIN tasks t ON t.id = r.task_id
       ORDER BY r.started_at DESC LIMIT 100`
    )
    .all();
  const jobs = db.prepare('SELECT * FROM background_jobs ORDER BY created_at DESC LIMIT 100').all();
  res.json({ runs, jobs });
});

studioAndGovRouter.post('/jobs/:id/cancel', requirePermission('agents:run'), (req: AuthedRequest, res) => {
  const cancelled = cancelBackgroundJob(req.params.id);
  if (!cancelled) {
    res.status(409).json({ error: 'Job cannot be cancelled (already running or terminal).' });
    return;
  }
  res.json({ ok: true });
});
