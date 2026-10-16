import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Search,
  Plus,
  CheckCircle2,
  X,
  MapPin,
  HeartHandshake,
  UserCheck,
  TrendingUp,
  Loader2,
  Calendar,
  FileText,
  Eye,
  RefreshCw,
  AlertCircle,
  Trash2,
  Edit,
  Phone,
  Home,
  CreditCard,
  ClipboardList,
  Upload,
  File,
  Image,
  Download,
  Printer,
  MessageCircle,
  ExternalLink,
  DollarSign,
  FileSpreadsheet,
  Check,
  Send,
  Building,
  HelpCircle,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  Sparkles,
  Copy,
  SlidersHorizontal,
  FolderOpen,
  FileCheck2,
  GraduationCap,
  HeartPulse,
  Briefcase,
  Layers,
  MoreVertical,
  CheckCircle,
  Clock,
  Coins
} from 'lucide-react';
import { formatRupiah } from '../utils/format';
import { api } from '../services/api';
import OfficialDocumentsModal from './OfficialDocumentsModal';

// 5-Stage Sequential Pipeline Workflow
const PIPELINE_STEPS = [
  { id: 'all', stepNum: '★', label: 'Semua Data', desc: 'Master 60-Kolom', statusMatch: null, color: 'emerald' },
  { id: 'diajukan', stepNum: '1', label: 'Pengajuan Masuk', desc: 'Antrean Baru', statusMatch: 'Diajukan', color: 'slate' },
  { id: 'administrasi', stepNum: '2', label: 'Verifikasi Syarat', desc: 'Cek Dokumen', statusMatch: 'Verifikasi Administrasi', color: 'blue' },
  { id: 'survey', stepNum: '3', label: 'Survey Lapangan', desc: 'Form F-BPP/04', statusMatch: 'Survey', color: 'amber' },
  { id: 'mpzis', stepNum: '4', label: 'Sidang MPZIS', desc: 'Persetujuan Pimpinan', statusMatch: 'Persetujuan MPZIS', color: 'purple' },
  { id: 'ppd', stepNum: '5', label: 'Pencairan PPD', desc: 'Dana Siap Salur', statusMatch: 'Pengajuan Dana (FPD)', color: 'orange' },
  { id: 'selesai', stepNum: '✓', label: 'Penyaluran Selesai', desc: 'Tersalurkan & LPJ', statusMatch: 'Penyaluran Selesai', color: 'teal' },
];

const STATUS_OPTIONS = [
  'Diajukan',
  'Verifikasi Administrasi',
  'Survey',
  'Persetujuan MPZIS',
  'Pengajuan Dana (FPD)',
  'Penyaluran Selesai',
  'Ditolak',
];

const STATUS_BADGES = {
  'Diajukan': { bg: 'bg-slate-100 dark:bg-slate-800/80', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-300 dark:border-slate-700', step: 1, stepText: 'Tahap 1: Berkas Masuk' },
  'Verifikasi Administrasi': { bg: 'bg-blue-50 dark:bg-blue-950/50', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800', step: 2, stepText: 'Tahap 2: Verifikasi Adm' },
  'Survey': { bg: 'bg-amber-50 dark:bg-amber-950/50', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', step: 3, stepText: 'Tahap 3: Survey Lapangan' },
  'Persetujuan MPZIS': { bg: 'bg-purple-50 dark:bg-purple-950/50', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800', step: 4, stepText: 'Tahap 4: Sidang MPZIS' },
  'Pengajuan Dana (FPD)': { bg: 'bg-orange-50 dark:bg-orange-950/50', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800', step: 5, stepText: 'Tahap 5: Pencairan Dana' },
  'Pengajuan Dana (PPD)': { bg: 'bg-orange-50 dark:bg-orange-950/50', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800', step: 5, stepText: 'Tahap 5: Pencairan Dana' },
  'Penyaluran Selesai': { bg: 'bg-emerald-50 dark:bg-emerald-950/50', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800', step: 5, stepText: 'Penyaluran Tuntas' },
  'Ditolak': { bg: 'bg-rose-50 dark:bg-rose-950/50', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800', step: 0, stepText: 'Tidak Memenuhi Syarat' },
};

const ASNAF_COLORS = {
  'Fakir': 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
  'Miskin': 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  'Amil': 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  'Mualaf': 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800',
  'Fisabilillah': 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  'Ibnu Sabil': 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-800',
  'Gharimin': 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
};

const ASNAP_OPTIONS = ['Fakir', 'Miskin', 'Fisabilillah', 'Mualaf', 'Gharimin', 'Ibnu Sabil'];
const PROGRAM_OPTIONS = ['Pendidikan', 'Kesehatan', 'Kemanusiaan', 'Ekonomi', 'Dakwah Advokasi'];
const HOUSE_OPTIONS = ['Menumpang', 'Kontrak', 'Keluarga', 'Sendiri'];
const PAYMENT_OPTIONS = ['Transfer', 'Tunai'];
const MARITAL_OPTIONS = ['Menikah', 'Belum Menikah', 'Cerai Mati', 'Cerai Hidup', 'Lembaga'];

const emptyForm = {
  file_no: '',
  received_date: new Date().toISOString().split('T')[0],
  name: '',
  beneficiary_name: '',
  nik: '',
  kk_number: '',
  phone: '',
  marital_status: 'Menikah',
  dob: '',
  address: '',
  rt_rw: '',
  kelurahan: '',
  kecamatan: '',
  kabupaten_kota: 'Kota Tangerang',
  province: 'Banten',
  occupation: '',
  education_level: '',
  house_ownership: 'Kontrak',
  family_dependents: '2',
  monthly_income: '',
  monthly_expense: '',
  asnaf: 'Miskin',
  program: 'Kemanusiaan',
  request_title: '',
  status: 'Diajukan',
  priority: 'Prioritas 2',
  recommended_amount: '',
  approved_amount: '',
  payment_method: 'Transfer',
  bank_account: '',
  bank_name: 'Bank Syariah Indonesia (BSI)',
  bank_account_name: '',
  documents: [],
};

export default function MustahikPage({ onNavigate }) {
  const [mustahikList, setMustahikList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active Tab Pipeline Filter
  const [activeTab, setActiveTab] = useState('all');

  // Search and Filter Dropdowns
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAsnaf, setFilterAsnaf] = useState('Semua');
  const [filterProgram, setFilterProgram] = useState('Semua');

  // Sheets & Dialogs
  const [showAddEditSheet, setShowAddEditSheet] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Detail Sheet 360
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [detailTab, setDetailTab] = useState('profil');

  // Assessment Survey Modal (F-BPP/04)
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const [surveyTarget, setSurveyTarget] = useState(null);
  const [surveyForm, setSurveyForm] = useState({
    surveyor_name: 'H. Rahmat Hidayat (Kabid Penyaluran)',
    surveyor_phone: '08123456789',
    survey_date: new Date().toISOString().split('T')[0],
    survey_method: 'Kunjungan Langsung',
    house_index: 'Sangat Sederhana (Dinding semi permanen)',
    asset_index: 'Rendah (Hanya perabot dasar)',
    income_index: 'Di Bawah Had Kifayah (< Rp 1.500.000)',
    spiritual_score: '85',
    overall_score: '88',
    priority: 'Prioritas 1',
    recommendation: 'Layak Dibantu Penuh',
    narrative_conclusion: 'Kondisi ekonomi mustahik sangat memerlukan bantuan langsung tunai/program BAZNAS Kota Tangerang.',
    notes: 'Keluarga memiliki 3 anak usia sekolah aktif.',
  });

  // MPZIS Approval Modal (F-BPP/06)
  const [showMpzisModal, setShowMpzisModal] = useState(false);
  const [mpzisTarget, setMpzisTarget] = useState(null);
  const [mpzisForm, setMpzisForm] = useState({
    form_number: '',
    mpzis_date: new Date().toISOString().split('T')[0],
    program_classification: 'Kemanusiaan',
    purpose: 'Bantuan Biaya Hidup & Kebutuhan Pokok Mustahik',
    asnaf: 'Miskin',
    fund_source: 'Zakat Maal',
    recipient_name: '',
    recipient_type: 'Individu',
    beneficiary_count: 1,
    total_amount: '',
    proposed_by: 'Divisi Pendistribusian',
    examined_by: 'Kabid Penyaluran',
    ashnaf_verifier: 'Ust. H. Fauzan, Lc.',
    approved_by: 'Ketua BAZNAS Kota Tangerang',
  });

  // PPD Modal (F-PKP/03)
  const [showPpdModal, setShowPpdModal] = useState(false);
  const [ppdTarget, setPpdTarget] = useState(null);
  const [ppdForm, setPpdForm] = useState({
    form_number: '',
    transaction_number: '',
    requester_name: 'Divisi Penyaluran BAZNAS',
    requester_role: 'Staf Penyaluran',
    requester_department: 'Pendistribusian & Pendayagunaan',
    amount: '',
    amount_in_words: '',
    purpose: 'Penyaluran Bantuan Zakat Program BAZNAS',
    bank_account_info: '',
    payment_type: 'Transfer Bank (BSI)',
  });

  // WhatsApp Dialog
  const [showWaModal, setShowWaModal] = useState(false);
  const [waTarget, setWaTarget] = useState(null);
  const [waPhase, setWaPhase] = useState('diajukan');
  const [waCustomNotes, setWaCustomNotes] = useState('');
  const [waPreview, setWaPreview] = useState({ message: '', waUrl: '' });

  // Official Documents Print Modal
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [printTarget, setPrintTarget] = useState(null);
  const [printDocType, setPrintDocType] = useState('FBPP04');

  // Copy Alert state
  const [copiedId, setCopiedId] = useState(null);

  // Toast
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 4000);
  };

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await api.listMustahik();
      setMustahikList(res.data || []);
    } catch (err) {
      console.error('Failed to load mustahik:', err);
      showToast('Gagal memuat data dari server: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  // Header Statistics
  const stats = useMemo(() => {
    const total = mustahikList.length;
    const antreanVerifikasi = mustahikList.filter((m) => m.status === 'Diajukan').length;
    const siapSurvey = mustahikList.filter((m) => m.status === 'Verifikasi Administrasi').length;
    const menungguMpzis = mustahikList.filter((m) => m.status === 'Survey').length;
    const siapPencairan = mustahikList.filter(
      (m) => m.status === 'Persetujuan MPZIS' || m.status === 'Pengajuan Dana (FPD)' || m.status === 'Pengajuan Dana (PPD)'
    ).length;
    const selesai = mustahikList.filter((m) => m.status === 'Penyaluran Selesai').length;
    const totalDana = mustahikList.reduce((sum, m) => sum + (Number(m.approved_amount) || Number(m.recommended_amount) || 0), 0);

    return { total, antreanVerifikasi, siapSurvey, menungguMpzis, siapPencairan, selesai, totalDana };
  }, [mustahikList]);

  // Tab Filtering & Search Filtering
  const filteredMustahik = useMemo(() => {
    const currentTab = PIPELINE_STEPS.find((t) => t.id === activeTab);
    return mustahikList.filter((m) => {
      // Tab filter
      if (currentTab && currentTab.statusMatch) {
        if (currentTab.id === 'ppd') {
          if (m.status !== 'Pengajuan Dana (FPD)' && m.status !== 'Pengajuan Dana (PPD)') return false;
        } else if (m.status !== currentTab.statusMatch) {
          return false;
        }
      }

      // Search filter
      const search = searchTerm.toLowerCase().trim();
      const matchSearch =
        !search ||
        (m.name || '').toLowerCase().includes(search) ||
        (m.nik || '').toLowerCase().includes(search) ||
        (m.file_no || '').toLowerCase().includes(search) ||
        (m.kecamatan || '').toLowerCase().includes(search) ||
        (m.kelurahan || '').toLowerCase().includes(search) ||
        (m.program || '').toLowerCase().includes(search) ||
        (m.request_title || '').toLowerCase().includes(search);

      // Dropdown filters
      const matchAsnaf = filterAsnaf === 'Semua' || m.asnaf === filterAsnaf;
      const matchProgram = filterProgram === 'Semua' || m.program === filterProgram;

      return matchSearch && matchAsnaf && matchProgram;
    });
  }, [mustahikList, activeTab, searchTerm, filterAsnaf, filterProgram]);

  // Handle WhatsApp preview update
  useEffect(() => {
    if (waTarget) {
      api.sendWhatsAppNotification(waTarget.id, waPhase, waCustomNotes).then((res) => {
        setWaPreview(res || { message: '', waUrl: '' });
      });
    }
  }, [waTarget, waPhase, waCustomNotes]);

  // Copy helper
  const copyToClipboard = (text, id) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // CRUD Operations
  const handleOpenAdd = () => {
    setIsEditing(false);
    setEditingId(null);
    setForm({
      ...emptyForm,
      file_no: `MST-TNG-${new Date().getFullYear()}-${String(mustahikList.length + 1).padStart(4, '0')}`,
    });
    setShowAddEditSheet(true);
  };

  const handleOpenEdit = (item) => {
    setIsEditing(true);
    setEditingId(item.id);
    setForm({
      ...emptyForm,
      ...item,
      monthly_income: item.monthly_income || '',
      monthly_expense: item.monthly_expense || '',
      recommended_amount: item.recommended_amount || '',
      approved_amount: item.approved_amount || '',
    });
    setShowAddEditSheet(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus data permohonan mustahik ini?')) return;
    try {
      await api.deleteMustahik(id);
      showToast('Data mustahik berhasil dihapus');
      await loadData();
      if (detailData && detailData.id === id) {
        setShowDetailSheet(false);
      }
    } catch (err) {
      showToast('Gagal menghapus data: ' + err.message, 'error');
    }
  };

  const handleSaveSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.nik) {
      showToast('Nama Lengkap dan NIK wajib diisi!', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...form,
        monthly_income: Number(form.monthly_income) || 0,
        monthly_expense: Number(form.monthly_expense) || 0,
        recommended_amount: Number(form.recommended_amount) || 0,
        approved_amount: Number(form.approved_amount) || 0,
        family_dependents: Number(form.family_dependents) || 0,
      };

      if (isEditing) {
        await api.updateMustahik(editingId, payload);
        showToast('Data mustahik berhasil diperbarui!');
      } else {
        await api.createMustahik(payload);
        showToast('Mustahik baru berhasil didaftarkan ke antrean!');
      }

      setShowAddEditSheet(false);
      await loadData();
    } catch (err) {
      showToast('Gagal menyimpan: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open 360 Detail Sheet
  const openDetail = async (item) => {
    try {
      const res = await api.getMustahik(item.id);
      setDetailData(res.data || item);
    } catch {
      setDetailData(item);
    }
    setDetailTab('profil');
    setShowDetailSheet(true);
  };

  // Open Survey F-BPP/04
  const openSurvey = (item) => {
    setSurveyTarget(item);
    const existing = item.assessments && item.assessments[0];
    if (existing) {
      setSurveyForm({
        surveyor_name: existing.surveyor_name || 'H. Rahmat Hidayat (Kabid Penyaluran)',
        surveyor_phone: existing.surveyor_phone || '08123456789',
        survey_date: existing.survey_date || new Date().toISOString().split('T')[0],
        survey_method: existing.survey_method || 'Kunjungan Langsung',
        house_index: existing.house_index || 'Sangat Sederhana (Dinding semi permanen)',
        asset_index: existing.asset_index || 'Rendah (Hanya perabot dasar)',
        income_index: existing.income_index || 'Di Bawah Had Kifayah (< Rp 1.500.000)',
        spiritual_score: String(existing.spiritual_score || 85),
        overall_score: String(existing.overall_score || 88),
        priority: existing.priority || 'Prioritas 1',
        recommendation: existing.recommendation || 'Layak Dibantu Penuh',
        narrative_conclusion: existing.narrative_conclusion || 'Kondisi ekonomi mustahik sangat memerlukan bantuan langsung BAZNAS.',
        notes: existing.notes || '',
      });
    } else {
      setSurveyForm({
        surveyor_name: 'H. Rahmat Hidayat (Kabid Penyaluran)',
        surveyor_phone: '08123456789',
        survey_date: new Date().toISOString().split('T')[0],
        survey_method: 'Kunjungan Langsung',
        house_index: 'Sangat Sederhana (Dinding semi permanen)',
        asset_index: 'Rendah (Hanya perabot dasar)',
        income_index: 'Di Bawah Had Kifayah (< Rp 1.500.000)',
        spiritual_score: '85',
        overall_score: '88',
        priority: 'Prioritas 1',
        recommendation: 'Layak Dibantu Penuh',
        narrative_conclusion: `Berdasarkan verifikasi lapangan di ${item.kecamatan || 'Kota Tangerang'}, keluarga ${item.name} memenuhi kriteria Had Kifayah untuk menerima bantuan program ${item.program || 'Kemanusiaan'}.`,
        notes: `Rekomendasi bantuan: ${formatRupiah(item.recommended_amount || 2500000)}`,
      });
    }
    setShowSurveyModal(true);
  };

  const handleSaveSurvey = async (e) => {
    e.preventDefault();
    try {
      await api.addAssessment(surveyTarget.id, {
        ...surveyForm,
        spiritual_score: Number(surveyForm.spiritual_score),
        overall_score: Number(surveyForm.overall_score),
        expected_status: surveyTarget.status,
        expected_version: surveyTarget.workflow_version || 0,
      });
      showToast(`Hasil Survey Lapangan (F-BPP/04) untuk "${surveyTarget.name}" berhasil disimpan!`);
      setShowSurveyModal(false);
      await loadData();
    } catch (err) {
      showToast('Gagal menyimpan hasil survey: ' + err.message, 'error');
    }
  };

  // Open MPZIS
  const openMpzis = (item) => {
    setMpzisTarget(item);
    setMpzisForm({
      form_number: `MPZIS/TNG/${new Date().getFullYear()}/${String(item.id).padStart(4, '0')}`,
      mpzis_date: new Date().toISOString().split('T')[0],
      program_classification: item.program || 'Kemanusiaan',
      purpose: item.request_title || 'Bantuan Biaya Hidup & Kebutuhan Pokok Mustahik',
      asnaf: item.asnaf || 'Miskin',
      fund_source: 'Zakat Maal',
      recipient_name: item.name,
      recipient_type: 'Individu',
      beneficiary_count: 1,
      total_amount: item.approved_amount || item.recommended_amount || 2500000,
      proposed_by: 'Divisi Pendistribusian',
      examined_by: 'H. Rahmat Hidayat (Kabid Penyaluran)',
      ashnaf_verifier: 'Ust. H. Fauzan, Lc. (Komisi Fatwa)',
      approved_by: 'Ketua BAZNAS Kota Tangerang',
    });
    setShowMpzisModal(true);
  };

  const handleSaveMpzis = async (e) => {
    e.preventDefault();
    try {
      await api.addMpzisDecision(mpzisTarget.id, {
        ...mpzisForm,
        total_amount: Number(mpzisForm.total_amount),
        expected_status: mpzisTarget.status,
        expected_version: mpzisTarget.workflow_version || 0,
      });
      showToast(`Keputusan Sidang MPZIS untuk "${mpzisTarget.name}" berhasil disahkan!`);
      setShowMpzisModal(false);
      await loadData();
    } catch (err) {
      showToast('Gagal menyimpan keputusan MPZIS: ' + err.message, 'error');
    }
  };

  // Open PPD
  const openPpd = (item) => {
    setPpdTarget(item);
    const amount = item.approved_amount || item.recommended_amount || 2500000;
    setPpdForm({
      form_number: `PPD/TNG/${new Date().getFullYear()}/${String(item.id).padStart(4, '0')}`,
      transaction_number: `TRX-${Date.now().toString().slice(-6)}`,
      requester_name: 'Divisi Penyaluran BAZNAS',
      requester_role: 'Staf Penyaluran',
      requester_department: 'Pendistribusian & Pendayagunaan',
      amount: amount,
      amount_in_words: `${formatRupiah(amount)} Rupiah`,
      purpose: `Penyaluran Bantuan Program ${item.program || 'BAZNAS'} a.n. ${item.name}`,
      bank_account_info: item.bank_account ? `${item.bank_name || 'BSI'} - No. Rek: ${item.bank_account} a.n ${item.bank_account_name || item.name}` : 'Pencairan Kas Tunai / BSI Virtual',
      payment_type: 'Transfer Bank (BSI)',
    });
    setShowPpdModal(true);
  };

  const handleSavePpd = async (e) => {
    e.preventDefault();
    try {
      await api.addPpd(ppdTarget.id, {
        ...ppdForm,
        amount: Number(ppdForm.amount),
        expected_status: ppdTarget.status,
        expected_version: ppdTarget.workflow_version || 0,
      });
      showToast(`Formulir PPD untuk "${ppdTarget.name}" berhasil diajukan ke Keuangan!`);
      setShowPpdModal(false);
      await loadData();
    } catch (err) {
      showToast('Gagal menyimpan PPD: ' + err.message, 'error');
    }
  };

  // Open WhatsApp Dialog
  const openWhatsApp = (item) => {
    setWaTarget(item);
    let defaultPhase = 'diajukan';
    if (item.status === 'Verifikasi Administrasi') defaultPhase = 'administrasi';
    if (item.status === 'Survey') defaultPhase = 'survey';
    if (item.status === 'Persetujuan MPZIS') defaultPhase = 'mpzis';
    if (item.status === 'Penyaluran Selesai') defaultPhase = 'penyaluran';
    setWaPhase(defaultPhase);
    setWaCustomNotes('');
    setShowWaModal(true);
  };

  // Open Official Documents Print Modal
  const openPrintDocs = (item, type = 'FBPP04') => {
    setPrintTarget(item);
    setPrintDocType(type);
    setShowDocsModal(true);
  };

  // Export 60-Column Master Excel/CSV
  const handleExportExcel = () => {
    try {
      const res = api.exportMustahikData(mustahikList);
      showToast(`Berhasil mengekspor ${res.count} data Master Mustahik (60 Kolom BAZNAS)!`);
    } catch (err) {
      showToast('Gagal ekspor: ' + err.message, 'error');
    }
  };

  // Direct Status Advance
  const handleAdvanceStatus = async (item) => {
    let nextStatus = '';
    if (item.status === 'Diajukan') {
      nextStatus = 'Verifikasi Administrasi';
      await api.updateMustahik(item.id, {
        status: nextStatus,
        action: 'approve',
        notes: `Status dimajukan ke ${nextStatus}.`,
        expected_status: item.status,
        expected_version: item.workflow_version || 0,
      });
      showToast(`Status "${item.name}" berhasil dimajukan ke Verifikasi Administrasi`);
      await loadData();
    } else if (item.status === 'Verifikasi Administrasi') {
      openSurvey(item);
    } else if (item.status === 'Survey') {
      openMpzis(item);
    } else if (item.status === 'Persetujuan MPZIS') {
      openPpd(item);
    } else if (item.status === 'Pengajuan Dana (FPD)' || item.status === 'Pengajuan Dana (PPD)') {
      nextStatus = 'Penyaluran Selesai';
      await api.updateMustahik(item.id, {
        status: nextStatus,
        action: 'approve',
        notes: `Penyaluran untuk ${item.name} telah diselesaikan.`,
        expected_status: item.status,
        expected_version: item.workflow_version || 0,
      });
      showToast(`Penyaluran untuk "${item.name}" tuntas! Dana telah disalurkan.`);
      await loadData();
    } else {
      openPrintDocs(item, 'FBPP04');
    }
  };

  return (
    <div className="w-full max-w-[1920px] 2xl:mx-auto space-y-4 sm:space-y-6 relative">
      {/* Toast Alert */}
      {toast.show && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 bg-card border border-border shadow-2xl rounded-2xl p-4 animate-fade-in pr-12 min-w-[340px]">
          {toast.type === 'success' ? (
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-5 shrink-0" />
            </div>
          ) : (
            <div className="p-2 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
              <AlertCircle className="size-5 shrink-0" />
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold text-foreground">
              {toast.type === 'success' ? 'Berhasil' : 'Pemberitahuan'}
            </span>
            <span className="text-[11px] text-muted-foreground">{toast.message}</span>
          </div>
          <button
            onClick={() => setToast((prev) => ({ ...prev, show: false }))}
            className="absolute top-3 right-3 text-muted-foreground/60 hover:text-foreground cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Header Panel */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-card p-5 sm:p-6 rounded-2xl border border-border/80 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
              <Users className="size-6 text-emerald-600 shrink-0" />
              Master Data Mustahik & Distribusi
            </h1>
            <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-[11px] font-bold">
              Standard BAZNAS 60-Kolom
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground max-w-3xl">
            Sistem pemrosesan mustahik terpadu Kota Tangerang: Pendaftaran online → Verifikasi berkas → Survey faktual Had Kifayah (F-BPP/04) → Keputusan Sidang MPZIS → Pencairan dana (PPD).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onNavigate && (
            <Button
              size="sm"
              variant="outline"
              className="h-8.5 text-xs gap-1.5 border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
              onClick={() => onNavigate('portal')}
            >
              <ExternalLink className="size-3.5" /> Portal Permohonan Publik
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            className="h-8.5 text-xs gap-1.5 cursor-pointer font-medium"
            onClick={handleExportExcel}
          >
            <FileSpreadsheet className="size-3.5 text-emerald-600" /> Export Excel
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-8.5 text-xs gap-1.5 cursor-pointer"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>

          <Button
            size="sm"
            className="h-8.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-bold shadow-xs cursor-pointer px-3.5"
            onClick={handleOpenAdd}
          >
            <Plus className="size-4" /> Tambah Mustahik Baru
          </Button>
        </div>
      </div>

      {/* Linear-Style Clean Segmented Pipeline Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto p-1 bg-muted/50 border border-border/80 rounded-xl no-scrollbar">
        {PIPELINE_STEPS.map((step) => {
          const isActive = activeTab === step.id;
          const count =
            step.id === 'all'
              ? mustahikList.length
              : step.id === 'ppd'
              ? mustahikList.filter((m) => m.status === 'Pengajuan Dana (FPD)' || m.status === 'Pengajuan Dana (PPD)').length
              : mustahikList.filter((m) => m.status === step.statusMatch).length;

          return (
            <button
              key={step.id}
              onClick={() => setActiveTab(step.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-card text-foreground shadow-2xs font-bold border border-border'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
              }`}
            >
              <span className={`size-4.5 rounded-full flex items-center justify-center text-[10px] ${isActive ? 'bg-emerald-600 text-white font-bold' : 'bg-muted-foreground/20 text-muted-foreground font-medium'}`}>
                {step.stepNum}
              </span>
              <span>{step.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${isActive ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold' : 'bg-muted-foreground/10 text-muted-foreground'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Table Card with Search & Filters */}
      <Card className="shadow-xs border-border/80 overflow-hidden rounded-2xl">
        {/* Unified Search & Quick Filter Toolbar */}
        <div className="p-3.5 sm:p-4 border-b border-border bg-card flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Cari Mustahik (Nama, NIK, No. Berkas, Kecamatan)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 pl-9 text-xs bg-background/80 focus-visible:ring-emerald-500 rounded-xl"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Asnaf Filter */}
            <select
              value={filterAsnaf}
              onChange={(e) => setFilterAsnaf(e.target.value)}
              className="h-9 text-xs rounded-xl border border-border bg-background px-3 text-foreground focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer"
            >
              <option value="Semua">Semua 8 Asnaf</option>
              {ASNAP_OPTIONS.map((a) => (
                <option key={a} value={a}>Asnaf: {a}</option>
              ))}
            </select>

            {/* Program Filter */}
            <select
              value={filterProgram}
              onChange={(e) => setFilterProgram(e.target.value)}
              className="h-9 text-xs rounded-xl border border-border bg-background px-3 text-foreground focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer"
            >
              <option value="Semua">Semua 5 Pilar Program</option>
              {PROGRAM_OPTIONS.map((p) => (
                <option key={p} value={p}>Program: {p}</option>
              ))}
            </select>

            {/* Quick Reset if filtered */}
            {(searchTerm || filterAsnaf !== 'Semua' || filterProgram !== 'Semua' || activeTab !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs text-muted-foreground hover:text-foreground cursor-pointer gap-1"
                onClick={() => {
                  setSearchTerm('');
                  setFilterAsnaf('Semua');
                  setFilterProgram('Semua');
                  setActiveTab('all');
                }}
              >
                <X className="size-3" /> Reset Filter
              </Button>
            )}
          </div>

          <div className="text-xs text-muted-foreground font-medium shrink-0 flex items-center gap-1.5">
            <span>Ditemukan</span>
            <span className="font-bold text-foreground px-2 py-0.5 rounded-md bg-muted text-xs">
              {filteredMustahik.length}
            </span>
            <span>dari {mustahikList.length} data</span>
          </div>
        </div>

        {/* Mustahik Data Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="size-8 animate-spin text-emerald-600" />
              <span className="text-xs font-semibold text-muted-foreground">Memuat data Master Mustahik...</span>
            </div>
          ) : filteredMustahik.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
              <div className="size-14 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground/60 mb-3">
                <Search className="size-7 text-muted-foreground/60" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Tidak Ditemukan Data Mustahik</h3>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                Kriteria pencarian atau tab filter yang Anda pilih saat ini tidak memiliki data.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 h-8.5 text-xs font-bold rounded-xl cursor-pointer"
                onClick={() => {
                  setSearchTerm('');
                  setFilterAsnaf('Semua');
                  setFilterProgram('Semua');
                  setActiveTab('all');
                }}
              >
                Reset Semua Filter
              </Button>
            </div>
          ) : (
            <>
              {/* Mobile Card View (< 768px) */}
              <div className="md:hidden divide-y divide-border/60">
                {filteredMustahik.map((m) => {
                  const statusInfo = STATUS_BADGES[m.status] || STATUS_BADGES['Diajukan'];
                  const asnafStyle = ASNAF_COLORS[m.asnaf] || ASNAF_COLORS['Miskin'];
                  const amount = m.approved_amount || m.recommended_amount || 0;

                  return (
                    <div key={m.id} className="p-3.5 sm:p-4 hover:bg-muted/20 transition-colors space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold flex items-center justify-center shrink-0 text-xs">
                            {m.name ? m.name.charAt(0).toUpperCase() : 'M'}
                          </div>
                          <div>
                            <span
                              className="font-bold text-foreground hover:text-emerald-600 transition-colors cursor-pointer text-xs block"
                              onClick={() => openDetail(m)}
                            >
                              {m.name}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {m.file_no || `MST-${m.id}`} • NIK: {m.nik || '-'}
                            </span>
                          </div>
                        </div>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold border ${asnafStyle}`}>
                          {m.asnaf || 'Miskin'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-1">
                        <span className="text-muted-foreground">{m.program || 'Kemanusiaan'} • Kec. {m.kecamatan || 'Tangerang'}</span>
                        <span className="font-extrabold font-mono text-emerald-700 dark:text-emerald-400 text-xs">
                          {formatRupiah(amount)}
                        </span>
                      </div>

                      {/* Status Progress */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className={`font-semibold ${statusInfo.text}`}>{m.status || 'Diajukan'}</span>
                          <span className="text-muted-foreground">{statusInfo.step > 0 ? `Tahap ${statusInfo.step}/5` : ''}</span>
                        </div>
                        {statusInfo.step > 0 && (
                          <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-emerald-600 rounded-full"
                              style={{ width: `${(statusInfo.step / 5) * 100}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between gap-1.5 pt-1">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] px-2"
                            onClick={() => openDetail(m)}
                          >
                            <Eye className="size-3 mr-1" /> Profil
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[10px] px-2 text-green-600"
                            onClick={() => openWhatsApp(m)}
                          >
                            <MessageCircle className="size-3 mr-1" /> WA
                          </Button>
                        </div>

                        {/* Primary Step Action Button */}
                        {m.status === 'Diajukan' && (
                          <Button
                            size="sm"
                            className="h-7 text-[10px] bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5"
                            onClick={() => handleAdvanceStatus(m)}
                          >
                            Verifikasi <ArrowRight className="size-3 ml-1" />
                          </Button>
                        )}
                        {m.status === 'Verifikasi Administrasi' && (
                          <Button
                            size="sm"
                            className="h-7 text-[10px] bg-amber-600 hover:bg-amber-700 text-white font-bold px-2.5"
                            onClick={() => openSurvey(m)}
                          >
                            <FileText className="size-3 mr-1" /> Survey
                          </Button>
                        )}
                        {m.status === 'Survey' && (
                          <Button
                            size="sm"
                            className="h-7 text-[10px] bg-purple-600 hover:bg-purple-700 text-white font-bold px-2.5"
                            onClick={() => openMpzis(m)}
                          >
                            <ShieldCheck className="size-3 mr-1" /> Sidang
                          </Button>
                        )}
                        {m.status === 'Persetujuan MPZIS' && (
                          <Button
                            size="sm"
                            className="h-7 text-[10px] bg-orange-600 hover:bg-orange-700 text-white font-bold px-2.5"
                            onClick={() => openPpd(m)}
                          >
                            <DollarSign className="size-3 mr-1" /> PPD
                          </Button>
                        )}
                        {(m.status === 'Pengajuan Dana (FPD)' || m.status === 'Pengajuan Dana (PPD)') && (
                          <Button
                            size="sm"
                            className="h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5"
                            onClick={() => handleAdvanceStatus(m)}
                          >
                            <CheckCircle2 className="size-3 mr-1" /> Salur
                          </Button>
                        )}
                        {m.status === 'Penyaluran Selesai' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] text-emerald-700 dark:text-emerald-400 border-emerald-300 px-2.5"
                            onClick={() => openPrintDocs(m, 'FBPP04')}
                          >
                            <Printer className="size-3 mr-1" /> Cetak
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tablet & Desktop Table View (>= 768px) */}
              <table className="hidden md:table w-full text-left text-xs border-collapse">
                <thead className="bg-muted/50 border-b border-border/80">
                  <tr>
                    <th className="px-4 py-3.5 font-bold text-muted-foreground tracking-wide">Mustahik & Berkas</th>
                    <th className="px-4 py-3.5 font-bold text-muted-foreground tracking-wide">Program & Asnaf</th>
                    <th className="px-4 py-3.5 font-bold text-muted-foreground tracking-wide">Wilayah / Lokasi</th>
                    <th className="px-4 py-3.5 font-bold text-muted-foreground tracking-wide">Status Alur Pelayanan</th>
                    <th className="px-4 py-3.5 font-bold text-muted-foreground tracking-wide text-right">Nominal Bantuan</th>
                    <th className="px-4 py-3.5 font-bold text-muted-foreground tracking-wide text-center min-w-[180px]">Aksi Utama</th>
                    <th className="px-3 py-3.5 font-bold text-muted-foreground tracking-wide text-center w-12">Menu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredMustahik.map((m) => {
                    const statusInfo = STATUS_BADGES[m.status] || STATUS_BADGES['Diajukan'];
                    const asnafStyle = ASNAF_COLORS[m.asnaf] || ASNAF_COLORS['Miskin'];
                    const amount = m.approved_amount || m.recommended_amount || 0;

                    return (
                      <tr key={m.id} className="hover:bg-muted/30 transition-colors group">
                        {/* Mustahik Profile Cell */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-start gap-2.5">
                            <div className="size-8 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold flex items-center justify-center shrink-0 text-xs mt-0.5">
                              {m.name ? m.name.charAt(0).toUpperCase() : 'M'}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-foreground hover:text-emerald-600 transition-colors cursor-pointer text-[13px]" onClick={() => openDetail(m)}>
                                  {m.name}
                                </span>
                                {m.priority === 'Prioritas 1' && (
                                  <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-200 text-[9px] px-1.5 py-0">
                                    Prioritas 1
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono mt-0.5 flex-wrap">
                                <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                                  {m.file_no || `MST-${m.id}`}
                                  <button
                                    onClick={() => copyToClipboard(m.file_no || `MST-${m.id}`, m.id)}
                                    className="text-muted-foreground/60 hover:text-foreground cursor-pointer"
                                    title="Salin No. Berkas"
                                  >
                                    {copiedId === m.id ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                                  </button>
                                </span>
                                <span>•</span>
                                <span>NIK: {m.nik || '-'}</span>
                                {m.phone && (
                                  <>
                                    <span>•</span>
                                    <span className="text-muted-foreground">{m.phone}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Program & Asnaf */}
                        <td className="px-4 py-3.5">
                          <div className="space-y-1">
                            <div className="font-bold text-foreground text-xs flex items-center gap-1.5">
                              <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
                              {m.program || 'Kemanusiaan'}
                            </div>
                            <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border ${asnafStyle}`}>
                              Asnaf: {m.asnaf || 'Miskin'}
                            </span>
                          </div>
                        </td>

                        {/* Wilayah */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-start gap-1 text-[11px] text-foreground">
                            <MapPin className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <div className="font-semibold">{m.kecamatan || 'Kota Tangerang'}</div>
                              <div className="text-[10px] text-muted-foreground truncate">{m.kelurahan ? `Kel. ${m.kelurahan}` : m.address || '-'}</div>
                            </div>
                          </div>
                        </td>

                        {/* Status Pipeline Progress */}
                        <td className="px-4 py-3.5">
                          <div className="space-y-1.5 min-w-[140px]">
                            <div className="flex items-center justify-between">
                              <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
                                {m.status || 'Diajukan'}
                              </span>
                              <span className="text-[9px] text-muted-foreground font-semibold">
                                {statusInfo.step > 0 ? `${statusInfo.step}/5` : ''}
                              </span>
                            </div>
                            {/* Mini Progress Bar */}
                            {statusInfo.step > 0 && (
                              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-500 rounded-full ${
                                    m.status === 'Penyaluran Selesai' ? 'bg-emerald-500' : 'bg-blue-600'
                                  }`}
                                  style={{ width: `${(statusInfo.step / 5) * 100}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Nominal Bantuan */}
                        <td className="px-4 py-3.5 text-right">
                          <div className="font-extrabold text-foreground text-xs sm:text-sm text-emerald-700 dark:text-emerald-400">
                            {formatRupiah(amount)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {m.approved_amount ? 'Dana Disetujui' : 'Rekomendasi'}
                          </div>
                        </td>

                        {/* Smart Next-Step Primary Action */}
                        <td className="px-4 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {m.status === 'Diajukan' && (
                              <Button
                                size="sm"
                                className="h-7.5 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1 rounded-xl shadow-xs cursor-pointer px-3"
                                onClick={() => handleAdvanceStatus(m)}
                              >
                                <span>Verifikasi Berkas</span>
                                <ArrowRight className="size-3.5" />
                              </Button>
                            )}

                            {m.status === 'Verifikasi Administrasi' && (
                              <Button
                                size="sm"
                                className="h-7.5 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold gap-1 rounded-xl shadow-xs cursor-pointer px-3"
                                onClick={() => openSurvey(m)}
                              >
                                <FileText className="size-3.5" />
                                <span>Input Survey F-BPP/04</span>
                              </Button>
                            )}

                            {m.status === 'Survey' && (
                              <Button
                                size="sm"
                                className="h-7.5 text-xs bg-purple-600 hover:bg-purple-700 text-white font-bold gap-1 rounded-xl shadow-xs cursor-pointer px-3"
                                onClick={() => openMpzis(m)}
                              >
                                <ShieldCheck className="size-3.5" />
                                <span>Sidang MPZIS (F-BPP/06)</span>
                              </Button>
                            )}

                            {m.status === 'Persetujuan MPZIS' && (
                              <Button
                                size="sm"
                                className="h-7.5 text-xs bg-orange-600 hover:bg-orange-700 text-white font-bold gap-1 rounded-xl shadow-xs cursor-pointer px-3"
                                onClick={() => openPpd(m)}
                              >
                                <DollarSign className="size-3.5" />
                                <span>Buat PPD Pencairan</span>
                              </Button>
                            )}

                            {(m.status === 'Pengajuan Dana (FPD)' || m.status === 'Pengajuan Dana (PPD)') && (
                              <Button
                                size="sm"
                                className="h-7.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1 rounded-xl shadow-xs cursor-pointer px-3"
                                onClick={() => handleAdvanceStatus(m)}
                              >
                                <CheckCircle2 className="size-3.5" />
                                <span>Tuntaskan Penyaluran</span>
                              </Button>
                            )}

                            {m.status === 'Penyaluran Selesai' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7.5 text-xs text-emerald-700 dark:text-emerald-400 border-emerald-300 font-bold gap-1 rounded-xl cursor-pointer px-3 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                onClick={() => openPrintDocs(m, 'FBPP04')}
                              >
                                <Printer className="size-3.5" />
                                <span>Cetak LPJ Berkas</span>
                              </Button>
                            )}
                          </div>
                        </td>

                        {/* Secondary Action Toolbar */}
                        <td className="px-3 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* 360 Detail View */}
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              className="size-7 text-muted-foreground hover:text-foreground cursor-pointer rounded-lg"
                              title="Buka Profil 360 & Dokumen"
                              onClick={() => openDetail(m)}
                            >
                              <Eye className="size-3.5" />
                            </Button>

                            {/* WhatsApp */}
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              className="size-7 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/40 cursor-pointer rounded-lg"
                              title="Kirim Notifikasi WhatsApp"
                              onClick={() => openWhatsApp(m)}
                            >
                              <MessageCircle className="size-3.5" />
                            </Button>

                            {/* Edit */}
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              className="size-7 text-muted-foreground hover:text-foreground cursor-pointer rounded-lg"
                              title="Edit Data"
                              onClick={() => handleOpenEdit(m)}
                            >
                              <Edit className="size-3.5" />
                            </Button>

                            {/* Hapus */}
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              className="size-7 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer rounded-lg"
                              title="Hapus Permohonan"
                              onClick={() => handleDelete(m.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </Card>

      {/* ========================================================================= */}
      {/* 1. 360° MUSTAHIK PROFILE DRAWER (SHEET) */}
      {/* ========================================================================= */}
      <Sheet open={showDetailSheet} onOpenChange={setShowDetailSheet}>
        <SheetContent side="right" className="sm:max-w-2xl bg-card border-l border-border p-6 flex flex-col h-full z-50 overflow-hidden">
          {detailData && (
            <>
              <SheetHeader className="pb-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <SheetTitle className="text-lg font-black text-foreground">
                        {detailData.name}
                      </SheetTitle>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${STATUS_BADGES[detailData.status]?.bg || 'bg-muted'} ${STATUS_BADGES[detailData.status]?.text || 'text-foreground'}`}>
                        {detailData.status}
                      </span>
                    </div>
                    <SheetDescription className="text-xs font-mono text-muted-foreground">
                      No. Berkas: <span className="font-bold text-emerald-600">{detailData.file_no || `MST-${detailData.id}`}</span> • NIK: {detailData.nik}
                    </SheetDescription>
                  </div>
                </div>

                {/* Sub Tab Navigation */}
                <div className="flex gap-2 pt-3 overflow-x-auto border-t border-border/60 mt-3">
                  {[
                    { id: 'profil', label: '1. Profil & Keluarga', icon: UserCheck },
                    { id: 'ekonomi', label: '2. Ekonomi & Had Kifayah', icon: TrendingUp },
                    { id: 'dokumen', label: '3. Berkas Digital (6)', icon: FolderOpen },
                    { id: 'survey', label: '4. Survey Lapangan', icon: FileCheck2 },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setDetailTab(t.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                        detailTab === t.id
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <t.icon className="size-3.5" />
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 text-xs">
                {/* TAB 1: PROFIL & KELUARGA */}
                {detailTab === 'profil' && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="grid grid-cols-2 gap-2.5">
                      <InfoCard label="Nama Pemohon" value={detailData.name} />
                      <InfoCard label="Nama Penerima Manfaat" value={detailData.beneficiary_name || detailData.name} />
                      <InfoCard label="NIK KTP" value={detailData.nik} />
                      <InfoCard label="No. Kartu Keluarga (KK)" value={detailData.kk_number || '-'} />
                      <InfoCard label="No. Telepon / WhatsApp" value={detailData.phone || '-'} />
                      <InfoCard label="Status Pernikahan" value={detailData.marital_status || 'Menikah'} />
                      <InfoCard label="Jumlah Tanggungan" value={`${detailData.family_dependents || 0} Jiwa`} />
                      <InfoCard label="Status Tempat Tinggal" value={detailData.house_ownership || 'Kontrak'} />
                    </div>

                    <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-1">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Alamat Kependudukan</p>
                      <p className="font-semibold text-foreground text-xs">{detailData.address || '-'}</p>
                      <p className="text-muted-foreground text-[11px]">
                        RT/RW {detailData.rt_rw || '-'} • Kel. {detailData.kelurahan || '-'}, Kec. {detailData.kecamatan || 'Kota Tangerang'}, {detailData.kabupaten_kota || 'Banten'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <InfoCard label="Program BAZNAS" value={detailData.program || 'Kemanusiaan'} />
                      <InfoCard label="Golongan Asnaf" value={detailData.asnaf || 'Miskin'} />
                    </div>
                  </div>
                )}

                {/* TAB 2: EKONOMI & HAD KIFAYAH */}
                {detailTab === 'ekonomi' && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3.5 rounded-xl bg-muted/40 border border-border">
                        <p className="text-[10px] text-muted-foreground font-bold">Pendapatan Bulanan</p>
                        <p className="text-base font-black text-foreground mt-0.5">{formatRupiah(detailData.monthly_income || 0)}</p>
                      </div>
                      <div className="p-3.5 rounded-xl bg-muted/40 border border-border">
                        <p className="text-[10px] text-muted-foreground font-bold">Pengeluaran Bulanan</p>
                        <p className="text-base font-black text-rose-600 dark:text-rose-400 mt-0.5">{formatRupiah(detailData.monthly_expense || 0)}</p>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-800 dark:text-emerald-300">Rekomendasi Bantuan BAZNAS</span>
                        <Badge className="bg-emerald-600 text-white font-bold">{detailData.priority || 'Prioritas 1'}</Badge>
                      </div>
                      <div className="text-xl font-black text-emerald-700 dark:text-emerald-400">
                        {formatRupiah(detailData.approved_amount || detailData.recommended_amount || 2500000)}
                      </div>
                      <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80">
                        Keperluan: {detailData.request_title || 'Bantuan Biaya Hidup & Kebutuhan Pokok Mustahik'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <InfoCard label="Metode Penyaluran" value={detailData.payment_method || 'Transfer Bank'} />
                      <InfoCard label="Bank Tujuan" value={detailData.bank_name || 'Bank Syariah Indonesia (BSI)'} />
                      <InfoCard label="Nomor Rekening" value={detailData.bank_account || 'Pencairan Kas / Tunai'} />
                      <InfoCard label="Nama Pemilik Rekening" value={detailData.bank_account_name || detailData.name} />
                    </div>
                  </div>
                )}

                {/* TAB 3: DOKUMEN DIGITAL (6 SLOTS) */}
                {detailTab === 'dokumen' && (
                  <div className="space-y-3 animate-fade-in">
                    <p className="text-xs text-muted-foreground font-medium">
                      Status 6 kelengkapan berkas digital permohonan mustahik sesuai Peraturan BAZNAS:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {[
                        { title: '1. KTP Elektronik Pemohon', type: 'KTP', icon: UserCheck },
                        { title: '2. Kartu Keluarga (KK)', type: 'KK', icon: Users },
                        { title: '3. SKTM Kelurahan / DTSEN BPS', type: 'SKTM', icon: FileCheck2 },
                        { title: '4. Surat Rekomendasi UPZ / DKM', type: 'REKOM_UPZ', icon: Building },
                        { title: '5. Foto Kondisi Rumah / Usaha', type: 'FOTO_RUMAH', icon: Image },
                        { title: '6. Berkas Medis / Biaya Pendidikan', type: 'MEDIS_SPP', icon: FileText },
                      ].map((slot) => {
                        const hasDoc = detailData.documents && detailData.documents.some((d) => d.doc_type?.includes(slot.type));
                        return (
                          <div
                            key={slot.type}
                            className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                              hasDoc
                                ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                                : 'bg-muted/30 border-border/70'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${hasDoc ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                                <slot.icon className="size-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-foreground text-xs truncate">{slot.title}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {hasDoc ? '✓ Berkas Terverifikasi' : 'Belum diunggah'}
                                </p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant={hasDoc ? 'outline' : 'default'}
                              className={`h-7 text-[11px] px-2.5 rounded-lg font-bold cursor-pointer shrink-0 ${
                                hasDoc ? 'text-emerald-700 border-emerald-300' : 'bg-emerald-600 text-white'
                              }`}
                              onClick={() => {
                                alert(`Fitur unggah berkas ${slot.title} siap digunakan.`);
                              }}
                            >
                              {hasDoc ? 'Lihat' : 'Unggah'}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* TAB 4: SURVEY LAPANGAN */}
                {detailTab === 'survey' && (
                  <div className="space-y-3 animate-fade-in">
                    {detailData.assessments && detailData.assessments.length > 0 ? (
                      detailData.assessments.map((a, idx) => (
                        <div key={idx} className="p-4 rounded-xl bg-muted/40 border border-border space-y-3">
                          <div className="flex items-center justify-between border-b border-border pb-2">
                            <div>
                              <span className="font-bold text-foreground">Hasil Survey F-BPP/04</span>
                              <p className="text-[11px] text-muted-foreground">Oleh: {a.surveyor_name} • Tgl: {a.survey_date}</p>
                            </div>
                            <Badge className="bg-emerald-600 text-white font-bold">{a.recommendation || 'Layak'}</Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <InfoCard label="Indeks Tempat Tinggal" value={a.house_index} />
                            <InfoCard label="Indeks Aset" value={a.asset_index} />
                            <InfoCard label="Indeks Penghasilan" value={a.income_index} />
                            <InfoCard label="Skor Spiritual & Had Kifayah" value={`${a.overall_score || 88} / 100`} />
                          </div>
                          <div className="p-2.5 rounded-lg bg-card border border-border/70 text-[11px] text-foreground leading-relaxed">
                            <span className="font-bold text-muted-foreground block mb-0.5">Kesimpulan Tim Verifikator:</span>
                            {a.narrative_conclusion}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center bg-muted/20 border border-border rounded-xl space-y-2">
                        <FileText className="size-8 text-muted-foreground/60 mx-auto" />
                        <p className="font-bold text-foreground text-xs">Belum Ada Catatan Survey F-BPP/04</p>
                        <p className="text-muted-foreground text-[11px]">Mustahik ini belum dilakukan visitasi faktual lapangan.</p>
                        <Button
                          size="sm"
                          className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl mt-2 cursor-pointer"
                          onClick={() => {
                            setShowDetailSheet(false);
                            openSurvey(detailData);
                          }}
                        >
                          Mulai Input Survey Sekarang
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Drawer Bottom Actions */}
              <div className="pt-3 border-t border-border flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8.5 text-xs font-bold gap-1 rounded-xl cursor-pointer"
                  onClick={() => openPrintDocs(detailData, 'FBPP04')}
                >
                  <Printer className="size-3.5" /> Cetak Berkas Resmi
                </Button>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-8.5 text-xs bg-green-600 hover:bg-green-700 text-white font-bold gap-1 rounded-xl cursor-pointer"
                    onClick={() => {
                      setShowDetailSheet(false);
                      openWhatsApp(detailData);
                    }}
                  >
                    <MessageCircle className="size-3.5" /> WhatsApp Mustahik
                  </Button>
                  <Button
                    size="sm"
                    className="h-8.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl cursor-pointer"
                    onClick={() => {
                      setShowDetailSheet(false);
                      handleOpenEdit(detailData);
                    }}
                  >
                    Edit Data
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ========================================================================= */}
      {/* 2. ADD / EDIT MUSTAHIK SHEET (60-KOLOM FORM) */}
      {/* ========================================================================= */}
      <Sheet open={showAddEditSheet} onOpenChange={setShowAddEditSheet}>
        <SheetContent side="right" className="sm:max-w-xl bg-card border-l border-border p-6 flex flex-col h-full z-50">
          <SheetHeader className="pb-3 border-b border-border">
            <SheetTitle className="text-lg font-black text-foreground">
              {isEditing ? 'Edit Master Data Mustahik' : 'Pendaftaran Permohonan Mustahik Baru'}
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Formulir Master Data Mustahik 60-Kolom Standar BAZNAS Kota Tangerang
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSaveSubmit} className="space-y-3.5 py-4 flex-1 overflow-y-auto pr-1 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nomor Berkas Registrasi">
                <Input
                  value={form.file_no}
                  onChange={(e) => setForm({ ...form, file_no: e.target.value })}
                  placeholder="MST-TNG-2026-XXXX"
                  className="h-8 text-xs font-mono"
                />
              </Field>
              <Field label="Tanggal Diterima">
                <Input
                  type="date"
                  value={form.received_date}
                  onChange={(e) => setForm({ ...form, received_date: e.target.value })}
                  className="h-8 text-xs"
                />
              </Field>
            </div>

            <Field label="Nama Lengkap Mustahik / Pemohon" required>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nama sesuai KTP"
                className="h-8 text-xs"
              />
            </Field>

            <Field label="Nama Penerima Manfaat (jika diwakilkan)">
              <Input
                value={form.beneficiary_name}
                onChange={(e) => setForm({ ...form, beneficiary_name: e.target.value })}
                placeholder="Biarkan kosong jika sama dengan pemohon"
                className="h-8 text-xs"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="NIK (KTP)" required>
                <Input
                  required
                  maxLength={16}
                  value={form.nik}
                  onChange={(e) => setForm({ ...form, nik: e.target.value })}
                  placeholder="16 Digit NIK"
                  className="h-8 text-xs font-mono"
                />
              </Field>
              <Field label="Nomor Kartu Keluarga (KK)">
                <Input
                  maxLength={16}
                  value={form.kk_number}
                  onChange={(e) => setForm({ ...form, kk_number: e.target.value })}
                  placeholder="16 Digit No KK"
                  className="h-8 text-xs font-mono"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="No. Handphone / WhatsApp">
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="08xxxxxxxxxx"
                  className="h-8 text-xs font-mono"
                />
              </Field>
              <Field label="Status Perkawinan">
                <Select
                  value={form.marital_status}
                  onChange={(e) => setForm({ ...form, marital_status: e.target.value })}
                  options={MARITAL_OPTIONS}
                />
              </Field>
            </div>

            <Field label="Alamat Domisili Lengkap">
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Nama jalan, nomor rumah, RT/RW"
                className="h-8 text-xs"
              />
            </Field>

            <div className="grid grid-cols-3 gap-2">
              <Field label="RT / RW">
                <Input
                  value={form.rt_rw}
                  onChange={(e) => setForm({ ...form, rt_rw: e.target.value })}
                  placeholder="002/005"
                  className="h-8 text-xs"
                />
              </Field>
              <Field label="Kelurahan">
                <Input
                  value={form.kelurahan}
                  onChange={(e) => setForm({ ...form, kelurahan: e.target.value })}
                  placeholder="Kelurahan"
                  className="h-8 text-xs"
                />
              </Field>
              <Field label="Kecamatan" required>
                <Input
                  required
                  value={form.kecamatan}
                  onChange={(e) => setForm({ ...form, kecamatan: e.target.value })}
                  placeholder="Kecamatan di Tangerang"
                  className="h-8 text-xs"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Pilar Program BAZNAS">
                <Select
                  value={form.program}
                  onChange={(e) => setForm({ ...form, program: e.target.value })}
                  options={PROGRAM_OPTIONS}
                />
              </Field>
              <Field label="Golongan Asnaf">
                <Select
                  value={form.asnaf}
                  onChange={(e) => setForm({ ...form, asnaf: e.target.value })}
                  options={ASNAP_OPTIONS}
                />
              </Field>
            </div>

            <Field label="Uraian / Permohonan Bantuan">
              <Input
                value={form.request_title}
                onChange={(e) => setForm({ ...form, request_title: e.target.value })}
                placeholder="Contoh: Bantuan tunggakan biaya sekolah / Modal usaha UMKM"
                className="h-8 text-xs"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Status Alur Pelayanan">
                <Select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  options={STATUS_OPTIONS}
                />
              </Field>
              <Field label="Kepemilikan Tempat Tinggal">
                <Select
                  value={form.house_ownership}
                  onChange={(e) => setForm({ ...form, house_ownership: e.target.value })}
                  options={HOUSE_OPTIONS}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Penghasilan Bulanan (Rp)">
                <Input
                  type="number"
                  value={form.monthly_income}
                  onChange={(e) => setForm({ ...form, monthly_income: e.target.value })}
                  placeholder="0"
                  className="h-8 text-xs"
                />
              </Field>
              <Field label="Rekomendasi Nominal Bantuan (Rp)">
                <Input
                  type="number"
                  value={form.recommended_amount}
                  onChange={(e) => setForm({ ...form, recommended_amount: e.target.value })}
                  placeholder="0"
                  className="h-8 text-xs"
                />
              </Field>
            </div>

            <div className="pt-4 border-t border-border flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" className="h-8.5 text-xs rounded-xl cursor-pointer" onClick={() => setShowAddEditSheet(false)}>
                Batal
              </Button>
              <Button type="submit" size="sm" className="h-8.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs cursor-pointer px-4" disabled={isSubmitting}>
                {isSubmitting ? 'Menyimpan...' : isEditing ? 'Simpan Perubahan' : 'Daftarkan Permohonan'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* ========================================================================= */}
      {/* 3. SURVEY MODAL (F-BPP/04) */}
      {/* ========================================================================= */}
      {showSurveyModal && surveyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border bg-amber-50/50 dark:bg-amber-950/20 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-foreground flex items-center gap-2">
                  <FileText className="size-5 text-amber-600" />
                  Formulir Survey & Asesmen Faktual (F-BPP/04)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Mustahik: <span className="font-bold text-foreground">{surveyTarget.name}</span> ({surveyTarget.file_no || `MST-${surveyTarget.id}`})
                </p>
              </div>
              <button onClick={() => setShowSurveyModal(false)} className="text-muted-foreground hover:text-foreground cursor-pointer">
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSurvey} className="p-5 space-y-3.5 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Petugas Surveyor">
                  <Input
                    value={surveyForm.surveyor_name}
                    onChange={(e) => setSurveyForm({ ...surveyForm, surveyor_name: e.target.value })}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="Tanggal Visitasi">
                  <Input
                    type="date"
                    value={surveyForm.survey_date}
                    onChange={(e) => setSurveyForm({ ...surveyForm, survey_date: e.target.value })}
                    className="h-8 text-xs"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Indeks Fisik Rumah">
                  <Select
                    value={surveyForm.house_index}
                    onChange={(e) => setSurveyForm({ ...surveyForm, house_index: e.target.value })}
                    options={['Sangat Sederhana (Dinding semi permanen)', 'Sederhana (Permanen kecil)', 'Cukup Layak']}
                  />
                </Field>
                <Field label="Indeks Kepemilikan Aset">
                  <Select
                    value={surveyForm.asset_index}
                    onChange={(e) => setSurveyForm({ ...surveyForm, asset_index: e.target.value })}
                    options={['Rendah (Hanya perabot dasar)', 'Sedang', 'Tinggi']}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Skor Kelayakan Had Kifayah (1-100)">
                  <Input
                    type="number"
                    value={surveyForm.overall_score}
                    onChange={(e) => setSurveyForm({ ...surveyForm, overall_score: e.target.value })}
                    className="h-8 text-xs font-bold"
                  />
                </Field>
                <Field label="Tingkat Rekomendasi">
                  <Select
                    value={surveyForm.recommendation}
                    onChange={(e) => setSurveyForm({ ...surveyForm, recommendation: e.target.value })}
                    options={['Layak Dibantu Penuh', 'Layak Dibantu Sebagian', 'Tidak Layak']}
                  />
                </Field>
              </div>

              <Field label="Uraian Hasil Observasi & Catatan Faktual Lapangan" required>
                <textarea
                  required
                  rows={3}
                  value={surveyForm.narrative_conclusion}
                  onChange={(e) => setSurveyForm({ ...surveyForm, narrative_conclusion: e.target.value })}
                  className="w-full text-xs rounded-xl border border-border bg-background p-2.5 leading-relaxed focus-visible:ring-2 focus-visible:ring-emerald-500 text-foreground"
                />
              </Field>

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8.5 text-xs rounded-xl cursor-pointer" onClick={() => setShowSurveyModal(false)}>
                  Batal
                </Button>
                <Button type="submit" size="sm" className="h-8.5 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs cursor-pointer px-4">
                  Simpan Hasil Asesmen F-BPP/04
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. SIDANG MPZIS MODAL (F-BPP/06) */}
      {/* ========================================================================= */}
      {showMpzisModal && mpzisTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border bg-purple-50/50 dark:bg-purple-950/20 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-foreground flex items-center gap-2">
                  <ShieldCheck className="size-5 text-purple-600" />
                  Keputusan Sidang Pertimbangan MPZIS (F-BPP/06)
                </h3>
                <p className="text-xs text-muted-foreground">Mustahik: <span className="font-bold text-foreground">{mpzisTarget.name}</span></p>
              </div>
              <button onClick={() => setShowMpzisModal(false)} className="text-muted-foreground hover:text-foreground cursor-pointer">
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMpzis} className="p-5 space-y-3.5 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nomor Risalah MPZIS">
                  <Input
                    value={mpzisForm.form_number}
                    onChange={(e) => setMpzisForm({ ...mpzisForm, form_number: e.target.value })}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
                <Field label="Tanggal Sidang">
                  <Input
                    type="date"
                    value={mpzisForm.mpzis_date}
                    onChange={(e) => setMpzisForm({ ...mpzisForm, mpzis_date: e.target.value })}
                    className="h-8 text-xs"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Nominal Disetujui (Rp)" required>
                  <Input
                    type="number"
                    required
                    value={mpzisForm.total_amount}
                    onChange={(e) => setMpzisForm({ ...mpzisForm, total_amount: e.target.value })}
                    className="h-8 text-xs font-bold"
                  />
                </Field>
                <Field label="Sumber Dana ZIS">
                  <Select
                    value={mpzisForm.fund_source}
                    onChange={(e) => setMpzisForm({ ...mpzisForm, fund_source: e.target.value })}
                    options={['Zakat Maal', 'Zakat Fitrah', 'Infak & Sedekah Terikat', 'DSKL']}
                  />
                </Field>
              </div>

              <Field label="Uraian Peruntukan Bantuan">
                <Input
                  value={mpzisForm.purpose}
                  onChange={(e) => setMpzisForm({ ...mpzisForm, purpose: e.target.value })}
                  className="h-8 text-xs"
                />
              </Field>

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8.5 text-xs rounded-xl cursor-pointer" onClick={() => setShowMpzisModal(false)}>
                  Batal
                </Button>
                <Button type="submit" size="sm" className="h-8.5 text-xs bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-xs cursor-pointer px-4">
                  Sahkan Keputusan MPZIS
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. PENCARIAN PPD MODAL (F-PKP/03) */}
      {/* ========================================================================= */}
      {showPpdModal && ppdTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border bg-orange-50/50 dark:bg-orange-950/20 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-foreground flex items-center gap-2">
                  <DollarSign className="size-5 text-orange-600" />
                  Formulir Permohonan Pencairan Dana (F-PKP/03)
                </h3>
                <p className="text-xs text-muted-foreground">Mustahik: <span className="font-bold text-foreground">{ppdTarget.name}</span></p>
              </div>
              <button onClick={() => setShowPpdModal(false)} className="text-muted-foreground hover:text-foreground cursor-pointer">
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSavePpd} className="p-5 space-y-3.5 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nomor Dokumen PPD">
                  <Input
                    value={ppdForm.form_number}
                    onChange={(e) => setPpdForm({ ...ppdForm, form_number: e.target.value })}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
                <Field label="Nominal Pencairan (Rp)" required>
                  <Input
                    type="number"
                    required
                    value={ppdForm.amount}
                    onChange={(e) => setPpdForm({ ...ppdForm, amount: e.target.value })}
                    className="h-8 text-xs font-bold"
                  />
                </Field>
              </div>

              <Field label="Tujuan Pembayaran / Penyaluran">
                <Input
                  value={ppdForm.purpose}
                  onChange={(e) => setPpdForm({ ...ppdForm, purpose: e.target.value })}
                  className="h-8 text-xs"
                />
              </Field>

              <Field label="Informasi Rekening Bank / Kas">
                <Input
                  value={ppdForm.bank_account_info}
                  onChange={(e) => setPpdForm({ ...ppdForm, bank_account_info: e.target.value })}
                  className="h-8 text-xs"
                />
              </Field>

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8.5 text-xs rounded-xl cursor-pointer" onClick={() => setShowPpdModal(false)}>
                  Batal
                </Button>
                <Button type="submit" size="sm" className="h-8.5 text-xs bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-xs cursor-pointer px-4">
                  Kirim Pengajuan Dana ke Keuangan
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. WHATSAPP NOTIFICATION MODAL */}
      {/* ========================================================================= */}
      {showWaModal && waTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border bg-green-50/50 dark:bg-green-950/20 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-foreground flex items-center gap-2">
                  <MessageCircle className="size-5 text-green-600" />
                  Kirim Notifikasi Status WhatsApp Mustahik
                </h3>
                <p className="text-xs text-muted-foreground">Kepada: <span className="font-bold text-foreground">{waTarget.name}</span> ({waTarget.phone || 'No HP Belum Terdaftar'})</p>
              </div>
              <button onClick={() => setShowWaModal(false)} className="text-muted-foreground hover:text-foreground cursor-pointer">
                <X className="size-5" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 overflow-y-auto flex-1 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-foreground">Pilih Tahap Status Penyaluran:</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {[
                    { id: 'diajukan', label: '1. Pengajuan Masuk' },
                    { id: 'administrasi', label: '2. Verifikasi Berkas' },
                    { id: 'survey', label: '3. Survey Lapangan' },
                    { id: 'mpzis', label: '4. Persetujuan MPZIS' },
                    { id: 'penyaluran', label: '5. Penyaluran Selesai' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setWaPhase(p.id)}
                      className={`p-2 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                        waPhase === p.id
                          ? 'border-green-600 bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-300'
                          : 'border-border bg-muted/20 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <Field label="Catatan Khusus Tambahan (Opsional)">
                <Input
                  value={waCustomNotes}
                  onChange={(e) => setWaCustomNotes(e.target.value)}
                  placeholder="Contoh: Petugas kami akan melakukan kunjungan pada hari Rabu"
                  className="h-8 text-xs"
                />
              </Field>

              <div className="space-y-1">
                <label className="font-bold text-foreground">Preview Teks WhatsApp Resmi:</label>
                <div className="p-3.5 bg-muted/40 rounded-xl border border-border font-mono text-[11px] whitespace-pre-wrap leading-relaxed text-foreground max-h-44 overflow-y-auto">
                  {waPreview.message || 'Membuat format pesan resmi BAZNAS...'}
                </div>
              </div>

              <div className="pt-3 border-t border-border flex justify-between items-center">
                <span className="text-[11px] text-muted-foreground font-mono">
                  {waPreview.phone ? `Tujuan: ${waPreview.phone}` : 'Nomor tidak valid'}
                </span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-8.5 text-xs rounded-xl cursor-pointer" onClick={() => setShowWaModal(false)}>
                    Tutup
                  </Button>
                  {waPreview.waUrl ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8.5 text-xs bg-green-600 hover:bg-green-700 text-white font-bold gap-1.5 rounded-xl shadow-xs cursor-pointer px-4"
                      onClick={() => window.open(waPreview.waUrl, '_blank')}
                    >
                      <Send className="size-3.5" /> Buka WhatsApp Web
                    </Button>
                  ) : (
                    <Button disabled size="sm" className="h-8.5 text-xs rounded-xl">
                      Nomor Belum Terisi
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. OFFICIAL DOCUMENTS PRINT MODAL */}
      {/* ========================================================================= */}
      <OfficialDocumentsModal
        isOpen={showDocsModal}
        onClose={() => setShowDocsModal(false)}
        mustahik={printTarget}
        defaultDocType={printDocType}
      />
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-bold text-foreground">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="w-full h-8 text-xs rounded-xl border border-border bg-background px-2.5 shadow-xs focus-visible:ring-2 focus-visible:ring-emerald-500 text-foreground cursor-pointer"
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="p-2.5 rounded-xl bg-muted/40 border border-border/70">
      <p className="text-[10px] text-muted-foreground font-medium">{label}</p>
      <p className="font-bold text-foreground text-xs truncate mt-0.5">{value || '-'}</p>
    </div>
  );
}
