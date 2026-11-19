import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DatabaseSync } from 'node:sqlite';

export interface SupabaseStatusResult {
  ok: boolean;
  configured: boolean;
  schemaReady: boolean;
  storageReady: boolean;
  bucketName: string;
  latencyMs: number;
  message?: string;
  error?: string;
}

export interface SupabaseSyncResult {
  ok: boolean;
  syncedTables: Record<string, number>;
  errors: Array<{ table: string; error: string }>;
  syncedAt: string;
}

export function getSupabaseBucketName(): string {
  return (process.env.SUPABASE_STORAGE_BUCKET || 'agency-assets').trim() || 'agency-assets';
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL?.trim() || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  return (
    url.startsWith('https://') &&
    !url.includes('MY_SUPABASE') &&
    key.length > 20 &&
    !key.startsWith('MY_')
  );
}

let cachedClient: SupabaseClient | null = null;
let cachedSignature = '';

export function getSupabaseAdminClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase is not configured: add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Settings > Secrets.'
    );
  }
  const url = process.env.SUPABASE_URL!.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  const sig = `${url}::${key.slice(0, 12)}`;
  if (!cachedClient || cachedSignature !== sig) {
    cachedClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    cachedSignature = sig;
  }
  return cachedClient;
}

export async function verifySupabaseConnection(): Promise<SupabaseStatusResult> {
  const bucketName = getSupabaseBucketName();
  const started = Date.now();
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      configured: false,
      schemaReady: false,
      storageReady: false,
      bucketName,
      latencyMs: 0,
      error: 'Missing environment credentials: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.',
    };
  }

  try {
    const supabase = getSupabaseAdminClient();

    // 1. Check PostgreSQL table accessibility via PostgREST
    const { error: dbError } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);

    // 2. Check Storage bucket availability
    const { data: buckets, error: storageError } = await supabase.storage.listBuckets();
    const latencyMs = Date.now() - started;

    const bucketExists = Boolean(buckets?.some((b) => b.name === bucketName));
    const storageReady = !storageError && bucketExists;

    if (dbError) {
      const missingTable =
        dbError.code === '42P01' ||
        dbError.message.toLowerCase().includes('could not find the table') ||
        dbError.message.toLowerCase().includes('does not exist');
      return {
        ok: false,
        configured: true,
        schemaReady: false,
        storageReady,
        bucketName,
        latencyMs,
        error: missingTable
          ? 'Connected to Supabase project, but schema tables are not installed yet. Run docs/migrations/001_supabase_schema.sql in your Supabase SQL Editor.'
          : `Supabase database check failed: ${dbError.message}`,
      };
    }

    if (storageError) {
      return {
        ok: true,
        configured: true,
        schemaReady: true,
        storageReady: false,
        bucketName,
        latencyMs,
        message: `Supabase PostgreSQL connected (${latencyMs}ms). Storage check warning: ${storageError.message}`,
      };
    }

    return {
      ok: true,
      configured: true,
      schemaReady: true,
      storageReady,
      bucketName,
      latencyMs,
      message: storageReady
        ? `Supabase PostgreSQL and Storage bucket "${bucketName}" verified live (${latencyMs}ms).`
        : `Supabase PostgreSQL verified live (${latencyMs}ms). Bucket "${bucketName}" will be created automatically on first asset upload.`,
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      schemaReady: false,
      storageReady: false,
      bucketName,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : 'Unexpected Supabase connection error.',
    };
  }
}

export async function mirrorAssetToSupabaseStorage(
  storageKey: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ uploaded: boolean; bucket: string; path: string; error?: string }> {
  const bucket = getSupabaseBucketName();
  if (!isSupabaseConfigured()) {
    return { uploaded: false, bucket, path: storageKey, error: 'Supabase not configured' };
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b) => b.name === bucket)) {
      await supabase.storage.createBucket(bucket, { public: false });
    }
    const { error } = await supabase.storage.from(bucket).upload(storageKey, buffer, {
      contentType: mimeType,
      upsert: true,
    });
    if (error) {
      return { uploaded: false, bucket, path: storageKey, error: error.message };
    }
    return { uploaded: true, bucket, path: storageKey };
  } catch (err) {
    return {
      uploaded: false,
      bucket,
      path: storageKey,
      error: err instanceof Error ? err.message : 'Supabase storage upload error',
    };
  }
}

const SYNC_TABLE_ORDER = [
  'organizations',
  'departments',
  'clients',
  'client_brands',
  'projects',
  'campaigns',
  'content_items',
  'tasks',
  'invoices',
  'expenses',
  'assets',
] as const;

export async function syncWorkspaceToSupabase(db: DatabaseSync): Promise<SupabaseSyncResult> {
  const supabase = getSupabaseAdminClient();
  const syncedTables: Record<string, number> = {};
  const errors: Array<{ table: string; error: string }> = [];

  for (const table of SYNC_TABLE_ORDER) {
    try {
      const rows = db.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>;
      if (rows.length === 0) {
        syncedTables[table] = 0;
        continue;
      }
      const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
      if (error) {
        errors.push({ table, error: error.message });
      } else {
        syncedTables[table] = rows.length;
      }
    } catch (err) {
      errors.push({
        table,
        error: err instanceof Error ? err.message : 'Sync failed',
      });
    }
  }

  return {
    ok: errors.length === 0,
    syncedTables,
    errors,
    syncedAt: new Date().toISOString(),
  };
}
