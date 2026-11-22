import type { DatabaseSync } from 'node:sqlite';
import type { Response } from 'express';
import { nowIso } from '../db/database';
import { DEFAULT_ORG_ID } from '../db/seed';
import { generateId } from './security';

export interface CompanyEventInput {
  eventType: string;
  actorType: 'human' | 'agent' | 'system';
  actorId: string;
  actorLabel: string;
  departmentId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  summary: string;
  payload?: Record<string, unknown>;
}

export interface PersistedCompanyEvent {
  id: string;
  organization_id: string;
  event_type: string;
  actor_type: string;
  actor_id: string;
  actor_label: string;
  department_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  summary: string;
  payload_json: string;
  created_at: string;
}

interface SseClient {
  id: string;
  res: Response;
  userId: string;
}

const clients = new Map<string, SseClient>();

export function registerSseClient(userId: string, res: Response): string {
  const clientId = generateId('sse');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  clients.set(clientId, { id: clientId, res, userId });
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId, connectedAt: nowIso() })}\n\n`);

  const heartbeat = setInterval(() => {
    if (!clients.has(clientId)) {
      clearInterval(heartbeat);
      return;
    }
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      clients.delete(clientId);
      clearInterval(heartbeat);
    }
  }, 25000);

  res.on('close', () => {
    clients.delete(clientId);
    clearInterval(heartbeat);
  });

  return clientId;
}

export function getActiveSseClientCount(): number {
  return clients.size;
}

export function broadcastCompanyEvent(
  db: DatabaseSync,
  input: CompanyEventInput
): PersistedCompanyEvent {
  const id = generateId('cev');
  const createdAt = nowIso();
  const payloadJson = JSON.stringify(input.payload ?? {});

  try {
    db.prepare(
      `INSERT INTO company_events (
        id, organization_id, event_type, actor_type, actor_id, actor_label,
        department_id, entity_type, entity_id, summary, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      DEFAULT_ORG_ID,
      input.eventType,
      input.actorType,
      input.actorId,
      input.actorLabel,
      input.departmentId ?? null,
      input.entityType ?? null,
      input.entityId ?? null,
      input.summary,
      payloadJson,
      createdAt
    );
  } catch {
    // Table may not exist yet during early bootstrap; fail safely without crashing caller
  }

  const event: PersistedCompanyEvent = {
    id,
    organization_id: DEFAULT_ORG_ID,
    event_type: input.eventType,
    actor_type: input.actorType,
    actor_id: input.actorId,
    actor_label: input.actorLabel,
    department_id: input.departmentId ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    summary: input.summary,
    payload_json: payloadJson,
    created_at: createdAt,
  };

  const frame = `event: company_event\ndata: ${JSON.stringify(event)}\n\n`;
  for (const [clientId, client] of clients.entries()) {
    try {
      client.res.write(frame);
    } catch {
      clients.delete(clientId);
    }
  }

  return event;
}
