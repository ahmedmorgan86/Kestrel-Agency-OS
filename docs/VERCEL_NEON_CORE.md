# Vercel and Neon core runtime

The Vercel Node function in `api/[...path].js` serves the first operational slice of MORGAN GROUP. It connects to Neon through the encrypted `DATABASE_URL` runtime setting and creates its idempotent PostgreSQL tables and virtual-company seed rows on first API request.

## Included routes

- `GET /api/healthz` checks database connectivity without exposing configuration.
- `GET /api/auth/status`, `POST /api/auth/bootstrap`, `POST /api/auth/login`, and `POST /api/auth/logout` provide first-admin setup and session handling.
- `GET /api/organization` and `GET /api/hq/state` provide company metadata and the 30-person virtual staff snapshot.
- `GET /api/academy`, `POST /api/academy/:courseId/enrollments`, and `PATCH /api/academy/enrollments/:enrollmentId` provide academy records.

The first successful database initialization seeds 13 departments, 30 fictional employees (with reserved `.example` addresses), and 4 learning courses. It does not create a user account. The owner creates the first administrator through the app's setup form.

Passwords are stored as scrypt hashes. Session tokens are generated from cryptographically secure random bytes; only their SHA-256 hashes are stored in PostgreSQL. Browser sessions use HttpOnly, Secure, SameSite cookies, and the login endpoint throttles repeated failed attempts.

## Vercel configuration

Store `DATABASE_URL` as a sensitive environment variable on the deployment branch. Do not put connection strings in repository files or client-side `VITE_` variables. The current Neon connection is scoped to the preview branch; production has not been enabled.

## Scope

The existing Express/SQLite modules for clients, projects, task workers, integrations, files, finance, agent execution, and realtime events are not served by this Vercel function yet. Requests for those routes return an explicit `not_migrated` response. The current HQ snapshot includes the real seeded staff roster but does not claim that simulated employees or AI agents are executing work.
