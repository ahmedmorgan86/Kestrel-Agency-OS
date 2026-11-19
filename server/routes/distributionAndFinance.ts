import { Router } from 'express';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { getDb, nowIso } from '../db/database';
import { computeHonestIntegrationStatus, DEFAULT_ORG_ID } from '../db/seed';
import { requireAuth, requirePermission, type AuthedRequest } from '../services/auth';
import { generateId } from '../services/security';
import { writeAuditLog } from '../services/audit';
import { verifyGeminiConnection } from '../services/aiProviders';
import {
  isSupabaseConfigured,
  syncWorkspaceToSupabase,
  verifySupabaseConnection,
} from '../services/supabase';
import {
  buildSocialOAuthUrl,
  getOAuthCallbackUrl,
  SOCIAL_OAUTH_CONFIGS,
  type SocialPlatform,
} from '../services/socialAdapters';
import { buildPublishingIdempotencyKey } from '../../src/domain/idempotency';
import { calculateFinancialSummary } from '../../src/domain/finance';
import { enqueueBackgroundJob } from '../services/worker';

export const distributionAndFinanceRouter = Router();

// --- INTEGRATIONS & HONEST STATUS ---
distributionAndFinanceRouter.get('/integrations', requirePermission('integrations:read'), (_req, res) => {
  const db = getDb();
  const integrations = db
    .prepare('SELECT * FROM integrations ORDER BY category ASC, display_name ASC')
    .all() as Array<Record<string, unknown>>;

  const enriched = integrations.map((integ) => {
    const code = String(integ.provider_code);
    const isSocial = code in SOCIAL_OAUTH_CONFIGS;
    const requiredVars = JSON.parse(String(integ.required_env_vars_json || '[]')) as string[];
    const liveEnv = computeHonestIntegrationStatus(requiredVars);
    let liveStatus = String(integ.status);
    let liveError = integ.last_error as string | null;

    if (liveEnv.missingVars.length > 0) {
      liveStatus = liveEnv.status;
      liveError = `Missing environment credential(s): ${liveEnv.missingVars.join(', ')}`;
    } else if (liveStatus === 'not_configured' || liveStatus === 'configuration_incomplete') {
      liveStatus = 'disconnected';
      liveError = null;
    }

    return {
      ...integ,
      status: liveStatus,
      last_error: liveError,
      callbackUrl: isSocial ? getOAuthCallbackUrl(code as SocialPlatform) : null,
    };
  });

  const socialAccounts = db
    .prepare(
      `SELECT sa.*, c.name as client_name, b.name as brand_name
       FROM client_social_accounts sa
       INNER JOIN clients c ON c.id = sa.client_id
       LEFT JOIN client_brands b ON b.id = sa.brand_id
       ORDER BY sa.created_at DESC`
    )
    .all();

  res.json({ integrations: enriched, socialAccounts });
});

distributionAndFinanceRouter.post(
  '/integrations/:code/verify',
  requirePermission('integrations:manage'),
  async (req: AuthedRequest, res) => {
    const db = getDb();
    const integ = db
      .prepare('SELECT * FROM integrations WHERE provider_code = ?')
      .get(req.params.code) as Record<string, unknown> | undefined;
    if (!integ) {
      res.status(404).json({ error: 'Integration not found.' });
      return;
    }
    const ts = nowIso();

    if (req.params.code === 'google_gemini' || req.params.code === 'gemini_image') {
      const check = await verifyGeminiConnection();
      const nextStatus = check.ok
        ? 'connected'
        : check.error?.includes('not configured')
        ? 'not_configured'
        : 'error';
      db.prepare(
        `UPDATE integrations SET status = ?, last_verified_at = ?, last_error = ?, updated_at = ? WHERE provider_code = ?`
      ).run(nextStatus, check.ok ? ts : null, check.error ?? null, ts, req.params.code);

      writeAuditLog({
        db,
        correlationId: req.correlationId,
        actorType: 'human',
        actorId: req.authUser!.id,
        actorLabel: req.authUser!.email,
        action: 'integration.verified',
        entityType: 'integration',
        entityId: String(integ.id),
        metadata: { provider: req.params.code, ok: check.ok, latencyMs: check.latencyMs },
      });

      res.json({ status: nextStatus, latencyMs: check.latencyMs, error: check.error ?? null });
      return;
    }

    if (req.params.code === 'supabase') {
      const check = await verifySupabaseConnection();
      const nextStatus = check.ok
        ? 'connected'
        : !check.configured
        ? 'not_configured'
        : !check.schemaReady
        ? 'configuration_incomplete'
        : 'error';

      db.prepare(
        `UPDATE integrations SET status = ?, last_verified_at = ?, last_error = ?, updated_at = ? WHERE provider_code = ?`
      ).run(nextStatus, check.ok ? ts : null, check.error ?? null, ts, 'supabase');

      writeAuditLog({
        db,
        correlationId: req.correlationId,
        actorType: 'human',
        actorId: req.authUser!.id,
        actorLabel: req.authUser!.email,
        action: 'integration.verified',
        entityType: 'integration',
        entityId: String(integ.id),
        metadata: {
          provider: 'supabase',
          ok: check.ok,
          schemaReady: check.schemaReady,
          storageReady: check.storageReady,
          latencyMs: check.latencyMs,
        },
      });

      res.json({
        status: nextStatus,
        schemaReady: check.schemaReady,
        storageReady: check.storageReady,
        bucketName: check.bucketName,
        latencyMs: check.latencyMs,
        message: check.message ?? null,
        error: check.error ?? null,
      });
      return;
    }

    const requiredVars = JSON.parse(String(integ.required_env_vars_json || '[]')) as string[];
    const envCheck = computeHonestIntegrationStatus(requiredVars);
    const errMsg =
      envCheck.missingVars.length > 0
        ? `Missing environment credentials: ${envCheck.missingVars.join(', ')}`
        : 'Credentials present in environment; authorize a client social account via official OAuth to validate live token scopes.';

    db.prepare(
      `UPDATE integrations SET status = ?, last_error = ?, updated_at = ? WHERE provider_code = ?`
    ).run(envCheck.status, errMsg, ts, req.params.code);

    res.json({ status: envCheck.status, missingVars: envCheck.missingVars, message: errMsg });
  }
);

distributionAndFinanceRouter.post(
  '/integrations/supabase/sync',
  requirePermission('integrations:manage'),
  async (req: AuthedRequest, res) => {
    if (!isSupabaseConfigured()) {
      res.status(400).json({
        error:
          'Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Settings > Secrets, then verify connection.',
      });
      return;
    }
    const db = getDb();
    try {
      const result = await syncWorkspaceToSupabase(db);
      const ts = nowIso();
      db.prepare(
        `UPDATE integrations SET status = ?, last_verified_at = ?, last_error = ?, updated_at = ? WHERE provider_code = 'supabase'`
      ).run(
        result.ok ? 'connected' : 'error',
        result.ok ? ts : null,
        result.errors.length > 0 ? result.errors.map((e) => `${e.table}: ${e.error}`).join('; ') : null,
        ts
      );

      writeAuditLog({
        db,
        correlationId: req.correlationId,
        actorType: 'human',
        actorId: req.authUser!.id,
        actorLabel: req.authUser!.email,
        action: 'integration.supabase_synced',
        entityType: 'integration',
        entityId: 'supabase',
        metadata: { ok: result.ok, syncedTables: result.syncedTables, errorCount: result.errors.length },
      });

      if (!result.ok) {
        res.status(502).json({
          error: `Supabase sync completed with errors: ${result.errors.map((e) => `${e.table} (${e.error})`).join('; ')}`,
          ...result,
        });
        return;
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Supabase synchronization failed.',
      });
    }
  }
);

// --- CLIENT SOCIAL ACCOUNTS & OFFICIAL OAUTH FLOW ---
distributionAndFinanceRouter.post('/social-accounts', requirePermission('integrations:manage'), (req: AuthedRequest, res) => {
  const schema = z.object({
    clientId: z.string().min(1, 'Client is required.'),
    brandId: z.string().nullable().optional(),
    platform: z.enum(['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin']),
    accountHandle: z.string().trim().min(2, 'Account handle is required.').max(120),
    externalAccountId: z.string().trim().max(120).default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid social account.' });
    return;
  }
  const db = getDb();
  const id = generateId('soc');
  const ts = nowIso();
  // Honest rule: newly registered account is NOT connected until OAuth succeeds!
  db.prepare(
    `INSERT INTO client_social_accounts (
      id, client_id, brand_id, platform, account_handle, external_account_id,
      connection_status, last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'not_configured', 'Awaiting official OAuth authorization.', ?, ?)`
  ).run(
    id,
    parsed.data.clientId,
    parsed.data.brandId ?? null,
    parsed.data.platform,
    parsed.data.accountHandle,
    parsed.data.externalAccountId,
    ts,
    ts
  );
  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'social_account.registered',
    entityType: 'client_social_account',
    entityId: id,
    metadata: { platform: parsed.data.platform, handle: parsed.data.accountHandle },
  });
  res.status(201).json({ account: db.prepare('SELECT * FROM client_social_accounts WHERE id = ?').get(id) });
});

distributionAndFinanceRouter.get('/oauth/:platform/url', requirePermission('integrations:manage'), (req: AuthedRequest, res) => {
  const platform = req.params.platform as SocialPlatform;
  if (!(platform in SOCIAL_OAUTH_CONFIGS)) {
    res.status(400).json({ error: `Unsupported OAuth platform: ${platform}` });
    return;
  }
  const state = generateId('ostate');
  const built = buildSocialOAuthUrl(platform, state);
  if (!built.ok) {
    res.status(400).json({ error: built.error, callbackUrl: built.callbackUrl });
    return;
  }
  res.json({ url: built.url, callbackUrl: built.callbackUrl });
});

// Popup-safe OAuth callback handler (handles both trailing-slash and non-trailing-slash)
distributionAndFinanceRouter.get(
  ['/oauth/:platform/callback', '/oauth/:platform/callback/'],
  (req, res) => {
    const platform = String(req.params.platform || '');
    const error = req.query.error ? String(req.query.error) : null;
    const code = req.query.code ? String(req.query.code) : null;
    const ok = Boolean(code && !error);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html>
  <body style="font-family:system-ui,sans-serif;padding:24px;color:#0f172a;">
    <script>
      if (window.opener) {
        window.opener.postMessage({
          type: ${JSON.stringify(ok ? 'OAUTH_AUTH_SUCCESS' : 'OAUTH_AUTH_ERROR')},
          platform: ${JSON.stringify(platform)},
          error: ${JSON.stringify(error)}
        }, '*');
        window.close();
      }
    </script>
    <p>${ok ? 'Authorization callback received. You may close this window.' : 'Authorization was cancelled or failed: ' + (error || 'missing authorization code')}.</p>
  </body>
</html>`);
  }
);

// --- PUBLISHING ENGINE ---
distributionAndFinanceRouter.get('/publishing-jobs', requirePermission('publishing:read'), (_req, res) => {
  const db = getDb();
  const jobs = db
    .prepare(
      `SELECT pj.*, ci.title as content_title, cv.version_number, sa.account_handle, c.name as client_name
       FROM publishing_jobs pj
       INNER JOIN content_items ci ON ci.id = pj.content_item_id
       INNER JOIN content_versions cv ON cv.id = pj.content_version_id
       INNER JOIN client_social_accounts sa ON sa.id = pj.social_account_id
       INNER JOIN clients c ON c.id = ci.client_id
       ORDER BY pj.created_at DESC`
    )
    .all();
  const attempts = db
    .prepare('SELECT * FROM publishing_attempts ORDER BY started_at DESC LIMIT 100')
    .all();
  res.json({ jobs, attempts });
});

distributionAndFinanceRouter.post('/publishing-jobs', requirePermission('publishing:execute'), (req: AuthedRequest, res) => {
  const schema = z.object({
    contentItemId: z.string().min(1, 'Approved content item is required.'),
    socialAccountId: z.string().min(1, 'Destination social account is required.'),
    scheduledFor: z.string().min(1, 'Scheduled date/time is required.'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid publishing job.' });
    return;
  }

  const db = getDb();
  const item = db
    .prepare('SELECT * FROM content_items WHERE id = ?')
    .get(parsed.data.contentItemId) as Record<string, SQLInputValue> | undefined;
  if (!item) {
    res.status(404).json({ error: 'Content item not found.' });
    return;
  }

  const version = db
    .prepare('SELECT * FROM content_versions WHERE id = ?')
    .get(String(item.current_version_id)) as Record<string, SQLInputValue>;

  // Hard Governance Gate: MUST have a valid human approval matching exact current version_hash!
  const approvalDecision = db
    .prepare(
      `SELECT ad.* FROM approval_decisions ad
       INNER JOIN approval_requests ar ON ar.id = ad.approval_request_id
       WHERE ar.entity_type = 'content_item' AND ar.entity_id = ?
         AND ar.status = 'approved' AND ad.decision = 'approved' AND ad.version_hash = ?
       ORDER BY ad.decided_at DESC LIMIT 1`
    )
    .get(item.id, version.version_hash) as { id: string; version_hash: string } | undefined;

  if (!approvalDecision) {
    res.status(409).json({
      error: 'Cannot schedule publishing: no valid human approval exists for the current content version hash.',
    });
    return;
  }

  const account = db
    .prepare('SELECT * FROM client_social_accounts WHERE id = ?')
    .get(parsed.data.socialAccountId) as Record<string, SQLInputValue> | undefined;
  if (!account) {
    res.status(404).json({ error: 'Social account not found.' });
    return;
  }

  const idempotencyKey = buildPublishingIdempotencyKey(String(version.id), String(account.id));
  const existing = db
    .prepare('SELECT * FROM publishing_jobs WHERE idempotency_key = ?')
    .get(idempotencyKey);
  if (existing) {
    res.status(200).json({ job: existing, deduplicated: true });
    return;
  }

  const id = generateId('pjob');
  const ts = nowIso();
  db.prepare(
    `INSERT INTO publishing_jobs (
      id, organization_id, content_item_id, content_version_id, version_hash,
      social_account_id, platform, approval_decision_id, idempotency_key,
      scheduled_for, state, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)`
  ).run(
    id,
    DEFAULT_ORG_ID,
    item.id,
    version.id,
    version.version_hash,
    account.id,
    account.platform,
    approvalDecision.id,
    idempotencyKey,
    parsed.data.scheduledFor,
    req.authUser!.id,
    ts,
    ts
  );

  db.prepare(`UPDATE content_items SET status = 'scheduled', scheduled_for = ?, updated_at = ? WHERE id = ?`).run(
    parsed.data.scheduledFor,
    ts,
    item.id
  );

  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'publishing.scheduled',
    entityType: 'publishing_job',
    entityId: id,
    metadata: { idempotencyKey, platform: account.platform, versionHash: version.version_hash },
  });

  res.status(201).json({ job: db.prepare('SELECT * FROM publishing_jobs WHERE id = ?').get(id) });
});

distributionAndFinanceRouter.post('/publishing-jobs/:id/execute', requirePermission('publishing:execute'), (req: AuthedRequest, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM publishing_jobs WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!job) {
    res.status(404).json({ error: 'Publishing job not found.' });
    return;
  }
  if (job.state === 'unknown_outcome_reconciliation_required') {
    res.status(409).json({
      error: 'Publishing outcome is uncertain after prior timeout. Reconcile against the external platform before retrying to prevent duplicate posts.',
    });
    return;
  }
  const { jobId } = enqueueBackgroundJob({
    jobType: 'publish_social_content',
    correlationId: req.correlationId,
    payload: { publishingJobId: job.id },
    maxAttempts: 1,
  });
  db.prepare(`UPDATE publishing_jobs SET state = 'queued', updated_at = ? WHERE id = ?`).run(nowIso(), String(job.id));
  res.status(202).json({ backgroundJobId: jobId, state: 'queued' });
});

distributionAndFinanceRouter.post('/publishing-jobs/:id/cancel', requirePermission('publishing:execute'), (req: AuthedRequest, res) => {
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE publishing_jobs SET state = 'cancelled', updated_at = ?
       WHERE id = ? AND state IN ('scheduled','failed','retry_scheduled')`
    )
    .run(nowIso(), req.params.id);
  if (Number(result.changes) === 0) {
    res.status(409).json({ error: 'Publishing job cannot be cancelled in its current state.' });
    return;
  }
  res.json({ ok: true });
});

// --- ANALYTICS & PROVENANCE ---
distributionAndFinanceRouter.get('/analytics', requirePermission('analytics:read'), (_req, res) => {
  const db = getDb();
  const metrics = db
    .prepare(
      `SELECT pm.*, c.name as client_name, sa.account_handle
       FROM performance_metrics pm
       INNER JOIN clients c ON c.id = pm.client_id
       INNER JOIN client_social_accounts sa ON sa.id = pm.social_account_id
       ORDER BY pm.collected_at DESC LIMIT 200`
    )
    .all();
  const syncRuns = db
    .prepare(
      `SELECT asr.*, sa.platform, sa.account_handle
       FROM analytics_sync_runs asr
       INNER JOIN client_social_accounts sa ON sa.id = asr.social_account_id
       ORDER BY asr.started_at DESC LIMIT 50`
    )
    .all();
  const accounts = db
    .prepare(
      `SELECT sa.*, c.name as client_name
       FROM client_social_accounts sa INNER JOIN clients c ON c.id = sa.client_id
       ORDER BY sa.created_at DESC`
    )
    .all();
  res.json({ metrics, syncRuns, accounts });
});

distributionAndFinanceRouter.post('/analytics/sync', requirePermission('analytics:sync'), (req: AuthedRequest, res) => {
  const schema = z.object({ socialAccountId: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Social account ID is required.' });
    return;
  }
  const { jobId } = enqueueBackgroundJob({
    jobType: 'analytics_sync',
    correlationId: req.correlationId,
    payload: { socialAccountId: parsed.data.socialAccountId },
    maxAttempts: 1,
  });
  res.status(202).json({ jobId, status: 'queued' });
});

// --- FINANCIAL MANAGEMENT & PROFITABILITY ---
distributionAndFinanceRouter.get('/finance/summary', requirePermission('finance:read'), (_req, res) => {
  const db = getDb();
  const invoices = db
    .prepare(
      `SELECT i.*, c.name as client_name, p.name as project_name,
              (SELECT COALESCE(SUM(pay.amount_cents), 0) FROM payments pay WHERE pay.invoice_id = i.id) as paid_cents
       FROM invoices i
       INNER JOIN clients c ON c.id = i.client_id
       LEFT JOIN projects p ON p.id = i.project_id
       ORDER BY i.issued_date DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const payments = db
    .prepare(
      `SELECT pay.*, c.name as client_name, i.invoice_number
       FROM payments pay
       INNER JOIN clients c ON c.id = pay.client_id
       INNER JOIN invoices i ON i.id = pay.invoice_id
       ORDER BY pay.paid_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const expenses = db
    .prepare(
      `SELECT ex.*, c.name as client_name, p.name as project_name
       FROM expenses ex
       LEFT JOIN clients c ON c.id = ex.client_id
       LEFT JOIN projects p ON p.id = ex.project_id
       ORDER BY ex.incurred_date DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const usageRecords = db
    .prepare(
      `SELECT u.*, c.name as client_name, a.name as agent_name
       FROM usage_records u
       LEFT JOIN clients c ON c.id = u.client_id
       LEFT JOIN agents a ON a.id = u.agent_id
       ORDER BY u.recorded_at DESC LIMIT 100`
    )
    .all() as Array<Record<string, unknown>>;

  const summary = calculateFinancialSummary({
    invoices: invoices.map((i) => ({
      id: String(i.id),
      clientId: String(i.client_id),
      amountCents: Number(i.amount_cents),
      status: String(i.status) as 'draft' | 'issued' | 'paid' | 'overdue' | 'void',
    })),
    payments: payments.map((p) => ({
      id: String(p.id),
      invoiceId: String(p.invoice_id),
      clientId: String(p.client_id),
      amountCents: Number(p.amount_cents),
    })),
    expenses: expenses.map((e) => ({
      id: String(e.id),
      clientId: e.client_id ? String(e.client_id) : null,
      projectId: e.project_id ? String(e.project_id) : null,
      category: String(e.category),
      amountCents: Number(e.amount_cents),
      isEstimate: Boolean(e.is_estimate),
    })),
    usageRecords: usageRecords.map((u) => ({
      id: String(u.id),
      clientId: u.client_id ? String(u.client_id) : null,
      projectId: u.project_id ? String(u.project_id) : null,
      costUsd: Number(u.cost_usd),
    })),
  });

  // Client-level profitability breakdown using actual recorded figures
  const clients = db.prepare('SELECT id, name FROM clients WHERE archived_at IS NULL ORDER BY name').all() as Array<{ id: string; name: string }>;
  const clientProfitability = clients.map((c) => {
    const cSummary = calculateFinancialSummary({
      invoices: invoices
        .filter((i) => i.client_id === c.id)
        .map((i) => ({
          id: String(i.id),
          clientId: c.id,
          amountCents: Number(i.amount_cents),
          status: String(i.status) as 'draft' | 'issued' | 'paid' | 'overdue' | 'void',
        })),
      payments: payments
        .filter((p) => p.client_id === c.id)
        .map((p) => ({
          id: String(p.id),
          invoiceId: String(p.invoice_id),
          clientId: c.id,
          amountCents: Number(p.amount_cents),
        })),
      expenses: expenses
        .filter((e) => e.client_id === c.id)
        .map((e) => ({
          id: String(e.id),
          clientId: c.id,
          projectId: e.project_id ? String(e.project_id) : null,
          category: String(e.category),
          amountCents: Number(e.amount_cents),
          isEstimate: Boolean(e.is_estimate),
        })),
      usageRecords: usageRecords
        .filter((u) => u.client_id === c.id)
        .map((u) => ({
          id: String(u.id),
          clientId: c.id,
          projectId: u.project_id ? String(u.project_id) : null,
          costUsd: Number(u.cost_usd),
        })),
    });
    return { clientId: c.id, clientName: c.name, ...cSummary };
  });

  res.json({ summary, invoices, payments, expenses, usageRecords, clientProfitability });
});

distributionAndFinanceRouter.post('/finance/invoices', requirePermission('finance:write'), (req: AuthedRequest, res) => {
  const schema = z.object({
    clientId: z.string().min(1, 'Client is required.'),
    projectId: z.string().nullable().optional(),
    invoiceNumber: z.string().trim().min(2, 'Invoice number is required.').max(60),
    amountUsd: z.number().positive('Amount must be greater than 0.'),
    issuedDate: z.string().min(8),
    dueDate: z.string().min(8),
    status: z.enum(['draft', 'issued', 'paid', 'overdue', 'void']).default('issued'),
    notes: z.string().trim().max(1000).default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid invoice.' });
    return;
  }
  const db = getDb();
  const id = generateId('inv');
  const ts = nowIso();
  try {
    db.prepare(
      `INSERT INTO invoices (
        id, organization_id, client_id, project_id, invoice_number, amount_cents,
        status, issued_date, due_date, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      DEFAULT_ORG_ID,
      parsed.data.clientId,
      parsed.data.projectId ?? null,
      parsed.data.invoiceNumber,
      Math.round(parsed.data.amountUsd * 100),
      parsed.data.status,
      parsed.data.issuedDate,
      parsed.data.dueDate,
      parsed.data.notes,
      ts,
      ts
    );
    writeAuditLog({
      db,
      correlationId: req.correlationId,
      actorType: 'human',
      actorId: req.authUser!.id,
      actorLabel: req.authUser!.email,
      action: 'finance.invoice_created',
      entityType: 'invoice',
      entityId: id,
      metadata: { invoiceNumber: parsed.data.invoiceNumber, amountUsd: parsed.data.amountUsd },
    });
    res.status(201).json({ id });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Invoice number already exists.' });
  }
});

distributionAndFinanceRouter.post('/finance/payments', requirePermission('finance:write'), (req: AuthedRequest, res) => {
  const schema = z.object({
    invoiceId: z.string().min(1),
    amountUsd: z.number().positive('Payment amount must be greater than 0.'),
    paymentMethod: z.string().trim().max(60).default('bank_transfer'),
    referenceCode: z.string().trim().max(100).default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid payment.' });
    return;
  }
  const db = getDb();
  const invoice = db
    .prepare('SELECT id, client_id, amount_cents FROM invoices WHERE id = ?')
    .get(parsed.data.invoiceId) as { id: string; client_id: string; amount_cents: number } | undefined;
  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found.' });
    return;
  }

  const id = generateId('pay');
  const ts = nowIso();
  const amountCents = Math.round(parsed.data.amountUsd * 100);
  db.prepare(
    `INSERT INTO payments (id, invoice_id, client_id, amount_cents, payment_method, reference_code, paid_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, invoice.id, invoice.client_id, amountCents, parsed.data.paymentMethod, parsed.data.referenceCode, ts, ts);

  const totalPaid = (
    db.prepare('SELECT COALESCE(SUM(amount_cents), 0) as total FROM payments WHERE invoice_id = ?').get(invoice.id) as { total: number }
  ).total;
  if (totalPaid >= invoice.amount_cents) {
    db.prepare(`UPDATE invoices SET status = 'paid', updated_at = ? WHERE id = ?`).run(ts, invoice.id);
  }

  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'finance.payment_recorded',
    entityType: 'payment',
    entityId: id,
    metadata: { invoiceId: invoice.id, amountUsd: parsed.data.amountUsd },
  });

  res.status(201).json({ id, invoicePaidInFull: totalPaid >= invoice.amount_cents });
});

distributionAndFinanceRouter.post('/finance/expenses', requirePermission('finance:write'), (req: AuthedRequest, res) => {
  const schema = z.object({
    clientId: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
    category: z.enum([
      'ai_model',
      'image_generation',
      'video_generation',
      'storage',
      'integration',
      'employee',
      'campaign_media',
      'operations',
    ]),
    description: z.string().trim().min(2).max(400),
    amountUsd: z.number().positive('Expense amount must be greater than 0.'),
    isEstimate: z.boolean().default(false),
    incurredDate: z.string().min(8),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid expense.' });
    return;
  }
  const db = getDb();
  const id = generateId('exp');
  const ts = nowIso();
  db.prepare(
    `INSERT INTO expenses (
      id, organization_id, client_id, project_id, category, description,
      amount_cents, is_estimate, incurred_date, recorded_by_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    DEFAULT_ORG_ID,
    parsed.data.clientId ?? null,
    parsed.data.projectId ?? null,
    parsed.data.category,
    parsed.data.description,
    Math.round(parsed.data.amountUsd * 100),
    parsed.data.isEstimate ? 1 : 0,
    parsed.data.incurredDate,
    req.authUser!.id,
    ts
  );
  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'finance.expense_recorded',
    entityType: 'expense',
    entityId: id,
    metadata: { category: parsed.data.category, amountUsd: parsed.data.amountUsd, isEstimate: parsed.data.isEstimate },
  });
  res.status(201).json({ id });
});
