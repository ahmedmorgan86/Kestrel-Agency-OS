# Kestrel Agency OS — System Architecture

## 1. Core Architectural Principle
Kestrel Agency OS is an internal **AI-First Social Media Agency Operating System** engineered under a strict **zero-simulation** contract:
- Operational records are backed by relational tables (`SQLITE_DB_PATH`, SQLite WAL mode, and `PRAGMA foreign_keys = ON`). The 30-person `@morgangroup.example` roster and photorealistic HQ avatars are fictional visual sample data; they must not be represented as employed staff or factual company activity.
- Zero fake clients, zero fabricated analytics metrics, zero simulated publishing calls, and zero synthetic agent runs are ever seeded or returned.
- All external AI models and social APIs are accessed exclusively server-side through provider adapters that return honest, structured failure diagnostics when credentials or permissions are missing.

## 2. Runtime Topology
```
Browser (React 19 + Tailwind v4 SPA)
   │  HTTPS / HTTP (Session Cookie + Bearer Token)
   ▼
Express Server (`server.ts`, port 3000)
   ├── Static / Vite Middleware (`dist/` in prod, Vite middleware in dev)
   ├── Security & Auth Middleware (CSP/Headers, Rate Limiter, Session Resolver, RBAC)
   ├── REST API Routers (`/api/*`)
   │     ├── authAndOrg.ts         (Auth, Org, Departments, Employees, Roles, Agents, Audit, Health)
   │     ├── clientsAndWork.ts     (Clients, Brands, Projects, Campaigns, Tasks, Trends, Competitors)
   │     ├── studioAndGov.ts       (Content Workflow, Versions, Approvals, Assets, Signed URLs)
   │     └── distributionAndFinance.ts (Integrations, OAuth, Publishing, Analytics, Finance, Notifications)
   ├── Domain Logic Layer (`src/domain/`) — Pure deterministic rules, shared & unit-tested
   │     ├── workflows.ts          (14-state Content FSM, 12-state Task FSM, 10-state Publish FSM)
   │     ├── approvals.ts          (FIPS 180-4 SHA-256 hashing, immutability & human-only gates)
   │     ├── rbac.ts               (31 permissions, 5 roles, agent tool policies, injection defense)
   │     ├── finance.ts            (Actual vs estimated ledger math, transparent AI cost rate card)
   │     └── idempotency.ts        (Deterministic publish keys, backoff, lease & timeout classifier)
   ├── Durable SQL Background Worker (`server/services/worker.ts`)
   │     ├── Poll + lease claiming (`background_jobs`)
   │     ├── Crash recovery (`reclaimStaleLeases`)
   │     ├── Exponential backoff + dead-lettering + cancellation
   │     └── Handlers: `agent_task_execution`, `trend_research`, `publish_social_content`, `analytics_sync`
   ├── Storage Engine (`server/services/storage.ts`)
   │     └── Disk blob store (`./data/storage/`), MIME allowlist, 25MB cap, SHA-256, HMAC signed URLs
   └── External Adapters
         ├── `server/services/aiProviders.ts`    (local Ollama text/JSON by default; optional Gemini cloud/grounding/image)
         └── `server/services/socialAdapters.ts` (Official Meta/LinkedIn OAuth & publishing with timeout classification)
```

## 3. Relational Data Model Overview
Migrations live in `server/db/migrations.ts` (and a production PostgreSQL equivalent is provided in `docs/migrations/001_postgresql_schema.sql`). The schema comprises 38 normalized tables grouped into 7 bounded contexts:
1. **Identity & Organization**: `organizations`, `departments`, `roles`, `permissions`, `role_permissions`, `users`, `user_roles`, `sessions`, `employees`.
2. **AI Workforce**: `ai_agents` (14 specialized operational agents), `ai_agent_versions`, `ai_agent_tools`, `ai_agent_policies`.
3. **Client & Brand Strategy**: `clients`, `client_contacts`, `brands`, `brand_versions`, `social_accounts`, `projects`, `campaigns`.
4. **Content Production & Assets**: `content_items`, `content_versions`, `assets`, `asset_versions`, `approval_requests`, `approval_decisions`.
5. **Execution & Durable Queue**: `tasks`, `task_dependencies`, `task_runs`, `background_jobs`, `comments`.
6. **Distribution & Intelligence**: `publishing_jobs`, `publishing_attempts`, `trends`, `competitors`, `performance_metrics`, `analytics_sync_runs`.
7. **Finance, Governance & Observability**: `invoices`, `payments`, `expenses`, `ai_usage_records`, `integrations`, `notifications`, `audit_logs`, `system_events`.

## 4. Human-in-the-Loop Governance
- Content follows a strict 14-state machine (`idea` → `brief` → `draft` → `design_review` → `quality_assurance` → `human_review` → `approved` → `scheduled` → `publishing` → `published`, plus `changes_requested`, `failed`, `archived`, `canceled`).
- Submitting a version for approval computes a canonical SHA-256 hash (`computeContentVersionHash`) over title, body, caption, hashtags, visual brief, CTA, and asset references.
- Editing a content item creates a new version (`version_number + 1`) and automatically invalidates prior pending or approved gates (`approval_status = 'invalidated'`), requiring re-approval before scheduling.
- AI agents are cryptographically and structurally blocked from self-approving (`evaluateApprovalDecision` rejects any non-human actor).
- Rejections and change requests require an explicit rationale.

## 5. Production Scaling Path
- **Database**: Runtime currently uses one SQLite database per persistent application host. `docs/migrations/001_postgresql_schema.sql` is reference DDL only; multi-instance use requires implementing and validating a PostgreSQL runtime adapter before deployment.
- **Object Storage**: Swap `server/services/storage.ts` to S3/GCS/R2 signed PUT/GET URLs while preserving checksum and MIME validation.
- **Worker Topology**: Run `worker.ts` as an independent horizontal worker pool; `background_jobs` lease ownership (`locked_by`, `lease_expires_at`) already coordinates multi-worker claiming and stale-lease recovery.
