# Production Deploy and Database Safety Design

## Goal

Make production releases deterministic and prevent BAZNAS from serving demo or SQLite data when PostgreSQL is unavailable.

## Deployment

GitHub Actions validates the exact `main` commit, then connects to the VPS and asks a versioned deploy script to release that same SHA. The VPS fetches that SHA, installs locked dependencies with `npm ci`, builds Next.js locally so `frontend-next/.env.local` supplies the domain-restricted Mapbox public token, restarts the established PM2 processes, and checks backend and frontend health.

The release process must preserve `.env`, `frontend-next/.env.local`, and `uploads`. It must not use Docker Compose, SCP partial source copies, `npm install`, or `pm2 start server/index.js`.

If the post-release health checks fail, the deploy script resets the tracked source to the previous SHA, rebuilds, restarts PM2, and exits unsuccessfully.

## Database policy

Production means `NODE_ENV=production`. In production, PostgreSQL is mandatory: inability to connect raises a startup error. SQLite fallback is development/test-only.

Demo mustahik, sample reports, sample initiatives, master-data seeds, and default users are development/test-only. Production startup may create or reconcile schema, but it must never insert demo data or default accounts.

## Verification

- Unit tests cover production database fail-closed policy and non-production fallback policy.
- Existing server access-policy, metrics, audit, public-tracking, and frontend test suites remain green.
- CI runs deterministic installs, tests, typecheck, and builds.
- VPS checks `/api/health`, `http://127.0.0.1:3002/penyaluran`, and saves PM2 only after both respond successfully.
