# Vercel and Neon core runtime

The Vercel Node function in `api/[...path].js` serves the first operational slice of MORGAN GROUP. It connects to Neon through the encrypted `DATABASE_URL` runtime setting and creates its idempotent PostgreSQL tables and virtual-company seed rows on first API request.

## Included routes

- `GET /api/healthz` checks database connectivity without exposing configuration.
- `GET /api/auth/status`, `POST /api/auth/bootstrap`, `POST /api/auth/login`, and `POST /api/auth/logout` provide first-admin setup and session handling.
- `GET /api/organization` and `GET /api/hq/state` provide company metadata and the 30-person virtual staff snapshot.
- `GET /api/academy`, `POST /api/academy/:courseId/enrollments`, and `PATCH /api/academy/enrollments/:enrollmentId` provide academy records.
- `GET /api/dashboard` and the `/api/clients` routes provide live CRM counts and client create/read/update/archive operations.
- The `/api/projects` routes provide client-linked project create/read/update operations.

The first successful database initialization seeds 13 departments, 30 fictional employees (with reserved `.example` addresses), and 4 learning courses. It does not create a user account. The owner creates the first administrator through the app's setup form.

Passwords are stored as scrypt hashes. Session tokens are generated from cryptographically secure random bytes; only their SHA-256 hashes are stored in PostgreSQL. Browser sessions use HttpOnly, Secure, SameSite cookies, and the login endpoint throttles repeated failed attempts.

PostgreSQL TLS certificate verification must stay enabled. Academy enrollment accepts the course identifier emitted by the client as well as the course code.

## Vercel configuration

Store `DATABASE_URL` as a sensitive Vercel environment variable for the intended preview branch. Do not put connection strings in repository files or client-side `VITE_` variables. As audited on 2026-11-23, the Vercel project had branch-scoped `DATABASE_URL` variables for three older Preview branches and no Production database variable. A separate Neon project, `morgan-group-content`, was created on the Free plan for this review branch only, and its connection string is stored as a sensitive Preview-only variable scoped to `codex/morgan-group-real-ops`. This review database is isolated from the pre-existing Neon project. No Production Vercel variable or Production database was changed. The full Express API has not moved to Neon.

The local Express runtime still uses SQLite through `SQLITE_DB_PATH`; its migration and worker stack is separate. The Vercel catch-all uses Neon/PostgreSQL only for the limited routes listed above. Keep new Neon preview credentials on Preview targets and do not point unreviewed migrations at the production environment.

## Scope

The existing Express/SQLite modules for task workers, integrations, files, finance, agent execution, and realtime events are not served by this Vercel function yet. Requests for those routes return an explicit `not_migrated` response. The current HQ snapshot includes the real seeded staff roster but does not claim that simulated employees or AI agents are executing work.

On the Vercel Hobby plan, keep API routes consolidated in the catch-all function; the existing pi/[...path].js handler routes /api/clients and /api/projects as well as nested paths. This keeps the project under the 12-function deployment limit.
