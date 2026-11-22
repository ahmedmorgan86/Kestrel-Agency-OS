export type OperationalStatus =
  | 'idle'
  | 'queued'
  | 'working'
  | 'in_meeting'
  | 'waiting_for_approval'
  | 'waiting_for_input'
  | 'validating'
  | 'failed'
  | 'paused'
  | 'disabled'
  | 'completed';

export interface AvatarConfig {
  accentColor: string;
  bodyColor: string;
  headStyle: 'classic' | 'visor' | 'halo' | 'studio';
  accessory: 'none' | 'headset' | 'badge' | 'tablet';
}

export interface ZoneRect {
  id: string;
  code: string;
  name: string;
  kind: 'reception' | 'executive' | 'department' | 'meeting_room';
  x: number;
  z: number;
  width: number;
  depth: number;
  colorHex: string;
  workstations: Array<{ code: string; x: number; z: number; rotY: number }>;
}

export interface HqDepartmentInput {
  id: string;
  code: string;
  name: string;
  color_hex?: string | null;
  status?: string | null;
}

export interface HqMeetingRoomInput {
  id: string;
  code: string;
  name: string;
  capacity?: number | null;
  color_hex?: string | null;
}

export interface AgentOperationalInput {
  agentStatus: string;
  runningRunCount: number;
  validatingRunCount: number;
  queuedTaskCount: number;
  waitingApprovalTaskCount: number;
  waitingInputTaskCount: number;
  recentFailedRunCount: number;
  activeMeetingId: string | null;
}

export interface HumanOperationalInput {
  employmentStatus: string;
  activeMeetingId: string | null;
  runningTaskCount: number;
}

export function deriveAgentOperationalState(input: AgentOperationalInput): OperationalStatus {
  if (input.agentStatus === 'disabled') return 'disabled';
  if (input.agentStatus === 'paused') return 'paused';
  if (input.activeMeetingId) return 'in_meeting';
  if (input.runningRunCount > 0) return 'working';
  if (input.validatingRunCount > 0) return 'validating';
  if (input.waitingApprovalTaskCount > 0) return 'waiting_for_approval';
  if (input.waitingInputTaskCount > 0) return 'waiting_for_input';
  if (input.queuedTaskCount > 0) return 'queued';
  if (input.recentFailedRunCount > 0) return 'failed';
  return 'idle';
}

export function deriveHumanOperationalState(input: HumanOperationalInput): OperationalStatus {
  if (input.employmentStatus === 'offboarded' || input.employmentStatus === 'suspended') {
    return 'disabled';
  }
  if (input.employmentStatus === 'on_leave' || input.employmentStatus === 'inactive') {
    return 'paused';
  }
  if (input.activeMeetingId) return 'in_meeting';
  if (input.runningTaskCount > 0) return 'working';
  return 'idle';
}

const DEFAULT_AI_PALETTE = [
  '#2563eb',
  '#0891b2',
  '#7c3aed',
  '#0d9488',
  '#d97706',
  '#4f46e5',
  '#0284c7',
];

const DEFAULT_HUMAN_PALETTE = ['#334155', '#1e40af', '#0f766e', '#9a3412', '#475569'];

export function parseAvatarConfig(
  rawJson: string | null | undefined,
  seedKey: string,
  isAi: boolean
): AvatarConfig {
  let hash = 0;
  for (let i = 0; i < seedKey.length; i += 1) {
    hash = (hash * 31 + seedKey.charCodeAt(i)) >>> 0;
  }
  const palette = isAi ? DEFAULT_AI_PALETTE : DEFAULT_HUMAN_PALETTE;
  const fallback: AvatarConfig = {
    accentColor: palette[hash % palette.length],
    bodyColor: isAi ? '#1e293b' : '#334155',
    headStyle: isAi ? 'visor' : 'classic',
    accessory: isAi ? 'badge' : 'none',
  };

  if (!rawJson) return fallback;
  try {
    const parsed = JSON.parse(rawJson) as Partial<AvatarConfig>;
    return {
      accentColor:
        typeof parsed.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.accentColor)
          ? parsed.accentColor
          : fallback.accentColor,
      bodyColor:
        typeof parsed.bodyColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.bodyColor)
          ? parsed.bodyColor
          : fallback.bodyColor,
      headStyle:
        parsed.headStyle && ['classic', 'visor', 'halo', 'studio'].includes(parsed.headStyle)
          ? parsed.headStyle
          : fallback.headStyle,
      accessory:
        parsed.accessory && ['none', 'headset', 'badge', 'tablet'].includes(parsed.accessory)
          ? parsed.accessory
          : fallback.accessory,
    };
  } catch {
    return fallback;
  }
}

const DEPARTMENT_ZONE_SLOTS: Record<
  string,
  { x: number; z: number; width: number; depth: number; color: string; kind?: ZoneRect['kind'] }
> = {
  executive: { x: 0, z: -15, width: 14, depth: 7, color: '#1d4ed8', kind: 'executive' },
  strategy_research: { x: -16, z: -6, width: 9, depth: 7, color: '#0891b2' },
  social_media_mgmt: { x: -6, z: -6, width: 9, depth: 7, color: '#2563eb' },
  content_planning: { x: 6, z: -6, width: 9, depth: 7, color: '#4f46e5' },
  content_copywriting: { x: 16, z: -6, width: 9, depth: 7, color: '#7c3aed' },
  creative_direction: { x: -16, z: 3, width: 9, depth: 7, color: '#db2777' },
  graphic_design: { x: -6, z: 3, width: 9, depth: 7, color: '#e11d48' },
  video_production: { x: 6, z: 3, width: 9, depth: 7, color: '#ea580c' },
  quality_assurance: { x: 16, z: 3, width: 9, depth: 7, color: '#0d9488' },
  publishing_distribution: { x: -16, z: 12, width: 9, depth: 7, color: '#059669' },
  analytics_reporting: { x: -6, z: 12, width: 9, depth: 7, color: '#0284c7' },
  client_success: { x: 6, z: 12, width: 9, depth: 7, color: '#65a30d' },
  finance_operations: { x: 16, z: 12, width: 9, depth: 7, color: '#ca8a04' },
};

const MEETING_ROOM_SLOTS: Array<{ x: number; z: number; width: number; depth: number; color: string }> = [
  { x: -15, z: -15, width: 9, depth: 7, color: '#334155' },
  { x: 15, z: -15, width: 9, depth: 7, color: '#1e3a8a' },
  { x: -14, z: 21, width: 10, depth: 6.5, color: '#0f766e' },
  { x: 14, z: 21, width: 10, depth: 6.5, color: '#4338ca' },
];

function buildWorkstationsForZone(
  zoneCode: string,
  cx: number,
  cz: number,
  width: number,
  depth: number,
  count = 4
): Array<{ code: string; x: number; z: number; rotY: number }> {
  const stations: Array<{ code: string; x: number; z: number; rotY: number }> = [];
  const cols = 2;
  const rows = Math.max(1, Math.ceil(count / cols));
  const xSpan = Math.max(2.6, width * 0.56);
  const zSpan = Math.max(2.2, depth * 0.48);

  for (let i = 0; i < count; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const xOffset = (col - 0.5) * xSpan;
    const zOffset = rows === 1 ? 0 : (row - (rows - 1) / 2) * zSpan;
    stations.push({
      code: `${zoneCode.toUpperCase()}-WS${i + 1}`,
      x: Number((cx + xOffset).toFixed(2)),
      z: Number((cz + zOffset).toFixed(2)),
      rotY: row % 2 === 0 ? 0 : Math.PI,
    });
  }
  return stations;
}

export function computeHqFloorPlan(
  departments: HqDepartmentInput[],
  meetingRooms: HqMeetingRoomInput[]
): ZoneRect[] {
  const zones: ZoneRect[] = [
    {
      id: 'zone_reception',
      code: 'reception',
      name: 'Reception & Brand Lobby',
      kind: 'reception',
      x: 0,
      z: 21,
      width: 12,
      depth: 6.5,
      colorHex: '#0f172a',
      workstations: [{ code: 'RECEPTION-DESK', x: 0, z: 20.4, rotY: 0 }],
    },
  ];

  let extraIndex = 0;
  for (const dept of departments) {
    const preset = DEPARTMENT_ZONE_SLOTS[dept.code];
    let slot: { x: number; z: number; width: number; depth: number; color: string; kind?: ZoneRect['kind'] };
    if (preset) {
      slot = preset;
    } else {
      const col = extraIndex % 4;
      const row = Math.floor(extraIndex / 4);
      slot = {
        x: -15 + col * 10,
        z: 29 + row * 8,
        width: 8.8,
        depth: 6.6,
        color: '#475569',
      };
      extraIndex += 1;
    }

    const colorHex = dept.color_hex && /^#[0-9a-fA-F]{6}$/.test(dept.color_hex) ? dept.color_hex : slot.color;
    zones.push({
      id: dept.id,
      code: dept.code,
      name: dept.name,
      kind: slot.kind ?? 'department',
      x: slot.x,
      z: slot.z,
      width: slot.width,
      depth: slot.depth,
      colorHex,
      workstations: buildWorkstationsForZone(dept.code, slot.x, slot.z, slot.width, slot.depth, 4),
    });
  }

  meetingRooms.forEach((room, idx) => {
    const slot = MEETING_ROOM_SLOTS[idx] ?? {
      x: -14 + (idx % 3) * 14,
      z: -24,
      width: 9,
      depth: 6.5,
      color: '#334155',
    };
    const seats: Array<{ code: string; x: number; z: number; rotY: number }> = [];
    const seatCount = Math.min(8, Math.max(4, Number(room.capacity || 6)));
    const radiusX = 2.1;
    const radiusZ = 1.45;
    for (let s = 0; s < seatCount; s += 1) {
      const angle = (s / seatCount) * Math.PI * 2;
      seats.push({
        code: `${room.code.toUpperCase()}-S${s + 1}`,
        x: Number((slot.x + Math.cos(angle) * radiusX).toFixed(2)),
        z: Number((slot.z + Math.sin(angle) * radiusZ).toFixed(2)),
        rotY: Number((Math.atan2(-Math.cos(angle), -Math.sin(angle))).toFixed(3)),
      });
    }
    zones.push({
      id: room.id,
      code: room.code,
      name: room.name,
      kind: 'meeting_room',
      x: slot.x,
      z: slot.z,
      width: slot.width,
      depth: slot.depth,
      colorHex: room.color_hex && /^#[0-9a-fA-F]{6}$/.test(room.color_hex) ? room.color_hex : slot.color,
      workstations: seats,
    });
  });

  return zones;
}

export interface ActorPlacementInput {
  id: string;
  departmentId: string | null;
  slotIndexInDept: number;
  activeMeetingRoomId: string | null;
  meetingSeatIndex: number;
}

export function computeActorWorldPosition(
  actor: ActorPlacementInput,
  zones: ZoneRect[]
): { x: number; y: number; z: number; rotY: number; zoneId: string; stationCode: string } {
  if (actor.activeMeetingRoomId) {
    const room = zones.find((z) => z.kind === 'meeting_room' && z.id === actor.activeMeetingRoomId);
    if (room && room.workstations.length > 0) {
      const seat = room.workstations[actor.meetingSeatIndex % room.workstations.length];
      return {
        x: seat.x,
        y: 0,
        z: seat.z,
        rotY: seat.rotY,
        zoneId: room.id,
        stationCode: seat.code,
      };
    }
  }

  const deptZone =
    zones.find((z) => z.id === actor.departmentId) ??
    zones.find((z) => z.kind === 'reception') ??
    zones[0];

  if (!deptZone) {
    return { x: 0, y: 0, z: 0, rotY: 0, zoneId: 'zone_reception', stationCode: 'LOBBY-1' };
  }

  const station =
    deptZone.workstations[actor.slotIndexInDept % Math.max(1, deptZone.workstations.length)] ?? {
      code: `${deptZone.code.toUpperCase()}-WS1`,
      x: deptZone.x,
      z: deptZone.z,
      rotY: 0,
    };

  const overflowRing = Math.floor(actor.slotIndexInDept / Math.max(1, deptZone.workstations.length));
  const jitterX = overflowRing > 0 ? (overflowRing % 2 === 0 ? 0.9 : -0.9) : 0;
  const jitterZ = overflowRing > 0 ? 0.75 * overflowRing : 0;

  return {
    x: Number((station.x + jitterX).toFixed(2)),
    y: 0,
    z: Number((station.z + jitterZ).toFixed(2)),
    rotY: station.rotY,
    zoneId: deptZone.id,
    stationCode: station.code,
  };
}

export interface OrgTreeMember {
  id: string;
  actorType: 'human' | 'agent';
  name: string;
  jobTitle: string;
  departmentId: string | null;
  managerEmployeeId: string | null;
  status: string;
  operationalStatus: OperationalStatus;
  openTasks: number;
  modelIdentifier?: string | null;
}

export interface OrgDepartmentBranch {
  id: string;
  code: string;
  name: string;
  description: string;
  status: string;
  colorHex: string;
  manager: OrgTreeMember | null;
  humans: OrgTreeMember[];
  agents: OrgTreeMember[];
  totalOpenTasks: number;
}

export interface OrgChartHierarchy {
  executives: OrgTreeMember[];
  departments: OrgDepartmentBranch[];
  unassignedHumans: OrgTreeMember[];
  unassignedAgents: OrgTreeMember[];
}

export function buildOrgChartHierarchy(
  departments: Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    status?: string;
    color_hex?: string;
    lead_employee_id?: string | null;
  }>,
  humans: OrgTreeMember[],
  agents: OrgTreeMember[]
): OrgChartHierarchy {
  const execDept = departments.find((d) => d.code === 'executive');
  const executives = humans.filter(
    (h) =>
      (execDept && h.departmentId === execDept.id) ||
      (!h.managerEmployeeId && /ceo|founder|chief|director|admin|executive/i.test(h.jobTitle))
  );
  const execIds = new Set(executives.map((e) => e.id));

  const deptBranches: OrgDepartmentBranch[] = departments.map((d) => {
    const deptHumans = humans.filter((h) => h.departmentId === d.id);
    const deptAgents = agents.filter((a) => a.departmentId === d.id);
    const leadMatch = d.lead_employee_id ? humans.find((h) => h.id === d.lead_employee_id) ?? null : null;
    const manager =
      leadMatch ??
      deptHumans.find((h) => /head|lead|manager|director/i.test(h.jobTitle)) ??
      null;
    const totalOpenTasks =
      deptHumans.reduce((acc, m) => acc + m.openTasks, 0) +
      deptAgents.reduce((acc, m) => acc + m.openTasks, 0);

    return {
      id: d.id,
      code: d.code,
      name: d.name,
      description: d.description,
      status: d.status || 'active',
      colorHex: d.color_hex || '#2563eb',
      manager,
      humans: deptHumans,
      agents: deptAgents,
      totalOpenTasks,
    };
  });

  const knownDeptIds = new Set(departments.map((d) => d.id));
  const unassignedHumans = humans.filter(
    (h) => !execIds.has(h.id) && (!h.departmentId || !knownDeptIds.has(h.departmentId))
  );
  const unassignedAgents = agents.filter(
    (a) => !a.departmentId || !knownDeptIds.has(a.departmentId)
  );

  return {
    executives,
    departments: deptBranches,
    unassignedHumans,
    unassignedAgents,
  };
}
