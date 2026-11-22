# Kestrel Agency OS — Security Architecture & Threat Model

## 1. Authentication & Session Security
- **Password Hashing**: `crypto.scrypt` with per-user 16-byte random salt and `timingSafeEqual` verification. Plaintext passwords are never logged or stored.
- **Session Tokens**: 32-byte cryptographically random tokens; only the HMAC-SHA256 digest is persisted in `sessions`. Revocation deletes/marks the session row immediately.
- **Cookie & Iframe Compatibility**: Sessions are issued both via `HttpOnly` cookie (`SameSite=None; Secure` over HTTPS, `SameSite=Lax` on local HTTP) and `Authorization: Bearer` header for sandboxed iframe environments.
- **First-Run Bootstrap Lock**: `POST /api/auth/bootstrap` executes inside a database check that permanently rejects requests once the first user account exists.

## 2. Role-Based Access Control (RBAC)
Five system roles map to 31 fine-grained permissions (`src/domain/rbac.ts`):
- `super_admin` — Full system administration, security settings, and integration management.
- `agency_director` — Full agency operations, approvals, finance, and agent configuration.
- `account_manager` — Client CRM, brands, projects, campaigns, content submission, and scheduling.
- `creative_lead` — Content production, asset management, and creative QA.
- `analyst` — Read-only access to dashboards, analytics, trends, competitors, and finance reporting.

Every state-changing endpoint enforces `requireAuth` and `requirePermission(...)` server-side before mutating state.

## 3. Secrets & Credential Encryption at Rest
- Third-party OAuth tokens and integration secrets are encrypted with **AES-256-GCM** (random 12-byte IV + authentication tag) using `ENCRYPTION_SECRET` before storage.
- `GEMINI_API_KEY` and social OAuth client secrets remain strictly server-side; the frontend never requests, renders, or persists raw API keys.
- Structured server logging strips sensitive keys (`password`, `token`, `secret`, `authorization`, `cookie`, `apiKey`, `accessToken`, `refreshToken`).

## 4. Asset & Upload Hardening
- Uploaded files are constrained to an explicit MIME allowlist (`image/png`, `image/jpeg`, `image/webp`, `image/gif`, `video/mp4`, `application/pdf`, `text/plain`, `text/csv`) and a 25MB maximum payload size.
- Filenames are sanitized and stored under UUID keys outside the public static root (`./data/storage/`).
- Downloads require a time-limited **HMAC-SHA256 signed URL** (`expires` + `sig`) validated with constant-time comparison.

## 5. AI Agent Safety & Prompt Injection Defense
- **Tool Policy Enforcement**: `canAgentInvokeTool` (`src/domain/rbac.ts`) blocks AI agents from invoking high-risk actions (`publish_social_post`, `approve_content`, `modify_billing`) without an explicit human approval artifact.
- **Untrusted Data Isolation**: External text (scraped trends, competitor copy, client notes) is scanned for prompt-injection markers and wrapped in `<untrusted_data>` delimiters before model invocation.
- **Human-Only Approval Gate**: Content approvals bind a human `user_id` to an immutable SHA-256 version hash; AI agent actors are rejected at both domain and route layers.

## 6. HTTP Security & Rate Limiting
- Responses apply `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy` (without blocking iframe embedding via `X-Frame-Options`).
- An in-memory sliding-window rate limiter throttles authentication and high-cost AI endpoints.

## 7. Known Security Considerations for Production Deployment
- Production startup fails unless `SESSION_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` are each configured with at least 32 characters. Keep them independent, stable, and in a secret manager; changing either can invalidate sessions or make stored OAuth credentials unreadable.
- Production startup also requires absolute `SQLITE_DB_PATH` and `STORAGE_ROOT_DIR` paths. Mount both on persistent storage; deployments on ephemeral serverless filesystems are unsupported and refused by the included Docker production profile.
- Place the application behind TLS termination and a reverse proxy / WAF for distributed rate limiting (Redis-backed) across multiple replicas.
- Enable automated off-host encrypted backups for the database and object storage bucket.
