export const ALL_PERMISSIONS = [
  'org:read',
  'org:manage',
  'users:manage',
  'clients:read',
  'clients:write',
  'clients:delete',
  'brands:read',
  'brands:write',
  'projects:read',
  'projects:write',
  'content:read',
  'content:write',
  'approvals:read',
  'approvals:decide',
  'publishing:read',
  'publishing:execute',
  'agents:read',
  'agents:configure',
  'agents:run',
  'tasks:read',
  'tasks:write',
  'assets:read',
  'assets:write',
  'analytics:read',
  'analytics:sync',
  'finance:read',
  'finance:write',
  'integrations:read',
  'integrations:manage',
  'audit:read',
  'system:health',
] as const;

export type PermissionCode = (typeof ALL_PERMISSIONS)[number];

export const SYSTEM_ROLE_PERMISSIONS: Record<string, readonly PermissionCode[]> = {
  super_admin: ALL_PERMISSIONS,
  agency_director: ALL_PERMISSIONS.filter((p) => p !== 'users:manage'),
  account_manager: [
    'org:read',
    'clients:read',
    'clients:write',
    'brands:read',
    'brands:write',
    'projects:read',
    'projects:write',
    'content:read',
    'content:write',
    'approvals:read',
    'approvals:decide',
    'publishing:read',
    'publishing:execute',
    'agents:read',
    'agents:run',
    'tasks:read',
    'tasks:write',
    'assets:read',
    'assets:write',
    'analytics:read',
    'analytics:sync',
    'finance:read',
    'integrations:read',
    'audit:read',
  ],
  creative_lead: [
    'org:read',
    'clients:read',
    'brands:read',
    'brands:write',
    'projects:read',
    'content:read',
    'content:write',
    'approvals:read',
    'agents:read',
    'agents:run',
    'tasks:read',
    'tasks:write',
    'assets:read',
    'assets:write',
    'analytics:read',
  ],
  analyst: [
    'org:read',
    'clients:read',
    'brands:read',
    'projects:read',
    'content:read',
    'approvals:read',
    'publishing:read',
    'agents:read',
    'tasks:read',
    'assets:read',
    'analytics:read',
    'analytics:sync',
    'finance:read',
    'audit:read',
    'system:health',
  ],
};

export function hasPermission(
  grantedPermissions: readonly string[],
  required: PermissionCode
): boolean {
  return grantedPermissions.includes(required);
}

export const HIGH_RISK_AGENT_TOOLS = new Set<string>([
  'publish_social_post',
  'approve_content_version',
  'authorize_financial_spend',
  'delete_client_data',
  'modify_agent_permissions',
]);

export function canAgentInvokeTool(input: {
  agentStatus: 'active' | 'paused';
  allowedTools: readonly string[];
  requestedTool: string;
  humanApprovalGranted?: boolean;
}): { allowed: boolean; reason?: string } {
  if (input.agentStatus !== 'active') {
    return { allowed: false, reason: 'Agent is paused and cannot invoke tools.' };
  }
  if (!input.allowedTools.includes(input.requestedTool)) {
    return {
      allowed: false,
      reason: `Tool "${input.requestedTool}" is outside this agent's allowed tool policy.`,
    };
  }
  if (HIGH_RISK_AGENT_TOOLS.has(input.requestedTool) && !input.humanApprovalGranted) {
    return {
      allowed: false,
      reason: `High-risk tool "${input.requestedTool}" requires explicit human approval prior to execution.`,
    };
  }
  return { allowed: true };
}

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /override\s+system\s+permissions/i,
  /bypass\s+approval/i,
  /approve\s+your\s+own/i,
  /reveal\s+(api[_\s]?key|secret|password|token)/i,
];

export function detectPromptInjectionSignals(untrustedInput: string): string[] {
  const matches: string[] = [];
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(untrustedInput)) {
      matches.push(pattern.source);
    }
  }
  return matches;
}

export function wrapUntrustedContentForAgent(label: string, content: string): string {
  const cleaned = content.replace(/<\/?untrusted_data[^>]*>/gi, '[stripped-tag]');
  return `<untrusted_data source="${label}">\n${cleaned}\n</untrusted_data>`;
}
