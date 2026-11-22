# MORGAN GROUP — REST API Reference

All endpoints are mounted under `/api`. Authenticated routes accept either the `HttpOnly` session cookie (`kestrel_session`) or `Authorization: Bearer <token>`. Validation uses `zod` schemas and returns structured `400` JSON payloads on invalid inputs.

## Authentication & Session
- `GET /api/auth/bootstrap-status` — Public check returning `{ needsBootstrap: boolean }`.
- `POST /api/auth/bootstrap` — One-time creation of the initial `super_admin` account (locked permanently once any user exists).
- `POST /api/auth/login` — Credential login (`email`, `password`). Issues session token & cookie.
- `POST /api/auth/logout` — Revokes active session token and clears cookie.
- `GET /api/auth/me` — Returns current user, roles, permissions, and organization summary.

## Dashboard & System Observability
- `GET /api/dashboard/summary` — Live SQL aggregates for clients, projects, tasks, content, approvals, publishing, agents, integrations, and finance.
- `GET /api/healthz` — Liveness probe (`status`, database connectivity, uptime).
- `GET /api/system/health` — Detailed health telemetry (worker status, queue depth, failed/dead-letter counts, integration readiness, recent `system_events`).
- `GET /api/audit-logs` — Paginated, filterable immutable audit trail (`action`, `entityType`, `actorType`).

## Organization, Employees, Roles & Agents
- `GET /api/org/overview` — Organization profile, department counts, headcount, and system configuration.
- `PATCH /api/org/settings` — Update organization name, timezone, currency, and governance settings.
- `GET /api/departments` / `POST /api/departments` — List or create agency departments.
- `GET /api/employees` / `POST /api/employees` / `PATCH /api/employees/:id` — Manage human staff, roles, and hourly cost rates.
- `GET /api/roles` — List roles with attached granular permissions (`31` system permissions).
- `GET /api/agents` — List the 14 operational AI agents with active model, temperature, status, and run counts.
- `GET /api/agents/:id` — Detailed agent profile, prompt versions, allowed tools, policies, and recent runs.
- `PATCH /api/agents/:id` — Update agent model, system prompt (creates new immutable `ai_agent_versions` record), temperature, token budget, or status.
- `POST /api/agents/:id/run` — Enqueues a durable `agent_task_execution` background job using the agent's configured server-side model (local Ollama by default; optional Gemini cloud).

## MORGAN Academy
- `GET /api/academy` — Returns the learning catalog, active virtual team, and saved enrollment progress.
- `POST /api/academy/:courseId/enrollments` — Enrolls an employee. Requires `users:manage`; duplicate enrollments are idempotent.
- `PATCH /api/academy/enrollments/:enrollmentId` — Records integer progress from 0–100 and derives the enrollment state. Requires `users:manage`; every change is audited.

## Clients, Brands, Projects, Campaigns & Tasks
- `GET /api/clients` / `POST /api/clients` / `GET /api/clients/:id` / `PATCH /api/clients/:id`
- `GET /api/brands` / `POST /api/brands` / `POST /api/brands/:id/versions` — Versioned brand voice, audience, pillars, dos/donts, and visual guidelines.
- `GET /api/projects` / `POST /api/projects` / `PATCH /api/projects/:id`
- `GET /api/campaigns` / `POST /api/campaigns` / `PATCH /api/campaigns/:id`
- `GET /api/tasks` / `POST /api/tasks` / `PATCH /api/tasks/:id` / `POST /api/tasks/:id/comments`
- `GET /api/trends` / `POST /api/trends/research` — Triggers real Google Search-grounded Gemini research (`trend_research` background job) returning real source URLs.
- `GET /api/competitors` / `POST /api/competitors`

## Content Studio, Approvals, Assets & Publishing
- `GET /api/content` / `POST /api/content` / `GET /api/content/:id`
- `POST /api/content/:id/versions` — Saves new immutable version, recalculates SHA-256 hash, invalidates prior approvals if edited.
- `POST /api/content/:id/transition` — Enforces 14-state FSM transitions.
- `POST /api/content/:id/submit-approval` — Locks current version hash into an `approval_requests` record.
- `GET /api/approvals` / `POST /api/approvals/:id/decide` — Human-only `approve`, `reject`, or `changes_requested` decision bound to exact SHA-256 content hash.
- `GET /api/assets` / `POST /api/assets/upload` — Multipart disk upload (MIME allowlist, 25MB limit, SHA-256 checksum).
- `GET /api/assets/:id/download` — Verifies HMAC-SHA256 signed URL (`expires`, `sig`) and streams file.
- `GET /api/publishing` / `POST /api/publishing/schedule` — Schedules only human-approved content versions; generates deterministic idempotency key and enqueues `publish_social_content`.
- `POST /api/publishing/:id/retry` / `POST /api/publishing/:id/cancel`

## Background Jobs, Analytics, Finance, Integrations & Notifications
- `GET /api/jobs` / `POST /api/jobs/:id/cancel` / `POST /api/jobs/:id/retry`
- `GET /api/analytics` / `POST /api/analytics/sync` — Enqueues honest `analytics_sync` job; returns empty state when no platform credentials are connected.
- `GET /api/finance/summary` — Real ledger totals (`revenue`, `actualExpenses`, `estimatedAiCost`, `netMargin`).
- `GET /api/finance/invoices` / `POST /api/finance/invoices` / `PATCH /api/finance/invoices/:id`
- `GET /api/finance/expenses` / `POST /api/finance/expenses`
- `GET /api/integrations` / `POST /api/integrations/:provider/verify` — Verifies live connectivity (e.g. live Gemini ping or env credential audit).
- `GET /api/social-accounts` / `POST /api/social-accounts/oauth/start` / `GET /api/oauth/:platform/callback`
- `GET /api/notifications` / `POST /api/notifications/:id/read` / `POST /api/notifications/read-all`
