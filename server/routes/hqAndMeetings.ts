import { Router } from 'express';
import { z } from 'zod';
import { getDb, nowIso } from '../db/database';
import { DEFAULT_ORG_ID } from '../db/seed';
import { requireAuth, requirePermission, type AuthedRequest } from '../services/auth';
import { generateId } from '../services/security';
import { writeAuditLog } from '../services/audit';
import { broadcastCompanyEvent, registerSseClient } from '../services/realtime';
import { generateStructuredText } from '../services/aiProviders';
import { wrapUntrustedContentForAgent } from '../../src/domain/rbac';
import {
  buildOrgChartHierarchy,
  computeActorWorldPosition,
  computeHqFloorPlan,
  deriveAgentOperationalState,
  deriveHumanOperationalState,
  parseAvatarConfig,
  type OrgTreeMember,
} from '../../src/domain/hq';

export const hqAndMeetingsRouter = Router();

const avatarConfigSchema = z.object({
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  bodyColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  headStyle: z.enum(['classic', 'visor', 'halo', 'studio']).optional(),
  accessory: z.enum(['none', 'headset', 'badge', 'tablet']).optional(),
});

// ============================================================
// 1. REAL-TIME SERVER-SENT EVENTS STREAM
// ============================================================
hqAndMeetingsRouter.get('/events/stream', requireAuth, (req: AuthedRequest, res) => {
  registerSseClient(req.authUser!.id, res);
});

// ============================================================
// 2. AUTHORITATIVE VIRTUAL HQ STATE SNAPSHOT
// ============================================================
hqAndMeetingsRouter.get('/hq/state', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(DEFAULT_ORG_ID) as Record<
    string,
    unknown
  >;

  const departments = db
    .prepare(
      `SELECT d.*,
              lead.full_name as manager_name,
              (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id AND e.employment_status = 'active') as employee_count,
              (SELECT COUNT(*) FROM agents a WHERE a.department_id = d.id) as agent_count,
              (SELECT COUNT(*) FROM tasks t WHERE t.department_id = d.id AND t.status NOT IN ('completed','cancelled')) as active_tasks,
              (SELECT COUNT(*) FROM tasks t WHERE t.department_id = d.id AND t.status = 'completed') as completed_tasks
       FROM departments d
       LEFT JOIN employees lead ON lead.id = d.lead_employee_id
       ORDER BY d.name ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const meetingRooms = db
    .prepare('SELECT * FROM meeting_rooms ORDER BY name ASC')
    .all() as Array<Record<string, unknown>>;

  const activeMeetings = db
    .prepare(
      `SELECT m.*, mr.name as room_name, mr.code as room_code, c.name as client_name, d.name as department_name
       FROM meetings m
       LEFT JOIN meeting_rooms mr ON mr.id = m.room_id
       LEFT JOIN clients c ON c.id = m.client_id
       LEFT JOIN departments d ON d.id = m.department_id
       WHERE m.status = 'active'
       ORDER BY m.started_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const activeMeetingIds = activeMeetings.map((m) => String(m.id));
  const activeMeetingParticipants =
    activeMeetingIds.length > 0
      ? (db
          .prepare(
            `SELECT mp.*, m.room_id, m.title as meeting_title
             FROM meeting_participants mp
             INNER JOIN meetings m ON m.id = mp.meeting_id
             WHERE m.status = 'active'
             ORDER BY mp.seat_index ASC`
          )
          .all() as Array<Record<string, unknown>>)
      : [];

  const humanActiveMeeting = new Map<string, { meetingId: string; roomId: string | null; seatIndex: number; title: string }>();
  const agentActiveMeeting = new Map<string, { meetingId: string; roomId: string | null; seatIndex: number; title: string }>();
  for (const p of activeMeetingParticipants) {
    const info = {
      meetingId: String(p.meeting_id),
      roomId: (p.room_id as string | null) ?? null,
      seatIndex: Number(p.seat_index ?? 0),
      title: String(p.meeting_title || ''),
    };
    if (p.participant_type === 'human') {
      humanActiveMeeting.set(String(p.participant_id), info);
    } else {
      agentActiveMeeting.set(String(p.participant_id), info);
    }
  }

  const zones = computeHqFloorPlan(
    departments.map((d) => ({
      id: String(d.id),
      code: String(d.code),
      name: String(d.name),
      color_hex: String(d.color_hex || '#2563eb'),
      status: String(d.status || 'active'),
    })),
    meetingRooms.map((r) => ({
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      capacity: Number(r.capacity || 6),
      color_hex: String(r.color_hex || '#1e3a8a'),
    }))
  );

  const rawEmployees = db
    .prepare(
      `SELECT e.*, d.name as department_name, mgr.full_name as manager_name,
              (SELECT GROUP_CONCAT(r.name, ', ')
               FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id
               WHERE ur.user_id = e.user_id) as role_names,
              (SELECT COUNT(*) FROM tasks t WHERE t.assigned_user_id = e.user_id AND t.status NOT IN ('completed','cancelled')) as open_tasks,
              (SELECT COUNT(*) FROM tasks t WHERE t.assigned_user_id = e.user_id AND t.status = 'running') as running_tasks
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN employees mgr ON mgr.id = e.manager_employee_id
       ORDER BY e.created_at ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const rawAgents = db
    .prepare(
      `SELECT a.*, d.name as department_name, mgr.full_name as manager_name,
              (SELECT COUNT(*) FROM task_runs r WHERE r.agent_id = a.id AND r.status = 'running') as running_runs,
              (SELECT COUNT(*) FROM task_runs r WHERE r.agent_id = a.id AND r.status = 'validating') as validating_runs,
              (SELECT COUNT(*) FROM task_runs r WHERE r.agent_id = a.id AND r.status = 'completed') as completed_runs,
              (SELECT COUNT(*) FROM task_runs r WHERE r.agent_id = a.id AND r.status = 'failed') as failed_runs,
              (SELECT COUNT(*) FROM tasks t WHERE t.assigned_agent_id = a.id AND t.status IN ('queued','assigned')) as queued_tasks,
              (SELECT COUNT(*) FROM tasks t WHERE t.assigned_agent_id = a.id AND t.status = 'waiting_for_approval') as waiting_approval_tasks,
              (SELECT COUNT(*) FROM tasks t WHERE t.assigned_agent_id = a.id AND t.status = 'waiting_for_input') as waiting_input_tasks,
              (SELECT COUNT(*) FROM tasks t WHERE t.assigned_agent_id = a.id AND t.status NOT IN ('completed','cancelled')) as open_tasks,
              (SELECT t.title FROM tasks t WHERE t.assigned_agent_id = a.id AND t.status IN ('running','validating','queued','assigned','waiting_for_approval') ORDER BY t.updated_at DESC LIMIT 1) as current_task_title,
              (SELECT r.status FROM task_runs r WHERE r.agent_id = a.id ORDER BY r.started_at DESC LIMIT 1) as last_run_status,
              (SELECT COALESCE(SUM(r.cost_usd), 0) FROM task_runs r WHERE r.agent_id = a.id) as total_cost_usd
       FROM agents a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN employees mgr ON mgr.id = a.manager_employee_id
       ORDER BY a.name ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const deptSlotCounter = new Map<string, number>();
  const nextSlot = (deptId: string | null) => {
    const key = deptId || 'unassigned';
    const current = deptSlotCounter.get(key) ?? 0;
    deptSlotCounter.set(key, current + 1);
    return current;
  };

  const humans: Array<Record<string, any>> = rawEmployees.map((emp) => {
    const meetingInfo = humanActiveMeeting.get(String(emp.id)) ?? null;
    const operationalStatus = deriveHumanOperationalState({
      employmentStatus: String(emp.employment_status || 'active'),
      activeMeetingId: meetingInfo?.meetingId ?? null,
      runningTaskCount: Number(emp.running_tasks || 0),
    });
    const avatarConfig = parseAvatarConfig(
      String(emp.avatar_config_json || ''),
      String(emp.id),
      false
    );
    const worldPosition = computeActorWorldPosition(
      {
        id: String(emp.id),
        departmentId: (emp.department_id as string | null) ?? null,
        slotIndexInDept: nextSlot((emp.department_id as string | null) ?? null),
        activeMeetingRoomId: meetingInfo?.roomId ?? null,
        meetingSeatIndex: meetingInfo?.seatIndex ?? 0,
      },
      zones
    );

    return {
      ...emp,
      actorType: 'human' as const,
      operationalStatus,
      avatarConfig,
      worldPosition,
      activeMeetingId: meetingInfo?.meetingId ?? null,
      activeMeetingTitle: meetingInfo?.title ?? null,
    };
  });

  const agents: Array<Record<string, any>> = rawAgents.map((ag) => {
    const meetingInfo = agentActiveMeeting.get(String(ag.id)) ?? null;
    const operationalStatus = deriveAgentOperationalState({
      agentStatus: String(ag.status || 'active'),
      runningRunCount: Number(ag.running_runs || 0),
      validatingRunCount: Number(ag.validating_runs || 0),
      queuedTaskCount: Number(ag.queued_tasks || 0),
      waitingApprovalTaskCount: Number(ag.waiting_approval_tasks || 0),
      waitingInputTaskCount: Number(ag.waiting_input_tasks || 0),
      recentFailedRunCount: ag.last_run_status === 'failed' ? 1 : 0,
      activeMeetingId: meetingInfo?.meetingId ?? null,
    });
    const avatarConfig = parseAvatarConfig(
      String(ag.avatar_config_json || ''),
      String(ag.code || ag.id),
      true
    );
    const worldPosition = computeActorWorldPosition(
      {
        id: String(ag.id),
        departmentId: (ag.department_id as string | null) ?? null,
        slotIndexInDept: nextSlot((ag.department_id as string | null) ?? null),
        activeMeetingRoomId: meetingInfo?.roomId ?? null,
        meetingSeatIndex: meetingInfo?.seatIndex ?? 0,
      },
      zones
    );

    return {
      ...ag,
      actorType: 'agent' as const,
      operationalStatus,
      avatarConfig,
      worldPosition,
      activeMeetingId: meetingInfo?.meetingId ?? null,
      activeMeetingTitle: meetingInfo?.title ?? null,
    };
  });

  const orgChart = buildOrgChartHierarchy(
    departments.map((d) => ({
      id: String(d.id),
      code: String(d.code),
      name: String(d.name),
      description: String(d.description || ''),
      status: String(d.status || 'active'),
      color_hex: String(d.color_hex || '#2563eb'),
      lead_employee_id: (d.lead_employee_id as string | null) ?? null,
    })),
    humans.map(
      (h): OrgTreeMember => ({
        id: String(h.id),
        actorType: 'human',
        name: String(h.full_name),
        jobTitle: String(h.job_title),
        departmentId: (h.department_id as string | null) ?? null,
        managerEmployeeId: (h.manager_employee_id as string | null) ?? null,
        status: String(h.employment_status),
        operationalStatus: h.operationalStatus,
        openTasks: Number(h.open_tasks || 0),
      })
    ),
    agents.map(
      (a): OrgTreeMember => ({
        id: String(a.id),
        actorType: 'agent',
        name: String(a.name),
        jobTitle: String(a.job_title),
        departmentId: (a.department_id as string | null) ?? null,
        managerEmployeeId: (a.manager_employee_id as string | null) ?? null,
        status: String(a.status),
        operationalStatus: a.operationalStatus,
        openTasks: Number(a.open_tasks || 0),
        modelIdentifier: String(a.model_identifier || ''),
      })
    )
  );

  const pendingApprovals = Number(
    (db.prepare(`SELECT COUNT(*) as c FROM approval_requests WHERE status = 'pending'`).get() as { c: number })?.c ?? 0
  );
  const unreadNotifications = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM notifications WHERE read_at IS NULL AND (user_id IS NULL OR user_id = ?)`
        )
        .get(req.authUser!.id) as { c: number }
    )?.c ?? 0
  );
  const recentEvents = db
    .prepare('SELECT * FROM company_events ORDER BY created_at DESC LIMIT 40')
    .all();

  res.json({
    syncedAt: nowIso(),
    organization: org,
    departments,
    meetingRooms: meetingRooms.map((room) => ({
      ...room,
      activeMeeting: activeMeetings.find((m) => m.room_id === room.id) ?? null,
    })),
    activeMeetings: activeMeetings.map((m) => ({
      ...m,
      participants: activeMeetingParticipants.filter((p) => p.meeting_id === m.id),
    })),
    zones,
    humans,
    agents,
    orgChart,
    recentEvents,
    counts: {
      pendingApprovals,
      unreadNotifications,
      activeMeetings: activeMeetings.length,
      workingAgents: agents.filter((a) => a.operationalStatus === 'working').length,
      totalHumans: humans.length,
      totalAgents: agents.length,
      totalDepartments: departments.length,
    },
  });
});

// ============================================================
// 3. GLOBAL RBAC-AWARE SEARCH
// ============================================================
hqAndMeetingsRouter.get('/search', requireAuth, (req: AuthedRequest, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q || q.length < 2) {
    res.json({ query: q, results: [] });
    return;
  }
  const db = getDb();
  const like = `%${q}%`;
  const results: Array<{
    type: string;
    id: string;
    title: string;
    subtitle: string;
    route: string;
    entityId?: string;
  }> = [];

  const clients = db
    .prepare('SELECT id, name, industry, status FROM clients WHERE name LIKE ? OR industry LIKE ? LIMIT 6')
    .all(like, like) as Array<Record<string, string>>;
  for (const c of clients) {
    results.push({ type: 'client', id: c.id, title: c.name, subtitle: `${c.industry} · ${c.status}`, route: 'clients' });
  }

  const employees = db
    .prepare('SELECT id, full_name, job_title, email FROM employees WHERE full_name LIKE ? OR job_title LIKE ? OR email LIKE ? LIMIT 6')
    .all(like, like, like) as Array<Record<string, string>>;
  for (const e of employees) {
    results.push({
      type: 'employee',
      id: e.id,
      title: e.full_name,
      subtitle: `${e.job_title} · ${e.email}`,
      route: 'employee_profile',
      entityId: e.id,
    });
  }

  const agents = db
    .prepare('SELECT id, name, job_title, model_identifier FROM agents WHERE name LIKE ? OR job_title LIKE ? OR role_description LIKE ? LIMIT 6')
    .all(like, like, like) as Array<Record<string, string>>;
  for (const a of agents) {
    results.push({
      type: 'agent',
      id: a.id,
      title: a.name,
      subtitle: `${a.job_title} · ${a.model_identifier}`,
      route: 'agent_profile',
      entityId: a.id,
    });
  }

  const departments = db
    .prepare('SELECT id, name, description FROM departments WHERE name LIKE ? OR description LIKE ? LIMIT 6')
    .all(like, like) as Array<Record<string, string>>;
  for (const d of departments) {
    results.push({
      type: 'department',
      id: d.id,
      title: d.name,
      subtitle: d.description.slice(0, 90),
      route: 'department_workspace',
      entityId: d.id,
    });
  }

  const projects = db
    .prepare('SELECT id, name, status FROM projects WHERE name LIKE ? OR objectives LIKE ? LIMIT 6')
    .all(like, like) as Array<Record<string, string>>;
  for (const p of projects) {
    results.push({ type: 'project', id: p.id, title: p.name, subtitle: `Project · ${p.status}`, route: 'projects' });
  }

  const tasks = db
    .prepare('SELECT id, title, status, priority FROM tasks WHERE title LIKE ? OR description LIKE ? LIMIT 6')
    .all(like, like) as Array<Record<string, string>>;
  for (const t of tasks) {
    results.push({ type: 'task', id: t.id, title: t.title, subtitle: `${t.status} · ${t.priority}`, route: 'tasks' });
  }

  const content = db
    .prepare('SELECT id, title, platform, status FROM content_items WHERE title LIKE ? LIMIT 6')
    .all(like) as Array<Record<string, string>>;
  for (const ci of content) {
    results.push({ type: 'content', id: ci.id, title: ci.title, subtitle: `${ci.platform} · ${ci.status}`, route: 'content' });
  }

  const meetings = db
    .prepare('SELECT id, title, meeting_type, status FROM meetings WHERE title LIKE ? OR agenda LIKE ? LIMIT 6')
    .all(like, like) as Array<Record<string, string>>;
  for (const m of meetings) {
    results.push({
      type: 'meeting',
      id: m.id,
      title: m.title,
      subtitle: `${m.meeting_type} · ${m.status}`,
      route: 'meetings',
      entityId: m.id,
    });
  }

  res.json({ query: q, results });
});

// ============================================================
// 4. PERSONAL WORKSPACE ("MY WORKSPACE")
// ============================================================
hqAndMeetingsRouter.get('/me/workspace', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const userId = req.authUser!.id;
  const employee = db
    .prepare(
      `SELECT e.*, d.name as department_name, mgr.full_name as manager_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN employees mgr ON mgr.id = e.manager_employee_id
       WHERE e.user_id = ?`
    )
    .get(userId) as Record<string, unknown> | undefined;

  const assignedTasks = db
    .prepare(
      `SELECT t.*, c.name as client_name, p.name as project_name, a.name as agent_name
       FROM tasks t
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN agents a ON a.id = t.assigned_agent_id
       WHERE t.assigned_user_id = ? OR t.created_by_user_id = ?
       ORDER BY t.updated_at DESC LIMIT 40`
    )
    .all(userId, userId);

  const pendingApprovals = db
    .prepare(
      `SELECT * FROM approval_requests WHERE status = 'pending' ORDER BY created_at DESC LIMIT 20`
    )
    .all();

  const notifications = db
    .prepare(
      `SELECT * FROM notifications WHERE user_id IS NULL OR user_id = ? ORDER BY created_at DESC LIMIT 25`
    )
    .all(userId);

  const recentActivity = db
    .prepare(
      `SELECT * FROM audit_logs WHERE actor_id = ? ORDER BY created_at DESC LIMIT 30`
    )
    .all(userId);

  const myMeetings = employee
    ? db
        .prepare(
          `SELECT m.*, mr.name as room_name
           FROM meetings m
           LEFT JOIN meeting_rooms mr ON mr.id = m.room_id
           WHERE m.created_by_user_id = ?
              OR EXISTS (SELECT 1 FROM meeting_participants mp WHERE mp.meeting_id = m.id AND mp.participant_type = 'human' AND mp.participant_id = ?)
           ORDER BY m.created_at DESC LIMIT 15`
        )
        .all(userId, String(employee.id))
    : [];

  res.json({
    user: req.authUser,
    employee: employee ?? null,
    assignedTasks,
    pendingApprovals,
    notifications,
    recentActivity,
    myMeetings,
  });
});

// ============================================================
// 5. DEPARTMENT WORKSPACE & MANAGEMENT
// ============================================================
hqAndMeetingsRouter.get('/departments/:id/workspace', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const deptId = req.params.id;
  const department = db
    .prepare(
      `SELECT d.*, lead.full_name as manager_name, lead.job_title as manager_title
       FROM departments d
       LEFT JOIN employees lead ON lead.id = d.lead_employee_id
       WHERE d.id = ?`
    )
    .get(deptId) as Record<string, unknown> | undefined;

  if (!department) {
    res.status(404).json({ error: 'Department not found.' });
    return;
  }

  const humans = db
    .prepare(
      `SELECT e.*,
              (SELECT GROUP_CONCAT(r.name, ', ')
               FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id
               WHERE ur.user_id = e.user_id) as role_names,
              (SELECT COUNT(*) FROM tasks t WHERE t.assigned_user_id = e.user_id AND t.status NOT IN ('completed','cancelled')) as open_tasks
       FROM employees e WHERE e.department_id = ? ORDER BY e.full_name ASC`
    )
    .all(deptId);

  const agents = db
    .prepare(
      `SELECT a.*,
              (SELECT COUNT(*) FROM tasks t WHERE t.assigned_agent_id = a.id AND t.status NOT IN ('completed','cancelled')) as open_tasks,
              (SELECT COUNT(*) FROM task_runs r WHERE r.agent_id = a.id AND r.status = 'completed') as completed_runs,
              (SELECT COUNT(*) FROM task_runs r WHERE r.agent_id = a.id AND r.status = 'failed') as failed_runs,
              (SELECT COALESCE(SUM(r.cost_usd), 0) FROM task_runs r WHERE r.agent_id = a.id) as total_cost_usd
       FROM agents a WHERE a.department_id = ? ORDER BY a.name ASC`
    )
    .all(deptId);

  const tasks = db
    .prepare(
      `SELECT t.*, c.name as client_name, p.name as project_name, a.name as agent_name
       FROM tasks t
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN projects p ON p.id = t.project_id
       LEFT JOIN agents a ON a.id = t.assigned_agent_id
       WHERE t.department_id = ?
       ORDER BY t.updated_at DESC LIMIT 50`
    )
    .all(deptId);

  const projects = db
    .prepare(
      `SELECT DISTINCT p.*, c.name as client_name
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       INNER JOIN tasks t ON t.project_id = p.id
       WHERE t.department_id = ?
       ORDER BY p.updated_at DESC LIMIT 20`
    )
    .all(deptId);

  const events = db
    .prepare(
      `SELECT * FROM company_events WHERE department_id = ? ORDER BY created_at DESC LIMIT 25`
    )
    .all(deptId);

  const meetings = db
    .prepare(
      `SELECT m.*, mr.name as room_name FROM meetings m
       LEFT JOIN meeting_rooms mr ON mr.id = m.room_id
       WHERE m.department_id = ? ORDER BY m.created_at DESC LIMIT 15`
    )
    .all(deptId);

  res.json({
    department,
    humans,
    agents,
    tasks,
    projects,
    events,
    meetings,
  });
});

hqAndMeetingsRouter.patch('/departments/:id', requirePermission('org:manage'), (req: AuthedRequest, res) => {
  const schema = z.object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    leadEmployeeId: z.string().nullable().optional(),
    status: z.enum(['active', 'inactive']).optional(),
    colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid department update.' });
    return;
  }
  const db = getDb();
  const existing = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Department not found.' });
    return;
  }
  const ts = nowIso();
  db.prepare(
    `UPDATE departments
     SET name = ?, description = ?, lead_employee_id = ?, status = ?, color_hex = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    String(parsed.data.name ?? existing.name),
    String(parsed.data.description ?? existing.description ?? ''),
    (parsed.data.leadEmployeeId !== undefined ? parsed.data.leadEmployeeId : (existing.lead_employee_id as string | null)) ?? null,
    String(parsed.data.status ?? existing.status ?? 'active'),
    String(parsed.data.colorHex ?? existing.color_hex ?? '#2563eb'),
    ts,
    req.params.id
  );

  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'department.updated',
    entityType: 'department',
    entityId: req.params.id,
    metadata: parsed.data,
  });

  broadcastCompanyEvent(db, {
    eventType: 'department.updated',
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.fullName,
    departmentId: req.params.id,
    entityType: 'department',
    entityId: req.params.id,
    summary: `Department "${String(parsed.data.name ?? existing.name)}" configuration updated`,
  });

  res.json({ department: db.prepare('SELECT * FROM departments WHERE id = ?').get(req.params.id) });
});

// ============================================================
// 6. HUMAN EMPLOYEE FULL PROFILE & MANAGEMENT
// ============================================================
hqAndMeetingsRouter.get('/employees/:id', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const emp = db
    .prepare(
      `SELECT e.*, d.name as department_name, mgr.full_name as manager_name, mgr.job_title as manager_title,
              u.status as user_account_status, u.last_login_at
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN employees mgr ON mgr.id = e.manager_employee_id
       LEFT JOIN users u ON u.id = e.user_id
       WHERE e.id = ?`
    )
    .get(req.params.id) as Record<string, unknown> | undefined;

  if (!emp) {
    res.status(404).json({ error: 'Employee not found.' });
    return;
  }

  const roles = emp.user_id
    ? db
        .prepare(
          `SELECT r.code, r.name FROM roles r INNER JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?`
        )
        .all(String(emp.user_id))
    : [];

  const permissions = emp.user_id
    ? db
        .prepare(
          `SELECT DISTINCT p.code, p.category FROM permissions p
           INNER JOIN role_permissions rp ON rp.permission_id = p.id
           INNER JOIN user_roles ur ON ur.role_id = rp.role_id
           WHERE ur.user_id = ? ORDER BY p.category, p.code`
        )
        .all(String(emp.user_id))
    : [];

  const directReports = db
    .prepare('SELECT id, full_name, job_title, employment_status FROM employees WHERE manager_employee_id = ?')
    .all(req.params.id);

  const supervisedAgents = db
    .prepare('SELECT id, name, job_title, status, model_identifier FROM agents WHERE manager_employee_id = ?')
    .all(req.params.id);

  const tasks = emp.user_id
    ? db
        .prepare(
          `SELECT t.*, c.name as client_name, p.name as project_name
           FROM tasks t
           LEFT JOIN clients c ON c.id = t.client_id
           LEFT JOIN projects p ON p.id = t.project_id
           WHERE t.assigned_user_id = ? OR t.created_by_user_id = ?
           ORDER BY t.updated_at DESC LIMIT 30`
        )
        .all(String(emp.user_id), String(emp.user_id))
    : [];

  const managedClients = db
    .prepare('SELECT id, name, industry, status FROM clients WHERE account_manager_employee_id = ?')
    .all(req.params.id);

  const activity = emp.user_id
    ? db
        .prepare('SELECT * FROM audit_logs WHERE actor_id = ? ORDER BY created_at DESC LIMIT 30')
        .all(String(emp.user_id))
    : [];

  res.json({
    employee: {
      ...emp,
      avatarConfig: parseAvatarConfig(String(emp.avatar_config_json || ''), String(emp.id), false),
    },
    roles,
    permissions,
    directReports,
    supervisedAgents,
    tasks,
    managedClients,
    activity,
  });
});

hqAndMeetingsRouter.patch('/employees/:id', requirePermission('users:manage'), (req: AuthedRequest, res) => {
  const schema = z.object({
    fullName: z.string().trim().min(2).max(120).optional(),
    jobTitle: z.string().trim().min(2).max(120).optional(),
    departmentId: z.string().nullable().optional(),
    managerEmployeeId: z.string().nullable().optional(),
    phone: z.string().trim().max(40).optional(),
    photoUrl: z.string().trim().max(500).optional(),
    joiningDate: z.string().trim().max(30).optional(),
    employmentStatus: z.enum(['active', 'on_leave', 'offboarded']).optional(),
    monthlyCostUsd: z.number().min(0).max(500000).optional(),
    roleCode: z.enum(['super_admin', 'agency_director', 'account_manager', 'creative_lead', 'analyst']).optional(),
    avatarConfig: avatarConfigSchema.optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid employee update.' });
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Employee not found.' });
    return;
  }

  if (parsed.data.managerEmployeeId === req.params.id) {
    res.status(400).json({ error: 'An employee cannot report to themselves.' });
    return;
  }

  const ts = nowIso();
  const mergedAvatar = parsed.data.avatarConfig
    ? JSON.stringify({
        ...parseAvatarConfig(String(existing.avatar_config_json || ''), String(existing.id), false),
        ...parsed.data.avatarConfig,
      })
    : String(existing.avatar_config_json || '{}');

  db.prepare(
    `UPDATE employees
     SET full_name = ?, job_title = ?, department_id = ?, manager_employee_id = ?,
         phone = ?, photo_url = ?, joining_date = ?, employment_status = ?,
         monthly_cost_cents = ?, avatar_config_json = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    String(parsed.data.fullName ?? existing.full_name),
    String(parsed.data.jobTitle ?? existing.job_title),
    (parsed.data.departmentId !== undefined ? parsed.data.departmentId : (existing.department_id as string | null)) ?? null,
    (parsed.data.managerEmployeeId !== undefined ? parsed.data.managerEmployeeId : (existing.manager_employee_id as string | null)) ?? null,
    String(parsed.data.phone ?? existing.phone ?? ''),
    String(parsed.data.photoUrl ?? existing.photo_url ?? ''),
    String(parsed.data.joiningDate ?? existing.joining_date ?? ''),
    String(parsed.data.employmentStatus ?? existing.employment_status),
    parsed.data.monthlyCostUsd !== undefined
      ? Math.round(parsed.data.monthlyCostUsd * 100)
      : Number(existing.monthly_cost_cents || 0),
    mergedAvatar,
    ts,
    req.params.id
  );

  if (parsed.data.roleCode && existing.user_id) {
    db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(String(existing.user_id));
    db.prepare('INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES (?, ?, ?)').run(
      String(existing.user_id),
      `role_${parsed.data.roleCode}`,
      ts
    );
  }

  if (parsed.data.employmentStatus && existing.user_id) {
    const userStatus = parsed.data.employmentStatus === 'offboarded' ? 'suspended' : 'active';
    db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(
      userStatus,
      ts,
      String(existing.user_id)
    );
  }

  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'employee.updated',
    entityType: 'employee',
    entityId: req.params.id,
    metadata: parsed.data,
  });

  broadcastCompanyEvent(db, {
    eventType: 'employee.updated',
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.fullName,
    departmentId: (parsed.data.departmentId ?? existing.department_id ?? null) as string | null,
    entityType: 'employee',
    entityId: req.params.id,
    summary: `Updated employee profile for ${String(parsed.data.fullName ?? existing.full_name)}`,
  });

  res.json({ employee: db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id) });
});

// ============================================================
// 7. AI AGENT 9-TAB PROFILE, AVATAR & PAUSE/RESUME CONTROLS
// ============================================================
hqAndMeetingsRouter.get('/agents/:id/profile', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const agent = db
    .prepare(
      `SELECT a.*, d.name as department_name, mgr.full_name as manager_name
       FROM agents a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN employees mgr ON mgr.id = a.manager_employee_id
       WHERE a.id = ?`
    )
    .get(req.params.id) as Record<string, unknown> | undefined;

  if (!agent) {
    res.status(404).json({ error: 'AI agent not found.' });
    return;
  }

  const tasks = db
    .prepare(
      `SELECT t.*, c.name as client_name, p.name as project_name
       FROM tasks t
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.assigned_agent_id = ?
       ORDER BY t.updated_at DESC LIMIT 50`
    )
    .all(req.params.id) as Array<Record<string, unknown>>;

  const runs = db
    .prepare('SELECT * FROM task_runs WHERE agent_id = ? ORDER BY started_at DESC LIMIT 50')
    .all(req.params.id) as Array<Record<string, unknown>>;

  const tools = db
    .prepare('SELECT * FROM agent_tools WHERE agent_id = ? ORDER BY tool_name ASC')
    .all(req.params.id);

  const versions = db
    .prepare('SELECT * FROM agent_versions WHERE agent_id = ? ORDER BY version_number DESC')
    .all(req.params.id);

  const usage = db
    .prepare('SELECT * FROM usage_records WHERE agent_id = ? ORDER BY recorded_at DESC LIMIT 50')
    .all(req.params.id);

  const logs = db
    .prepare(
      `SELECT * FROM audit_logs WHERE actor_id = ? OR (entity_type = 'agent' AND entity_id = ?) ORDER BY created_at DESC LIMIT 50`
    )
    .all(req.params.id, req.params.id);

  const activeMeeting = db
    .prepare(
      `SELECT m.id, m.title, m.room_id FROM meetings m
       INNER JOIN meeting_participants mp ON mp.meeting_id = m.id
       WHERE m.status = 'active' AND mp.participant_type = 'agent' AND mp.participant_id = ?
       LIMIT 1`
    )
    .get(req.params.id) as { id: string; title: string; room_id: string | null } | undefined;

  const runningRunCount = runs.filter((r) => r.status === 'running').length;
  const validatingRunCount = runs.filter((r) => r.status === 'validating').length;
  const completedRuns = runs.filter((r) => r.status === 'completed');
  const failedRuns = runs.filter((r) => r.status === 'failed');
  const totalCostUsd = runs.reduce((acc, r) => acc + Number(r.cost_usd || 0), 0);
  const totalPromptTokens = runs.reduce((acc, r) => acc + Number(r.prompt_tokens || 0), 0);
  const totalOutputTokens = runs.reduce((acc, r) => acc + Number(r.output_tokens || 0), 0);
  const avgLatencyMs =
    runs.length > 0 ? Math.round(runs.reduce((acc, r) => acc + Number(r.latency_ms || 0), 0) / runs.length) : null;

  const operationalStatus = deriveAgentOperationalState({
    agentStatus: String(agent.status || 'active'),
    runningRunCount,
    validatingRunCount,
    queuedTaskCount: tasks.filter((t) => t.status === 'queued' || t.status === 'assigned').length,
    waitingApprovalTaskCount: tasks.filter((t) => t.status === 'waiting_for_approval').length,
    waitingInputTaskCount: tasks.filter((t) => t.status === 'waiting_for_input').length,
    recentFailedRunCount: runs[0]?.status === 'failed' ? 1 : 0,
    activeMeetingId: activeMeeting?.id ?? null,
  });

  res.json({
    agent: {
      ...agent,
      operationalStatus,
      activeMeeting: activeMeeting ?? null,
      avatarConfig: parseAvatarConfig(String(agent.avatar_config_json || ''), String(agent.code || agent.id), true),
    },
    tasks,
    runs,
    tools,
    versions,
    usage,
    logs,
    performance: {
      totalRuns: runs.length,
      completedRuns: completedRuns.length,
      failedRuns: failedRuns.length,
      successRatePercent: runs.length > 0 ? Math.round((completedRuns.length / runs.length) * 100) : null,
      avgLatencyMs,
      totalCostUsd,
      totalPromptTokens,
      totalOutputTokens,
      openTasks: tasks.filter((t) => !['completed', 'cancelled'].includes(String(t.status))).length,
    },
  });
});

hqAndMeetingsRouter.patch('/agents/:id/avatar', requirePermission('agents:configure'), (req: AuthedRequest, res) => {
  const schema = z.object({
    avatarConfig: avatarConfigSchema.optional(),
    managerEmployeeId: z.string().nullable().optional(),
    departmentId: z.string().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid agent avatar update.' });
    return;
  }
  const db = getDb();
  const existing = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Agent not found.' });
    return;
  }
  const merged = parsed.data.avatarConfig
    ? JSON.stringify({
        ...parseAvatarConfig(String(existing.avatar_config_json || ''), String(existing.code || existing.id), true),
        ...parsed.data.avatarConfig,
      })
    : String(existing.avatar_config_json || '{}');

  db.prepare(
    `UPDATE agents SET avatar_config_json = ?, manager_employee_id = ?, department_id = ?, updated_at = ? WHERE id = ?`
  ).run(
    merged,
    (parsed.data.managerEmployeeId !== undefined ? parsed.data.managerEmployeeId : (existing.manager_employee_id as string | null)) ?? null,
    (parsed.data.departmentId !== undefined ? parsed.data.departmentId : (existing.department_id as string | null)) ?? null,
    nowIso(),
    req.params.id
  );

  broadcastCompanyEvent(db, {
    eventType: 'agent.updated',
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.fullName,
    departmentId: (parsed.data.departmentId ?? existing.department_id ?? null) as string | null,
    entityType: 'agent',
    entityId: req.params.id,
    summary: `Updated avatar & profile appearance for ${String(existing.name)}`,
  });

  res.json({ agent: db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) });
});

hqAndMeetingsRouter.post('/agents/:id/pause', requirePermission('agents:configure'), (req: AuthedRequest, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Agent not found.' });
    return;
  }
  db.prepare(`UPDATE agents SET status = 'paused', updated_at = ? WHERE id = ?`).run(nowIso(), req.params.id);
  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'agent.paused',
    entityType: 'agent',
    entityId: req.params.id,
  });
  broadcastCompanyEvent(db, {
    eventType: 'agent.paused',
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.fullName,
    departmentId: (existing.department_id as string | null) ?? null,
    entityType: 'agent',
    entityId: req.params.id,
    summary: `${String(existing.name)} paused by ${req.authUser!.fullName}`,
  });
  res.json({ ok: true, status: 'paused' });
});

hqAndMeetingsRouter.post('/agents/:id/resume', requirePermission('agents:configure'), (req: AuthedRequest, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Agent not found.' });
    return;
  }
  db.prepare(`UPDATE agents SET status = 'active', updated_at = ? WHERE id = ?`).run(nowIso(), req.params.id);
  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'agent.resumed',
    entityType: 'agent',
    entityId: req.params.id,
  });
  broadcastCompanyEvent(db, {
    eventType: 'agent.resumed',
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.fullName,
    departmentId: (existing.department_id as string | null) ?? null,
    entityType: 'agent',
    entityId: req.params.id,
    summary: `${String(existing.name)} resumed active duty`,
  });
  res.json({ ok: true, status: 'active' });
});

// ============================================================
// 8. REAL VIRTUAL MEETING SYSTEM
// ============================================================
hqAndMeetingsRouter.get('/meetings', requireAuth, (_req, res) => {
  const db = getDb();
  const rooms = db.prepare('SELECT * FROM meeting_rooms ORDER BY name ASC').all();
  const meetings = db
    .prepare(
      `SELECT m.*, mr.name as room_name, c.name as client_name, p.name as project_name, d.name as department_name,
              (SELECT COUNT(*) FROM meeting_participants mp WHERE mp.meeting_id = m.id) as participant_count,
              (SELECT COUNT(*) FROM meeting_contributions mc WHERE mc.meeting_id = m.id) as contribution_count,
              (SELECT COUNT(*) FROM meeting_decisions md WHERE md.meeting_id = m.id) as decision_count,
              (SELECT COUNT(*) FROM meeting_action_items ma WHERE ma.meeting_id = m.id) as action_item_count
       FROM meetings m
       LEFT JOIN meeting_rooms mr ON mr.id = m.room_id
       LEFT JOIN clients c ON c.id = m.client_id
       LEFT JOIN projects p ON p.id = m.project_id
       LEFT JOIN departments d ON d.id = m.department_id
       ORDER BY CASE m.status WHEN 'active' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END, m.created_at DESC`
    )
    .all();

  res.json({ rooms, meetings });
});

hqAndMeetingsRouter.post('/meetings', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({
    title: z.string().trim().min(2).max(180),
    meetingType: z
      .enum(['executive', 'department', 'project', 'client', 'ai_coordination', 'human_ai_collaboration', 'emergency'])
      .default('human_ai_collaboration'),
    roomId: z.string().nullable().optional(),
    agenda: z.string().trim().max(4000).default(''),
    clientId: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
    departmentId: z.string().nullable().optional(),
    humanParticipantIds: z.array(z.string()).default([]),
    agentParticipantIds: z.array(z.string()).default([]),
    startImmediately: z.boolean().default(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid meeting payload.' });
    return;
  }

  const db = getDb();
  const ts = nowIso();
  const meetingId = generateId('mtg');
  const roomId = parsed.data.roomId || 'room_strategy_war_room';
  const status = parsed.data.startImmediately ? 'active' : 'scheduled';

  db.prepare(
    `INSERT INTO meetings (
      id, organization_id, room_id, title, meeting_type, agenda, client_id, project_id, department_id,
      status, started_at, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    meetingId,
    DEFAULT_ORG_ID,
    roomId,
    parsed.data.title,
    parsed.data.meetingType,
    parsed.data.agenda,
    parsed.data.clientId ?? null,
    parsed.data.projectId ?? null,
    parsed.data.departmentId ?? null,
    status,
    parsed.data.startImmediately ? ts : null,
    req.authUser!.id,
    ts,
    ts
  );

  // Automatically include the creator's employee record if they exist and weren't listed
  const creatorEmp = db
    .prepare('SELECT id, full_name, job_title FROM employees WHERE user_id = ?')
    .get(req.authUser!.id) as { id: string; full_name: string; job_title: string } | undefined;

  const humanIds = new Set<string>(parsed.data.humanParticipantIds);
  if (creatorEmp) humanIds.add(creatorEmp.id);

  let seatIndex = 0;
  const insertPart = db.prepare(
    `INSERT OR IGNORE INTO meeting_participants (
      id, meeting_id, participant_type, participant_id, display_name, role_title, seat_index, joined_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const hId of humanIds) {
    const emp = db
      .prepare('SELECT id, full_name, job_title FROM employees WHERE id = ?')
      .get(hId) as { id: string; full_name: string; job_title: string } | undefined;
    if (emp) {
      insertPart.run(generateId('mpart'), meetingId, 'human', emp.id, emp.full_name, emp.job_title, seatIndex, ts);
      seatIndex += 1;
    }
  }

  for (const aId of new Set(parsed.data.agentParticipantIds)) {
    const ag = db
      .prepare('SELECT id, name, job_title FROM agents WHERE id = ?')
      .get(aId) as { id: string; name: string; job_title: string } | undefined;
    if (ag) {
      insertPart.run(generateId('mpart'), meetingId, 'agent', ag.id, ag.name, ag.job_title, seatIndex, ts);
      seatIndex += 1;
    }
  }

  db.prepare(
    `INSERT INTO meeting_contributions (
      id, meeting_id, participant_type, participant_id, display_name, contribution_kind, content, created_at
    ) VALUES (?, ?, 'coordinator', 'system', 'Meeting System', 'system', ?, ?)`
  ).run(
    generateId('mcon'),
    meetingId,
    `Meeting "${parsed.data.title}" ${status === 'active' ? 'started' : 'scheduled'} by ${req.authUser!.fullName}. Agenda: ${parsed.data.agenda || 'Open operational discussion'}`,
    ts
  );

  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'meeting.created',
    entityType: 'meeting',
    entityId: meetingId,
    metadata: { title: parsed.data.title, status, roomId, participantCount: seatIndex },
  });

  broadcastCompanyEvent(db, {
    eventType: status === 'active' ? 'meeting.started' : 'meeting.scheduled',
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.fullName,
    departmentId: parsed.data.departmentId ?? null,
    entityType: 'meeting',
    entityId: meetingId,
    summary: `${status === 'active' ? 'Started' : 'Scheduled'} virtual meeting "${parsed.data.title}" (${seatIndex} participants)`,
    payload: { meetingId, roomId, status },
  });

  res.status(201).json({ meeting: db.prepare('SELECT * FROM meetings WHERE id = ?').get(meetingId) });
});

hqAndMeetingsRouter.get('/meetings/:id', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const meeting = db
    .prepare(
      `SELECT m.*, mr.name as room_name, mr.code as room_code, mr.capacity as room_capacity,
              c.name as client_name, p.name as project_name, d.name as department_name
       FROM meetings m
       LEFT JOIN meeting_rooms mr ON mr.id = m.room_id
       LEFT JOIN clients c ON c.id = m.client_id
       LEFT JOIN projects p ON p.id = m.project_id
       LEFT JOIN departments d ON d.id = m.department_id
       WHERE m.id = ?`
    )
    .get(req.params.id);

  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found.' });
    return;
  }

  const participants = db
    .prepare('SELECT * FROM meeting_participants WHERE meeting_id = ? ORDER BY seat_index ASC')
    .all(req.params.id);
  const contributions = db
    .prepare('SELECT * FROM meeting_contributions WHERE meeting_id = ? ORDER BY created_at ASC')
    .all(req.params.id);
  const decisions = db
    .prepare('SELECT * FROM meeting_decisions WHERE meeting_id = ? ORDER BY created_at DESC')
    .all(req.params.id);
  const actionItems = db
    .prepare('SELECT * FROM meeting_action_items WHERE meeting_id = ? ORDER BY created_at DESC')
    .all(req.params.id);

  res.json({ meeting, participants, contributions, decisions, actionItems });
});

hqAndMeetingsRouter.patch('/meetings/:id', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({
    status: z.enum(['scheduled', 'active', 'completed', 'cancelled']).optional(),
    agenda: z.string().trim().max(4000).optional(),
    summaryText: z.string().trim().max(8000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid meeting update.' });
    return;
  }
  const db = getDb();
  const existing = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Meeting not found.' });
    return;
  }

  const ts = nowIso();
  const nextStatus = parsed.data.status ?? String(existing.status);
  const startedAt = nextStatus === 'active' && !existing.started_at ? ts : (existing.started_at as string | null);
  const endedAt =
    (nextStatus === 'completed' || nextStatus === 'cancelled') && !existing.ended_at
      ? ts
      : (existing.ended_at as string | null);

  db.prepare(
    `UPDATE meetings SET status = ?, agenda = ?, summary_text = ?, started_at = ?, ended_at = ?, updated_at = ? WHERE id = ?`
  ).run(
    nextStatus,
    String(parsed.data.agenda ?? existing.agenda ?? ''),
    String(parsed.data.summaryText ?? existing.summary_text ?? ''),
    startedAt ?? null,
    endedAt ?? null,
    ts,
    req.params.id
  );

  if (parsed.data.status && parsed.data.status !== existing.status) {
    db.prepare(
      `INSERT INTO meeting_contributions (
        id, meeting_id, participant_type, participant_id, display_name, contribution_kind, content, created_at
      ) VALUES (?, ?, 'coordinator', 'system', 'Meeting System', 'system', ?, ?)`
    ).run(
      generateId('mcon'),
      req.params.id,
      `Meeting status changed to ${nextStatus} by ${req.authUser!.fullName}.`,
      ts
    );

    broadcastCompanyEvent(db, {
      eventType: nextStatus === 'active' ? 'meeting.started' : 'meeting.ended',
      actorType: 'human',
      actorId: req.authUser!.id,
      actorLabel: req.authUser!.fullName,
      departmentId: (existing.department_id as string | null) ?? null,
      entityType: 'meeting',
      entityId: req.params.id,
      summary: `Meeting "${String(existing.title)}" marked ${nextStatus}`,
      payload: { meetingId: req.params.id, status: nextStatus },
    });
  }

  res.json({ meeting: db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id) });
});

hqAndMeetingsRouter.post('/meetings/:id/messages', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({
    content: z.string().trim().min(1, 'Message cannot be empty.').max(4000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid message.' });
    return;
  }

  const db = getDb();
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found.' });
    return;
  }

  const ts = nowIso();
  const id = generateId('mcon');
  db.prepare(
    `INSERT INTO meeting_contributions (
      id, meeting_id, participant_type, participant_id, display_name, contribution_kind, content, created_at
    ) VALUES (?, ?, 'human', ?, ?, 'message', ?, ?)`
  ).run(id, req.params.id, req.authUser!.id, req.authUser!.fullName, parsed.data.content, ts);

  broadcastCompanyEvent(db, {
    eventType: 'meeting.human_message',
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.fullName,
    departmentId: (meeting.department_id as string | null) ?? null,
    entityType: 'meeting',
    entityId: req.params.id,
    summary: `${req.authUser!.fullName} posted in "${String(meeting.title)}"`,
  });

  res.status(201).json({ contribution: db.prepare('SELECT * FROM meeting_contributions WHERE id = ?').get(id) });
});

// Real Multi-Agent Meeting Discussion Orchestration (Zero Simulated Output!)
hqAndMeetingsRouter.post('/meetings/:id/orchestrate', requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({
    topicPrompt: z.string().trim().max(2000).optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid orchestration prompt.' });
    return;
  }

  const db = getDb();
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found.' });
    return;
  }

  const agentParticipants = db
    .prepare(
      `SELECT mp.participant_id, a.*
       FROM meeting_participants mp
       INNER JOIN agents a ON a.id = mp.participant_id
       WHERE mp.meeting_id = ? AND mp.participant_type = 'agent' AND a.status = 'active'
       ORDER BY mp.seat_index ASC`
    )
    .all(req.params.id) as Array<Record<string, unknown>>;

  if (agentParticipants.length === 0) {
    res.status(400).json({
      error: 'No active AI agents are assigned to this meeting. Add at least one active AI agent to run multi-agent orchestration.',
    });
    return;
  }

  const recentTranscript = db
    .prepare(
      `SELECT display_name, participant_type, contribution_kind, content
       FROM meeting_contributions
       WHERE meeting_id = ?
       ORDER BY created_at ASC LIMIT 25`
    )
    .all(req.params.id) as Array<Record<string, string>>;

  let clientContext = '';
  if (meeting.client_id) {
    const client = db.prepare('SELECT name, industry, service_package, notes FROM clients WHERE id = ?').get(String(meeting.client_id));
    if (client) {
      clientContext = wrapUntrustedContentForAgent('client_context', JSON.stringify(client));
    }
  }

  const topic =
    parsed.data.topicPrompt ||
    String(meeting.agenda || '') ||
    `Operational alignment for meeting "${String(meeting.title)}"`;

  const producedContributions: Array<Record<string, unknown>> = [];
  const transcriptLines = recentTranscript.map(
    (m) => `[${m.participant_type.toUpperCase()} - ${m.display_name}]: ${m.content}`
  );

  for (const agent of agentParticipants) {
    const prompt = [
      `Meeting Title: ${String(meeting.title)}`,
      `Meeting Type: ${String(meeting.meeting_type)}`,
      `Current Discussion Topic / Agenda: ${topic}`,
      clientContext,
      transcriptLines.length > 0
        ? `Prior Meeting Transcript:\n${wrapUntrustedContentForAgent('meeting_transcript', transcriptLines.join('\n'))}`
        : '',
      'Respond from your specific specialist role. Provide: 1) concise domain recommendation, 2) risks or disagreements with prior points if any, and 3) concrete next step. Return JSON with keys: contribution (string), risksOrDisagreements (string[]), proposedActions (string[]).',
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      const result = await generateStructuredText({
        provider: String(agent.model_provider || 'google_gemini'),
        model: String(agent.model_identifier || 'gemini-4-hydrogen'),
        systemInstruction: String(agent.system_instructions),
        prompt,
        expectJson: true,
        timeoutSeconds: Number(agent.timeout_seconds || 45),
      });

      const ts = nowIso();
      const parsedOut = result.parsedJson as {
        contribution?: string;
        risksOrDisagreements?: string[];
        proposedActions?: string[];
      } | null;

      const contributionText = parsedOut?.contribution || result.text;
      const contribId = generateId('mcon');
      db.prepare(
        `INSERT INTO meeting_contributions (
          id, meeting_id, participant_type, participant_id, display_name, contribution_kind,
          content, structured_json, model_identifier, cost_usd, created_at
        ) VALUES (?, ?, 'agent', ?, ?, 'ai_contribution', ?, ?, ?, ?, ?)`
      ).run(
        contribId,
        req.params.id,
        String(agent.id),
        String(agent.name),
        contributionText,
        JSON.stringify(parsedOut ?? {}),
        result.model,
        result.costUsd,
        ts
      );

      db.prepare(
        `INSERT INTO usage_records (
          id, organization_id, client_id, project_id, agent_id, provider, model, modality,
          prompt_tokens, output_tokens, cost_usd, rate_card_found, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'text', ?, ?, ?, ?, ?)`
      ).run(
        generateId('usg'),
        DEFAULT_ORG_ID,
        (meeting.client_id as string | null) ?? null,
        (meeting.project_id as string | null) ?? null,
        String(agent.id),
        result.provider,
        result.model,
        result.promptTokens,
        result.outputTokens,
        result.costUsd,
        result.rateCardFound ? 1 : 0,
        ts
      );

      transcriptLines.push(`[AGENT - ${String(agent.name)}]: ${contributionText}`);
      const saved = db.prepare('SELECT * FROM meeting_contributions WHERE id = ?').get(contribId) as Record<
        string,
        unknown
      >;
      producedContributions.push(saved);

      broadcastCompanyEvent(db, {
        eventType: 'meeting.ai_contribution',
        actorType: 'agent',
        actorId: String(agent.id),
        actorLabel: String(agent.name),
        departmentId: (agent.department_id as string | null) ?? null,
        entityType: 'meeting',
        entityId: req.params.id,
        summary: `${String(agent.name)} contributed to "${String(meeting.title)}"`,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const ts = nowIso();
      db.prepare(
        `INSERT INTO meeting_contributions (
          id, meeting_id, participant_type, participant_id, display_name, contribution_kind, content, created_at
        ) VALUES (?, ?, 'coordinator', 'system', 'AI Orchestrator', 'system', ?, ?)`
      ).run(
        generateId('mcon'),
        req.params.id,
        `AI discussion halted for ${String(agent.name)}: ${errMsg}`,
        ts
      );
      res.status(503).json({
        error: `Real AI meeting orchestration failed for ${String(agent.name)}: ${errMsg}`,
        partialContributions: producedContributions,
      });
      return;
    }
  }

  // Synthesize Coordinator Summary via real Gemini call
  try {
    const coordResult = await generateStructuredText({
      provider: 'google_gemini',
      model: 'gemini-4-hydrogen',
      systemInstruction:
        'You are the Agency Meeting Coordinator. Summarize the real discussion objectively: key alignment points, explicit disagreements/risks, and recommended human decisions. Never fabricate facts.',
      prompt: `Summarize this agency meeting transcript for "${String(meeting.title)}":\n\n${transcriptLines.join('\n')}`,
      expectJson: false,
      timeoutSeconds: 45,
    });
    const ts = nowIso();
    const sumId = generateId('mcon');
    db.prepare(
      `INSERT INTO meeting_contributions (
        id, meeting_id, participant_type, participant_id, display_name, contribution_kind,
        content, model_identifier, cost_usd, created_at
      ) VALUES (?, ?, 'coordinator', 'ai_coordinator', 'AI Meeting Coordinator', 'summary', ?, ?, ?, ?)`
    ).run(sumId, req.params.id, coordResult.text, coordResult.model, coordResult.costUsd, ts);

    db.prepare('UPDATE meetings SET summary_text = ?, updated_at = ? WHERE id = ?').run(
      coordResult.text,
      ts,
      req.params.id
    );
    producedContributions.push(
      db.prepare('SELECT * FROM meeting_contributions WHERE id = ?').get(sumId) as Record<string, unknown>
    );
  } catch {
    // Individual agent contributions already succeeded and were saved
  }

  res.json({ ok: true, contributions: producedContributions });
});

hqAndMeetingsRouter.post('/meetings/:id/decisions', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({
    title: z.string().trim().min(2).max(200),
    rationale: z.string().trim().max(2000).default(''),
    ownerLabel: z.string().trim().max(120).default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid decision.' });
    return;
  }
  const db = getDb();
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found.' });
    return;
  }
  const id = generateId('mdec');
  const ts = nowIso();
  db.prepare(
    `INSERT INTO meeting_decisions (id, meeting_id, title, rationale, owner_label, recorded_by_user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, req.params.id, parsed.data.title, parsed.data.rationale, parsed.data.ownerLabel || req.authUser!.fullName, req.authUser!.id, ts);

  writeAuditLog({
    db,
    correlationId: req.correlationId,
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.email,
    action: 'meeting.decision_recorded',
    entityType: 'meeting_decision',
    entityId: id,
    metadata: { meetingId: req.params.id, title: parsed.data.title },
  });

  broadcastCompanyEvent(db, {
    eventType: 'meeting.decision_recorded',
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.fullName,
    departmentId: (meeting.department_id as string | null) ?? null,
    entityType: 'meeting',
    entityId: req.params.id,
    summary: `Decision recorded in "${String(meeting.title)}": ${parsed.data.title}`,
  });

  res.status(201).json({ decision: db.prepare('SELECT * FROM meeting_decisions WHERE id = ?').get(id) });
});

hqAndMeetingsRouter.post('/meetings/:id/action-items', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(2000).default(''),
    assigneeType: z.enum(['human', 'agent']).default('agent'),
    assigneeId: z.string().nullable().optional(),
    assigneeLabel: z.string().trim().max(120).default(''),
    dueDate: z.string().nullable().optional(),
    convertToTask: z.boolean().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid action item.' });
    return;
  }

  const db = getDb();
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found.' });
    return;
  }

  const ts = nowIso();
  const itemId = generateId('mact');
  let linkedTaskId: string | null = null;
  let itemStatus: 'open' | 'converted' = 'open';

  if (parsed.data.convertToTask) {
    linkedTaskId = generateId('tsk');
    itemStatus = 'converted';
    const assignedUserId =
      parsed.data.assigneeType === 'human' && parsed.data.assigneeId
        ? ((
            db
              .prepare('SELECT user_id FROM employees WHERE id = ?')
              .get(parsed.data.assigneeId) as { user_id: string | null } | undefined
          )?.user_id ?? null)
        : null;
    const assignedAgentId =
      parsed.data.assigneeType === 'agent' && parsed.data.assigneeId ? parsed.data.assigneeId : null;

    db.prepare(
      `INSERT INTO tasks (
        id, organization_id, title, description, task_type, client_id, project_id, department_id,
        assigned_user_id, assigned_agent_id, priority, due_date, requires_approval, status,
        created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'meeting_action', ?, ?, ?, ?, ?, 'medium', ?, 1, 'queued', ?, ?, ?)`
    ).run(
      linkedTaskId,
      DEFAULT_ORG_ID,
      parsed.data.title,
      `${parsed.data.description}\n\n[Origin: Virtual Meeting "${String(meeting.title)}"]`.trim(),
      (meeting.client_id as string | null) ?? null,
      (meeting.project_id as string | null) ?? null,
      (meeting.department_id as string | null) ?? null,
      assignedUserId,
      assignedAgentId,
      parsed.data.dueDate ?? null,
      req.authUser!.id,
      ts,
      ts
    );
  }

  db.prepare(
    `INSERT INTO meeting_action_items (
      id, meeting_id, title, description, assignee_type, assignee_id, assignee_label,
      due_date, status, linked_task_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    itemId,
    req.params.id,
    parsed.data.title,
    parsed.data.description,
    parsed.data.assigneeType,
    parsed.data.assigneeId ?? null,
    parsed.data.assigneeLabel || 'Unassigned',
    parsed.data.dueDate ?? null,
    itemStatus,
    linkedTaskId,
    ts
  );

  broadcastCompanyEvent(db, {
    eventType: linkedTaskId ? 'meeting.task_created' : 'meeting.action_recorded',
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.fullName,
    departmentId: (meeting.department_id as string | null) ?? null,
    entityType: linkedTaskId ? 'task' : 'meeting',
    entityId: linkedTaskId ?? req.params.id,
    summary: linkedTaskId
      ? `Converted meeting action "${parsed.data.title}" into operational task`
      : `Added action item "${parsed.data.title}" in "${String(meeting.title)}"`,
  });

  res.status(201).json({
    actionItem: db.prepare('SELECT * FROM meeting_action_items WHERE id = ?').get(itemId),
    linkedTaskId,
  });
});

hqAndMeetingsRouter.post('/meetings/:id/action-items/:itemId/convert', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  const item = db
    .prepare('SELECT * FROM meeting_action_items WHERE id = ? AND meeting_id = ?')
    .get(req.params.itemId, req.params.id) as Record<string, unknown> | undefined;

  if (!meeting || !item) {
    res.status(404).json({ error: 'Meeting action item not found.' });
    return;
  }
  if (item.linked_task_id) {
    res.json({ actionItem: item, linkedTaskId: item.linked_task_id });
    return;
  }

  const ts = nowIso();
  const taskId = generateId('tsk');
  const assignedUserId =
    item.assignee_type === 'human' && item.assignee_id
      ? ((
          db
            .prepare('SELECT user_id FROM employees WHERE id = ?')
            .get(String(item.assignee_id)) as { user_id: string | null } | undefined
        )?.user_id ?? null)
      : null;
  const assignedAgentId = item.assignee_type === 'agent' && item.assignee_id ? String(item.assignee_id) : null;

  db.prepare(
    `INSERT INTO tasks (
      id, organization_id, title, description, task_type, client_id, project_id, department_id,
      assigned_user_id, assigned_agent_id, priority, due_date, requires_approval, status,
      created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'meeting_action', ?, ?, ?, ?, ?, 'medium', ?, 1, 'queued', ?, ?, ?)`
  ).run(
    taskId,
    DEFAULT_ORG_ID,
    String(item.title),
    `${String(item.description || '')}\n\n[Converted from Virtual Meeting "${String(meeting.title)}"]`.trim(),
    (meeting.client_id as string | null) ?? null,
    (meeting.project_id as string | null) ?? null,
    (meeting.department_id as string | null) ?? null,
    assignedUserId,
    assignedAgentId,
    (item.due_date as string | null) ?? null,
    req.authUser!.id,
    ts,
    ts
  );

  db.prepare(`UPDATE meeting_action_items SET status = 'converted', linked_task_id = ? WHERE id = ?`).run(
    taskId,
    req.params.itemId
  );

  broadcastCompanyEvent(db, {
    eventType: 'meeting.task_created',
    actorType: 'human',
    actorId: req.authUser!.id,
    actorLabel: req.authUser!.fullName,
    departmentId: (meeting.department_id as string | null) ?? null,
    entityType: 'task',
    entityId: taskId,
    summary: `Converted "${String(item.title)}" into operational task`,
  });

  res.status(201).json({
    actionItem: db.prepare('SELECT * FROM meeting_action_items WHERE id = ?').get(req.params.itemId),
    linkedTaskId: taskId,
  });
});
