# MORGAN GROUP — Initial Repository Audit

**Audit date:** 2026-11-23 (Africa/Cairo)  
**Audited revision:** `ee558ec` (`origin/main`, PR #10 merge)  
**Working branch:** `codex/morgan-group-real-ops`  
**Scope:** Phase 0 inspection and baseline checks only. This report records the repository as found; it does not certify the public deployment or external integrations.

## Repository and stack

- React 19 + TypeScript single-page application; Vite 8, Tailwind CSS 4, Three.js 0.187.
- Express/TypeScript server with SQLite (`node:sqlite`), migrations, RBAC, audit events, durable job queue, disk asset storage, and local AI/social-provider adapters.
- A separate Vercel catch-all API (`api/[...path].js`) uses PostgreSQL through `DATABASE_URL`; its own documentation describes this as a limited runtime slice. The full Express/SQLite routes are not all exposed through that Vercel handler.
- Vercel static build is configured to output `dist`. The project also has Docker files and database migration documents.
- No root `README.md` or root `AGENTS.md` was present. Existing guidance is in `docs/` (`ARCHITECTURE.md`, `API.md`, `OPERATIONS.md`, `SECURITY.md`, `VERCEL_NEON_CORE.md`, and migrations).
- `package.json` is named `react-example`; scripts are `dev`, `start`, `start:production`, `build`, `preview`, `clean`, `lint` (TypeScript check), and `test` (Node test runner through `tsx`).

## What is implemented in source

- Owner/admin bootstrap and login routes, hashed passwords, server-side sessions, route-level authentication, role/permission checks, security headers, and audit logging exist in the Express runtime. Domain tests cover human-only, immutable content approvals and block unsafe workflow transitions.
- Content, organization, meetings, tasks, academy, agents, analytics, finance, and publishing interfaces/routes exist to varying degrees. There are 30 fictional employee records and 14 seeded AI-agent definitions in the SQLite seed, plus 13 departments and academy courses.
- The HQ uses four bundled animated GLB rigs with skeletal animation clips. The same small set of stylized models is reused across the roster; it is not a set of 30 distinct photorealistic people. Movement is tied to virtual work/meeting state, so it is a visual simulation, not autonomous humans.
- The Vercel API has PostgreSQL-backed first-run bootstrap/session handling, organization/HQ/academy and a limited set of dashboard/client/project operations. It explicitly returns `not_migrated` for some full-server functions. The configured production deployment and its database were not modified during this audit.
- Social publishing adapters are present, but live actions depend on platform credentials. Local AI uses Ollama when installed/configured; optional cloud providers require their own keys. Video generation is documented as unavailable without a provider.

## Material gaps against the requested product

1. **The website's Arabic-only requirement is not met.** Several shared views, navigation entries, entity names, seed rows, status strings, and operations text remain English. `index.css` provides RTL direction, but that does not translate the product.
2. **The specified 30-person Arabic organization is not seeded.** Existing employee seed names, departments, hierarchy, roles, and meeting rooms differ from the requested org chart. No idempotent dedicated MORGAN GROUP seed command or relationship-integrity test for that chart is evident.
3. **The 3D staff are visibly stylized virtual people, not realistic human actors.** Four reusable rigs cannot meet the stated appearance goal. Walk/idle clips and seated poses are supported, but realistic interaction, 30 distinct appearances, and sustained natural work behavior are not established by the current tests.
4. **The deployed and local server topologies differ.** Express's complete route set and durable worker are not available in the Vercel handler. The PostgreSQL runtime is a separate partial implementation; the documented environment says its database connection is preview-scoped. A production-like, persistent end-to-end run has not been demonstrated by these checks.
5. **Documentation is inconsistent or inaccurate.** `ARCHITECTURE.md` describes avatars as photorealistic, while the bundled assets are visibly stylized; it also centers the SQLite server topology. `VERCEL_NEON_CORE.md` documents a narrower Neon/PostgreSQL runtime. `.env.example` still lists unused-by-default Supabase and optional paid AI provider keys although the product brief is free-only.
6. **The frontend build produces a large JavaScript bundle** (1,225.73 kB minified before gzip), including Three.js. Vite also warns about `__dirname` in the config loader and the chunk-size threshold.
7. No root README explains which deployment is operational, how to initialize the free/local setup, or what currently works versus is simulated/disconnected.

## Baseline checks

Checks were run against a clean temporary clone of audited revision `ee558ec`, so npm installation and build outputs did not replace the working checkout's files or touch its database.

| Check | Result | Evidence / notes |
| --- | --- | --- |
| `npm ci` in the existing checkout | **Blocked** | Windows returned `EPERM` while unlinking `node_modules/lightningcss-win32-x64-msvc/lightningcss.win32-x64-msvc.node`; the local preview may hold this file. The original `node_modules` then lacked packages, so failures from running checks against that damaged installation were not treated as code findings. |
| `npm ci` in a clean temporary clone | **Passed** | Installed 242 packages; npm's install report said 0 vulnerabilities. npm 12 blocked install scripts for `esbuild` and `protobufjs` by default; the audit clone explicitly approved those two packages before running the checks. |
| `npm run build` | **Passed** | Vite 8.3.8 transformed 1,688 modules. Warnings: `__dirname` config-loader compatibility and a 1,225.73 kB minified JS chunk (>500 kB threshold). |
| `npm run lint` | **Passed** | `tsc --noEmit` completed without diagnostics. |
| `npm test` | **Passed** | 14/14 tests passed, including database/worker integration, approval workflow, human/agent state derivation, and HQ world-position tests. |
| `npm audit --omit=dev` | **Passed** | 0 production dependency vulnerabilities reported. This excludes development dependencies; full dependency audit remains for delivery phase. |

## Priority order for the next phases

1. Establish a reliable, free-only local/persistent runtime and test protected endpoints and the owner-only publish gate end to end; keep external deployment/database changes out of scope until explicitly requested.
2. Replace the existing roster and organizational hierarchy with the requested 30 fictional Arabic staff, responsibilities, management links, offices, meetings, tasks, and an idempotent seed with integrity tests.
3. Translate all user-visible screens and operating states to Arabic and ensure the signed-in default opens the 3D HQ with honest service-status indicators.
4. Fix discrepancies between the Vercel entry point, frontend expectations, and operational docs so unsupported features are clearly marked rather than appearing live.
5. Improve the 3D scene incrementally with licensed assets, unique appearance variation, natural seating/work/meeting behavior, progressive loading, and measured performance. Report the realism ceiling honestly; this baseline does not satisfy photoreal-human expectations.
6. Reduce bundle weight, update setup documentation, and perform the complete build/test/security audit before opening a review-only PR.

## Not verified in Phase 0

- No login or workflow was exercised against the user's real deployment, production database, or credentials.
- No production Vercel environment settings, external account, paid service, or live social connection were changed.
- No realistic-human quality or 30-actor device-performance benchmark was run.
- No production deployment, public publishing action, or real-data migration was attempted.
