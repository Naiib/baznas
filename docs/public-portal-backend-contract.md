## Public intake and printable letter

`POST /api/public/pengajuan` accepts multipart form data through both legacy and P0 writers. Public callers cannot set asnaf; both writers persist SQL NULL even when the schema has a legacy default. Internal classification, historical rows, and internal upload limits remain unchanged.

| Input | Storage / behavior |
| --- | --- |
| `applicant_status` | `Perorangan` (default) or `Lembaga`; other values rejected |
| `name` | Applicant name or institution name; required, up to 255 characters |
| `pic_name` / `representative_name` | For institutions, maps to existing `beneficiary_name` (contact); institution remains in `name` |
| `pic_nik` / `nik` | Optional institution contact NIK; if supplied, string of exactly 16 digits |
| `pic_phone` / `phone` | Institution contact phone in existing `phone` |
| `institution_name` | Optional alias for institution `name` |
| `proposed_amount` | Finite nonnegative number or numeric string; stored in `recommended_amount` without a schema rename; `approved_amount` remains zero |
| `notes` / `distribution_purpose` | Economic description in existing fields; either fills the other when only one is supplied; distinct supplied fields are retained |
| `address`, `rt_rw`, `kelurahan`, `kecamatan` | Existing applicant/institution address fields |

Frontend institution submission uses `name` for the institution and `pic_name`, `pic_phone`, plus `nik` for its contact. Hidden individual fields must not be submitted when switching type. Intake response remains `{ success, data: { id, file_no, status, ... } }`; P0 additionally returns normalized `applicant_status` and `proposed_amount`. The legacy `recommended_amount` input alias is retained for existing clients, but is still only an applicant proposal, never approval.

### Documents

Maximum **5,242,880 bytes (5 MiB) per file**, up to five files. PDF, JPEG (`.jpg` / `.jpeg`), and PNG are allowed; claimed MIME, extension, and content signature must agree. P0 writes randomized files with private permissions; legacy access continues through the existing protected upload routes. Partial parser failures and persistence failures remove files; legacy record/document/notification writes run in a database transaction.

The multipart parser uses a one-byte overflow sentinel because Busboy reports its size limit at equality. Storage validation still enforces the exact 5 MiB maximum. Tests prove an exactly-sized file succeeds, one extra byte fails, and multiple individually valid files totaling more than 5 MiB succeed. Internal artifact policy remains 10 MiB / 30 MiB quota. The parent-reported proxy body cap of 50 MB accommodates five public files; proxy/production config is not changed by this package.

Supported document keys include `ktp`, `kk`, `sktm`, `surat_kelurahan`, `rekomendasi_upz`, `rekomendasi` (UPZ or masjid alternative), `permohonan`, `bukti_kebutuhan`, `proposal`, and `surat_permohonan`. The last is stored as Surat Permohonan, not as a bill. Size/type errors return 422; validation errors include `code`, `message`, and where applicable `field_errors`. Multiple valid files are supported without increasing the per-file limit.

### Printable letter

`POST /api/public/surat-permohonan` accepts JSON directly from the current form draft. It performs no database lookup, requires no case ID or session, and never reads another applicant's data. JSON body maximum is 100 KiB; exceeding it returns 413. Rate limit is 30 requests per IP per 15 minutes. Successful responses are streaming `application/pdf`, A4, with `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and a fixed safe inline filename. The frontend may download the response as a Blob.

Fields match the intake identity aliases. Optional `position` / `representative_role` is printable only; no new business/legal requirement or storage column is introduced. `economic_description`, `notes`, or `distribution_purpose` fills the economic paragraph; maximum 4,000 characters. `address` and `request_title` each allow 1,000 characters; longer or non-string values return 422 rather than being silently truncated. Printing again uses edited input. Zero budget prints Rp 0, not an invented BAZNAS standard.

The document is explicitly **DRAFT**, with no claimed official letterhead/contact details, fictitious reference number, signed approval, stamp, or compulsory duty stamp. Long text flows onto additional A4 pages with page numbers. Official wording, institution mandatory fields, and document/upload-back requirements remain pending the owner's MKA-77 decision; this package does not infer them.

### Verification

Tests use pg-mem or a disposable task-labeled PostgreSQL container, never the production database. `public-surat-permohonan.test.js` verifies PDF text through decoded content streams, A4 media boxes, multipage limits, final text markers, fresh-input regeneration, stateless HTTP, headers, validation, body cap, and rate limit. `penyaluran-p0-public-intake.test.js` verifies real DB mapping and NULL persistence on both writers, exact-size/multi-file uploads, spoofing, rollback, cleanup, and retry. Existing internal artifact/private-download/tracking suites guard regressions.

One pre-existing intake test (`legacy file suffix collision allocates the next free canonical number`) hard-codes September 2026 but uses the current clock. On October 7, 2026 it expects the wrong month; it is reproduced against the untouched baseline and excluded explicitly from the otherwise passing focused run. No unrelated production behavior is changed to accommodate it.
