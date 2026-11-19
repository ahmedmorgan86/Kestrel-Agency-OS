import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from '../db/database';
import { DEFAULT_ORG_ID } from '../db/seed';
import { createSignedAssetToken, generateId, verifySignedAssetToken } from './security';
import { isSupabaseConfigured, mirrorAssetToSupabaseStorage } from './supabase';

export const ALLOWED_UPLOAD_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'application/pdf',
  'text/plain',
  'text/csv',
]);

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export function getStorageRoot(): string {
  const dir = process.env.STORAGE_ROOT_DIR || path.resolve(process.cwd(), 'data', 'storage');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function inferAssetType(mimeType: string): 'image' | 'video' | 'document' | 'other' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf' || mimeType.startsWith('text/')) return 'document';
  return 'other';
}

export function storeBufferAsAsset(
  db: DatabaseSync,
  input: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    title: string;
    clientId?: string | null;
    brandId?: string | null;
    projectId?: string | null;
    sourceType: 'upload' | 'ai_generated' | 'export';
    providerMetadata?: Record<string, unknown>;
    uploadedByUserId?: string | null;
  }
): {
  id: string;
  storageKey: string;
  sha256Checksum: string;
  byteSize: number;
  signedUrl: string;
} {
  if (!ALLOWED_UPLOAD_MIMES.has(input.mimeType)) {
    throw new Error(`Unsupported file MIME type: ${input.mimeType}`);
  }
  if (input.buffer.byteLength === 0) {
    throw new Error('Cannot store an empty file.');
  }
  if (input.buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds maximum upload limit of ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`);
  }

  const assetId = generateId('ast');
  const ext = path.extname(input.originalName).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10) || '.bin';
  const storageKey = `${assetId}${ext}`;
  const fullPath = path.join(getStorageRoot(), storageKey);
  const checksum = crypto.createHash('sha256').update(input.buffer).digest('hex');

  fs.writeFileSync(fullPath, input.buffer);

  const supabaseEnabled = isSupabaseConfigured();
  const metadata = {
    ...(input.providerMetadata ?? {}),
    storageBackend: supabaseEnabled ? 'local_and_supabase' : 'local_disk',
  };

  const ts = nowIso();
  db.prepare(
    `INSERT INTO assets (
      id, organization_id, client_id, brand_id, project_id, title, asset_type,
      mime_type, byte_size, storage_key, sha256_checksum, source_type,
      provider_metadata_json, uploaded_by_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    assetId,
    DEFAULT_ORG_ID,
    input.clientId ?? null,
    input.brandId ?? null,
    input.projectId ?? null,
    input.title.trim() || input.originalName,
    inferAssetType(input.mimeType),
    input.mimeType,
    input.buffer.byteLength,
    storageKey,
    checksum,
    input.sourceType,
    JSON.stringify(metadata),
    input.uploadedByUserId ?? null,
    ts
  );

  db.prepare(
    `INSERT INTO asset_versions (id, asset_id, version_number, storage_key, sha256_checksum, byte_size, created_at)
     VALUES (?, ?, 1, ?, ?, ?, ?)`
  ).run(generateId('astv'), assetId, storageKey, checksum, input.buffer.byteLength, ts);

  if (supabaseEnabled) {
    void mirrorAssetToSupabaseStorage(storageKey, input.buffer, input.mimeType);
  }

  return {
    id: assetId,
    storageKey,
    sha256Checksum: checksum,
    byteSize: input.buffer.byteLength,
    signedUrl: buildSignedAssetUrl(assetId),
  };
}

export function buildSignedAssetUrl(assetId: string): string {
  const { exp, sig } = createSignedAssetToken(assetId, 3600);
  return `/api/storage/files/${encodeURIComponent(assetId)}?exp=${exp}&sig=${encodeURIComponent(sig)}`;
}

export function resolveSignedAssetFile(
  db: DatabaseSync,
  assetId: string,
  exp: number,
  sig: string
): { filePath: string; mimeType: string; title: string } | null {
  if (!verifySignedAssetToken(assetId, exp, sig)) {
    return null;
  }
  const row = db
    .prepare('SELECT storage_key, mime_type, title FROM assets WHERE id = ?')
    .get(assetId) as { storage_key: string; mime_type: string; title: string } | undefined;
  if (!row) return null;

  const root = getStorageRoot();
  const safePath = path.resolve(root, path.basename(row.storage_key));
  if (!safePath.startsWith(root) || !fs.existsSync(safePath)) {
    return null;
  }
  return { filePath: safePath, mimeType: row.mime_type, title: row.title };
}

export function getStorageStats(): { fileCount: number; totalBytes: number; storageRoot: string } {
  const root = getStorageRoot();
  try {
    const files = fs.readdirSync(root);
    let totalBytes = 0;
    for (const f of files) {
      const st = fs.statSync(path.join(root, f));
      if (st.isFile()) totalBytes += st.size;
    }
    return { fileCount: files.length, totalBytes, storageRoot: root };
  } catch {
    return { fileCount: 0, totalBytes: 0, storageRoot: root };
  }
}
