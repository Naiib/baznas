# Penerimaan & Penyaluran Production Hardening Design

## Goal

Make the current Penerimaan and Penyaluran experience safe, truthful, and reliable without redesigning established screens or adding speculative features.

## Approved Scope

The work is split into two ordered phases. Frontend comes first: audit both modules for broken, confusing, inaccessible, or data-misleading states and fix only evidence-backed issues. Backend follows: protect uploaded evidence, enforce Penyaluran workflow transitions, remove synthetic dashboard fallbacks, make report exports honor their definitions and filters, reduce PII exposure, normalize public error responses, validate custom periods, and align access rules.

The existing visual language, navigation, and domain terminology remain intact. Empty datasets must render as zero/empty states, never invented operational values. No production records or environment files may be modified during implementation.

## Architecture

Frontend fixes stay inside the existing Next.js routes, shared API client, and module components. Server authorization remains authoritative; frontend guards only mirror capabilities for navigation and affordances. Every changed behavior gets a focused regression test before implementation.

Backend hardening uses small domain helpers for file authorization, workflow transitions, report query construction, public error mapping, and period validation. Routes delegate to those helpers so security and correctness can be tested without broad route rewrites. Existing PostgreSQL repository patterns and response envelopes are preserved.

## Data And Security Rules

- `/uploads` must not be publicly static. Downloads require authentication and an authorized role or ownership/capability decision.
- Workflow target states must come from an explicit transition map; arbitrary `target_status` input is rejected.
- Dashboards and maps must reflect stored data. Missing data produces zero, empty arrays, or an explicit empty state.
- Report export must use the selected report definition, period, filters, scope, and deterministic pagination/limits.
- Penerimaan list/detail payloads use allowlisted DTOs and role-aware masking for contact, bank, and evidence fields.
- Client-facing 5xx responses are generic and carry a correlation identifier; internal detail stays server-side.
- Custom periods accept valid `YYYY-MM-DD` values with `start_date <= end_date`; invalid input returns 422.
- Backend access policy is the source of truth; frontend route guards reflect it exactly.

## UX And Accessibility Acceptance

- Core desktop and mobile routes render without uncaught errors, horizontal overflow, clipped primary actions, or misleading sample values.
- Loading, empty, success, validation, and API-error states are distinguishable and actionable.
- Buttons, links, inputs, dialogs, and tables retain labels, keyboard focus visibility, and usable target sizes.
- No redesign is performed unless required to fix a verified usability or accessibility defect.

## Verification And Release

Run focused red/green tests for each fix, then the full backend suite, frontend Vitest suite, TypeScript check, Next production build, root lint/build, and production smoke checks. Review the final diff independently before merging. Deployment uses the existing release script with an exact full SHA, followed by PM2, health, public route, authentication, and representative Penerimaan/Penyaluran checks.
