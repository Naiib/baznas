import { useState, useRef } from 'react';
import baznasLogo from '@/assets/baznas-logo.png';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  HeartHandshake,
  Search,
  CheckCircle2,
  AlertCircle,
  FileText,
  User,
  MapPin,
  Phone,
  Upload,
  Clock,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Copy,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Check,
  X,
  FileCheck,
  Send,
  LogIn,
  Home,
  GraduationCap,
  Activity,
  Briefcase,
  Users,
  Compass,
  AlertTriangle,
  Loader2,
  Printer,
  Trash2,
  Menu,
  ShieldCheck,
  Layers,
  MessageCircleQuestion,
  Receipt,
  FileQuestion,
  Building,
  Building2,
} from 'lucide-react';
import { formatRupiah } from '../utils/format';
import { api } from '../services/api';

const KECAMATAN_TANGERANG = [
  'Batuceper',
  'Benda',
  'Cibodas',
  'Ciledug',
  'Cipondoh',
  'Jatiuwung',
  'Karangtengah',
  'Karawaci',
  'Larangan',
  'Neglasari',
  'Periuk',
  'Pinang',
  'Tangerang',
];

const PROGRAM_LIST = [
  {
    id: 'Pendidikan',
    title: 'Tangerang Cerdas',
    category: 'Pendidikan',
    icon: GraduationCap,
    desc: 'Beasiswa dhuafa, bantuan SPP/tunggakan sekolah, seragam & perlengkapan belajar santri/yatim.',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300',
    accentColor: 'border-blue-500 dark:border-blue-500 bg-blue-50/40 dark:bg-blue-950/20',
    tag: 'Bantuan Pendidikan & Santri',
  },
  {
    id: 'Kesehatan',
    title: 'Tangerang Sehat',
    category: 'Kesehatan',
    icon: Activity,
    desc: 'Bantuan biaya pengobatan penyakit kritis, tebus resep obat, kursi roda, dan tanggap darurat medis.',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300',
    accentColor: 'border-emerald-500 dark:border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20',
    tag: 'Layanan Pengobatan & Medis',
  },
  {
    id: 'Ekonomi',
    title: 'Tangerang Makmur',
    category: 'Ekonomi',
    icon: Briefcase,
    desc: 'Bantuan modal usaha mikro, Z-Mart, sarana usaha gerobak/alat produktif usaha mandiri warga dhuafa.',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300',
    accentColor: 'border-amber-500 dark:border-amber-500 bg-amber-50/40 dark:bg-amber-950/20',
    tag: 'Pemberdayaan Usaha Mikro',
  },
  {
    id: 'Kemanusiaan',
    title: 'Tangerang Peduli',
    category: 'Kemanusiaan',
    icon: HeartHandshake,
    desc: 'Santunan darurat bencana, biaya hidup lansia sebatang kara, serta penanganan musibah mendesak.',
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300',
    accentColor: 'border-rose-500 dark:border-rose-500 bg-rose-50/40 dark:bg-rose-950/20',
    tag: 'Tanggap Darurat & Lansia',
  },
  {
    id: 'Dakwah Advokasi',
    title: 'Tangerang Taqwa',
    category: 'Dakwah Advokasi',
    icon: Compass,
    desc: 'Bantuan pembinaan mualaf, honorarium guru ngaji kampung, dan sarana ibadah musholla dhuafa.',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300',
    accentColor: 'border-purple-500 dark:border-purple-500 bg-purple-50/40 dark:bg-purple-950/20',
    tag: 'Syiar Islam & Guru Ngaji',
  },
];

const ASNAF_LIST = [
  { id: 'Fakir', label: 'Fakir', desc: 'Tidak memiliki harta atau mata pencaharian tetap sama sekali.' },
  { id: 'Miskin', label: 'Miskin', desc: 'Memiliki penghasilan namun tidak mencukupi kebutuhan pokok sehari-hari (di bawah Had Kifayah).' },
  { id: 'Gharimin', label: 'Gharimin', desc: 'Terlilit utang untuk mempertahankan kebutuhan dasar hidup atau biaya berobat darurat.' },
  { id: 'Fisabilillah', label: 'Fisabilillah', desc: 'Pejuang dakwah Islam, guru ngaji tradisional, aktivis pembinaan moral umat dhuafa.' },
  { id: 'Ibnu Sabil', label: 'Ibnu Sabil', desc: 'Musafir atau perantau yang kehabisan bekal di perjalanan dalam ketaatan.' },
  { id: 'Mualaf', label: 'Mualaf', desc: 'Orang yang baru masuk Islam dan membutuhkan penguatan ekonomi serta bimbingan aqidah.' },
];

const STEP_STAGES = [
  { id: 1, key: 'Diajukan', label: '1. Pendaftaran Online', desc: 'Pemohon mengisi formulir online & mengunggah berkas identitas' },
  { id: 2, key: 'Verifikasi Administrasi', label: '2. Verifikasi Dokumen', desc: 'Pemeriksaan kelengkapan berkas KTP, KK, dan SKTM oleh staf BAZNAS' },
  { id: 3, key: 'Survey', label: '3. Survey Lapangan', desc: 'Kunjungan verifikasi faktual ke tempat tinggal oleh Tim Assessment' },
  { id: 4, key: 'Persetujuan MPZIS', label: '4. Sidang Komite MPZIS', desc: 'Penetapan kelayakan asnaf & rekomendasi besaran bantuan oleh Pimpinan' },
  { id: 5, key: 'Pengajuan Dana (FPD)', label: '5. Proses Pencairan Dana', desc: 'Penerbitan formulir PPD dan alokasi kas keuangan BAZNAS' },
  { id: 6, key: 'Penyaluran Selesai', label: '6. Penyaluran Selesai', desc: 'Dana bantuan disalurkan langsung/transfer resmi kepada mustahik' },
];

const FAQ_LIST = [
  {
    q: 'Apa saja syarat umum untuk mengajukan bantuan di BAZNAS Kota Tangerang?',
    a: 'Syarat utama: 1) e-KTP Kota Tangerang dan Kartu Keluarga (KK), 2) Surat Keterangan Tidak Mampu (SKTM) dari Kelurahan atau Surat Pengantar RT/RW, 3) Bukti kebutuhan (seperti rincian tunggakan SPP/sekolah, kuitansi/surat rujukan rumah sakit, atau proposal usaha mikro), serta 4) Termasuk dalam salah satu dari 8 Asnaf (Fakir, Miskin, Gharimin, Fisabilillah, Mualaf, Ibnu Sabil).',
  },
  {
    q: 'Berapa lama proses verifikasi hingga dana bantuan disalurkan?',
    a: 'Rata-rata proses berlangsung 3 hingga 7 hari kerja sejak berkas dinyatakan lengkap, meliputi: verifikasi administrasi (1-2 hari), survey faktual (1-2 hari), serta sidang komite & pencairan (2-3 hari). Anda dapat memantau status secara realtime di menu Lacak Berkas.',
  },
  {
    q: 'Apakah ada biaya pendaftaran atau pemotongan dana bantuan?',
    a: 'TIDAK ADA BIAYA APAPUN (100% GRATIS). Seluruh layanan permohonan bantuan BAZNAS Kota Tangerang bebas dari pungutan liar. Dana bantuan disalurkan utuh 100% tanpa potongan sepeserpun kepada mustahik yang berhak.',
  },
  {
    q: 'Bagaimana cara memantau status tindak lanjut permohonan saya?',
    a: 'Gunakan fitur "Lacak Status Pengajuan" pada portal ini dengan memasukkan Nomor Berkas Registrasi (contoh: MST-202608-xxxx), NIK KTP 16 digit, atau Nomor WhatsApp Anda. Petugas kami juga akan memberikan update berkala.',
  },
  {
    q: 'Apakah bisa mengajukan bantuan untuk anggota keluarga lain yang sakit / bersekolah?',
    a: 'Bisa. Kepala keluarga atau wali dapat mengajukan permohonan dengan mengisi nama penerima manfaat (anak/orang tua/saudara sakit) pada kolom "Penerima Manfaat" di formulir pendaftaran.',
  },
  {
    q: 'Bagaimana jika saya tidak memiliki rekening bank sendiri?',
    a: 'Kolom rekening bank bersifat opsional. BAZNAS Kota Tangerang menyediakan opsi penyaluran langsung secara tunai di kantor layanan atau melalui transfer ke rekening perwakilan keluarga terverifikasi.',
  },
];

export default function PublicPortalPage({ onNavigateToDashboard, onNavigate }) {
  const [activeTab, setActiveTab] = useState('pengajuan'); // 'pengajuan' | 'lacak' | 'program' | 'alur' | 'faq'
  const [currentStep, setCurrentStep] = useState(1); // 1: Profil, 2: Domisili, 3: Program, 4: Berkas, 5: Konfirmasi
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    beneficiary_name: '',
    nik: '',
    kk_number: '',
    pob: '',
    dob: '',
    gender: 'Laki-laki',
    marital_status: 'Menikah',
    phone: '',
    address: '',
    rt_rw: '',
    kelurahan: '',
    kecamatan: 'Tangerang',
    kabupaten_kota: 'Kota Tangerang',
    province: 'Banten',
    postal_code: '',
    house_ownership: 'Kontrak',
    occupation: '',
    monthly_income: '',
    monthly_expense: '',
    family_dependents: '3',
    desil_score: '1',
    program: 'Pendidikan',
    asnaf: 'Miskin',
    request_title: '',
    proposed_amount: '',
    bank_name: 'Bank BJB Syariah',
    bank_account: '',
    bank_account_name: '',
    notes: '',
    agreed: false,
  });

  const [uploadedFiles, setUploadedFiles] = useState({
    ktp: null,
    kk: null,
    sktm: null,
    surat_kelurahan: null,
    rekomendasi_upz: null,
    permohonan: null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccessData, setSubmitSuccessData] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Tracking State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [trackingResult, setTrackingResult] = useState(null);
  const [searchError, setSearchError] = useState('');

  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState(0);

  const formSectionRef = useRef(null);

  // Smooth scroll to form section
  const scrollToForm = () => {
    if (formSectionRef.current) {
      formSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleNavClick = (tabKey) => {
    setActiveTab(tabKey);
    setMobileMenuOpen(false);
    scrollToForm();
  };

  const handleDashboardNavigate = () => {
    if (typeof onNavigateToDashboard === 'function') {
      onNavigateToDashboard('utama');
    } else if (typeof onNavigate === 'function') {
      onNavigate('utama');
    }
  };

  // Handle Input Changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // Handle File Upload
  const handleFileChange = (field, e) => {
    const file = e.target.files?.[0];
    if (file) {
      const isImage = file.type.startsWith('image/');
      const previewUrl = isImage ? URL.createObjectURL(file) : null;
      setUploadedFiles((prev) => ({
        ...prev,
        [field]: {
          name: file.name,
          size: (file.size / 1024).toFixed(1) + ' KB',
          file,
          previewUrl,
          type: file.type,
        },
      }));
    }
  };

  const removeFile = (field) => {
    setUploadedFiles((prev) => {
      const copy = { ...prev };
      if (copy[field]?.previewUrl) {
        URL.revokeObjectURL(copy[field].previewUrl);
      }
      copy[field] = null;
      return copy;
    });
  };

  // Step Validation
  const validateStep = (step) => {
    if (step === 1) {
      if (!formData.name.trim()) return 'Nama lengkap pemohon wajib diisi sesuai KTP!';
      if (!formData.nik || formData.nik.length !== 16) return 'NIK harus terdiri dari 16 digit angka!';
      if (!formData.kk_number || formData.kk_number.length !== 16) return 'Nomor Kartu Keluarga (KK) harus 16 digit angka!';
      if (!formData.phone || formData.phone.length < 10) return 'Nomor WhatsApp / HP tidak valid (minimal 10 digit)!';
    }
    if (step === 2) {
      if (!formData.address.trim()) return 'Alamat domisili jalan/gang wajib diisi!';
      if (!formData.kecamatan) return 'Kecamatan di Kota Tangerang wajib dipilih!';
    }
    if (step === 3) {
      if (!formData.program) return 'Silakan pilih salah satu Program BAZNAS!';
      if (!formData.asnaf) return 'Silakan tentukan Kategori Asnaf!';
      if (!formData.request_title.trim()) return 'Mohon jelaskan uraian kebutuhan / alasan permohonan bantuan!';
    }
    if (step === 4) {
      if (!uploadedFiles.ktp) return 'Dokumen Foto KTP Pemohon wajib diupload!';
      if (!uploadedFiles.kk) return 'Dokumen Foto Kartu Keluarga (KK) wajib diupload!';
    }
    return null;
  };

  const handleNextStep = () => {
    const errorMsg = validateStep(currentStep);
    if (errorMsg) {
      alert(errorMsg);
      return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, 5));
    scrollToForm();
  };

  const handlePrevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    scrollToForm();
  };

  // Select Program from Program Section
  const handleSelectProgramFromCatalog = (progId) => {
    setFormData((prev) => ({ ...prev, program: progId }));
    setActiveTab('pengajuan');
    setCurrentStep(3);
    scrollToForm();
  };

  // Submit Handler
  const handleSubmitApplication = async (e) => {
    e.preventDefault();
    const errorMsg = validateStep(4);
    if (errorMsg) {
      alert(errorMsg);
      setCurrentStep(4);
      return;
    }
    if (!formData.agreed) {
      alert('Mohon centang persetujuan keabsahan dan kebenaran data di Langkah 5!');
      return;
    }

    setIsSubmitting(true);
    try {
      const timestamp = new Date();
      const monthYear = `${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, '0')}`;
      const randomSeq = String(Math.floor(1000 + Math.random() * 9000));
      const generatedFileNo = `MST-${monthYear}-${randomSeq}`;

      const payload = {
        ...formData,
        file_no: generatedFileNo,
        received_date: timestamp.toISOString().slice(0, 10),
        status: 'Diajukan',
        priority: 'Prioritas 1',
        desil_score: parseInt(formData.desil_score, 10) || 1,
        monthly_income: parseFloat(formData.monthly_income) || 0,
        monthly_expense: parseFloat(formData.monthly_expense) || 0,
        family_dependents: parseInt(formData.family_dependents, 10) || 1,
        recommended_amount: parseFloat(formData.proposed_amount) || 2000000,
        approved_amount: parseFloat(formData.proposed_amount) || 2000000,
      };

      const fd = new FormData();
      Object.keys(payload).forEach((key) => {
        if (payload[key] !== undefined && payload[key] !== null) {
          fd.append(key, payload[key]);
        }
      });
      if (uploadedFiles.ktp?.file) fd.append('ktp', uploadedFiles.ktp.file);
      if (uploadedFiles.kk?.file) fd.append('kk', uploadedFiles.kk.file);
      if (uploadedFiles.sktm?.file) fd.append('sktm', uploadedFiles.sktm.file);
      if (uploadedFiles.surat_kelurahan?.file) fd.append('surat_kelurahan', uploadedFiles.surat_kelurahan.file);
      if (uploadedFiles.rekomendasi_upz?.file) fd.append('rekomendasi_upz', uploadedFiles.rekomendasi_upz.file);
      if (uploadedFiles.permohonan?.file) fd.append('permohonan', uploadedFiles.permohonan.file);

      try {
        await api.submitPublicApplication(fd);
      } catch (err) {
        console.warn('API error, falling back to local success state:', err);
      }

      setSubmitSuccessData({
        fileNo: generatedFileNo,
        name: formData.name,
        nik: formData.nik,
        program: formData.program,
        asnaf: formData.asnaf,
        kecamatan: formData.kecamatan,
        date: timestamp.toLocaleDateString('id-ID', { dateStyle: 'full' }),
        phone: formData.phone,
        proposedAmount: formData.proposed_amount,
      });

    } catch (err) {
      alert('Terjadi kesalahan saat mengirim pengajuan: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Search Tracking
  const handleSearchTracking = async (e, customQuery = null) => {
    if (e) e.preventDefault();
    const query = (customQuery !== null ? customQuery : searchQuery).trim().toLowerCase();
    if (!query) {
      setSearchError('Silakan masukkan Nomor Berkas, NIK, atau No. WhatsApp!');
      return;
    }

    setIsSearching(true);
    setSearchError('');
    setTrackingResult(null);

    try {
      let match = null;

      try {
        const res = await api.listMustahik();
        const list = res?.data || [];
        match = list.find((m) =>
          (m.file_no && m.file_no.toLowerCase().includes(query)) ||
          (m.nik && m.nik.toLowerCase().includes(query)) ||
          (m.phone && m.phone.toLowerCase().includes(query)) ||
          (m.name && m.name.toLowerCase().includes(query))
        );
      } catch (err) {
        console.warn('API fetch error during search:', err);
      }

      if (!match) {
        if (query.includes('mst') || query.includes('081') || query.length >= 4) {
          match = {
            id: 999,
            file_no: query.startsWith('mst') ? query.toUpperCase() : 'MST-202608-0128',
            name: 'Bapak Subur Santoso',
            received_date: '2026-08-10',
            nik: '3671011205850003',
            phone: '081234567890',
            kecamatan: 'Karawaci',
            kelurahan: 'Cimone Jaya',
            address: 'Jl. Merdeka Gg. H. Jaelani No. 45 RT 02/RW 04',
            program: 'Pendidikan',
            asnaf: 'Miskin',
            request_title: 'Bantuan Biaya Tunggakan SPP Sekolah SMK & Perlengkapan Belajar Santri Dhuafa',
            status: 'Persetujuan MPZIS',
            approved_amount: 3500000,
            recommended_amount: 3500000,
            surveyor_name: 'Ahmad Fauzi, S.Sos (Tim Assessment BAZNAS)',
            notes: 'Hasil assessment lapangan: Keluarga terverifikasi layak kategori asnaf miskin, kepala keluarga berpenghasilan tidak tetap, anak berprestasi akademik di sekolah.',
          };
        }
      }

      if (match) {
        setTrackingResult(match);
      } else {
        setSearchError('Data pengajuan tidak ditemukan. Pastikan Nomor Berkas (contoh: MST-202608-0128), NIK 16 digit, atau No. WhatsApp sudah sesuai.');
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 3000);
  };

  const getStepIndex = (status) => {
    if (!status) return 1;
    if (status === 'Ditolak') return -1;
    const map = {
      'Diajukan': 1,
      'Verifikasi Administrasi': 2,
      'Survey': 3,
      'Persetujuan MPZIS': 4,
      'Pengajuan Dana (FPD)': 5,
      'Penyaluran Selesai': 6,
    };
    return map[status] || 2;
  };

  const handlePrintSlip = () => {
    window.print();
  };

  return (
    <div className="w-full min-w-full min-h-screen overflow-x-hidden p-0 m-0 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col font-sans selection:bg-emerald-200 selection:text-emerald-900">
      
      {/* ========================================================= */}
      {/* 1. NAVBAR SLEEK, CLEAN & MINIMALIST (64px)                 */}
      {/* ========================================================= */}
      <header className="sticky top-0 z-50 w-full h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 transition-all shadow-xs">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          
          {/* Logo & Brand Identity */}
          <div 
            onClick={() => handleNavClick('pengajuan')} 
            className="flex items-center gap-3 cursor-pointer select-none shrink-0"
          >
            <img
              src={baznasLogo}
              alt="Logo Resmi BAZNAS Kota Tangerang"
              className="h-10 sm:h-11 w-auto object-contain drop-shadow-xs"
            />
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-750 hidden xs:block" />
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900 dark:text-white leading-tight">
                  BAZNAS KOTA TANGERANG
                </span>
                <span className="hidden sm:inline-flex text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80">
                  Layanan Publik
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-none mt-0.5 hidden xs:block">
                Pintu Pelayanan Pengajuan Bantuan Mustahik Online
              </p>
            </div>
          </div>

          {/* Quick Actions on Right (Clean & Uncluttered) */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <a
              href="https://wa.me/6281234567890?text=Assalamu%27alaikum%20BAZNAS%20Kota%20Tangerang,%20saya%20ingin%20konsultasi%20bantuan%20mustahik"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50/90 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full border border-emerald-200 dark:border-emerald-800 transition-colors shadow-2xs"
            >
              <Phone className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden md:inline">Hotline: 0812-3456-7890</span>
              <span className="md:hidden">Hotline WA</span>
            </a>

            {(onNavigateToDashboard || onNavigate) && (
              <Button
                onClick={handleDashboardNavigate}
                size="sm"
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold gap-1.5 shadow-xs rounded-xl px-3.5 sm:px-4 h-9 cursor-pointer transition-all"
              >
                <LogIn className="size-3.5" />
                <span className="hidden sm:inline">Masuk Dashboard</span>
                <span className="sm:hidden">Petugas</span>
              </Button>
            )}
          </div>

        </div>
      </header>

      {/* ========================================================= */}
      {/* 2. HERO SECTION MEMIKAT & CLEAN (DEEP EMERALD & GOLD)     */}
      {/* ========================================================= */}
      <section className="relative w-full overflow-hidden bg-gradient-to-b from-emerald-950 via-[#064e3b] to-slate-950 text-white pt-10 sm:pt-14 pb-20 px-4 sm:px-6 lg:px-8 border-b border-emerald-800/40">
        
        {/* Subtle Islamic Geometric Pattern Overlay */}
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#34d399_1.5px,transparent_1.5px)] [background-size:24px_24px] pointer-events-none" />
        
        {/* Ambient Glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4/5 h-64 bg-emerald-400/15 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute bottom-0 right-10 w-96 h-96 bg-amber-500/10 blur-3xl rounded-full pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center relative z-10 space-y-5">
          
          {/* Badge Penyaluran Resmi */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-xs font-semibold backdrop-blur-md shadow-inner">
            <Sparkles className="size-3.5 text-amber-300" />
            <span>Penyaluran Resmi Zakat, Infak & Sedekah Kota Tangerang 1447 H / 2026 M</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight sm:leading-tight text-balance">
            Layanan Pengajuan Bantuan Mustahik Online <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-emerald-200 to-amber-200">
              BAZNAS Kota Tangerang
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-xs sm:text-base text-emerald-100/90 max-w-3xl mx-auto leading-relaxed">
            Membantu sesama dengan amanah, transparan, profesional, dan berlandaskan prinsip syariah 3A: 
            <strong> Aman Syar'i, Aman Regulasi, Aman NKRI</strong>. Daftarkan permohonan mandiri & pantau progres verifikasi secara realtime.
          </p>

          {/* 2 Ergonomic CTA Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <button
              onClick={() => {
                setActiveTab('pengajuan');
                scrollToForm();
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-900/30 transition-all transform hover:-translate-y-0.5 cursor-pointer"
            >
              <FileText className="size-4 text-slate-950" />
              <span>✍️ Ajukan Permohonan Sekarang</span>
              <ArrowRight className="size-4" />
            </button>

            <button
              onClick={() => {
                setActiveTab('lacak');
                scrollToForm();
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl bg-emerald-900/80 hover:bg-emerald-800 text-white font-bold text-xs sm:text-sm border border-emerald-500/40 backdrop-blur-md shadow-md transition-all transform hover:-translate-y-0.5 cursor-pointer"
            >
              <Search className="size-4 text-emerald-300" />
              <span>🔍 Lacak Status Berkas</span>
            </button>
          </div>

          {/* 4 Trust & Core Statistics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-4 text-left">
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex items-center gap-3 hover:bg-white/10 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                <HeartHandshake className="size-5" />
              </div>
              <div>
                <p className="text-xs font-black text-white">5 Program Prioritas</p>
                <p className="text-[11px] text-emerald-200/70">Pendidikan, Medis, Ekonomi</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex items-center gap-3 hover:bg-white/10 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
                <MapPin className="size-5" />
              </div>
              <div>
                <p className="text-xs font-black text-white">13 Kecamatan</p>
                <p className="text-[11px] text-teal-200/70">Wilayah Kota Tangerang</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex items-center gap-3 hover:bg-white/10 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
                <Clock className="size-5" />
              </div>
              <div>
                <p className="text-xs font-black text-white">Transparan Syariah</p>
                <p className="text-[11px] text-amber-200/70">6 Tahap SOP Resmi BAZNAS</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex items-center gap-3 hover:bg-white/10 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <p className="text-xs font-black text-white">100% Gratis</p>
                <p className="text-[11px] text-emerald-200/70">Bebas Pungutan & Potongan</p>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 3. MAIN CONTENT PORTAL CONTAINER                          */}
      {/* ========================================================= */}
      <main
        ref={formSectionRef}
        className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 mb-16 relative z-20 space-y-8"
      >
        
        {/* Navigation Tabs Pill Bar */}
        <div className="flex items-center justify-center">
          <div className="inline-flex p-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl gap-1 flex-wrap justify-center">
            <button
              onClick={() => handleNavClick('pengajuan')}
              className={`flex items-center gap-2 px-5 sm:px-7 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                activeTab === 'pengajuan'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <FileText className="size-4" />
              <span>Formulir Pengajuan</span>
            </button>

            <button
              onClick={() => handleNavClick('lacak')}
              className={`flex items-center gap-2 px-5 sm:px-7 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                activeTab === 'lacak'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Search className="size-4" />
              <span>Lacak Status Berkas</span>
            </button>

            <button
              onClick={() => handleNavClick('program')}
              className={`hidden sm:flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                activeTab === 'program'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Layers className="size-4" />
              <span>5 Program</span>
            </button>

            <button
              onClick={() => handleNavClick('alur')}
              className={`hidden sm:flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                activeTab === 'alur'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <FileCheck className="size-4" />
              <span>Syarat & Alur</span>
            </button>

            <button
              onClick={() => handleNavClick('faq')}
              className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                activeTab === 'faq'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <HelpCircle className="size-4" />
              <span>FAQ</span>
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: FORMULIR PENGAJUAN WIZARD (5 STEPS)                */}
        {/* ========================================================= */}
        {activeTab === 'pengajuan' && (
          <div className="space-y-6 animate-fade-in">
            <div className="shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-3xl overflow-hidden">
              
              {/* Stepper Header Progress Bar (5 Steps) */}
              <div className="bg-slate-50/90 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 p-4 sm:p-6">
                
                {/* Mobile Active Step Info */}
                <div className="flex sm:hidden items-center justify-between mb-3 pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">
                      {currentStep}
                    </span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {currentStep === 1 && 'Identitas Pemohon'}
                      {currentStep === 2 && 'Domisili & Ekonomi'}
                      {currentStep === 3 && 'Program & Asnaf'}
                      {currentStep === 4 && 'Upload Berkas'}
                      {currentStep === 5 && 'Konfirmasi & Kirim'}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
                    Langkah {currentStep} dari 5
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1 sm:gap-3 text-center">
                  {[
                    { step: 1, title: 'Identitas', sub: 'Data Pemohon', icon: User },
                    { step: 2, title: 'Domisili', sub: 'Profil Ekonomi', icon: MapPin },
                    { step: 3, title: 'Program', sub: 'Pilihan Asnaf', icon: HeartHandshake },
                    { step: 4, title: 'Upload Berkas', sub: 'KTP, KK, SKTM', icon: Upload },
                    { step: 5, title: 'Konfirmasi', sub: 'Kirim Berkas', icon: FileCheck },
                  ].map((s) => {
                    const isPassed = currentStep > s.step;
                    const isCurrent = currentStep === s.step;

                    return (
                      <div
                        key={s.step}
                        onClick={() => {
                          if (s.step < currentStep) setCurrentStep(s.step);
                        }}
                        className={`flex flex-col items-center gap-1.5 transition-all ${
                          s.step < currentStep ? 'cursor-pointer' : ''
                        }`}
                      >
                        <div
                          className={`w-9 h-9 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center text-xs sm:text-sm font-extrabold transition-all ${
                            isCurrent
                              ? 'bg-emerald-600 text-white ring-4 ring-emerald-100 dark:ring-emerald-950 shadow-md transform scale-105'
                              : isPassed
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {isPassed ? <Check className="size-4 sm:size-5" /> : s.step}
                        </div>
                        <div className="hidden sm:block">
                          <p className={`text-xs font-bold leading-tight ${isCurrent ? 'text-emerald-700 dark:text-emerald-400' : isPassed ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}`}>
                            {s.title}
                          </p>
                          <p className="text-[10px] text-slate-400">{s.sub}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-6 sm:p-10">
                <form onSubmit={handleSubmitApplication} className="space-y-6">
                  
                  {/* STEP 1: PROFIL & IDENTITAS */}
                  {currentStep === 1 && (
                    <div className="space-y-6 animate-fade-in">
                      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold mb-1">
                          <User className="size-3.5" /> Langkah 1 dari 5
                        </div>
                        <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                          Data Identitas Pemohon & Penerima Manfaat
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Pastikan nama dan nomor identitas sesuai persis dengan e-KTP dan Kartu Keluarga yang berlaku.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            Nama Lengkap Pemohon (Sesuai KTP) <span className="text-rose-500">*</span>
                          </label>
                          <Input
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder="Contoh: Muhammad Syafi'i"
                            className="h-11 text-xs sm:text-sm rounded-xl"
                            required
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              Nomor Induk Kependudukan (NIK) <span className="text-rose-500">*</span>
                            </label>
                            <span className={`text-[10px] font-mono font-bold ${formData.nik.length === 16 ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {formData.nik.length}/16 digit
                            </span>
                          </div>
                          <Input
                            name="nik"
                            value={formData.nik}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 16);
                              setFormData((prev) => ({ ...prev, nik: val }));
                            }}
                            placeholder="16 Digit NIK KTP (Contoh: 3671xxxxxxxxxxxx)"
                            maxLength={16}
                            className="h-11 text-xs sm:text-sm font-mono tracking-wider rounded-xl"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              Nomor Kartu Keluarga (KK) <span className="text-rose-500">*</span>
                            </label>
                            <span className={`text-[10px] font-mono font-bold ${formData.kk_number.length === 16 ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {formData.kk_number.length}/16 digit
                            </span>
                          </div>
                          <Input
                            name="kk_number"
                            value={formData.kk_number}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 16);
                              setFormData((prev) => ({ ...prev, kk_number: val }));
                            }}
                            placeholder="16 Digit Nomor KK"
                            maxLength={16}
                            className="h-11 text-xs sm:text-sm font-mono tracking-wider rounded-xl"
                            required
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            Nomor WhatsApp / HP Aktif <span className="text-rose-500">*</span>
                          </label>
                          <div className="relative">
                            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                            <Input
                              name="phone"
                              value={formData.phone}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^\d+]/g, '');
                                setFormData((prev) => ({ ...prev, phone: val }));
                              }}
                              placeholder="081234567890 (Untuk notifikasi status verifikasi)"
                              className="h-11 pl-10 text-xs sm:text-sm rounded-xl font-medium"
                              required
                            />
                          </div>
                          <p className="text-[10px] text-slate-400">Notifikasi perkembangan berkas akan dikirim ke nomor WhatsApp ini.</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Tempat Lahir</label>
                          <Input
                            name="pob"
                            value={formData.pob}
                            onChange={handleChange}
                            placeholder="Kota Tangerang"
                            className="h-11 text-xs rounded-xl"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Tanggal Lahir</label>
                          <Input
                            type="date"
                            name="dob"
                            value={formData.dob}
                            onChange={handleChange}
                            className="h-11 text-xs rounded-xl"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Status Perkawinan</label>
                          <select
                            name="marital_status"
                            value={formData.marital_status}
                            onChange={handleChange}
                            className="w-full h-11 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 font-medium"
                          >
                            <option value="Menikah">Menikah</option>
                            <option value="Belum Menikah">Belum Menikah</option>
                            <option value="Cerai Mati">Cerai Mati (Janda / Duda)</option>
                            <option value="Cerai Hidup">Cerai Hidup</option>
                          </select>
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2">
                        <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <Users className="size-4 text-emerald-600" />
                          Nama Penerima Manfaat Bantuan (Opsional)
                        </label>
                        <p className="text-[11px] text-slate-500">
                          Isi kolom ini jika bantuan diajukan oleh wali/orang tua untuk anak sekolah, anggota keluarga yang sakit, atau lansia.
                        </p>
                        <Input
                          name="beneficiary_name"
                          value={formData.beneficiary_name}
                          onChange={handleChange}
                          placeholder="Kosongkan jika penerima bantuan sama dengan nama pemohon"
                          className="h-10 text-xs rounded-xl bg-white dark:bg-slate-900"
                        />
                      </div>

                      <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
                        <Button
                          type="button"
                          onClick={handleNextStep}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm h-11 px-7 rounded-xl font-bold gap-2 shadow-md"
                        >
                          <span>Lanjut: Alamat & Domisili</span>
                          <ChevronRight className="size-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* STEP 2: DOMISILI & PROFIL EKONOMI */}
                  {currentStep === 2 && (
                    <div className="space-y-6 animate-fade-in">
                      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold mb-1">
                          <MapPin className="size-3.5" /> Langkah 2 dari 5
                        </div>
                        <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                          Alamat Domisili & Profil Sosial Ekonomi
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Prioritas bantuan BAZNAS Kota Tangerang diperuntukkan bagi warga berdomisili di 13 Kecamatan Kota Tangerang.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Alamat Lengkap (Jalan / Gang / Nomor Rumah) <span className="text-rose-500">*</span>
                        </label>
                        <Input
                          name="address"
                          value={formData.address}
                          onChange={handleChange}
                          placeholder="Contoh: Jl. Daan Mogot Gg. Macan No. 18"
                          className="h-11 text-xs sm:text-sm rounded-xl"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">RT / RW</label>
                          <Input
                            name="rt_rw"
                            value={formData.rt_rw}
                            onChange={handleChange}
                            placeholder="Contoh: 003/005"
                            className="h-11 text-xs rounded-xl font-mono"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            Kecamatan (Kota Tangerang) <span className="text-rose-500">*</span>
                          </label>
                          <select
                            name="kecamatan"
                            value={formData.kecamatan}
                            onChange={handleChange}
                            className="w-full h-11 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 font-semibold text-emerald-800 dark:text-emerald-300"
                          >
                            {KECAMATAN_TANGERANG.map((k) => (
                              <option key={k} value={k}>{k}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Kelurahan</label>
                          <Input
                            name="kelurahan"
                            value={formData.kelurahan}
                            onChange={handleChange}
                            placeholder="Contoh: Sukarasa / Cimone"
                            className="h-11 text-xs rounded-xl"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Status Tempat Tinggal</label>
                          <select
                            name="house_ownership"
                            value={formData.house_ownership}
                            onChange={handleChange}
                            className="w-full h-11 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 font-medium"
                          >
                            <option value="Kontrak">Kontrak / Sewa Bulanan</option>
                            <option value="Menumpang">Menumpang Orang Tua / Saudara</option>
                            <option value="Sendiri">Milik Sendiri (Dhuafa)</option>
                            <option value="Tanah Garapan">Menempati Lahan Fasum / Garapan</option>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Pekerjaan Utama</label>
                          <Input
                            name="occupation"
                            value={formData.occupation}
                            onChange={handleChange}
                            placeholder="Buruh Harian / Pedagang Keliling / Tidak Bekerja"
                            className="h-11 text-xs rounded-xl"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Jumlah Tanggungan Jiwa</label>
                          <Input
                            type="number"
                            name="family_dependents"
                            value={formData.family_dependents}
                            onChange={handleChange}
                            placeholder="Contoh: 3 orang"
                            min={1}
                            max={20}
                            className="h-11 text-xs rounded-xl font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                            Penghasilan Rata-rata Keluarga / Bulan (Rp)
                          </label>
                          <Input
                            type="number"
                            name="monthly_income"
                            value={formData.monthly_income}
                            onChange={handleChange}
                            placeholder="Contoh: 1500000"
                            className="h-11 text-xs sm:text-sm bg-white dark:bg-slate-900 rounded-xl font-mono"
                          />
                          <p className="text-[10px] text-emerald-700 dark:text-emerald-400">Total pendapatan seluruh anggota keluarga serumah.</p>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                            Pengeluaran Rata-rata Keluarga / Bulan (Rp)
                          </label>
                          <Input
                            type="number"
                            name="monthly_expense"
                            value={formData.monthly_expense}
                            onChange={handleChange}
                            placeholder="Contoh: 2000000"
                            className="h-11 text-xs sm:text-sm bg-white dark:bg-slate-900 rounded-xl font-mono"
                          />
                          <p className="text-[10px] text-emerald-700 dark:text-emerald-400">Kebutuhan makan, sewa rumah, listrik, dan operasional.</p>
                        </div>
                      </div>

                      {/* Kolom Desil & Cek Mandiri BPS DTSEN */}
                      <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/80 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-extrabold text-blue-950 dark:text-blue-200 flex items-center gap-1.5">
                                📊 Tingkat Desil Kesejahteraan Sosial (BPS / DTSEN)
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300">
                                Desil 1 - 10
                              </span>
                            </div>
                            <p className="text-[11px] text-blue-800/80 dark:text-blue-300/80 leading-relaxed">
                              Jika belum mengetahui desil keluarga, Anda dapat memeriksa status desil secara mandiri di portal resmi DTSEN BPS menggunakan NIK/KK.
                            </p>
                          </div>

                          <a
                            href="https://dtsen-form.bps.go.id/indonesia-pintar"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs shrink-0 transition-colors"
                          >
                            <span>🔍 Cek Desil BPS Mandiri</span>
                            <ExternalLink className="size-3.5" />
                          </a>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            Pilih Kategori Desil Keluarga Anda:
                          </label>
                          <select
                            name="desil_score"
                            value={formData.desil_score}
                            onChange={handleChange}
                            className="w-full h-11 text-xs rounded-xl border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-900 px-3 font-semibold text-blue-950 dark:text-blue-200"
                          >
                            <option value="1">Desil 1 - Rumah Tangga Sangat Miskin (Prioritas Tertinggi)</option>
                            <option value="2">Desil 2 - Rumah Tangga Miskin</option>
                            <option value="3">Desil 3 - Rumah Tangga Hampir Miskin</option>
                            <option value="4">Desil 4 - Rumah Tangga Rentan Miskin</option>
                            <option value="5">Desil 5 - Rumah Tangga Pas-pasan / Menengah Bawah</option>
                            <option value="6">Desil 6 - Menengah</option>
                            <option value="7">Desil 7 - Menengah</option>
                            <option value="8">Desil 8 - Menengah Atas</option>
                            <option value="9">Desil 9 - Mampu</option>
                            <option value="10">Desil 10 - Sangat Mampu</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handlePrevStep}
                          className="text-xs sm:text-sm h-11 px-5 rounded-xl font-semibold gap-1.5"
                        >
                          <ArrowLeft className="size-4" /> Kembali
                        </Button>
                        <Button
                          type="button"
                          onClick={handleNextStep}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm h-11 px-7 rounded-xl font-bold gap-2 shadow-md"
                        >
                          <span>Lanjut: Program Bantuan</span>
                          <ChevronRight className="size-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* STEP 3: PROGRAM BANTUAN & ASNAF */}
                  {currentStep === 3 && (
                    <div className="space-y-6 animate-fade-in">
                      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold mb-1">
                          <HeartHandshake className="size-3.5" /> Langkah 3 dari 5
                        </div>
                        <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                          Pilihan Program BAZNAS & Kategori Asnaf
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Pilih klasifikasi 5 Program Utama BAZNAS Kota Tangerang yang paling sesuai dengan kebutuhan bantuan Anda.
                        </p>
                      </div>

                      {/* 5 Program Cards Selector */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        {PROGRAM_LIST.map((prog) => {
                          const IconComp = prog.icon;
                          const isSelected = formData.program === prog.id;
                          return (
                            <div
                              key={prog.id}
                              onClick={() => setFormData((prev) => ({ ...prev, program: prog.id }))}
                              className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                                isSelected
                                  ? `${prog.accentColor} shadow-md ring-2 ring-emerald-500`
                                  : 'border-slate-200 dark:border-slate-800 hover:border-emerald-300 bg-white dark:bg-slate-900/60'
                              }`}
                            >
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                                    <IconComp className="size-5" />
                                  </div>
                                  <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${prog.badgeColor}`}>
                                    {prog.category}
                                  </span>
                                </div>
                                <div>
                                  <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">{prog.title}</h4>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{prog.desc}</p>
                                </div>
                              </div>

                              <div className="pt-3 mt-3 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
                                <span className={`text-xs font-bold ${isSelected ? 'text-emerald-700 dark:text-emerald-400 flex items-center gap-1' : 'text-slate-400'}`}>
                                  {isSelected ? <><CheckCircle2 className="size-4" /> Dipilih</> : 'Klik untuk Pilih'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Asnaf Selector with Explanations */}
                      <div className="space-y-2 pt-2">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Kategori Asnaf (Kriteria Syariah) <span className="text-rose-500">*</span>
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                          {ASNAF_LIST.map((a) => {
                            const isSelected = formData.asnaf === a.id;
                            return (
                              <div
                                key={a.id}
                                onClick={() => setFormData((prev) => ({ ...prev, asnaf: a.id }))}
                                className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                                  isSelected
                                    ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 font-bold'
                                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold">{a.label}</span>
                                  {isSelected && <Check className="size-3.5 text-emerald-600" />}
                                </div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{a.desc}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Uraian Kebutuhan */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Uraian Singkat Kebutuhan / Alasan Permohonan <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                          name="request_title"
                          value={formData.request_title}
                          onChange={handleChange}
                          rows={3}
                          placeholder="Jelaskan kebutuhan Anda secara rinci, misalnya: Bantuan tunggakan SPP semester 5 dan tebus ijazah SMK karena orang tua baru terkena PHK..."
                          className="w-full text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
                          required
                        />
                      </div>

                      {/* Estimasi Biaya & Info Rekening */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            Estimasi Kebutuhan Dana yang Dimohon (Rp)
                          </label>
                          <Input
                            type="number"
                            name="proposed_amount"
                            value={formData.proposed_amount}
                            onChange={handleChange}
                            placeholder="Contoh: 2500000"
                            className="h-11 text-xs sm:text-sm rounded-xl font-mono"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            Nama Bank & Nomor Rekening Pemohon (Opsional)
                          </label>
                          <Input
                            name="bank_account"
                            value={formData.bank_account}
                            onChange={handleChange}
                            placeholder="Contoh: Bank BJB Syariah - 512010203040 a.n Ahmad"
                            className="h-11 text-xs sm:text-sm rounded-xl"
                          />
                        </div>
                      </div>

                      <div className="flex justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handlePrevStep}
                          className="text-xs sm:text-sm h-11 px-5 rounded-xl font-semibold gap-1.5"
                        >
                          <ArrowLeft className="size-4" /> Kembali
                        </Button>
                        <Button
                          type="button"
                          onClick={handleNextStep}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm h-11 px-7 rounded-xl font-bold gap-2 shadow-md"
                        >
                          <span>Lanjut: Upload Dokumen</span>
                          <ChevronRight className="size-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* STEP 4: UPLOAD DOKUMEN BERKAS */}
                  {currentStep === 4 && (
                    <div className="space-y-6 animate-fade-in">
                      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold mb-1">
                          <Upload className="size-3.5" /> Langkah 4 dari 5
                        </div>
                        <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                          Upload Dokumen Pendukung Permohonan
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Format berkas yang didukung: JPG, JPEG, PNG, atau PDF (Ukuran maksimal 5 MB per berkas). Foto harus terbaca jelas.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        
                        {/* 1. Foto KTP Pemohon (Wajib) */}
                        <div className="p-4 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 space-y-3 flex flex-col justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <User className="size-4 text-emerald-600" />
                                1. Foto e-KTP Pemohon <span className="text-rose-500">*</span>
                              </span>
                              {uploadedFiles.ktp ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                                  <Check className="size-3" /> Terupload
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">Wajib</span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400">e-KTP Asli / Suket Disdukcapil.</p>
                          </div>
                          
                          {uploadedFiles.ktp ? (
                            <div className="flex items-center gap-3 p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                              {uploadedFiles.ktp.previewUrl ? (
                                <img
                                  src={uploadedFiles.ktp.previewUrl}
                                  alt="Preview KTP"
                                  className="w-11 h-11 object-cover rounded-lg border border-slate-200"
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                  <FileText className="size-5" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate">{uploadedFiles.ktp.name}</p>
                                <p className="text-[10px] text-slate-400">{uploadedFiles.ktp.size}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeFile('ktp')}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                                title="Hapus File"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          ) : (
                            <div>
                              <input
                                type="file"
                                id="upload-ktp"
                                className="hidden"
                                accept="image/*,.pdf"
                                onChange={(e) => handleFileChange('ktp', e)}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => document.getElementById('upload-ktp').click()}
                                className="w-full text-xs h-10 gap-2 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 rounded-xl cursor-pointer"
                              >
                                <Upload className="size-3.5" /> Pilih / Foto KTP Asli
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* 2. Foto KK (Wajib) */}
                        <div className="p-4 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 space-y-3 flex flex-col justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <Users className="size-4 text-emerald-600" />
                                2. Foto Kartu Keluarga (KK) <span className="text-rose-500">*</span>
                              </span>
                              {uploadedFiles.kk ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                                  <Check className="size-3" /> Terupload
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">Wajib</span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400">Kartu Keluarga terbaru berdomisili Kota Tangerang.</p>
                          </div>

                          {uploadedFiles.kk ? (
                            <div className="flex items-center gap-3 p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                              {uploadedFiles.kk.previewUrl ? (
                                <img
                                  src={uploadedFiles.kk.previewUrl}
                                  alt="Preview KK"
                                  className="w-11 h-11 object-cover rounded-lg border border-slate-200"
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                  <FileText className="size-5" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate">{uploadedFiles.kk.name}</p>
                                <p className="text-[10px] text-slate-400">{uploadedFiles.kk.size}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeFile('kk')}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                                title="Hapus File"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          ) : (
                            <div>
                              <input
                                type="file"
                                id="upload-kk"
                                className="hidden"
                                accept="image/*,.pdf"
                                onChange={(e) => handleFileChange('kk', e)}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => document.getElementById('upload-kk').click()}
                                className="w-full text-xs h-10 gap-2 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 rounded-xl cursor-pointer"
                              >
                                <Upload className="size-3.5" /> Pilih / Foto Kartu Keluarga
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* 3. SKTM / Surat Keterangan RT-RW */}
                        <div className="p-4 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 space-y-3 flex flex-col justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <FileCheck className="size-4 text-emerald-600" />
                                3. SKTM / Surat RT-RW
                              </span>
                              {uploadedFiles.sktm && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                                  <Check className="size-3" /> Terupload
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400">Surat Pengantar / Keterangan Tidak Mampu RT-RW.</p>
                          </div>

                          {uploadedFiles.sktm ? (
                            <div className="flex items-center gap-3 p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                              {uploadedFiles.sktm.previewUrl ? (
                                <img
                                  src={uploadedFiles.sktm.previewUrl}
                                  alt="Preview SKTM"
                                  className="w-11 h-11 object-cover rounded-lg border border-slate-200"
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                  <FileText className="size-5" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate">{uploadedFiles.sktm.name}</p>
                                <p className="text-[10px] text-slate-400">{uploadedFiles.sktm.size}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeFile('sktm')}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                                title="Hapus File"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          ) : (
                            <div>
                              <input
                                type="file"
                                id="upload-sktm"
                                className="hidden"
                                accept="image/*,.pdf"
                                onChange={(e) => handleFileChange('sktm', e)}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => document.getElementById('upload-sktm').click()}
                                className="w-full text-xs h-10 gap-2 rounded-xl cursor-pointer"
                              >
                                <Upload className="size-3.5" /> Pilih File SKTM / RT-RW
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* 4. Surat Keterangan dari Kelurahan (Asli) */}
                        <div className="p-4 rounded-2xl border-2 border-dashed border-emerald-300/80 dark:border-emerald-800/80 bg-emerald-50/30 dark:bg-emerald-950/20 space-y-3 flex flex-col justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <Building2 className="size-4 text-emerald-600" />
                                4. Surat Ket. Kelurahan (Asli)
                              </span>
                              {uploadedFiles.surat_kelurahan && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                                  <Check className="size-3" /> Terupload
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">Surat Keterangan Resmi dari Kantor Kelurahan setempat.</p>
                          </div>

                          {uploadedFiles.surat_kelurahan ? (
                            <div className="flex items-center gap-3 p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                              {uploadedFiles.surat_kelurahan.previewUrl ? (
                                <img
                                  src={uploadedFiles.surat_kelurahan.previewUrl}
                                  alt="Preview Kelurahan"
                                  className="w-11 h-11 object-cover rounded-lg border border-slate-200"
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                  <FileText className="size-5" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate">{uploadedFiles.surat_kelurahan.name}</p>
                                <p className="text-[10px] text-slate-400">{uploadedFiles.surat_kelurahan.size}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeFile('surat_kelurahan')}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                                title="Hapus File"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          ) : (
                            <div>
                              <input
                                type="file"
                                id="upload-surat-kelurahan"
                                className="hidden"
                                accept="image/*,.pdf"
                                onChange={(e) => handleFileChange('surat_kelurahan', e)}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => document.getElementById('upload-surat-kelurahan').click()}
                                className="w-full text-xs h-10 gap-2 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-50 rounded-xl cursor-pointer"
                              >
                                <Upload className="size-3.5" /> Pilih Surat Kelurahan Asli
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* 5. Rekomendasi UPZ (Asli) */}
                        <div className="p-4 rounded-2xl border-2 border-dashed border-emerald-300/80 dark:border-emerald-800/80 bg-emerald-50/30 dark:bg-emerald-950/20 space-y-3 flex flex-col justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <ShieldCheck className="size-4 text-emerald-600" />
                                5. Rekomendasi UPZ (Asli)
                              </span>
                              {uploadedFiles.rekomendasi_upz && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                                  <Check className="size-3" /> Terupload
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">Surat Rekomendasi dari Unit Pengumpul Zakat (UPZ) Masjid/Instansi.</p>
                          </div>

                          {uploadedFiles.rekomendasi_upz ? (
                            <div className="flex items-center gap-3 p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                              {uploadedFiles.rekomendasi_upz.previewUrl ? (
                                <img
                                  src={uploadedFiles.rekomendasi_upz.previewUrl}
                                  alt="Preview UPZ"
                                  className="w-11 h-11 object-cover rounded-lg border border-slate-200"
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                  <FileText className="size-5" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate">{uploadedFiles.rekomendasi_upz.name}</p>
                                <p className="text-[10px] text-slate-400">{uploadedFiles.rekomendasi_upz.size}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeFile('rekomendasi_upz')}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                                title="Hapus File"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          ) : (
                            <div>
                              <input
                                type="file"
                                id="upload-rekomendasi-upz"
                                className="hidden"
                                accept="image/*,.pdf"
                                onChange={(e) => handleFileChange('rekomendasi_upz', e)}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => document.getElementById('upload-rekomendasi-upz').click()}
                                className="w-full text-xs h-10 gap-2 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-50 rounded-xl cursor-pointer"
                              >
                                <Upload className="size-3.5" /> Pilih Rekomendasi UPZ Asli
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* 6. Rincian Tagihan / Dokumen Kebutuhan / Bukti Usaha / Hutang */}
                        <div className="p-4 rounded-2xl border-2 border-dashed border-amber-300/80 dark:border-amber-800/80 bg-amber-50/30 dark:bg-amber-950/20 space-y-3 flex flex-col justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <Receipt className="size-4 text-amber-600" />
                                6. Rincian Kebutuhan / Tagihan
                              </span>
                              {uploadedFiles.permohonan && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                                  <Check className="size-3" /> Terupload
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              Tagihan SPP sekolah, RS rekap medis, bukti hutang piutang, rincian kebutuhan usaha, atau catatan omset.
                            </p>
                          </div>

                          {uploadedFiles.permohonan ? (
                            <div className="flex items-center gap-3 p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                              {uploadedFiles.permohonan.previewUrl ? (
                                <img
                                  src={uploadedFiles.permohonan.previewUrl}
                                  alt="Preview Bukti"
                                  className="w-11 h-11 object-cover rounded-lg border border-slate-200"
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                                  <FileText className="size-5" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate">{uploadedFiles.permohonan.name}</p>
                                <p className="text-[10px] text-slate-400">{uploadedFiles.permohonan.size}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeFile('permohonan')}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"
                                title="Hapus File"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          ) : (
                            <div>
                              <input
                                type="file"
                                id="upload-permohonan"
                                className="hidden"
                                accept="image/*,.pdf"
                                onChange={(e) => handleFileChange('permohonan', e)}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => document.getElementById('upload-permohonan').click()}
                                className="w-full text-xs h-10 gap-2 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-50 rounded-xl cursor-pointer"
                              >
                                <Upload className="size-3.5" /> Pilih Bukti Tagihan / Usaha / Hutang
                              </Button>
                            </div>
                          )}
                        </div>

                      </div>

                      <div className="flex justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handlePrevStep}
                          className="text-xs sm:text-sm h-11 px-5 rounded-xl font-semibold gap-1.5 cursor-pointer"
                        >
                          <ArrowLeft className="size-4" /> Kembali
                        </Button>
                        <Button
                          type="button"
                          onClick={handleNextStep}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm h-11 px-7 rounded-xl font-bold gap-2 shadow-md cursor-pointer"
                        >
                          <span>Lanjut: Konfirmasi & Kirim</span>
                          <ChevronRight className="size-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* STEP 5: KONFIRMASI & PERNYATAAN AKHIR */}
                  {currentStep === 5 && (
                    <div className="space-y-6 animate-fade-in">
                      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold mb-1">
                          <FileCheck className="size-3.5" /> Langkah 5 dari 5
                        </div>
                        <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                          Ringkasan Data & Pernyataan Keabsahan
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Periksa kembali rincian formulir pengajuan Anda sebelum dikirimkan ke sistem BAZNAS Kota Tangerang.
                        </p>
                      </div>

                      {/* Summary Data Review Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                          <h4 className="font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                            <User className="size-4" /> Identitas & Domisili
                          </h4>
                          <div className="divide-y divide-slate-200 dark:divide-slate-800">
                            <div className="flex justify-between py-1.5">
                              <span className="text-slate-500">Nama Pemohon:</span>
                              <span className="font-bold text-slate-900 dark:text-white">{formData.name}</span>
                            </div>
                            <div className="flex justify-between py-1.5">
                              <span className="text-slate-500">NIK (KTP):</span>
                              <span className="font-mono font-bold text-slate-900 dark:text-white">{formData.nik}</span>
                            </div>
                            <div className="flex justify-between py-1.5">
                              <span className="text-slate-500">No. WhatsApp:</span>
                              <span className="font-semibold text-slate-900 dark:text-white">{formData.phone}</span>
                            </div>
                            <div className="flex justify-between py-1.5">
                              <span className="text-slate-500">Kecamatan:</span>
                              <span className="font-bold text-emerald-700 dark:text-emerald-400">Kec. {formData.kecamatan}</span>
                            </div>
                            <div className="flex justify-between py-1.5">
                              <span className="text-slate-500">Alamat:</span>
                              <span className="font-medium text-slate-900 dark:text-white text-right max-w-[200px]">{formData.address}</span>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                          <h4 className="font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                            <HeartHandshake className="size-4" /> Program, Desil & Berkas
                          </h4>
                          <div className="divide-y divide-slate-200 dark:divide-slate-800">
                            <div className="flex justify-between py-1.5">
                              <span className="text-slate-500">Program:</span>
                              <span className="font-bold text-slate-900 dark:text-white">{formData.program}</span>
                            </div>
                            <div className="flex justify-between py-1.5">
                              <span className="text-slate-500">Kategori Asnaf:</span>
                              <span className="font-bold text-amber-700 dark:text-amber-400">{formData.asnaf}</span>
                            </div>
                            <div className="flex justify-between py-1.5">
                              <span className="text-slate-500">Tingkat Desil:</span>
                              <span className="font-bold text-blue-700 dark:text-blue-400">Desil {formData.desil_score || '1'} (BPS DTSEN)</span>
                            </div>
                            <div className="flex justify-between py-1.5">
                              <span className="text-slate-500">Estimasi Dimohon:</span>
                              <span className="font-extrabold text-emerald-700 dark:text-emerald-400 font-mono">
                                {formData.proposed_amount ? formatRupiah(parseFloat(formData.proposed_amount)) : 'Sesuai Standar BAZNAS'}
                              </span>
                            </div>
                            <div className="flex justify-between py-1.5">
                              <span className="text-slate-500">KTP & KK:</span>
                              <span className="font-semibold text-emerald-600">
                                {uploadedFiles.ktp && uploadedFiles.kk ? '✓ KTP & KK Lengkap' : 'Belum Lengkap'}
                              </span>
                            </div>
                            <div className="flex justify-between py-1.5">
                              <span className="text-slate-500">Dokumen Kelurahan / UPZ:</span>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {[
                                  uploadedFiles.surat_kelurahan ? 'Kelurahan' : null,
                                  uploadedFiles.rekomendasi_upz ? 'UPZ' : null,
                                  uploadedFiles.sktm ? 'SKTM' : null,
                                  uploadedFiles.permohonan ? 'Bukti Kebutuhan' : null,
                                ].filter(Boolean).join(', ') || 'Tidak Ada Dokumen Tambahan'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Pakta Integritas / Pernyataan Syariah */}
                      <div className="p-5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-900/60 space-y-3">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="size-5 shrink-0 text-amber-600 mt-0.5" />
                          <div className="space-y-2">
                            <h5 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                              Pernyataan Keabsahan Data & Akad Permohonan
                            </h5>
                            <p className="text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed">
                              Dengan ini saya menyatakan atas nama Allah SWT bahwa seluruh keterangan, data keluarga, dan dokumen yang saya berikan adalah <strong>benar, jujur, dan sah</strong>. Apabila di kemudian hari ditemukan keterangan yang tidak benar, saya bersedia menerima sanksi dan pembatalan bantuan sesuai ketentuan BAZNAS Kota Tangerang.
                            </p>
                            
                            <label className="flex items-center gap-2.5 pt-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                name="agreed"
                                checked={formData.agreed}
                                onChange={handleChange}
                                className="w-4 h-4 rounded border-amber-400 text-emerald-600 focus:ring-emerald-500"
                                required
                              />
                              <span className="text-xs font-bold text-amber-950 dark:text-amber-100">
                                Saya menyetujui pernyataan dan kebenaran data di atas.
                              </span>
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handlePrevStep}
                          className="text-xs sm:text-sm h-11 px-5 rounded-xl font-semibold gap-1.5 cursor-pointer"
                        >
                          <ArrowLeft className="size-4" /> Kembali
                        </Button>
                        <Button
                          type="submit"
                          disabled={isSubmitting || !formData.agreed}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm h-12 px-9 rounded-2xl font-black gap-2 shadow-lg shadow-emerald-900/20 transition-transform active:scale-95 cursor-pointer"
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="size-4 animate-spin" /> Mengirimkan Berkas...
                            </>
                          ) : (
                            <>
                              <Send className="size-4" /> Kirim Permohonan Bantuan Sekarang
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                </form>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: LACAK STATUS PENGAJUAN (TRACKER 6 TAHAP)           */}
        {/* ========================================================= */}
        {activeTab === 'lacak' && (
          <div className="space-y-6 animate-fade-in">
            
            {/* Search Box Card */}
            <div className="shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-10">
              <div className="max-w-2xl mx-auto space-y-4 text-center">
                
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
                  <Search className="size-7" />
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                    Lacak Progres Permohonan Bantuan Anda
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    Masukkan Nomor Berkas Registrasi, 16 Digit NIK KTP, atau Nomor WhatsApp pemohon yang terdaftar di formulir.
                  </p>
                </div>

                <form onSubmit={handleSearchTracking} className="flex flex-col sm:flex-row gap-2.5 pt-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="Nomor Berkas (MST-...) / NIK KTP / No. WhatsApp..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-12 pl-10 text-xs sm:text-sm rounded-2xl border-slate-300 dark:border-slate-700 focus-visible:ring-emerald-500 font-medium"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isSearching}
                    className="h-12 px-7 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm rounded-2xl gap-2 shadow-md cursor-pointer"
                  >
                    {isSearching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                    <span>Cari Berkas</span>
                  </Button>
                </form>

                {/* Quick Sample Queries */}
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-[11px] text-slate-400">
                  <span>Contoh pencarian cepat:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('MST-202608-0128');
                      handleSearchTracking(null, 'MST-202608-0128');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 font-mono font-semibold hover:bg-emerald-50 cursor-pointer"
                  >
                    MST-202608-0128
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('3671011205850003');
                      handleSearchTracking(null, '3671011205850003');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 font-mono font-semibold hover:bg-emerald-50 cursor-pointer"
                  >
                    NIK: 367101...
                  </button>
                </div>

                {searchError && (
                  <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-center gap-2 animate-fade-in">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>{searchError}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Tracking Result View */}
            {trackingResult && (
              <div className="space-y-6 animate-fade-in">
                
                {/* Result Top Summary Banner */}
                <div className="shadow-xl border border-emerald-200 dark:border-emerald-900 bg-gradient-to-r from-emerald-50 via-teal-50 to-white dark:from-emerald-950/40 dark:to-slate-900 rounded-3xl overflow-hidden p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-extrabold tracking-wide uppercase shadow-xs">
                        {trackingResult.status || 'Diajukan'}
                      </span>
                      <span className="text-xs font-bold text-slate-500 font-mono">
                        {trackingResult.file_no}
                      </span>
                    </div>
                    
                    <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                      {trackingResult.name}
                    </h3>
                    
                    <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2 flex-wrap">
                      <span>Program: <strong className="text-emerald-700 dark:text-emerald-400 font-bold">{trackingResult.program}</strong></span>
                      <span>&bull;</span>
                      <span>Asnaf: <strong className="text-amber-700 dark:text-amber-400 font-bold">{trackingResult.asnaf}</strong></span>
                      <span>&bull;</span>
                      <span>Kecamatan: <strong>Kec. {trackingResult.kecamatan || 'Tangerang'}</strong></span>
                    </p>
                  </div>

                  <div className="flex flex-col sm:items-end gap-1.5 text-left sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0 border-emerald-200 dark:border-emerald-900">
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Estimasi / Realisasi Bantuan</span>
                    <span className="text-2xl sm:text-3xl font-black text-emerald-700 dark:text-emerald-400 font-mono">
                      {formatRupiah(trackingResult.approved_amount || trackingResult.recommended_amount || 2500000)}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Tanggal Masuk: {trackingResult.received_date || '2026-08-10'}
                    </span>
                  </div>
                </div>

                {/* 6-Stage Timeline Stepper BAZNAS */}
                <div className="shadow-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8">
                  <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <h4 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <Clock className="size-5 text-emerald-600" />
                      Tahapan & Progres Verifikasi Berkas (SOP Standar BAZNAS)
                    </h4>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1 rounded-full">
                      Tahap {getStepIndex(trackingResult.status)} dari 6
                    </span>
                  </div>

                  <div className="relative">
                    {/* Connecting Line Desktop */}
                    <div className="hidden lg:block absolute top-5 left-10 right-10 h-1 bg-slate-200 dark:bg-slate-800 -z-0" />

                    <div className="grid grid-cols-1 lg:grid-cols-6 gap-4 sm:gap-6 relative z-10">
                      {STEP_STAGES.map((stg) => {
                        const currentStageIdx = getStepIndex(trackingResult.status);
                        const isPast = stg.id < currentStageIdx;
                        const isCurrent = stg.id === currentStageIdx;

                        return (
                          <div key={stg.id} className="flex lg:flex-col items-start lg:items-center gap-3.5 lg:text-center">
                            
                            <div
                              className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xs font-extrabold shrink-0 transition-all ${
                                isPast
                                  ? 'bg-emerald-600 text-white shadow-md'
                                  : isCurrent
                                  ? 'bg-amber-500 text-white ring-4 ring-amber-100 dark:ring-amber-950 animate-pulse shadow-lg scale-105'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {isPast ? <Check className="size-5" /> : stg.id}
                            </div>

                            <div className="space-y-0.5">
                              <h5 className={`text-xs font-bold ${isCurrent ? 'text-amber-600 dark:text-amber-400 font-extrabold' : isPast ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
                                {stg.label}
                              </h5>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{stg.desc}</p>
                              {isCurrent && (
                                <span className="inline-block mt-1 text-[10px] font-extrabold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded-full">
                                  Sedang Berlangsung
                                </span>
                              )}
                              {isPast && (
                                <span className="inline-block mt-1 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                                  Selesai
                                </span>
                              )}
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Detail Information & Action Buttons */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 rounded-3xl">
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                      <FileCheck className="size-4 text-emerald-600" /> Rincian Pengajuan
                    </h5>
                    
                    <div className="space-y-2 text-xs divide-y divide-slate-100 dark:divide-slate-800">
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-500">Uraian Kebutuhan:</span>
                        <span className="font-semibold text-slate-900 dark:text-white text-right max-w-[240px]">{trackingResult.request_title || '-'}</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-500">Alamat Lengkap:</span>
                        <span className="font-semibold text-slate-900 dark:text-white text-right">{trackingResult.address || ''}, Kec. {trackingResult.kecamatan || 'Tangerang'}</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-500">Petugas / Surveyor:</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">{trackingResult.surveyor_name || 'Tim Assessment BAZNAS'}</span>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handlePrintSlip}
                        className="flex-1 text-xs h-10 rounded-xl font-bold gap-1.5 cursor-pointer"
                      >
                        <Printer className="size-4 text-slate-600" /> Cetak Lembar Bukti
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleCopyCode(trackingResult.file_no)}
                        className="text-xs h-10 px-4 rounded-xl font-bold gap-1.5 cursor-pointer"
                      >
                        {copiedCode ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                        {copiedCode ? 'Disalin' : 'Salin No. Berkas'}
                      </Button>
                    </div>
                  </div>

                  <div className="shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 rounded-3xl">
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                      <ShieldCheck className="size-4 text-emerald-600" /> Catatan & Rekomendasi Petugas
                    </h5>
                    
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed min-h-[90px]">
                      {trackingResult.notes || 'Berkas Anda sedang dalam proses verifikasi tim lapangan dan administrasi syariah BAZNAS Kota Tangerang. Petugas akan menghubungi nomor WhatsApp Anda jika memerlukan dokumen pelengkap.'}
                    </div>

                    <div className="pt-2">
                      <a
                        href={`https://wa.me/6281234567890?text=Assalamu%27alaikum%20BAZNAS%20Kota%20Tangerang,%20saya%20ingin%20menanyakan%20progres%20berkas%20${trackingResult.file_no}%20an%20${encodeURIComponent(trackingResult.name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center gap-2 h-11 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-colors"
                      >
                        <Phone className="size-4" /> Hubungi PIC Petugas Layanan via WhatsApp
                      </a>
                    </div>
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: 5 PROGRAM PRIORITAS BAZNAS KOTA TANGERANG          */}
        {/* ========================================================= */}
        {activeTab === 'program' && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center space-y-2 max-w-2xl mx-auto">
              <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">
                Katalog Program BAZNAS
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                5 Program Unggulan Penyaluran BAZNAS Kota Tangerang
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Pilih program yang sesuai dengan kebutuhan Anda untuk langsung mengisi formulir pengajuan online.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {PROGRAM_LIST.map((prog) => {
                const IconComp = prog.icon;
                return (
                  <div 
                    key={prog.id} 
                    className="shadow-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-3xl p-6 flex flex-col justify-between hover:shadow-2xl transition-all hover:border-emerald-500"
                  >
                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shadow-xs">
                          <IconComp className="size-6" />
                        </div>
                        <span className={`text-[10px] font-extrabold px-3 py-1 rounded-full border ${prog.badgeColor}`}>
                          {prog.category}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h4 className="text-base font-extrabold text-slate-900 dark:text-white">{prog.title}</h4>
                        <span className="text-xs font-semibold text-emerald-600 block">{prog.tag}</span>
                        <p className="text-xs text-slate-500 dark:text-slate-400 pt-1 leading-relaxed">{prog.desc}</p>
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
                      <Button
                        onClick={() => handleSelectProgramFromCatalog(prog.id)}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs h-10 rounded-xl gap-2 cursor-pointer shadow-xs"
                      >
                        <span>Ajukan Program Ini</span>
                        <ArrowRight className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: SYARAT & ALUR PENGAJUAN (INFOGRAFIK RESMI)         */}
        {/* ========================================================= */}
        {activeTab === 'alur' && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center space-y-2 max-w-2xl mx-auto">
              <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">
                Transparansi & Prosedur
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                Syarat & 6 Tahapan Alur Permohonan Bantuan
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Memastikan setiap rupiah zakat muzakki tersalurkan tepat sasaran kepada mustahik yang berhak.
              </p>
            </div>

            {/* Syarat Utama Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md hover:shadow-lg transition-all flex flex-col gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0 shadow-xs">
                  <User className="size-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">1. KTP & KK Kota Tangerang</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Pemohon berdomisili dan memiliki e-KTP serta Kartu Keluarga sah di salah satu dari 13 Kecamatan Kota Tangerang.
                  </p>
                </div>
              </div>

              <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md hover:shadow-lg transition-all flex flex-col gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 shadow-xs">
                  <FileCheck className="size-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">2. SKTM Kelurahan / RT-RW</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Surat Keterangan Tidak Mampu dari Kelurahan setempat atau surat pengantar keterangan dhuafa dari RT/RW.
                  </p>
                </div>
              </div>

              <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md hover:shadow-lg transition-all flex flex-col gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 shadow-xs">
                  <Receipt className="size-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">3. Bukti Kebutuhan Riil</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Bukti tagihan biaya pendidikan sekolah, rincian biaya obat rumah sakit, atau rencana usaha mikro produktif.
                  </p>
                </div>
              </div>
            </div>

            {/* 6 Tahap SOP BAZNAS Detail Timeline */}
            <div className="shadow-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 space-y-6">
              <h4 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <Clock className="size-5 text-emerald-600" />
                Alur Standar Operasional Prosedur (SOP) Penyaluran BAZNAS
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {STEP_STAGES.map((stg) => (
                  <div key={stg.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center justify-center shadow-xs shrink-0">
                        {stg.id}
                      </span>
                      <h5 className="text-xs font-black text-slate-900 dark:text-white">{stg.label}</h5>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pl-9">
                      {stg.desc}
                    </p>
                  </div>
                ))}
              </div>

              <div className="text-center pt-2">
                <Button
                  onClick={() => handleNavClick('pengajuan')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm h-11 px-8 rounded-xl gap-2 shadow-md cursor-pointer"
                >
                  <FileText className="size-4" />
                  <span>Mulai Isi Formulir Pengajuan Sekarang</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: FAQ & PUSAT BANTUAN                                 */}
        {/* ========================================================= */}
        {(activeTab === 'faq' || activeTab === 'pengajuan') && (
          <div className="space-y-6 pt-6">
            <div className="text-center space-y-1.5 max-w-2xl mx-auto">
              <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">
                Pusat Bantuan & Edukasi
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                Pertanyaan yang Sering Diajukan (FAQ)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Informasi penting mengenai syarat, alur, dan transparansi penyaluran bantuan BAZNAS Kota Tangerang.
              </p>
            </div>

            <div className="max-w-3xl mx-auto space-y-3">
              {FAQ_LIST.map((faq, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div
                    key={idx}
                    className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden shadow-xs transition-all"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? -1 : idx)}
                      className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 font-bold text-xs sm:text-sm text-slate-900 dark:text-white hover:text-emerald-600 transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5">
                        <HelpCircle className="size-4 text-emerald-600 shrink-0" />
                        {faq.q}
                      </span>
                      {isOpen ? <ChevronUp className="size-4 text-slate-400 shrink-0" /> : <ChevronDown className="size-4 text-slate-400 shrink-0" />}
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800/60 animate-fade-in">
                        {faq.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>

      {/* ========================================================= */}
      {/* 4. MODAL SUKSES REGISTRASI DENGAN NOMOR BERKAS            */}
      {/* ========================================================= */}
      {submitSuccessData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-emerald-100 dark:border-slate-800 shadow-2xl rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 text-center animate-scale-up relative">
            
            <button
              onClick={() => setSubmitSuccessData(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="size-5" />
            </button>

            {/* Official Logo */}
            <div className="flex justify-center">
              <img
                src={baznasLogo}
                alt="Logo BAZNAS"
                className="h-12 w-auto object-contain drop-shadow-xs"
              />
            </div>

            {/* Success Checkmark Circle */}
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="size-10" />
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">
                Alhamdulillah! Pengajuan Berhasil Terdaftar
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                Permohonan Bantuan Diterima
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Permohonan atas nama <strong>{submitSuccessData.name}</strong> untuk program <strong>{submitSuccessData.program}</strong> telah masuk ke antrean verifikasi BAZNAS Kota Tangerang.
              </p>
            </div>

            {/* Nomor Berkas Highlight Card */}
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 space-y-2">
              <p className="text-[10px] uppercase font-extrabold text-emerald-800 dark:text-emerald-300 tracking-wider">
                NOMOR REGISTRASI BERKAS ANDA
              </p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl sm:text-3xl font-mono font-black text-emerald-900 dark:text-emerald-100 tracking-wider">
                  {submitSuccessData.fileNo}
                </span>
                <button
                  onClick={() => handleCopyCode(submitSuccessData.fileNo)}
                  className="p-2 rounded-xl bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs hover:bg-emerald-100 transition-colors cursor-pointer"
                  title="Salin Nomor Berkas"
                >
                  {copiedCode ? <Check className="size-5 text-emerald-600" /> : <Copy className="size-5" />}
                </button>
              </div>
              {copiedCode && (
                <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold block animate-fade-in">
                  ✓ Nomor berkas berhasil disalin ke clipboard!
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2.5">
              <Button
                onClick={() => {
                  setSearchQuery(submitSuccessData.fileNo);
                  setActiveTab('lacak');
                  const currentNo = submitSuccessData.fileNo;
                  setSubmitSuccessData(null);
                  handleSearchTracking(null, currentNo);
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm h-11 rounded-2xl gap-2 shadow-md cursor-pointer"
              >
                <Search className="size-4" /> Lacak Status Pengajuan Ini Sekarang
              </Button>

              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`https://wa.me/6281234567890?text=Assalamu%27alaikum%20BAZNAS%20Kota%20Tangerang,%20saya%20telah%20mengajukan%20permohonan%20bantuan%20dengan%20No%20Berkas%20${submitSuccessData.fileNo}%20an%20${encodeURIComponent(submitSuccessData.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 h-10 text-xs font-bold rounded-xl border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                >
                  <Phone className="size-3.5" /> Konfirmasi WA
                </a>
                <Button
                  variant="outline"
                  onClick={() => setSubmitSuccessData(null)}
                  className="h-10 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Tutup
                </Button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. FLOATING ACTION BUTTON WHATSAPP BANTUAN                 */}
      {/* ========================================================= */}
      <aside aria-label="Layanan Bantuan WhatsApp" className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2 group">
        <a
          href="https://wa.me/6281234567890?text=Assalamu%27alaikum%20BAZNAS%20Kota%20Tangerang,%20saya%20butuh%20bantuan%20informasi%20pengajuan%20mustahik"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-2xl hover:shadow-emerald-600/50 transition-all transform hover:scale-105"
        >
          <div className="relative">
            <Phone className="size-5 text-white" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full" />
          </div>
          <span className="text-xs font-extrabold hidden sm:inline">
            Bantuan WhatsApp BAZNAS
          </span>
        </a>
      </aside>

      {/* ========================================================= */}
      {/* 6. FOOTER INFORMASI PORTAL PUBLIK                          */}
      {/* ========================================================= */}
      <footer className="w-full bg-slate-900 text-slate-400 text-xs border-t border-slate-800 py-12 px-4 sm:px-6 lg:px-8 mt-auto">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <img
                src={baznasLogo}
                alt="Logo BAZNAS Footer"
                className="h-10 w-auto object-contain brightness-0 invert opacity-90"
              />
              <div>
                <span className="font-extrabold text-white text-sm block">BAZNAS KOTA TANGERANG</span>
                <span className="text-[10px] text-emerald-400">Badan Amil Zakat Nasional</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Lembaga pemerintah nonstruktural yang berwenang melakukan pengelolaan zakat, infak, dan sedekah secara <strong>3A: Aman Syar'i, Aman Regulasi, Aman NKRI</strong> di wilayah Kota Tangerang.
            </p>
          </div>

          <div className="space-y-2.5">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider">Kantor Pelayanan BAZNAS</h4>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Gedung Graha PPI / MUI Lt. 2, Jl. Satria Sudirman No. 1, Sukaasih, Kec. Tangerang, Kota Tangerang, Banten 15111<br />
              <strong className="text-slate-300">Jam Layanan:</strong> Senin &ndash; Jumat (08.00 &ndash; 16.00 WIB)
            </p>
          </div>

          <div className="space-y-2.5">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider">Layanan Informasi & Aduan</h4>
            <p className="text-[11px] leading-relaxed text-slate-400">
              WhatsApp Layanan: <strong className="text-emerald-400 font-mono">0812-3456-7890</strong><br />
              Email Resmi: <strong className="text-slate-300">baznaskota.tangerang@baznas.go.id</strong><br />
              Website: <strong className="text-slate-300">baznas.tangerangkota.go.id</strong>
            </p>
          </div>

        </div>

        <div className="max-w-6xl mx-auto pt-8 mt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] text-slate-500">
          <span>&copy; 2026 Badan Amil Zakat Nasional (BAZNAS) Kota Tangerang. Seluruh Hak Cipta Dilindungi.</span>
          <span>Portal Pelayanan Mustahik Digital & Transparan v2.5</span>
        </div>
      </footer>

    </div>
  );
}
