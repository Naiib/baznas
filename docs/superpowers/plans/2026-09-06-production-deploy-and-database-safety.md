# Production Deploy and Database Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release the exact validated commit safely and prohibit demo/SQLite data in production.

**Architecture:** A small runtime policy module owns the environment decisions consumed by the database initializer. A VPS deploy script owns release, health check, and rollback. GitHub Actions performs validation and invokes that script with the immutable commit SHA.

**Tech Stack:** Node.js 24, PostgreSQL, Next.js 16, PM2, GitHub Actions, Bash.

## Global Constraints

- Preserve production `.env`, `frontend-next/.env.local`, database, and uploads.
- Production requires PostgreSQL; no SQLite fallback or demo seeding.
- Deployment must use `npm ci`, local VPS frontend build, and PM2's supported commands.
- Do not start Docker containers.

---

### Task 1: Production runtime policy

**Files:**
- Create: `server/runtime-policy.js`
- Modify: `server/db.js`
- Test: `server/runtime-policy.test.js`

- [ ] Write tests showing production requires PostgreSQL and disables demo seeds, while development permits fallback and seeds.
- [ ] Run `node --test server/runtime-policy.test.js` and confirm the new policy exports are missing.
- [ ] Implement pure environment-policy functions and use them in database connection fallback and startup seed calls.
- [ ] Run the focused test and then all server tests.
- [ ] Commit the runtime-policy change.

### Task 2: Deterministic deploy script

**Files:**
- Create: `deploy/release-vps.sh`
- Modify: `.github/workflows/deploy.yml`

- [ ] Add a shell test/static validation for deployment invariants: exact SHA, `npm ci`, local Next build, PM2 `npm run server`, and health checks.
- [ ] Verify the test fails against the current deployment workflow.
- [ ] Implement the deploy script with a previous-SHA rollback trap and change the GitHub workflow from SCP deployment to SSH invocation of the script.
- [ ] Run shell syntax validation and repository test/build commands.
- [ ] Commit the deployment change.

### Task 3: Release verification

**Files:**
- Modify: `docs/operations/data-access-runbook.md`

- [ ] Add the exact release, rollback, and health-check procedure.
- [ ] Run backend and frontend test suites, frontend typecheck, and production builds.
- [ ] Commit the runbook change.
