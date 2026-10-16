# Public Application Workflow Design

## Goal

Move the existing public mustahik application experience into the live Next.js frontend and connect every submission to the authenticated amil workspace.

## Current foundation

- The legacy Vite portal already contains a five-step form, document upload, registration number, status tracking, programme catalogue, SOP, and FAQ.
- The API already exposes `POST /api/public/pengajuan`, `GET /api/public/lacak/:query`, document storage, and the `mustahik`, `applications`, `assessments`, `mpzis`, and `ppd` workflow tables.
- The Next.js public root currently only provides a landing page. The authenticated Mustahik workspace already supports queue filtering and status decisions.

## Product boundaries

### Public portal

`/` becomes a clear public service entry point. `Pengajuan bantuan` opens `/pengajuan`; `Lacak pengajuan` opens `/cek-pengajuan`. Public visitors never see internal records or staff controls.

`/pengajuan` uses a five-step guided form: identity, address/economic condition, requested programme, documents, and confirmation. It validates only the fields required for the current step, preserves entered data while navigating steps, submits `FormData` to the existing public API, and displays the API-issued registration number.

`/cek-pengajuan` accepts one registration number, NIK, or phone number. It shows only the applicant's own summary, current status, the six-stage timeline, and a safe next-action message. The route must not expose internal assessor notes, bank details, or other applicants' records.

### Amil workflow

Existing `/penyaluran/mustahik` remains the single queue and decision workspace. Public submissions enter with status `Diajukan`, so the existing dashboard priorities, Mustahik list, peta, and reports automatically consume the same record.

The first implementation adds a visible source marker, `Portal publik`, and public document metadata in the selected record so an amil immediately knows the origin and whether documents need review. It does not create a parallel queue.

### Subsequent modules

The existing `applications`, `assessments`, `mpzis`, and `ppd` records will be surfaced as dedicated workflow panels in later increments:

1. Transaction journal: each completed PPD becomes an immutable distribution transaction with payment method, proof, programme, asnaf, and recipient.
2. Task and notification centre: work is assigned to an amil with due date, status, and an applicant WhatsApp message generated from the existing API.
3. Master data: controlled programme, asnaf, district, staff, document requirement, and disbursement-method definitions. This needs role-aware admin controls and is not placed in the public portal.

## UX and visual rules

- Use the established light, white, Manrope-based BAZNAS UI: emerald action colour, navy text, soft slate surfaces, rounded cards, clear spacing, and short motion on step changes.
- The public form uses one main task per screen, plain Indonesian labels, field hints, visible required markers, and a persistent progress indicator.
- Desktop uses a readable two-column form where appropriate; tablet and mobile collapse to one column with 44px minimum tap targets.
- Error messages sit next to the relevant field; success state makes the registration number copyable and offers the tracking route.
- All sensitive values are masked in the tracking interface except where the applicant explicitly enters them into the form.

## Data contract

The Next frontend adds typed `PublicApplicationPayload`, `PublicApplicationResult`, and `PublicTrackingResult` interfaces plus `api.submitPublicApplication(formData)` and `api.trackPublicApplication(query)` client methods. The methods call existing public endpoints without an amil access token requirement.

The application form maps existing server fields (`name`, `nik`, `kk_number`, `phone`, `address`, `rt_rw`, `kelurahan`, `kecamatan`, `program`, `asnaf`, `request_title`, `proposed_amount`, `monthly_income`, `family_dependents`, `notes`) and document fields (`ktp`, `kk`, `sktm`, `surat_kelurahan`, `rekomendasi_upz`, `permohonan`). The server generates the file number and initial workflow state.

## Error handling

- Network/server failure keeps form values and shows a recoverable inline message.
- Tracking 404 renders a helpful empty state without inventing a record.
- Upload input rejects files above the server's 10 MB limit before submit and shows accepted file names.
- API validation remains the source of truth; client validation shortens obvious correction loops.

## Testing

- API client tests cover multipart submission and encoded tracking URLs.
- Form tests cover step validation, uploaded-document state, success state, and failed submission.
- Tracking tests cover loading, found, not-found, and API error states.
- Existing Mustahik workspace tests are extended only for public-source marker rendering.
- Run focused tests, the complete frontend test suite, typecheck, and production build before integration.

