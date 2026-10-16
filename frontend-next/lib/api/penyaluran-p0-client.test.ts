import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, apiFetch, fetchAuthenticatedBlob, ApiError } from './client';
import type {
  P0IntakePayload,
  P0CaseWorkspace,
  AssessmentDraft,
  MpzisDraft,
  PpdDraft,
  RabLine,
  RecipientConfirmationPayload,
  P0CommandMeta,
} from './penyaluran-p0-types';

describe('Penyaluran P0 API Client (Task 14)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // ==========================================
  // Group 1: P0 Intake API
  // ==========================================
  describe('P0 Intake API (createP0MustahikIntake)', () => {
    it('calls POST /api/penyaluran/mustahik and forwards idempotency headers', async () => {
      const mockResponse = {
        success: true,
        data: {
          id: 42,
          file_no: 'MST-202609-0042',
          received_date: '2026-09-20',
          name: 'Budi Santoso',
          program: 'Kemanusiaan',
          request_title: 'Permohonan Bantuan',
          application_id: 15,
          status: 'Diajukan',
          workflow_mode: 'p0' as const,
          workflow_version: 0,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockResponse,
      });

      const payload: P0IntakePayload = {
        name: 'Budi Santoso',
        nik: '3201012345670001',
        phone: '081234567890',
        address: 'Jl. Merdeka No. 10',
        program: 'Kemanusiaan',
        monthly_income: 1500000,
        monthly_expense: 1400000,
      };

      const meta: P0CommandMeta = {
        idempotency_key: 'idemp-intake-test-001',
        correlation_id: 'corr-intake-test-001',
      };

      const result = await api.createP0MustahikIntake(payload, meta);

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik');
      expect(options.method).toBe('POST');

      const headers = options.headers as Headers;
      expect(headers.get('Idempotency-Key')).toBe('idemp-intake-test-001');
      expect(headers.get('X-Correlation-Id')).toBe('corr-intake-test-001');

      const sentBody = JSON.parse(options.body);
      expect(sentBody.name).toBe('Budi Santoso');
      expect(sentBody.nik).toBe('3201012345670001');
      expect(sentBody.monthly_income).toBe(1500000);
    });

    it('isolates payload by stripping forbidden fields before sending', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { id: 1 } }),
      });

      // Pass an object with forbidden legacy/server fields attached
      const dirtyPayload: any = {
        name: 'Siti Aminah',
        nik: '3201012345670002',
        workflow_mode: 'p0',
        status: 'Survey',
        score: 95,
        priority: 'Tinggi',
        actor_id: 999,
        created_by_id: 888,
        overall_score: 85,
        house_index: 3,
        approved_amount: 5000000,
        idempotency_key: 'should-not-be-in-body',
        correlation_id: 'should-not-be-in-body',
      };

      await api.createP0MustahikIntake(dirtyPayload, { idempotency_key: 'header-key-ok' });

      const [, options] = (global.fetch as any).mock.calls[0];
      const sentBody = JSON.parse(options.body);

      expect(sentBody.name).toBe('Siti Aminah');
      expect(sentBody.nik).toBe('3201012345670002');
      // Assert all forbidden fields were stripped
      expect(sentBody.workflow_mode).toBeUndefined();
      expect(sentBody.status).toBeUndefined();
      expect(sentBody.score).toBeUndefined();
      expect(sentBody.priority).toBeUndefined();
      expect(sentBody.actor_id).toBeUndefined();
      expect(sentBody.created_by_id).toBeUndefined();
      expect(sentBody.overall_score).toBeUndefined();
      expect(sentBody.house_index).toBeUndefined();
      expect(sentBody.approved_amount).toBeUndefined();
      expect(sentBody.idempotency_key).toBeUndefined();
      expect(sentBody.correlation_id).toBeUndefined();
    });

    it('fails closed on HTTP 503 P0_WORKFLOW_DISABLED and NEVER falls back to legacy createMustahik', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          code: 'P0_WORKFLOW_DISABLED',
          message: 'Workflow P0 sedang dinonaktifkan.',
        }),
      });

      const payload: P0IntakePayload = { name: 'Ahmad Fauzi' };

      await expect(api.createP0MustahikIntake(payload)).rejects.toThrow(ApiError);

      try {
        await api.createP0MustahikIntake(payload);
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(503);
        expect(err.code).toBe('P0_WORKFLOW_DISABLED');
      }

      // Assert that global.fetch was NEVER called with /api/mustahik (legacy endpoint)
      for (const call of (global.fetch as any).mock.calls) {
        const url = call[0];
        expect(url).not.toBe('/api/mustahik');
        expect(url).toContain('/api/penyaluran/mustahik');
      }
    });
  });

  // ==========================================
  // Group 2: Canonical Case Workspace Read Model
  // ==========================================
  describe('Canonical Case Workspace (getP0CaseWorkspace)', () => {
    it('fetches server-truth workspace from GET /api/penyaluran/mustahik/:id/workspace', async () => {
      const mockWorkspace: P0CaseWorkspace = {
        success: true,
        case: {
          id: 101,
          nomor_registrasi: 'MST-000101',
          file_no: 'MST-000101',
          status: 'Survey',
          p0_version: 1,
          workflow_version: 1,
          workflow_mode: 'p0',
          is_legacy: false,
          legacy_banner: false,
          created_at: '2026-09-20T00:00:00.000Z',
          updated_at: '2026-09-20T00:00:00.000Z',
          archived_at: null,
          archived_by_id: null,
          archive_reason: null,
        },
        mustahik: {
          id: 101,
          nama: 'Dewi Sartika',
          name: 'Dewi Sartika',
          nik_masked: '3201************',
          phone_masked: '0812****7890',
          applicant_status: 'Perorangan',
          kategori: 'Perorangan',
          asnaf: 'Fakir',
          program: 'Kemanusiaan',
          address: 'Kp. Melati RT 01/02',
          rt_rw: '01/02',
          kelurahan: 'Sukamaju',
          kecamatan: 'Cilodong',
          kabupaten_kota: 'Kota Depok',
          province: 'Jawa Barat',
        },
        case_progress: {
          current_stage: 'assessment',
          active_artifact: 'assessment',
          required_action: 'Lengkapi formulir assessment',
          blocking_reasons: [],
          is_terminal: false,
        },
        assessment: {
          id: 5,
          revision: 1,
          status: 'draft',
          snapshot_hash: null,
          fields: {
            husband_in_household: true,
            husband_name: 'Budi',
            wife_in_household: true,
            wife_name: 'Dewi',
            child_count: 2,
            house_ownership: 'Kontrak',
            home_address: 'Kp. Melati',
            address_matches_ktp: true,
            monthly_rent_amount: 500000,
            husband_occupation: 'Buruh',
            husband_monthly_income: 1200000,
            wife_occupation: 'IRT',
            wife_monthly_income: 0,
            child_occupation: 'Pelajar',
            child_monthly_support: 0,
            assistance_request: 'Sembako',
            applied_to_baznas_before: false,
            previous_application_year: null,
          },
        },
        mpzis_approvals: [],
        mpzis: null,
        ppd: {
          id: null,
          revision: null,
          status: null,
          total_rab: 0,
          amount: 0,
          rab_lines: [],
        },
        disbursement: {
          status: 'pending',
          paid_amount: null,
          paid_at: null,
          transaction_number: null,
          proof_url: null,
          verification_status: null,
          verified_at: null,
        },
        completion: {
          status: 'pending',
          method: null,
          confirmed_at: null,
          recipient_name: null,
          receipt_status: null,
          receipt_url: null,
          payload_sha256: null,
          file_sha256: null,
        },
        permissions: {
          can_assess: true,
          can_approve_mpzis: false,
          allowed_mpzis_roles: [],
          can_submit_ppd: false,
          can_disburse: false,
          can_archive: false,
          can_restore: false,
        },
        capabilities: {
          can_create_draft: true,
        },
        timeline: [],
        history: [],
        documents: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockWorkspace,
      });

      const workspace = await api.getP0CaseWorkspace(101);

      expect(workspace.success).toBe(true);
      expect(workspace.case.id).toBe(101);
      expect(workspace.assessment?.fields?.husband_name).toBe('Budi');

      const [url] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/101/workspace');
    });
  });

  // ==========================================
  // Group 3: Assessment Workflow (5 Methods)
  // ==========================================
  describe('Assessment Workflow', () => {
    it('getAssessment calls GET /api/penyaluran/mustahik/:id/assessment', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { mustahik_id: 10 } }),
      });

      await api.getAssessment(10);
      expect((global.fetch as any).mock.calls[0][0]).toContain('/api/penyaluran/mustahik/10/assessment');
    });

    it('createAssessmentDraft calls POST /api/penyaluran/mustahik/:id/assessment/drafts', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { id: 1, revision: 1 } }),
      });

      const draft: Partial<AssessmentDraft> = {
        husband_in_household: true,
        husband_name: 'Budi',
      };
      const meta: P0CommandMeta = { idempotency_key: 'assess-create-key' };

      await api.createAssessmentDraft(10, draft, meta);

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/assessment/drafts');
      expect(options.method).toBe('POST');
      expect(options.headers.get('Idempotency-Key')).toBe('assess-create-key');
      const body = JSON.parse(options.body);
      expect(body.husband_name).toBe('Budi');
    });

    it('saveAssessmentDraft calls PUT and strips forbidden score fields', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { id: 1, revision: 1 } }),
      });

      const draftWithScores: any = {
        husband_in_household: false,
        husband_name: null,
        house_ownership: 'Milik Sendiri',
        overall_score: 99,
        house_index: 4,
        priority: 'Sangat Tinggi',
        snapshot_hash: 'fake-hash',
      };

      await api.saveAssessmentDraft(10, 1, draftWithScores, {
        idempotency_key: 'assess-save-key',
        expected_revision: 1,
      });

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/assessment/1');
      expect(options.method).toBe('PUT');
      expect(options.headers.get('Idempotency-Key')).toBe('assess-save-key');

      const body = JSON.parse(options.body);
      expect(body.house_ownership).toBe('Milik Sendiri');
      expect(body.expected_revision).toBe(1);
      // Assert scores stripped
      expect(body.overall_score).toBeUndefined();
      expect(body.house_index).toBeUndefined();
      expect(body.priority).toBeUndefined();
      expect(body.snapshot_hash).toBeUndefined();
    });

    it('submitAssessment calls POST /api/penyaluran/mustahik/:id/assessment/:id/submit', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { status: 'submitted' } }),
      });

      await api.submitAssessment(10, 1, { assistance_request: 'Biaya Sekolah' }, { expected_revision: 1 });

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/assessment/1/submit');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.assistance_request).toBe('Biaya Sekolah');
      expect(body.expected_revision).toBe(1);
    });

    it('reviewAssessment calls POST /api/penyaluran/mustahik/:id/assessment/:id/review with action and note', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { status: 'accepted' } }),
      });

      await api.reviewAssessment(10, 1, { action: 'accept', note: 'Data terverifikasi' }, {
        expected_snapshot_hash: 'a'.repeat(64),
      });

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/assessment/1/review');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.action).toBe('accept');
      expect(body.note).toBe('Data terverifikasi');
      expect(body.expected_snapshot_hash).toBe('a'.repeat(64));
    });
  });

  // ==========================================
  // Group 4: MPZIS Workflow (5 Methods)
  // ==========================================
  describe('MPZIS Workflow', () => {
    it('getMpzis calls GET /api/penyaluran/mustahik/:id/mpzis', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { mustahik_id: 10 } }),
      });

      await api.getMpzis(10);
      expect((global.fetch as any).mock.calls[0][0]).toContain('/api/penyaluran/mustahik/10/mpzis');
    });

    it('createMpzisDraft calls POST /api/penyaluran/mustahik/:id/mpzis/drafts', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { id: 2, revision: 1 } }),
      });

      const draft: Partial<MpzisDraft> = { purpose: 'Bantuan Pengobatan', total_amount: 3000000 };
      await api.createMpzisDraft(10, draft, { idempotency_key: 'mpzis-create-key' });

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/mpzis/drafts');
      expect(options.method).toBe('POST');
      expect(options.headers.get('Idempotency-Key')).toBe('mpzis-create-key');
    });

    it('saveMpzisDraft calls PUT /api/penyaluran/mustahik/:id/mpzis/:id', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { id: 2 } }),
      });

      await api.saveMpzisDraft(10, 2, { total_amount: 3500000 }, { expected_revision: 1 });

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/mpzis/2');
      expect(options.method).toBe('PUT');
      const body = JSON.parse(options.body);
      expect(body.total_amount).toBe(3500000);
      expect(body.expected_revision).toBe(1);
    });

    it('submitMpzis calls POST /api/penyaluran/mustahik/:id/mpzis/:id/submit', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { status: 'submitted' } }),
      });

      await api.submitMpzis(10, 2, {}, { expected_revision: 1 });

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/mpzis/2/submit');
      expect(options.method).toBe('POST');
    });

    it('decideMpzisStep calls POST /api/penyaluran/mustahik/:id/mpzis/:id/approvals/:step', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { status: 'approved' } }),
      });

      await api.decideMpzisStep(
        10,
        2,
        'ashnaf_verified',
        { action: 'approve', note: 'Ashnaf Fakir valid' },
        { expected_snapshot_hash: 'b'.repeat(64) }
      );

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/mpzis/2/approvals/ashnaf_verified');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.action).toBe('approve');
      expect(body.note).toBe('Ashnaf Fakir valid');
      expect(body.expected_snapshot_hash).toBe('b'.repeat(64));
    });
  });

  // ==========================================
  // Group 5: PPD & Finance Workflow (8 Methods)
  // ==========================================
  describe('PPD & Finance Workflow', () => {
    it('getPpd calls GET /api/penyaluran/mustahik/:id/ppd', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { mustahik_id: 10 } }),
      });

      await api.getPpd(10);
      expect((global.fetch as any).mock.calls[0][0]).toContain('/api/penyaluran/mustahik/10/ppd');
    });

    it('createPpdDraft calls POST /api/penyaluran/mustahik/:id/ppd/drafts', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { id: 3, revision: 1 } }),
      });

      await api.createPpdDraft(10, { purpose: 'Penyaluran Modal Usaha' });
      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/ppd/drafts');
      expect(options.method).toBe('POST');
    });

    it('savePpdDraft strips server-calculated totals, terbilang, requester, and formats rab_lines', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { id: 3 } }),
      });

      const dirtyPpdDraft: any = {
        purpose: 'Biaya Pengobatan',
        bank_name: 'BSI',
        bank_account_number: '1234567890',
        amount: 2500000,
        total: 2500000,
        amount_in_words: 'Dua juta lima ratus ribu rupiah',
        terbilang: 'Dua juta lima ratus ribu rupiah',
        requester_name: 'Staff Unauthorized',
        requester_role: 'penyaluran',
        requester_department: 'Penyaluran',
        snapshot_hash: 'forbidden-hash',
        rab_lines: [
          {
            line_no: 1,
            register_number: 'RAB-01',
            deskripsi: 'Obat-obatan',
            description: 'Obat-obatan',
            jumlah: 2,
            harga_satuan: 1000000,
            total: 2000000,
            amount: 2000000,
          },
          {
            line_no: 2,
            register_number: 'RAB-02',
            description: 'Transport',
            jumlah: 1,
            harga_satuan: 500000,
            total: 500000,
            amount: 500000,
          },
        ],
      };

      await api.savePpdDraft(10, 3, dirtyPpdDraft, { expected_revision: 1 });

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/ppd/3');
      expect(options.method).toBe('PUT');

      const body = JSON.parse(options.body);
      expect(body.purpose).toBe('Biaya Pengobatan');
      expect(body.bank_name).toBe('BSI');
      expect(body.bank_account_number).toBe('1234567890');
      // Assert aggregate & server fields stripped
      expect(body.amount).toBeUndefined();
      expect(body.total).toBeUndefined();
      expect(body.amount_in_words).toBeUndefined();
      expect(body.terbilang).toBeUndefined();
      expect(body.requester_name).toBeUndefined();
      expect(body.requester_role).toBeUndefined();
      expect(body.requester_department).toBeUndefined();
      expect(body.snapshot_hash).toBeUndefined();

      // Assert rab_lines contain only allowed fields (no extra total/deskripsi)
      expect(body.rab_lines).toHaveLength(2);
      expect(body.rab_lines[0]).toEqual({
        line_no: 1,
        register_number: 'RAB-01',
        description: 'Obat-obatan',
        amount: 2000000,
      });
      expect(body.rab_lines[1]).toEqual({
        line_no: 2,
        register_number: 'RAB-02',
        description: 'Transport',
        amount: 500000,
      });
    });

    it('submitPpd calls POST /api/penyaluran/mustahik/:id/ppd/:id/submit', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { status: 'submitted' } }),
      });

      await api.submitPpd(10, 3, {}, { expected_revision: 1 });

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/ppd/3/submit');
      expect(options.method).toBe('POST');
    });

    it('financeCheckPpd calls POST /api/penyaluran/mustahik/:id/ppd/:id/finance-check', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { status: 'finance_checked' } }),
      });

      await api.financeCheckPpd(10, 3, { note: 'Lampiran lengkap' }, { expected_revision: 1 });

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/ppd/3/finance-check');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.note).toBe('Lampiran lengkap');
    });

    it('financeApprovePpd calls POST /api/penyaluran/mustahik/:id/ppd/:id/finance-approve', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { status: 'finance_approved' } }),
      });

      await api.financeApprovePpd(10, 3, { note: 'Disetujui untuk bayar' }, { expected_snapshot_hash: 'c'.repeat(64) });

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/ppd/3/finance-approve');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.expected_snapshot_hash).toBe('c'.repeat(64));
    });

    it('recordPaymentProof sends multipart/form-data without forcing application/json', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { id: 7, ppd_id: 3, verification_status: 'pending' },
        }),
      });

      const formData = new FormData();
      const dummyFile = new Blob(['sample transfer proof'], { type: 'application/pdf' });
      formData.append('proof', dummyFile, 'bukti_transfer.pdf');
      formData.append('paid_amount', '2500000');
      formData.append('paid_at', '2026-09-20T10:00:00.000Z');
      formData.append('transaction_number', 'TRX-202609-001');

      await api.recordPaymentProof(10, 3, formData, { idempotency_key: 'payment-proof-key' });

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/ppd/3/payment');
      expect(options.method).toBe('POST');
      expect(options.body).toBe(formData);

      const headers = options.headers as Headers;
      expect(headers.get('Idempotency-Key')).toBe('payment-proof-key');
      // Critical check: headers must NOT have Content-Type: application/json forced
      expect(headers.get('Content-Type')).toBeNull();
    });

    it('verifyPayment calls POST /api/penyaluran/mustahik/:id/ppd/:id/payment/verify', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { verification_status: 'verified' } }),
      });

      await api.verifyPayment(10, 3, { expected_snapshot_hash: 'd'.repeat(64) });

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/ppd/3/payment/verify');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.expected_snapshot_hash).toBe('d'.repeat(64));
    });
  });

  // ==========================================
  // Group 6: Completion & Artifacts Workflow (4 Methods)
  // ==========================================
  describe('Completion & Artifacts Workflow', () => {
    it('recordRecipientConfirmation handles FormData directly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { id: 9, method: 'Tatap Muka' } }),
      });

      const fd = new FormData();
      fd.append('method', 'Tatap Muka');
      fd.append('recipient_name_snapshot', 'Dewi Sartika');

      await api.recordRecipientConfirmation(10, 3, fd, { idempotency_key: 'confirm-key-01' });

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/ppd/3/recipient-confirmation');
      expect(options.body).toBe(fd);
    });

    it('recordRecipientConfirmation handles RecipientConfirmationPayload with evidence_file as multipart', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { id: 9 } }),
      });

      const evidence = new Blob(['foto serah terima'], { type: 'image/jpeg' });
      const payload: RecipientConfirmationPayload = {
        method: 'WhatsApp',
        recipient_name_snapshot: 'Dewi Sartika',
        confirmed_at: '2026-09-20T12:00:00.000Z',
        note: 'Diterima mustahik langsung',
        evidence_file: evidence,
      };

      await api.recordRecipientConfirmation(10, 3, payload, { idempotency_key: 'confirm-key-02' });

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/ppd/3/recipient-confirmation');
      expect(options.body).toBeInstanceOf(FormData);
    });

    it('recordRecipientConfirmation handles RecipientConfirmationPayload without file as JSON', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { id: 9 } }),
      });

      const payload: RecipientConfirmationPayload = {
        method: 'Telepon',
        recipient_name_snapshot: 'Dewi Sartika',
        confirmed_at: '2026-09-20T12:00:00.000Z',
        note: 'Konfirmasi via telepon seluler',
      };

      await api.recordRecipientConfirmation(10, 3, payload);

      const [, options] = (global.fetch as any).mock.calls[0];
      const sent = JSON.parse(options.body as string);
      expect(sent.method).toBe('Telepon');
      expect(sent.recipient_name_snapshot).toBe('Dewi Sartika');
    });

    it('completePpd calls POST /api/penyaluran/mustahik/:id/ppd/:id/complete', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { status: 'completed' } }),
      });

      await api.completePpd(10, 3, { expected_snapshot_hash: 'e'.repeat(64) });

      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/ppd/3/complete');
      expect(options.method).toBe('POST');
    });

    it('downloadArtifact calls authenticated fetch and returns Blob', async () => {
      const mockBlob = new Blob(['artifact data'], { type: 'application/pdf' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/pdf' }),
        blob: async () => mockBlob,
      });

      const result = await api.downloadArtifact(10, 55, 'attachment');

      expect(result).toBe(mockBlob);
      const [url] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/artifacts/55?disposition=attachment');
    });

    it('downloadReceipt calls authenticated fetch and returns PDF receipt Blob', async () => {
      const mockReceiptBlob = new Blob(['%PDF-1.4 digital receipt'], { type: 'application/pdf' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/pdf' }),
        blob: async () => mockReceiptBlob,
      });

      const result = await api.downloadReceipt(10, 3);

      expect(result).toBe(mockReceiptBlob);
      const [url] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/penyaluran/mustahik/10/ppd/3/receipt');
    });

    it('downloadReceipt parses 409 RECEIPT_PENDING JSON error and throws ApiError', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          code: 'RECEIPT_PENDING',
          message: 'Bukti digital sedang diproses.',
        }),
      });

      await expect(api.downloadReceipt(10, 3)).rejects.toThrow(ApiError);

      try {
        await api.downloadReceipt(10, 3);
      } catch (err: any) {
        expect(err.status).toBe(409);
        expect(err.code).toBe('RECEIPT_PENDING');
        expect(err.message).toBe('Bukti digital sedang diproses.');
      }
    });
  });

  // ==========================================
  // Group 7: Case Retention & Archival (2 Methods)
  // ==========================================
  describe('Case Retention & Archival (archiveMustahik & restoreMustahik)', () => {
    it('archiveMustahik calls POST /api/mustahik/:id/archive with audited reason', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { id: 10, archived: true, archived_at: '2026-09-20T15:00:00.000Z', workflow_version: 2 },
        }),
      });

      const result = await api.archiveMustahik(10, {
        note: 'Pemohon telah pindah domisili keluar kota Tangerang secara permanen.',
      }, { idempotency_key: 'archive-key-01' });

      expect(result.data?.archived).toBe(true);
      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/mustahik/10/archive');
      expect(options.method).toBe('POST');
      expect(options.headers.get('Idempotency-Key')).toBe('archive-key-01');
    });

    it('restoreMustahik calls POST /api/mustahik/:id/restore with audited reason', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: { id: 10, archived: false, restored_at: '2026-09-20T16:00:00.000Z', workflow_version: 3 },
        }),
      });

      const result = await api.restoreMustahik(10, {
        note: 'Pemohon melampirkan surat domisili baru yang sah dari kelurahan.',
      });

      expect(result.data?.archived).toBe(false);
      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain('/api/mustahik/10/restore');
      expect(options.method).toBe('POST');
    });
  });

  // ==========================================
  // Error Handling & Concurrency Matrix
  // ==========================================
  describe('Error Handling & Concurrency Matrix', () => {
    it('extracts code and field_errors on 409 Conflict (optimistic lock/stale artifact)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          code: 'STALE_ARTIFACT',
          message: 'MPZIS snapshot is stale.',
          field_errors: { 'rab_lines.0.amount': 'POSITIVE_INTEGER' },
        }),
      });

      try {
        await api.savePpdDraft(10, 3, { purpose: 'Pengobatan' });
        expect.fail('Should have thrown ApiError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(409);
        expect(err.code).toBe('STALE_ARTIFACT');
        expect(err.field_errors).toEqual({ 'rab_lines.0.amount': 'POSITIVE_INTEGER' });
        expect(err.message).toBe('MPZIS snapshot is stale.');
      }
    });

    it('handles 410 Gone legacy endpoint freeze', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 410,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          code: 'LEGACY_WORKFLOW_DISABLED',
          message: 'Endpoint legacy telah dinonaktifkan.',
        }),
      });

      await expect(apiFetch('/api/mustahik/10/survey')).rejects.toThrow(ApiError);

      try {
        await apiFetch('/api/mustahik/10/survey');
      } catch (err: any) {
        expect(err.status).toBe(410);
        expect(err.code).toBe('LEGACY_WORKFLOW_DISABLED');
      }
    });

    it('extracts field_errors on 422 Unprocessable Entity', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          code: 'VALIDATION_FAILED',
          message: 'Data tidak valid.',
          field_errors: {
            nik: 'REQUIRED',
            name: 'MAX_LENGTH',
          },
        }),
      });

      try {
        await api.createP0MustahikIntake({ name: 'Test' });
        expect.fail('Should have thrown ApiError');
      } catch (err: any) {
        expect(err.status).toBe(422);
        expect(err.code).toBe('VALIDATION_FAILED');
        expect(err.field_errors).toEqual({
          nik: 'REQUIRED',
          name: 'MAX_LENGTH',
        });
      }
    });

    it('handles 403 Actor Separation error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          code: 'ACTOR_SEPARATION',
          message: 'Submitter dan reviewer harus merupakan akun yang berbeda.',
        }),
      });

      try {
        await api.reviewAssessment(10, 1, { action: 'accept' });
        expect.fail('Should have thrown ApiError');
      } catch (err: any) {
        expect(err.status).toBe(403);
        expect(err.code).toBe('ACTOR_SEPARATION');
        expect(err.message).toContain('Submitter dan reviewer harus merupakan akun yang berbeda');
      }
    });
  });

  // ==========================================
  // Group 8: Adversarial Stress Tests: Payload Isolation & Whitelist Sanitization (Task 14 R2)
  // ==========================================
  describe('Adversarial Stress Tests: Payload Isolation & Whitelist Sanitization (Task 14 R2)', () => {
    const injected = {
      workflow_mode: 'legacy',
      total: 15000000,
      amount: 15000000,
      terbilang: 'Lima Belas Juta',
      amount_in_words: 'Lima Belas Juta',
      score: 99,
      priority: 'HIGH',
    };

    it('createP0MustahikIntake strips injected keys under adversarial attack', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { id: 1 } }),
      });

      const dirtyPayload: any = {
        name: 'Siti Aminah',
        nik: '3201012345670002',
        ...injected,
      };

      await api.createP0MustahikIntake(dirtyPayload);

      const [, options] = (global.fetch as any).mock.calls[0];
      const sentBody = JSON.parse(options.body);

      expect(sentBody.name).toBe('Siti Aminah');
      expect(sentBody.nik).toBe('3201012345670002');
      expect(sentBody.workflow_mode).toBeUndefined();
      expect(sentBody.total).toBeUndefined();
      expect(sentBody.amount).toBeUndefined();
      expect(sentBody.terbilang).toBeUndefined();
      expect(sentBody.amount_in_words).toBeUndefined();
      expect(sentBody.score).toBeUndefined();
      expect(sentBody.priority).toBeUndefined();
    });

    it('createPpdDraft strips injected keys under adversarial attack', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { id: 3 } }),
      });

      const dirtyDraft: any = {
        purpose: 'Bantuan Biaya Hidup',
        ...injected,
      };

      await api.createPpdDraft(10, dirtyDraft);

      const [, options] = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.purpose).toBe('Bantuan Biaya Hidup');
      expect(body.workflow_mode).toBeUndefined();
      expect(body.total).toBeUndefined();
      expect(body.amount).toBeUndefined();
      expect(body.terbilang).toBeUndefined();
      expect(body.amount_in_words).toBeUndefined();
      expect(body.score).toBeUndefined();
      expect(body.priority).toBeUndefined();
    });

    it('savePpdDraft strips injected keys under adversarial attack', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { id: 3 } }),
      });

      const dirtyDraft: any = {
        purpose: 'Bantuan Biaya Hidup',
        ...injected,
      };

      await api.savePpdDraft(10, 3, dirtyDraft, { expected_revision: 1 });

      const [, options] = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.purpose).toBe('Bantuan Biaya Hidup');
      expect(body.expected_revision).toBe(1);
      expect(body.workflow_mode).toBeUndefined();
      expect(body.total).toBeUndefined();
      expect(body.amount).toBeUndefined();
      expect(body.terbilang).toBeUndefined();
      expect(body.amount_in_words).toBeUndefined();
      expect(body.score).toBeUndefined();
      expect(body.priority).toBeUndefined();
    });

    it('createMpzisDraft strips injected keys under adversarial attack', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { id: 2 } }),
      });

      const dirtyDraft: any = {
        purpose: 'Bantuan Kesehatan',
        total_amount: 3000000,
        ...injected,
      };

      await api.createMpzisDraft(10, dirtyDraft);

      const [, options] = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.purpose).toBe('Bantuan Kesehatan');
      expect(body.total_amount).toBe(3000000);
      expect(body.workflow_mode).toBeUndefined();
      expect(body.total).toBeUndefined();
      expect(body.amount).toBeUndefined();
      expect(body.terbilang).toBeUndefined();
      expect(body.amount_in_words).toBeUndefined();
      expect(body.score).toBeUndefined();
      expect(body.priority).toBeUndefined();
    });

    it('saveAssessmentDraft strips injected keys under adversarial attack', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: { id: 1, revision: 1 } }),
      });

      const dirtyDraft: any = {
        husband_name: 'Ahmad',
        ...injected,
      };

      await api.saveAssessmentDraft(10, 1, dirtyDraft, { expected_revision: 1 });

      const [, options] = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body.husband_name).toBe('Ahmad');
      expect(body.expected_revision).toBe(1);
      expect(body.workflow_mode).toBeUndefined();
      expect(body.total).toBeUndefined();
      expect(body.amount).toBeUndefined();
      expect(body.terbilang).toBeUndefined();
      expect(body.amount_in_words).toBeUndefined();
      expect(body.score).toBeUndefined();
      expect(body.priority).toBeUndefined();
    });
  });
});
