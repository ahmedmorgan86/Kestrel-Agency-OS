export interface ContentMaterialFields {
  platform: string;
  format: string;
  title: string;
  brief: string;
  caption: string;
  script: string;
  hashtags: string[];
  cta: string;
  mediaAssetIds: string[];
}

function rightRotate(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

/**
 * Pure deterministic SHA-256 implementation (FIPS 180-4) with zero runtime dependencies,
 * producing identical lowercase hex digests in both Node.js and browser contexts.
 */
export function sha256Hex(message: string): string {
  const utf8 = new TextEncoder().encode(message);
  const bitLen = utf8.length * 8;
  const totalLen = Math.ceil((utf8.length + 9) / 64) * 64;
  const padded = new Uint8Array(totalLen);
  padded.set(utf8);
  padded[utf8.length] = 0x80;

  const view = new DataView(padded.buffer);
  const highBits = Math.floor(bitLen / 0x100000000);
  const lowBits = bitLen >>> 0;
  view.setUint32(totalLen - 8, highBits, false);
  view.setUint32(totalLen - 4, lowBits, false);

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('');
}

export function computeContentVersionHash(fields: ContentMaterialFields): string {
  const canonical = JSON.stringify({
    platform: fields.platform.trim().toLowerCase(),
    format: fields.format.trim().toLowerCase(),
    title: fields.title.trim(),
    brief: fields.brief.trim(),
    caption: fields.caption.trim(),
    script: fields.script.trim(),
    hashtags: [...fields.hashtags].map((h) => h.trim()).filter(Boolean).sort(),
    cta: fields.cta.trim(),
    mediaAssetIds: [...fields.mediaAssetIds].filter(Boolean).sort(),
  });
  return sha256Hex(canonical);
}

export function shouldInvalidateApproval(previousHash: string, nextHash: string): boolean {
  return previousHash !== nextHash;
}

export type ApprovalDecisionType = 'approved' | 'rejected' | 'changes_requested';

export interface ApprovalGateInput {
  reviewerActorType: 'human' | 'agent';
  reviewerHasApprovalPermission: boolean;
  requestStatus: 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'invalidated';
  expectedVersionHash: string;
  currentVersionHash: string;
  decision: ApprovalDecisionType;
  comments: string;
}

export function evaluateApprovalDecision(
  input: ApprovalGateInput
): { allowed: true } | { allowed: false; reason: string } {
  if (input.reviewerActorType !== 'human') {
    return {
      allowed: false,
      reason: 'Governance policy violation: AI agents are prohibited from approving human-gated requests.',
    };
  }
  if (!input.reviewerHasApprovalPermission) {
    return {
      allowed: false,
      reason: 'Permission denied: reviewer lacks approvals:decide authorization.',
    };
  }
  if (input.requestStatus !== 'pending') {
    return {
      allowed: false,
      reason: `Approval request is immutable in status "${input.requestStatus}".`,
    };
  }
  if (input.expectedVersionHash !== input.currentVersionHash) {
    return {
      allowed: false,
      reason: 'Content version hash mismatch: the content changed after review began. Re-submit the new version for approval.',
    };
  }
  if (
    (input.decision === 'rejected' || input.decision === 'changes_requested') &&
    input.comments.trim().length < 3
  ) {
    return {
      allowed: false,
      reason: 'Reviewer comments are required when rejecting or requesting changes.',
    };
  }
  return { allowed: true };
}
