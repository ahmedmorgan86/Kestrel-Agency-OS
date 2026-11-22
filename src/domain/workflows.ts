export const CONTENT_STATUSES = [
  'idea',
  'brief',
  'strategy_review',
  'draft',
  'creative_production',
  'quality_assurance',
  'human_review',
  'changes_requested',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'analytics_collection',
  'archived',
] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  idea: 'فكرة',
  brief: 'توجيه إبداعي',
  strategy_review: 'مراجعة الاستراتيجية',
  draft: 'مسودة',
  creative_production: 'إنتاج إبداعي',
  quality_assurance: 'مراجعة الجودة',
  human_review: 'بانتظار قرار المالك',
  changes_requested: 'مطلوب تعديل',
  approved: 'معتمد من المالك',
  scheduled: 'مجدول',
  publishing: 'جارٍ النشر',
  published: 'تم النشر',
  analytics_collection: 'تحليل النتائج',
  archived: 'مؤرشف',
};

export const ALLOWED_CONTENT_TRANSITIONS: Record<ContentStatus, readonly ContentStatus[]> = {
  idea: ['brief', 'archived'],
  brief: ['strategy_review', 'draft', 'archived'],
  strategy_review: ['draft', 'brief', 'archived'],
  draft: ['creative_production', 'quality_assurance', 'archived'],
  creative_production: ['quality_assurance', 'draft', 'archived'],
  quality_assurance: ['human_review', 'changes_requested', 'draft', 'archived'],
  human_review: ['approved', 'changes_requested', 'archived'],
  changes_requested: ['draft', 'creative_production', 'quality_assurance', 'archived'],
  approved: ['scheduled', 'changes_requested', 'archived'],
  scheduled: ['publishing', 'approved', 'archived'],
  publishing: ['published', 'scheduled', 'changes_requested'],
  published: ['analytics_collection', 'archived'],
  analytics_collection: ['archived'],
  archived: ['idea'],
};

export function canTransitionContentStatus(from: ContentStatus, to: ContentStatus): boolean {
  if (from === to) return false;
  return ALLOWED_CONTENT_TRANSITIONS[from].includes(to);
}

export function assertContentTransition(
  from: ContentStatus,
  to: ContentStatus,
  context?: { hasValidHumanApproval?: boolean; hasExternalPostEvidence?: boolean }
): { ok: true } | { ok: false; reason: string } {
  if (!canTransitionContentStatus(from, to)) {
    return {
      ok: false,
      reason: `Illegal workflow transition from "${from}" to "${to}". Allowed next states: ${ALLOWED_CONTENT_TRANSITIONS[from].join(', ') || 'none'}.`,
    };
  }
  if (to === 'scheduled' && !context?.hasValidHumanApproval) {
    return {
      ok: false,
      reason: 'Content cannot be scheduled without a valid human approval matching the current content version hash.',
    };
  }
  if (to === 'published' && !context?.hasExternalPostEvidence) {
    return {
      ok: false,
      reason: 'Content cannot be marked published without recorded external platform post evidence.',
    };
  }
  return { ok: true };
}

export const TASK_STATUSES = [
  'queued',
  'assigned',
  'running',
  'validating',
  'waiting_for_input',
  'waiting_for_approval',
  'in_review',
  'completed',
  'failed',
  'retrying',
  'rejected',
  'cancelled',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  queued: 'في قائمة الانتظار',
  assigned: 'مسندة',
  running: 'قيد التنفيذ',
  validating: 'قيد التحقق',
  waiting_for_input: 'تنتظر مدخلات',
  waiting_for_approval: 'تنتظر موافقة المالك',
  in_review: 'قيد المراجعة',
  completed: 'مكتملة',
  failed: 'فشلت',
  retrying: 'إعادة المحاولة',
  rejected: 'مرفوضة',
  cancelled: 'ملغاة',
};

export const PUBLISHING_STATES = [
  'waiting_for_approval',
  'approved',
  'scheduled',
  'queued',
  'publishing',
  'published',
  'failed',
  'retry_scheduled',
  'cancelled',
  'unknown_outcome_reconciliation_required',
] as const;

export type PublishingState = (typeof PUBLISHING_STATES)[number];

export const PUBLISHING_STATE_LABELS: Record<PublishingState, string> = {
  waiting_for_approval: 'Waiting for Approval',
  approved: 'Approved',
  scheduled: 'Scheduled',
  queued: 'Queued',
  publishing: 'Publishing',
  published: 'Published',
  failed: 'Failed',
  retry_scheduled: 'Retry Scheduled',
  cancelled: 'Cancelled',
  unknown_outcome_reconciliation_required: 'Unknown Outcome (Reconciliation Required)',
};

export const INTEGRATION_STATUSES = [
  'not_configured',
  'configuration_incomplete',
  'connected',
  'authentication_expired',
  'permission_denied',
  'temporarily_unavailable',
  'error',
  'disconnected',
] as const;

export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  not_configured: 'Not Configured',
  configuration_incomplete: 'Configuration Incomplete',
  connected: 'Connected',
  authentication_expired: 'Authentication Expired',
  permission_denied: 'Permission Denied',
  temporarily_unavailable: 'Temporarily Unavailable',
  error: 'Error',
  disconnected: 'Disconnected',
};

export interface TaskDeliverableCheckInput {
  requiresApproval: boolean;
  approvalGranted: boolean;
  hasValidatedOutput: boolean;
  outputErrors: string[];
}

export function validateDeliverableBeforeTaskCompletion(
  input: TaskDeliverableCheckInput
): { canComplete: boolean; nextStatus: TaskStatus; reason?: string } {
  if (!input.hasValidatedOutput || input.outputErrors.length > 0) {
    return {
      canComplete: false,
      nextStatus: 'failed',
      reason:
        input.outputErrors.length > 0
          ? `Output validation failed: ${input.outputErrors.join('; ')}`
          : 'No validated deliverable output was persisted.',
    };
  }
  if (input.requiresApproval && !input.approvalGranted) {
    return {
      canComplete: false,
      nextStatus: 'waiting_for_approval',
      reason: 'Deliverable validated; human approval is required before task completion.',
    };
  }
  return {
    canComplete: true,
    nextStatus: 'completed',
  };
}
