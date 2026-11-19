import type { Request, Response, NextFunction } from 'express';
import { getDb, nowIso } from '../db/database';
import { DEFAULT_ORG_ID } from '../db/seed';
import { hasPermission, type PermissionCode } from '../../src/domain/rbac';
import {
  generateId,
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from './security';
import { writeAuditLog } from './audit';

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  email: string;
  fullName: string;
  status: string;
  roles: string[];
  permissions: string[];
}

export interface AuthedRequest extends Request {
  authUser?: AuthenticatedUser;
  correlationId?: string;
}

export function getUserWithPermissions(userId: string): AuthenticatedUser | null {
  const db = getDb();
  const user = db
    .prepare('SELECT id, organization_id, email, full_name, status FROM users WHERE id = ?')
    .get(userId) as
    | { id: string; organization_id: string; email: string; full_name: string; status: string }
    | undefined;
  if (!user || user.status !== 'active') return null;

  const roleRows = db
    .prepare(
      `SELECT r.code FROM roles r
       INNER JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ?`
    )
    .all(userId) as { code: string }[];

  const permRows = db
    .prepare(
      `SELECT DISTINCT p.code FROM permissions p
       INNER JOIN role_permissions rp ON rp.permission_id = p.id
       INNER JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = ?`
    )
    .all(userId) as { code: string }[];

  return {
    id: user.id,
    organizationId: user.organization_id,
    email: user.email,
    fullName: user.full_name,
    status: user.status,
    roles: roleRows.map((r) => r.code),
    permissions: permRows.map((p) => p.code),
  };
}

export function getSessionCount(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
  return row.c;
}

export function createSessionForUser(
  userId: string,
  meta: { ipAddress: string; userAgent: string }
): { rawToken: string; expiresAt: string } {
  const db = getDb();
  const { rawToken, tokenHash } = generateSessionToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const ts = nowIso();

  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, ip_address, user_agent, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(generateId('sess'), userId, tokenHash, meta.ipAddress, meta.userAgent, expiresAt, ts);

  db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, userId);

  return { rawToken, expiresAt };
}

export function bootstrapSuperAdmin(input: {
  fullName: string;
  email: string;
  password: string;
  organizationName?: string;
}): AuthenticatedUser {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
  if (existing.c > 0) {
    throw new Error('Workspace administrator has already been initialized.');
  }
  const ts = nowIso();
  const userId = generateId('usr');
  const employeeId = generateId('emp');
  const normalizedEmail = input.email.trim().toLowerCase();

  if (input.organizationName && input.organizationName.trim().length > 1) {
    db.prepare('UPDATE organizations SET name = ?, updated_at = ? WHERE id = ?').run(
      input.organizationName.trim(),
      ts,
      DEFAULT_ORG_ID
    );
  }

  db.prepare(
    `INSERT INTO users (id, organization_id, email, full_name, password_hash, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
  ).run(userId, DEFAULT_ORG_ID, normalizedEmail, input.fullName.trim(), hashPassword(input.password), ts, ts);

  db.prepare('INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES (?, ?, ?)').run(
    userId,
    'role_super_admin',
    ts
  );

  db.prepare(
    `INSERT INTO employees (
      id, organization_id, user_id, department_id, full_name, email, job_title, employment_status, created_at, updated_at
    ) VALUES (?, ?, ?, 'dept_executive', ?, ?, 'Managing Director & System Administrator', 'active', ?, ?)`
  ).run(employeeId, DEFAULT_ORG_ID, userId, input.fullName.trim(), normalizedEmail, ts, ts);

  writeAuditLog({
    db,
    actorType: 'human',
    actorId: userId,
    actorLabel: normalizedEmail,
    action: 'auth.bootstrap_admin',
    entityType: 'user',
    entityId: userId,
    metadata: { role: 'super_admin' },
  });

  const resolved = getUserWithPermissions(userId);
  if (!resolved) throw new Error('Failed to load initialized admin user.');
  return resolved;
}

export function authenticateCredentials(email: string, password: string): AuthenticatedUser | null {
  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();
  const row = db
    .prepare('SELECT id, password_hash, status FROM users WHERE email = ?')
    .get(normalizedEmail) as { id: string; password_hash: string; status: string } | undefined;
  if (!row || row.status !== 'active') return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return getUserWithPermissions(row.id);
}

export function revokeSessionByToken(rawToken: string): void {
  const db = getDb();
  const tokenHash = hashSessionToken(rawToken);
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?').run(nowIso(), tokenHash);
}

export function extractBearerOrCookieToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.kestrel_session;
  if (cookieToken && typeof cookieToken === 'string') {
    return cookieToken;
  }
  return null;
}

export function attachAuthMiddleware(req: AuthedRequest, _res: Response, next: NextFunction): void {
  req.correlationId = (req.headers['x-correlation-id'] as string) || generateId('corr');
  const token = extractBearerOrCookieToken(req);
  if (!token) {
    next();
    return;
  }
  const db = getDb();
  const tokenHash = hashSessionToken(token);
  const sess = db
    .prepare(
      `SELECT user_id, expires_at, revoked_at FROM sessions WHERE token_hash = ?`
    )
    .get(tokenHash) as { user_id: string; expires_at: string; revoked_at: string | null } | undefined;

  if (!sess || sess.revoked_at || Date.parse(sess.expires_at) <= Date.now()) {
    next();
    return;
  }

  const user = getUserWithPermissions(sess.user_id);
  if (user) {
    req.authUser = user;
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  next();
}

export function requirePermission(permission: PermissionCode) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!hasPermission(req.authUser.permissions, permission)) {
      res.status(403).json({
        error: `Forbidden: missing required permission "${permission}".`,
      });
      return;
    }
    next();
  };
}
