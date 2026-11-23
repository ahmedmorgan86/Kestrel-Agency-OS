import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrgChartHierarchy,
  computeActorWorldPosition,
  computeHqFloorPlan,
  deriveAgentOperationalState,
  deriveHumanOperationalState,
  parseAvatarConfig,
} from '../src/domain/hq';
import { closeDatabase, initDatabase, nowIso } from '../server/db/database';
import { runMigrations } from '../server/db/migrations';
import { DEFAULT_ORG_ID, seedSystemConfiguration } from '../server/db/seed';
import { broadcastCompanyEvent } from '../server/services/realtime';
import { generateId } from '../server/services/security';

test('deriveAgentOperationalState strictly reflects real backend execution states without fake activity', () => {
  const base = {
    agentStatus: 'active',
    runningRunCount: 0,
    validatingRunCount: 0,
    queuedTaskCount: 0,
    waitingApprovalTaskCount: 0,
    waitingInputTaskCount: 0,
    recentFailedRunCount: 0,
    activeMeetingId: null as string | null,
  };

  assert.equal(deriveAgentOperationalState(base), 'idle');
  assert.equal(deriveAgentOperationalState({ ...base, agentStatus: 'disabled' }), 'disabled');
  assert.equal(deriveAgentOperationalState({ ...base, agentStatus: 'paused', runningRunCount: 2 }), 'paused');
  assert.equal(deriveAgentOperationalState({ ...base, activeMeetingId: 'mtg_1', runningRunCount: 1 }), 'in_meeting');
  assert.equal(deriveAgentOperationalState({ ...base, runningRunCount: 1 }), 'working');
  assert.equal(deriveAgentOperationalState({ ...base, validatingRunCount: 1 }), 'validating');
  assert.equal(deriveAgentOperationalState({ ...base, waitingApprovalTaskCount: 2 }), 'waiting_for_approval');
  assert.equal(deriveAgentOperationalState({ ...base, waitingInputTaskCount: 1 }), 'waiting_for_input');
  assert.equal(deriveAgentOperationalState({ ...base, queuedTaskCount: 3 }), 'queued');
  assert.equal(deriveAgentOperationalState({ ...base, recentFailedRunCount: 1 }), 'failed');
});

test('deriveHumanOperationalState reflects real employment, meeting, and task states', () => {
  assert.equal(
    deriveHumanOperationalState({ employmentStatus: 'active', activeMeetingId: null, runningTaskCount: 0 }),
    'idle'
  );
  assert.equal(
    deriveHumanOperationalState({ employmentStatus: 'active', activeMeetingId: 'mtg_9', runningTaskCount: 0 }),
    'in_meeting'
  );
  assert.equal(
    deriveHumanOperationalState({ employmentStatus: 'active', activeMeetingId: null, runningTaskCount: 2 }),
    'working'
  );
  assert.equal(
    deriveHumanOperationalState({ employmentStatus: 'active', activeMeetingId: null, runningTaskCount: 0, waitingApprovalTaskCount: 1 }),
    'waiting_for_approval'
  );
  assert.equal(
    deriveHumanOperationalState({ employmentStatus: 'on_leave', activeMeetingId: 'mtg_9', runningTaskCount: 1 }),
    'paused'
  );
  assert.equal(
    deriveHumanOperationalState({ employmentStatus: 'offboarded', activeMeetingId: null, runningTaskCount: 0 }),
    'disabled'
  );
});

test('parseAvatarConfig sanitizes malformed JSON and invalid colors', () => {
  const fallback = parseAvatarConfig('{broken json', 'agent_1', true);
  assert.match(fallback.accentColor, /^#[0-9a-fA-F]{6}$/);
  assert.equal(fallback.headStyle, 'visor');

  const valid = parseAvatarConfig(
    JSON.stringify({ accentColor: '#059669', bodyColor: '#0f172a', headStyle: 'halo', accessory: 'headset' }),
    'agent_1',
    true
  );
  assert.equal(valid.accentColor, '#059669');
  assert.equal(valid.headStyle, 'halo');
  assert.equal(valid.accessory, 'headset');

  const badColor = parseAvatarConfig(
    JSON.stringify({ accentColor: 'javascript:alert(1)', headStyle: 'invalid' }),
    'emp_1',
    false
  );
  assert.match(badColor.accentColor, /^#[0-9a-fA-F]{6}$/);
  assert.equal(badColor.headStyle, 'classic');
});

test('computeHqFloorPlan and computeActorWorldPosition place actors in workstations or active meeting seats', () => {
  const zones = computeHqFloorPlan(
    [
      { id: 'dept_exec', code: 'executive', name: 'Executive Management', color_hex: '#1d4ed8' },
      { id: 'dept_copy', code: 'content_copywriting', name: 'Content & Copywriting', color_hex: '#7c3aed' },
    ],
    [{ id: 'room_board', code: 'exec_boardroom', name: 'Executive Boardroom', capacity: 6 }]
  );

  assert.equal(zones.length, 6); // Reception + 2 departments + meeting room + break and approval waiting areas
  const boardroom = zones.find((z) => z.id === 'room_board');
  assert.ok(boardroom);
  assert.equal(boardroom.workstations.length, 6);

  const deskPos = computeActorWorldPosition(
    { id: 'agent_1', departmentId: 'dept_copy', slotIndexInDept: 0, activeMeetingRoomId: null, meetingSeatIndex: 0 },
    zones
  );
  assert.equal(deskPos.zoneId, 'dept_copy');

  const meetingPos = computeActorWorldPosition(
    { id: 'agent_1', departmentId: 'dept_copy', slotIndexInDept: 0, activeMeetingRoomId: 'room_board', meetingSeatIndex: 2 },
    zones
  );
  assert.equal(meetingPos.zoneId, 'room_board');
  assert.equal(meetingPos.stationCode, 'EXEC_BOARDROOM-S3');

  const breakArea = zones.find((zone) => zone.kind === 'break_area');
  const approvalWaiting = zones.find((zone) => zone.kind === 'approval_waiting');
  assert.ok(breakArea && approvalWaiting);
  assert.equal(breakArea.name, 'استراحة الفريق');
  const waitingPosition = computeActorWorldPosition(
    { id: 'employee_1', departmentId: 'dept_copy', slotIndexInDept: 1, activeMeetingRoomId: null, meetingSeatIndex: 0, operationalStatus: 'waiting_for_approval' },
    zones
  );
  assert.equal(waitingPosition.zoneId, approvalWaiting.id);
  assert.match(waitingPosition.stationCode, /^APPROVAL_WAITING-WS/);
});

test('buildOrgChartHierarchy groups executives, department managers, human staff, and AI agents', () => {
  const tree = buildOrgChartHierarchy(
    [
      { id: 'dept_exec', code: 'executive', name: 'Executive', description: 'Leadership', lead_employee_id: 'emp_ceo' },
      { id: 'dept_copy', code: 'content_copywriting', name: 'Copywriting', description: 'Copy', lead_employee_id: 'emp_mgr' },
    ],
    [
      {
        id: 'emp_ceo',
        actorType: 'human',
        name: 'Elena Vance',
        jobTitle: 'CEO & Founder',
        departmentId: 'dept_exec',
        managerEmployeeId: null,
        status: 'active',
        operationalStatus: 'idle',
        openTasks: 1,
      },
      {
        id: 'emp_mgr',
        actorType: 'human',
        name: 'Marcus Chen',
        jobTitle: 'Head of Content',
        departmentId: 'dept_copy',
        managerEmployeeId: 'emp_ceo',
        status: 'active',
        operationalStatus: 'working',
        openTasks: 2,
      },
    ],
    [
      {
        id: 'agent_copy',
        actorType: 'agent',
        name: 'Copywriter Agent',
        jobTitle: 'Senior Social Copywriter',
        departmentId: 'dept_copy',
        managerEmployeeId: 'emp_mgr',
        status: 'active',
        operationalStatus: 'idle',
        openTasks: 3,
        modelIdentifier: 'gemini-4-hydrogen',
      },
    ]
  );

  assert.equal(tree.executives.length, 1);
  assert.equal(tree.executives[0].id, 'emp_ceo');
  const copyBranch = tree.departments.find((d) => d.id === 'dept_copy');
  assert.ok(copyBranch);
  assert.equal(copyBranch.manager?.id, 'emp_mgr');
  assert.equal(copyBranch.agents.length, 1);
  assert.equal(copyBranch.totalOpenTasks, 5);
});

test('Migration 002, brand identity persistence, virtual meetings, action-item conversion, and realtime events', () => {
  const db = initDatabase(':memory:');
  const { applied } = runMigrations(db);
  assert.ok(applied.includes('001_initial_agency_os_schema'));
  assert.ok(applied.includes('002_company_hq_identity_avatars_meetings'));

  // Re-running migrations must be idempotent
  const secondRun = runMigrations(db);
  assert.equal(secondRun.applied.length, 0);

  seedSystemConfiguration(db);

  // Verify brand identity update persists
  db.prepare(
    `UPDATE organizations SET name = ?, tagline = ?, brand_symbol = ?, brand_primary_color = ? WHERE id = ?`
  ).run('Vanguard Social Lab', 'Precision AI Agency', 'prism', '#0f766e', DEFAULT_ORG_ID);
  const org = db
    .prepare(`SELECT name, tagline, brand_symbol, brand_primary_color FROM organizations WHERE id = ?`)
    .get(DEFAULT_ORG_ID) as Record<string, string>;
  assert.equal(org.name, 'Vanguard Social Lab');
  assert.equal(org.brand_symbol, 'prism');
  assert.equal(org.brand_primary_color, '#0f766e');

  // Verify zero fabricated meetings in seed
  const initialMeetings = (db.prepare('SELECT COUNT(*) as c FROM meetings').get() as { c: number }).c;
  assert.equal(initialMeetings, 0);

  // Create a real meeting, participant, contribution, decision, and convert action item to task
  const now = nowIso();
  const mtgId = generateId('mtg');
  db.prepare(
    `INSERT INTO meetings (
      id, organization_id, room_id, title, meeting_type, agenda, status, started_at, created_at, updated_at
    ) VALUES (?, ?, 'room_strategy_war_room', 'Q4 Campaign Alignment', 'human_ai_collaboration', 'Align creative calendar', 'active', ?, ?, ?)`
  ).run(mtgId, DEFAULT_ORG_ID, now, now, now);

  db.prepare(
    `INSERT INTO meeting_participants (
      id, meeting_id, participant_type, participant_id, display_name, role_title, seat_index, joined_at
    ) VALUES (?, ?, 'agent', 'agent_copywriter_agent', 'Copywriter Agent', 'Senior Copywriter', 0, ?)`
  ).run(generateId('mpart'), mtgId, now);

  db.prepare(
    `INSERT INTO meeting_decisions (id, meeting_id, title, rationale, owner_label, created_at)
     VALUES (?, ?, 'Approve Reels cadence at 4/week', 'Matches client brief', 'Operations Admin', ?)`
  ).run(generateId('mdec'), mtgId, now);

  const actionId = generateId('mact');
  db.prepare(
    `INSERT INTO meeting_action_items (
      id, meeting_id, title, description, assignee_type, assignee_id, assignee_label, status, created_at
    ) VALUES (?, ?, 'Draft 4 Reels hooks', 'For Q4 launch', 'agent', 'agent_copywriter_agent', 'Copywriter Agent', 'open', ?)`
  ).run(actionId, mtgId, now);

  const taskId = generateId('tsk');
  db.prepare(
    `INSERT INTO tasks (
      id, organization_id, title, task_type, assigned_agent_id, priority, status, requires_approval, created_at, updated_at
    ) VALUES (?, ?, 'Draft 4 Reels hooks', 'meeting_action', 'agent_copywriter_agent', 'high', 'assigned', 1, ?, ?)`
  ).run(taskId, DEFAULT_ORG_ID, now, now);
  db.prepare(`UPDATE meeting_action_items SET linked_task_id = ?, status = 'converted' WHERE id = ?`).run(
    taskId,
    actionId
  );

  const converted = db
    .prepare(`SELECT status, linked_task_id FROM meeting_action_items WHERE id = ?`)
    .get(actionId) as {
    status: string;
    linked_task_id: string;
  };
  assert.equal(converted.status, 'converted');
  assert.equal(converted.linked_task_id, taskId);

  // Realtime event persistence
  const ev = broadcastCompanyEvent(db, {
    eventType: 'meeting.started',
    actorType: 'system',
    actorId: 'test_runner',
    actorLabel: 'Test Runner',
    entityType: 'meeting',
    entityId: mtgId,
    summary: 'Started Q4 Campaign Alignment',
  });
  const storedEv = db.prepare(`SELECT event_type, summary FROM company_events WHERE id = ?`).get(ev.id) as {
    event_type: string;
    summary: string;
  };
  assert.equal(storedEv.event_type, 'meeting.started');

  closeDatabase();
});
