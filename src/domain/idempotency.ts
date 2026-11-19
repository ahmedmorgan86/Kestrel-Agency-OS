import { sha256Hex } from './approvals';

export function buildPublishingIdempotencyKey(
  contentVersionId: string,
  socialAccountId: string
): string {
  const digest = sha256Hex(`${contentVersionId}:${socialAccountId}`).slice(0, 24);
  return `pub_${digest}`;
}

export function computeExponentialBackoffMs(
  attempt: number,
  baseMs = 2000,
  maxMs = 300_000
): number {
  const safeAttempt = Math.max(1, attempt);
  const raw = baseMs * Math.pow(2, safeAttempt - 1);
  return Math.min(maxMs, Math.round(raw));
}

export function isLeaseExpired(leaseExpiresAtIso: string | null, nowMs = Date.now()): boolean {
  if (!leaseExpiresAtIso) return true;
  const expiresMs = Date.parse(leaseExpiresAtIso);
  if (Number.isNaN(expiresMs)) return true;
  return expiresMs <= nowMs;
}

export type PublishErrorClassification =
  | 'timeout_reconciliation_required'
  | 'rate_limited'
  | 'auth_expired'
  | 'permission_denied'
  | 'validation_error'
  | 'transient_error';

export function classifyPublishError(error: {
  code?: string;
  httpStatus?: number;
  message?: string;
}): PublishErrorClassification {
  const msg = (error.message ?? '').toLowerCase();
  if (
    error.code === 'ETIMEDOUT' ||
    error.code === 'ABORT_ERR' ||
    error.httpStatus === 504 ||
    msg.includes('timeout') ||
    msg.includes('timed out')
  ) {
    return 'timeout_reconciliation_required';
  }
  if (error.httpStatus === 429 || msg.includes('rate limit')) {
    return 'rate_limited';
  }
  if (error.httpStatus === 401 || msg.includes('expired token') || msg.includes('invalid token')) {
    return 'auth_expired';
  }
  if (error.httpStatus === 403 || msg.includes('permission denied') || msg.includes('scope')) {
    return 'permission_denied';
  }
  if (error.httpStatus === 400 || error.httpStatus === 422) {
    return 'validation_error';
  }
  return 'transient_error';
}
