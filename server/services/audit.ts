import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from '../db/database';
import { DEFAULT_ORG_ID } from '../db/seed';
import { generateId, logStructured, redactSensitive } from './security';

export interface AuditEntryInput {
  db: DatabaseSync;
  correlationId?: string;
  actorType: 'human' | 'agent' | 'system';
  actorId: string;
  actorLabel: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export function writeAuditLog(input: AuditEntryInput): string {
  const id = generateId('audit');
  const correlationId = input.correlationId || generateId('corr');
  const ts = nowIso();
  const safeMeta = redactSensitive(input.metadata ?? {});

  input.db
    .prepare(
      `INSERT INTO audit_logs (
        id, organization_id, correlation_id, actor_type, actor_id, actor_label,
        action, entity_type, entity_id, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      DEFAULT_ORG_ID,
      correlationId,
      input.actorType,
      input.actorId,
      input.actorLabel,
      input.action,
      input.entityType,
      input.entityId,
      JSON.stringify(safeMeta),
      ts
    );

  logStructured('info', 'audit_event', {
    auditId: id,
    correlationId,
    actorType: input.actorType,
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
  });

  return id;
}

export function recordSystemEvent(
  db: DatabaseSync,
  input: {
    eventType: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    correlationId?: string;
    details?: Record<string, unknown>;
  }
): string {
  const id = generateId('sysevt');
  db.prepare(
    `INSERT INTO system_events (id, event_type, severity, message, correlation_id, details_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.eventType,
    input.severity,
    input.message,
    input.correlationId || '',
    JSON.stringify(redactSensitive(input.details ?? {})),
    nowIso()
  );
  return id;
}

export function createNotification(
  db: DatabaseSync,
  input: {
    userId?: string | null;
    severity: 'info' | 'warning' | 'error';
    title: string;
    message: string;
    entityType?: string | null;
    entityId?: string | null;
  }
): string {
  const id = generateId('notif');
  db.prepare(
    `INSERT INTO notifications (
      id, organization_id, user_id, severity, title, message, entity_type, entity_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    DEFAULT_ORG_ID,
    input.userId ?? null,
    input.severity,
    input.title,
    input.message,
    input.entityType ?? null,
    input.entityId ?? null,
    nowIso()
  );
  return id;
}
