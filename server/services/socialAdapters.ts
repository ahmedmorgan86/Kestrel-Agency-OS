import { classifyPublishError, type PublishErrorClassification } from '../../src/domain/idempotency';
import { decryptSecretJson } from './security';

export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'linkedin';

export interface PlatformOAuthConfig {
  platform: SocialPlatform;
  clientIdEnv: string;
  clientSecretEnv: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
}

export const SOCIAL_OAUTH_CONFIGS: Record<SocialPlatform, PlatformOAuthConfig> = {
  instagram: {
    platform: 'instagram',
    clientIdEnv: 'META_APP_ID',
    clientSecretEnv: 'META_APP_SECRET',
    authorizeUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
    scopes: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_insights', 'pages_show_list'],
  },
  facebook: {
    platform: 'facebook',
    clientIdEnv: 'META_APP_ID',
    clientSecretEnv: 'META_APP_SECRET',
    authorizeUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v21.0/oauth/access_token',
    scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'],
  },
  tiktok: {
    platform: 'tiktok',
    clientIdEnv: 'TIKTOK_CLIENT_KEY',
    clientSecretEnv: 'TIKTOK_CLIENT_SECRET',
    authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scopes: ['user.info.basic', 'video.publish', 'video.upload'],
  },
  youtube: {
    platform: 'youtube',
    clientIdEnv: 'YOUTUBE_CLIENT_ID',
    clientSecretEnv: 'YOUTUBE_CLIENT_SECRET',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
    ],
  },
  linkedin: {
    platform: 'linkedin',
    clientIdEnv: 'LINKEDIN_CLIENT_ID',
    clientSecretEnv: 'LINKEDIN_CLIENT_SECRET',
    authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['openid', 'profile', 'w_member_social', 'w_organization_social', 'r_organization_social'],
  },
};

export function getAppBaseUrl(): string {
  const configured = process.env.APP_URL;
  if (configured && configured.trim() && !configured.startsWith('MY_')) {
    return configured.replace(/\/+$/, '');
  }
  return 'http://localhost:3000';
}

export function getOAuthCallbackUrl(platform: SocialPlatform): string {
  return `${getAppBaseUrl()}/api/oauth/${platform}/callback`;
}

export function buildSocialOAuthUrl(
  platform: SocialPlatform,
  stateToken: string
): { ok: true; url: string; callbackUrl: string } | { ok: false; error: string; callbackUrl: string } {
  const cfg = SOCIAL_OAUTH_CONFIGS[platform];
  const callbackUrl = getOAuthCallbackUrl(platform);
  const clientId = process.env[cfg.clientIdEnv];
  const clientSecret = process.env[cfg.clientSecretEnv];

  if (!clientId || !clientSecret) {
    return {
      ok: false,
      callbackUrl,
      error: `Platform integration "${platform}" is not configured. Missing environment variables: ${cfg.clientIdEnv} and/or ${cfg.clientSecretEnv}.`,
    };
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: cfg.scopes.join(platform === 'tiktok' ? ',' : ' '),
    state: stateToken,
  });

  if (platform === 'youtube') {
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
  }

  return {
    ok: true,
    url: `${cfg.authorizeUrl}?${params.toString()}`,
    callbackUrl,
  };
}

export interface PublishAttemptInput {
  platform: SocialPlatform;
  externalAccountId: string;
  encryptedCredentialsRef: string | null;
  caption: string;
  mediaUrl?: string;
  idempotencyKey: string;
}

export interface PublishAttemptResult {
  ok: boolean;
  httpStatus?: number;
  externalPostId?: string;
  externalPostUrl?: string;
  errorClassification?: PublishErrorClassification;
  errorMessage?: string;
  responseMetadata?: Record<string, unknown>;
}

/**
 * Executes a real platform API publishing call when credentials & tokens exist.
 * Never fabricates a successful publication or synthetic post ID.
 */
export async function executePlatformPublish(
  input: PublishAttemptInput
): Promise<PublishAttemptResult> {
  if (!input.encryptedCredentialsRef) {
    return {
      ok: false,
      httpStatus: 401,
      errorClassification: 'auth_expired',
      errorMessage: `Social account on "${input.platform}" has no active OAuth credentials. Connect the account via official OAuth first.`,
    };
  }

  let creds: { accessToken?: string; expiresAt?: string };
  try {
    creds = decryptSecretJson<{ accessToken?: string; expiresAt?: string }>(
      input.encryptedCredentialsRef
    );
  } catch {
    return {
      ok: false,
      httpStatus: 401,
      errorClassification: 'auth_expired',
      errorMessage: 'Stored OAuth credential reference could not be decrypted. Re-authorize account.',
    };
  }

  if (!creds.accessToken) {
    return {
      ok: false,
      httpStatus: 401,
      errorClassification: 'auth_expired',
      errorMessage: 'OAuth access token missing. Re-authorize account.',
    };
  }
  if (creds.expiresAt && Date.parse(creds.expiresAt) <= Date.now()) {
    return {
      ok: false,
      httpStatus: 401,
      errorClassification: 'auth_expired',
      errorMessage: 'OAuth access token has expired. Refresh or re-authorize account.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    if (input.platform === 'facebook') {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(input.externalAccountId)}/feed`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${creds.accessToken}`,
          },
          body: JSON.stringify({ message: input.caption }),
          signal: controller.signal,
        }
      );
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        return {
          ok: false,
          httpStatus: res.status,
          errorClassification: classifyPublishError({
            httpStatus: res.status,
            message: JSON.stringify(data),
          }),
          errorMessage: `Facebook API rejected publish (${res.status}): ${JSON.stringify(data)}`,
          responseMetadata: data,
        };
      }
      const postId = String(data.id ?? '');
      if (!postId) {
        return {
          ok: false,
          httpStatus: res.status,
          errorClassification: 'timeout_reconciliation_required',
          errorMessage: 'Facebook API returned 2xx without an external post ID; reconciliation required.',
          responseMetadata: data,
        };
      }
      return {
        ok: true,
        httpStatus: res.status,
        externalPostId: postId,
        externalPostUrl: `https://www.facebook.com/${postId}`,
        responseMetadata: data,
      };
    }

    if (input.platform === 'linkedin') {
      const res = await fetch('https://api.linkedin.com/rest/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.accessToken}`,
          'LinkedIn-Version': '202405',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          author: input.externalAccountId,
          commentary: input.caption,
          visibility: 'PUBLIC',
          distribution: { feedDistribution: 'MAIN_FEED' },
          lifecycleState: 'PUBLISHED',
        }),
        signal: controller.signal,
      });
      const postUrn = res.headers.get('x-restli-id') || '';
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        return {
          ok: false,
          httpStatus: res.status,
          errorClassification: classifyPublishError({
            httpStatus: res.status,
            message: JSON.stringify(data),
          }),
          errorMessage: `LinkedIn API rejected publish (${res.status}): ${JSON.stringify(data)}`,
          responseMetadata: data,
        };
      }
      return {
        ok: true,
        httpStatus: res.status,
        externalPostId: postUrn,
        externalPostUrl: postUrn ? `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}` : undefined,
        responseMetadata: data,
      };
    }

    return {
      ok: false,
      httpStatus: 501,
      errorClassification: 'validation_error',
      errorMessage: `Direct media container publishing for "${input.platform}" requires verified public HTTPS media URL hosting and platform app review approval.`,
    };
  } catch (err) {
    const e = err as { name?: string; code?: string; message?: string };
    return {
      ok: false,
      errorClassification: classifyPublishError({
        code: e.name === 'AbortError' ? 'ABORT_ERR' : e.code,
        message: e.message,
      }),
      errorMessage: e.message || 'Network failure while contacting platform API.',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPlatformAnalytics(input: {
  platform: SocialPlatform;
  externalAccountId: string;
  encryptedCredentialsRef: string | null;
}): Promise<{
  ok: boolean;
  metrics: Array<{ name: string; value: number | null; isUnavailable: boolean; ref: string }>;
  errorMessage?: string;
}> {
  if (!input.encryptedCredentialsRef) {
    return {
      ok: false,
      metrics: [],
      errorMessage: `Cannot synchronize analytics: social account on "${input.platform}" is not authorized via OAuth.`,
    };
  }
  return {
    ok: false,
    metrics: [],
    errorMessage: `Live analytics API call for "${input.platform}" requires an active platform-approved OAuth token with insights scope.`,
  };
}
