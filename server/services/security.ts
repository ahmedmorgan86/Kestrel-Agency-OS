import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || EPHEMERAL_FALLBACK_SECRET;
}

function getStorageSigningSecret(): string {
  return process.env.STORAGE_SIGNING_SECRET || getSessionSecret();
}

function getEncryptionKey(): Buffer {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY || getSessionSecret();
  return crypto.createHash('sha256').update(raw).digest();
}

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = ['SESSION_SECRET', 'CREDENTIAL_ENCRYPTION_KEY']
    .filter((name) => (process.env[name] || '').length < 32);
  if (missing.length > 0) {
    throw new Error(`Production requires ${missing.join(' and ')} to be set to random values of at least 32 characters.`);
  }
}

export function getSecurityReadiness() {
  const isProduction = process.env.NODE_ENV === 'production';
  const checks = {
    sessionSecret: (process.env.SESSION_SECRET || '').length >= 32,
    credentialEncryptionKey: (process.env.CREDENTIAL_ENCRYPTION_KEY || '').length >= 32,
    persistentDatabasePath: Boolean(process.env.SQLITE_DB_PATH && pathIsAbsolute(process.env.SQLITE_DB_PATH)),
    persistentStoragePath: Boolean(process.env.STORAGE_ROOT_DIR && pathIsAbsolute(process.env.STORAGE_ROOT_DIR)),
  };
  return {
    environment: isProduction ? 'production' : 'development',
    ready: Object.values(checks).every(Boolean),
    checks,
  };
}

function pathIsAbsolute(value: string): boolean {
  // Keep this helper local to avoid exposing or logging configured filesystem paths.
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hexDigest] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hexDigest, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function generateSessionToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(rawToken);
  return { rawToken, tokenHash };
}

export function hashSessionToken(rawToken: string): string {
  return crypto
    .createHmac('sha256', getSessionSecret())
    .update(rawToken)
    .digest('hex');
}

export function encryptSecretJson(payload: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecretJson<T = Record<string, unknown>>(encoded: string): T {
  const [version, ivB64, tagB64, dataB64] = encoded.split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted credential format');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(ivB64, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}

export function createSignedAssetToken(assetId: string, ttlSeconds = 3600): {
  exp: number;
  sig: string;
} {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto
    .createHmac('sha256', getStorageSigningSecret())
    .update(`${assetId}:${exp}`)
    .digest('base64url');
  return { exp, sig };
}

export function verifySignedAssetToken(assetId: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', getStorageSigningSecret())
    .update(`${assetId}:${exp}`)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const REDACT_KEYS = new Set([
  'password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'secret',
  'authorization',
  'encrypted_credentials_ref',
]);

export function redactSensitive(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.replace(/(AIza[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z]{20,}|Bearer\s+[0-9A-Za-z._-]+)/g, '[REDACTED]');
  }
  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : redactSensitive(v);
    }
    return out;
  }
  return value;
}

export function logStructured(
  level: 'info' | 'warn' | 'error',
  event: string,
  meta: Record<string, unknown> = {}
): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(redactSensitive(meta) as Record<string, unknown>),
  };
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

export function createRateLimiter(options: { windowMs: number; maxRequests: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip || 'unknown'}:${req.path.startsWith('/api/auth') ? 'auth' : 'api'}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > options.maxRequests) {
      res.status(429).json({
        error: 'Rate limit exceeded. Please wait before retrying.',
        retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
      });
      return;
    }
    next();
  };
}
