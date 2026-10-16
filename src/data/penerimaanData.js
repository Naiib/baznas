// Mock data for BAZNAS Data Center V2

// Existing Penerimaan Data
export const PENERIMAAN_METRICS = {
  totalPenerimaan: 2_450_000_000_000,      // 2.45 Triliun
  penerimaanBulanIni: 240_000_000_000,      // 240 Miliar
  targetPenerimaan: 2_800_000_000_000,       // 2.8 Triliun
  totalMuzakki: 2_345_000,
  avgPenerimaan: 1_045_000,                  // Rp 1.045 juta per muzakki
};

export const JENIS_ZAKAT_DATA = [
  { name: 'Zakat Maal', value: 1_470_000_000_000, color: 'var(--chart-1)' },
  { name: 'Zakat Fitrah', value: 612_500_000_000, color: 'var(--chart-3)' },
  { name: 'Infak', value: 245_000_000_000, color: 'var(--chart-4)' },
  { name: 'Sedekah', value: 122_500_000_000, color: 'var(--chart-5)' },
];

export const SUMBER_PENERIMAAN = [
  { name: 'UPZ', value: 42, amount: 1_029_000_000_000 },
  { name: 'Korporasi', value: 28, amount: 686_000_000_000 },
  { name: 'Individu', value: 18, amount: 441_000_000_000 },
  { name: 'ASN', value: 8, amount: 196_000_000_000 },
  { name: 'Online', value: 4, amount: 98_000_000_000 },
];

export const PENERIMAAN_TRANSACTIONS = [
  { date: '2026-07-04', muzakki: 'PT Sejahtera Abadi', jenis: 'Zakat Maal', amount: 150_000_000, status: 'Diterima', sumber: 'Korporasi' },
  { date: '2026-07-04', muzakki: 'Ahmad Naufal', jenis: 'Zakat Fitrah', amount: 45_000, status: 'Diterima', sumber: 'Individu' },
  { date: '2026-07-03', muzakki: 'Bank Syariah Mandiri', jenis: 'Zakat Maal', amount: 275_000_000, status: 'Diterima', sumber: 'Korporasi' },
  { date: '2026-07-03', muzakki: 'Siti Nurhaliza', jenis: 'Infak', amount: 2_500_000, status: 'Diterima', sumber: 'Online' },
  { date: '2026-07-02', muzakki: 'PT Bumi Resources', jenis: 'Zakat Maal', amount: 500_000_000, status: 'Diproses', sumber: 'Korporasi' },
  { date: '2026-07-02', muzakki: 'Yayasan Pendidikan Islam', jenis: 'Zakat Maal', amount: 85_000_000, status: 'Diterima', sumber: 'UPZ' },
  { date: '2026-07-01', muzakki: 'H. Abdul Rahman', jenis: 'Zakat Maal', amount: 25_000_000, status: 'Diterima', sumber: 'Individu' },
  { date: '2026-07-01', muzakki: 'PT Telkom Indonesia', jenis: 'Zakat Maal', amount: 1_200_000_000, status: 'Terverifikasi', sumber: 'Korporasi' },
];

export const PENERIMAAN_CHART_12M = [
  { month: 'Jul 2025', zakatMaal: 110_000_000_000, zakatFitrah: 25_000_000_000, infak: 30_000_000_000, sedekah: 15_000_000_000 },
  { month: 'Agu 2025', zakatMaal: 100_000_000_000, zakatFitrah: 28_000_000_000, infak: 24_000_000_000, sedekah: 13_000_000_000 },
  { month: 'Sep 2025', zakatMaal: 115_000_000_000, zakatFitrah: 32_000_000_000, infak: 27_000_000_000, sedekah: 16_000_000_000 },
  { month: 'Okt 2025', zakatMaal: 105_000_000_000, zakatFitrah: 30_000_000_000, infak: 25_000_000_000, sedekah: 15_000_000_000 },
  { month: 'Nov 2025', zakatMaal: 120_000_000_000, zakatFitrah: 35_000_000_000, infak: 28_000_000_000, sedekah: 17_000_000_000 },
  { month: 'Des 2025', zakatMaal: 150_000_000_000, zakatFitrah: 45_000_000_000, infak: 35_000_000_000, sedekah: 20_000_000_000 },
  { month: 'Jan 2026', zakatMaal: 117_000_000_000, zakatFitrah: 38_000_000_000, infak: 26_000_000_000, sedekah: 14_000_000_000 },
  { month: 'Feb 2026', zakatMaal: 126_000_000_000, zakatFitrah: 40_000_000_000, infak: 28_000_000_000, sedekah: 16_000_000_000 },
  { month: 'Mar 2026', zakatMaal: 228_000_000_000, zakatFitrah: 95_000_000_000, infak: 32_000_000_000, sedekah: 25_000_000_000 },
  { month: 'Apr 2026', zakatMaal: 252_000_000_000, zakatFitrah: 110_000_000_000, infak: 35_000_000_000, sedekah: 23_000_000_000 },
  { month: 'Mei 2026', zakatMaal: 132_000_000_000, zakatFitrah: 42_000_000_000, infak: 29_000_000_000, sedekah: 17_000_000_000 },
  { month: 'Jun 2026', zakatMaal: 144_000_000_000, zakatFitrah: 48_000_000_000, infak: 31_000_000_000, sedekah: 17_000_000_000 },
];

// New Penyaluran Data
export const PENYALURAN_METRICS = {
  totalPenyaluran: 1_890_000_000_000,      // 1.89 Triliun
  penyaluranBulanIni: 195_000_000_000,      // 195 Miliar
  targetPenyaluran: 2_200_000_000_000,       // 2.2 Triliun
  totalMustahik: 5_678_000,
  efektivitasPenyaluran: 86.5,               // 86.5% efisiensi
};

export const ASNAF_DISTRIBUTION = [
  { name: 'Fakir', value: 567_000_000_000, color: '#e11d48' },
  { name: 'Miskin', value: 756_000_000_000, color: '#d97706' },
  { name: 'Amil', value: 189_000_000_000, color: '#2563eb' },
  { name: 'Mualaf', value: 94_500_000_000, color: '#0d9488' },
  { name: 'Fisabilillah', value: 151_200_000_000, color: '#059669' },
  { name: 'Ibnu Sabil & Lainnya', value: 132_300_000_000, color: '#64748b' },
];

export const PENYALURAN_PROGRAMS = [
  { name: 'Tangerang Cerdas (Pendidikan)', value: 35, budget: 661_500_000_000, realized: 570_000_000_000, color: '#2563eb' },
  { name: 'Tangerang Sehat (Kesehatan)', value: 25, budget: 472_500_000_000, realized: 410_000_000_000, color: '#059669' },
  { name: 'Tangerang Peduli (Sosial Kemanusiaan)', value: 20, budget: 378_000_000_000, realized: 330_000_000_000, color: '#e11d48' },
  { name: 'Tangerang Makmur (Ekonomi)', value: 12, budget: 226_800_000_000, realized: 180_000_000_000, color: '#d97706' },
  { name: 'Tangerang Takwa (Dakwah & Advokasi)', value: 8, budget: 151_200_000_000, realized: 120_000_000_000, color: '#7c3aed' },
];

export const PENYALURAN_TRANSACTIONS = [
  { date: '2026-07-04', mustahik: 'Beasiswa Pendidikan 500 Siswa', program: 'Tangerang Cerdas', amount: 250_000_000, status: 'Disalurkan', asnaf: 'Miskin' },
  { date: '2026-07-04', mustahik: 'Bantuan Medis RSU Tangerang', program: 'Tangerang Sehat', amount: 85_000_000, status: 'Disalurkan', asnaf: 'Fakir' },
  { date: '2026-07-03', mustahik: 'Modal Usaha 25 UMKM', program: 'Tangerang Makmur', amount: 125_000_000, status: 'Disalurkan', asnaf: 'Miskin' },
  { date: '2026-07-03', mustahik: 'Paket Sembako Tanggap Bencana', program: 'Tangerang Peduli', amount: 320_000_000, status: 'Disalurkan', asnaf: 'Fakir' },
  { date: '2026-07-02', mustahik: 'Renovasi Masjid Al-Ikhlas', program: 'Tangerang Takwa', amount: 75_000_000, status: 'Diproses', asnaf: 'Fisabilillah' },
  { date: '2026-07-02', mustahik: 'Santunan Anak Yatim', program: 'Tangerang Peduli', amount: 50_000_000, status: 'Disalurkan', asnaf: 'Miskin' },
  { date: '2026-07-01', mustahik: 'Insentif Guru Ngaji', program: 'Tangerang Takwa', amount: 120_000_000, status: 'Disalurkan', asnaf: 'Fisabilillah' },
  { date: '2026-07-01', mustahik: 'Bantuan Kursi Roda Difabel', program: 'Tangerang Peduli', amount: 45_000_000, status: 'Disalurkan', asnaf: 'Miskin' },
];

export const PENYALURAN_CHART_12M = [
  { month: 'Jul 2025', pendidikan: 45_000_000_000, kesehatan: 30_000_000_000, sosial: 25_000_000_000, ekonomi: 15_000_000_000, dakwah: 10_000_000_000 },
  { month: 'Agu 2025', pendidikan: 40_000_000_000, kesehatan: 28_000_000_000, sosial: 22_000_000_000, ekonomi: 14_000_000_000, dakwah: 9_000_000_000 },
  { month: 'Sep 2025', pendidikan: 48_000_000_000, kesehatan: 35_000_000_000, sosial: 26_000_000_000, ekonomi: 16_000_000_000, dakwah: 12_000_000_000 },
  { month: 'Okt 2025', pendidikan: 42_000_000_000, kesehatan: 32_000_000_000, sosial: 24_000_000_000, ekonomi: 15_000_000_000, dakwah: 10_000_000_000 },
  { month: 'Nov 2025', pendidikan: 50_000_000_000, kesehatan: 38_000_000_000, sosial: 28_000_000_000, ekonomi: 18_000_000_000, dakwah: 11_000_000_000 },
  { month: 'Des 2025', pendidikan: 65_000_000_000, kesehatan: 48_000_000_000, sosial: 35_000_000_000, ekonomi: 22_000_000_000, dakwah: 15_000_000_000 },
  { month: 'Jan 2026', pendidikan: 43_000_000_000, kesehatan: 31_000_000_000, sosial: 23_000_000_000, ekonomi: 14_000_000_000, dakwah: 9_000_000_000 },
  { month: 'Feb 2026', pendidikan: 46_000_000_000, kesehatan: 34_000_000_000, sosial: 25_000_000_000, ekonomi: 16_000_000_000, dakwah: 10_000_000_000 },
  { month: 'Mar 2026', pendidikan: 85_000_000_000, kesehatan: 65_000_000_000, sosial: 55_000_000_000, ekonomi: 25_000_000_000, dakwah: 20_000_000_000 },
  { month: 'Apr 2026', pendidikan: 98_000_000_000, kesehatan: 75_000_000_000, sosial: 62_000_000_000, ekonomi: 28_000_000_000, dakwah: 22_000_000_000 },
  { month: 'Mei 2026', pendidikan: 52_000_000_000, kesehatan: 38_000_000_000, sosial: 27_000_000_000, ekonomi: 17_000_000_000, dakwah: 11_000_000_000 },
  { month: 'Jun 2026', pendidikan: 58_000_000_000, kesehatan: 44_000_000_000, sosial: 31_000_000_000, ekonomi: 19_000_000_000, dakwah: 13_000_000_000 },
];

// New Muzakki List
export const MUZAKKI_LIST = [
  { id: 'MZK-001', name: 'PT Telkom Indonesia', type: 'Korporasi', email: 'csr@telkom.co.id', phone: '021-5240121', totalDonation: 12_500_000_000, lastDonation: '2026-07-01', status: 'Aktif' },
  { id: 'MZK-002', name: 'PT Bumi Resources', type: 'Korporasi', email: 'finance@bumiresources.com', phone: '021-3193456', totalDonation: 3_200_000_000, lastDonation: '2026-07-02', status: 'Aktif' },
  { id: 'MZK-003', name: 'Bank Syariah Indonesia', type: 'Korporasi', email: 'zakat@bsi.co.id', phone: '021-7890123', totalDonation: 9_800_000_000, lastDonation: '2026-06-28', status: 'Aktif' },
  { id: 'MZK-004', name: 'H. Abdul Rahman', type: 'Individu', email: 'abdul.rahman@gmail.com', phone: '0812-3456-7890', totalDonation: 450_000_000, lastDonation: '2026-07-01', status: 'Aktif' },
  { id: 'MZK-005', name: 'Siti Aminah', type: 'Individu', email: 'siti.aminah@yahoo.com', phone: '0813-9876-5432', totalDonation: 120_000_000, lastDonation: '2026-06-25', status: 'Aktif' },
  { id: 'MZK-006', name: 'PT Sejahtera Abadi', type: 'Korporasi', email: 'info@sejahteraabadi.com', phone: '021-8899776', totalDonation: 1_250_000_000, lastDonation: '2026-07-04', status: 'Aktif' },
  { id: 'MZK-007', name: 'Hj. Fatimah Az-Zahra', type: 'Individu', email: 'fatimah.zahra@outlook.com', phone: '0857-1122-3344', totalDonation: 310_000_000, lastDonation: '2026-06-30', status: 'Aktif' },
  { id: 'MZK-008', name: 'Ahmad Naufal', type: 'Individu', email: 'a.naufal@baznas.go.id', phone: '0811-2233-4455', totalDonation: 15_000_000, lastDonation: '2026-07-04', status: 'Aktif' },
  { id: 'MZK-009', name: 'Budi Hartono', type: 'Individu', email: 'budi.hartono@gmail.com', phone: '0812-9900-8877', totalDonation: 75_000_000, lastDonation: '2026-05-12', status: 'Pasif' },
  { id: 'MZK-010', name: 'PT Astra International', type: 'Korporasi', email: 'sustainability@astra.co.id', phone: '021-6522555', totalDonation: 6_700_000_000, lastDonation: '2026-06-15', status: 'Aktif' },
];

// New Mustahik List
export const MUSTAHIK_LIST = [
  { id: 'MST-001', name: 'Yayasan Yatama Tangerang', asnaf: 'Miskin', location: 'Batuceper', aidType: 'Pendidikan', totalAid: 150_000_000, status: 'Aktif' },
  { id: 'MST-002', name: 'Keluarga Bpk. Sulaeman', asnaf: 'Fakir', location: 'Cipondoh', aidType: 'Kesehatan & Pangan', totalAid: 25_000_000, status: 'Aktif' },
  { id: 'MST-003', name: 'Pondok Pesantren Al-Bayan', asnaf: 'Fisabilillah', location: 'Ciledug', aidType: 'Sarana & Prasarana', totalAid: 320_000_000, status: 'Aktif' },
  { id: 'MST-004', name: 'Ibu Maimunah (Janda Tua)', asnaf: 'Fakir', location: 'Tangerang', aidType: 'Bulanan Rutin', totalAid: 18_000_000, status: 'Aktif' },
  { id: 'MST-005', name: 'Bpk. Ahmad Junaedi (Difabel)', asnaf: 'Miskin', location: 'Jatiuwung', aidType: 'Alat Bantu & Modal', totalAid: 12_500_000, status: 'Aktif' },
  { id: 'MST-006', name: 'Kelompok Tani Harapan Jaya', asnaf: 'Miskin', location: 'Neglasari', aidType: 'Peralatan Pertanian', totalAid: 85_000_000, status: 'Aktif' },
  { id: 'MST-007', name: 'Sdr. Ridwan Hakim (Mahasiswa)', asnaf: 'Ibnu Sabil', location: 'Karawaci', aidType: 'Beasiswa Kuliah', totalAid: 45_000_000, status: 'Aktif' },
  { id: 'MST-008', name: 'Ibu Rahayu (Gharimin Medis)', asnaf: 'Gharimin', location: 'Periuk', aidType: 'Pelunasan Utang RS', totalAid: 35_000_000, status: 'Selesai' },
  { id: 'MST-009', name: 'Majelis Taklim Nurul Huda', asnaf: 'Fisabilillah', location: 'Pinang', aidType: 'Pembinaan Dakwah', totalAid: 40_000_000, status: 'Aktif' },
  { id: 'MST-010', name: 'Keluarga Ibu Khadijah', asnaf: 'Fakir', location: 'Karang Tengah', aidType: 'Bedah Rumah', totalAid: 65_000_000, status: 'Selesai' },
];

// UPZ List Data
export const UPZ_LIST = [
  { id: 'UPZ-001', name: 'UPZ Masjid Agung Al-Ittihad', category: 'Masjid', contact: 'H. Suherman', target: 250_000_000, realized: 235_000_000, status: 'Aktif' },
  { id: 'UPZ-002', name: 'UPZ Dinas Pendidikan Kota Tangerang', category: 'Dinas', contact: 'Drs. H. Mulyono', target: 800_000_000, realized: 742_000_000, status: 'Aktif' },
  { id: 'UPZ-003', name: 'UPZ BUMD PDAM Tirta Benteng', category: 'BUMD', contact: 'Ahmad Faisal, SE', target: 450_000_000, realized: 398_000_000, status: 'Aktif' },
  { id: 'UPZ-004', name: 'UPZ Kecamatan Pinang', category: 'Kecamatan', contact: 'Bpk. Kaonang', target: 300_000_000, realized: 285_000_000, status: 'Aktif' },
  { id: 'UPZ-005', name: 'UPZ Masjid Al-Jihad Cipondoh', category: 'Masjid', contact: 'Ustadz Jaelani', target: 150_000_000, realized: 120_000_000, status: 'Aktif' },
  { id: 'UPZ-006', name: 'UPZ Dinas Kesehatan', category: 'Dinas', contact: 'dr. Dini Anggraeni', target: 600_000_000, realized: 540_000_000, status: 'Aktif' },
  { id: 'UPZ-007', name: 'UPZ SMA Negeri 1 Tangerang', category: 'Sekolah', contact: 'Ibu Retno', target: 120_000_000, realized: 110_000_000, status: 'Aktif' },
  { id: 'UPZ-008', name: 'UPZ PT Tangerang Makmur Swasta', category: 'Swasta', contact: 'Susilo Bambang', target: 350_000_000, realized: 150_000_000, status: 'Pasif' }
];

// Kerjasama / Partnerships List Data
export const KERJASAMA_LIST = [
  { id: 'MOU-001', partner: 'PT Bank Syariah Indonesia', program: 'Beasiswa Pendidikan Santri Berprestasi', budget: 1_200_000_000, startDate: '2025-01-10', endDate: '2026-01-10', status: 'Aktif' },
  { id: 'MOU-002', partner: 'Lembaga Amil Zakat Pertamina', program: 'Klinik Kesehatan Gratis Tangerang Sehat', budget: 850_000_000, startDate: '2025-03-15', endDate: '2026-03-15', status: 'Aktif' },
  { id: 'MOU-003', partner: 'PT Angkasa Pura II', program: 'Bedah Rumah RTLH & Pemberdayaan Ekonomi', budget: 2_000_000_000, startDate: '2025-05-01', endDate: '2026-05-01', status: 'Aktif' },
  { id: 'MOU-004', partner: 'Yayasan Buddha Tzu Chi', program: 'Bantuan Pangan & Tanggap Bencana Bersama', budget: 500_000_000, startDate: '2025-06-20', endDate: '2026-06-20', status: 'Aktif' },
  { id: 'MOU-005', partner: 'Universitas Muhammadiyah Tangerang', program: 'KKN Tematik Pemberdayaan Masyarakat Mustahik', budget: 150_000_000, startDate: '2025-02-12', endDate: '2025-08-12', status: 'Selesai' }
];

// Finance & Accounting Mock Data
export const FINANCE_METRICS = {
  totalAssets: 3_120_000_000_000,          // Rp 3.12 Triliun
  cashAndBank: 560_000_000_000,            // Rp 560 Miliar
  amilRatio: 9.8,                          // 9.8% biaya operasional (max 12.5% regulasi)
  rkatRealization: 78.4,                   // 78.4% penyerapan rkat
  totalOperational: 245_000_000_000,       // Rp 245 Miliar
};

export const RKAT_BUDGETS = [
  { id: 'RKAT-01', program: 'Bidang Penerimaan Zakat', allocated: 25_000_000_000, spent: 18_500_000_000, category: 'Penerimaan' },
  { id: 'RKAT-02', program: 'Pilar Tangerang Cerdas (Pendidikan)', allocated: 661_500_000_000, spent: 570_000_000_000, category: 'Penyaluran' },
  { id: 'RKAT-03', program: 'Pilar Tangerang Sehat (Kesehatan)', allocated: 472_500_000_000, spent: 410_000_000_000, category: 'Penyaluran' },
  { id: 'RKAT-04', program: 'Pilar Tangerang Peduli (Sosial)', allocated: 378_000_000_000, spent: 330_000_000_000, category: 'Penyaluran' },
  { id: 'RKAT-05', program: 'Pilar Tangerang Makmur (Ekonomi)', allocated: 226_800_000_000, spent: 180_000_000_000, category: 'Penyaluran' },
  { id: 'RKAT-06', program: 'Pilar Tangerang Takwa (Dakwah)', allocated: 151_200_000_000, spent: 120_000_000_000, category: 'Penyaluran' },
  { id: 'RKAT-07', program: 'Operasional Kantor & Amil', allocated: 260_000_000_000, spent: 245_000_000_000, category: 'Operasional' },
  { id: 'RKAT-08', program: 'Penyusutan Aset & Sarpras', allocated: 35_000_000_000, spent: 28_000_000_000, category: 'Sarpras' }
];

export const FINANCIAL_LEDGER = [
  { date: '2026-07-05', desc: 'Penerimaan Zakat Korporasi BSI', type: 'Debet', amount: 500_000_000, account: 'Kas Bank BSI' },
  { date: '2026-07-05', desc: 'Penyaluran Beasiswa Tangerang Cerdas', type: 'Kredit', amount: 150_000_000, account: 'Kas Bank BJB' },
  { date: '2026-07-04', desc: 'Biaya Gaji Amil & Pegawai Bulanan', type: 'Kredit', amount: 120_000_000, account: 'Kas Bank BJB' },
  { date: '2026-07-04', desc: 'Setoran Dana ZIS UPZ Disdik', type: 'Debet', amount: 320_000_000, account: 'Kas Bank Mandiri' },
  { date: '2026-07-03', desc: 'Pembelian Kursi Roda Program Sehat', type: 'Kredit', amount: 45_000_000, account: 'Kas Bank Syariah' },
  { date: '2026-07-02', desc: 'Bantuan Pangan Tanggap Bencana', type: 'Kredit', amount: 200_000_000, account: 'Kas Bank BJB' },
  { date: '2026-07-01', desc: 'Penerimaan Zakat Individu (Online)', type: 'Debet', amount: 85_000_000, account: 'Kas Bank BSI' }
];

// SDM & Umum Mock Data
export const PEGAWAI_LIST = [
  { nik: '367101001', name: 'Drs. H. M. Asyik Syarif, M.A', role: 'Ketua BAZNAS', division: 'Pimpinan', status: 'Tetap', joinDate: '2021-02-15', contact: '0812-3456-7890' },
  { nik: '367101002', name: 'H. Anwar Aris, Lc', role: 'Wakil Ketua I (Penerimaan)', division: 'Pimpinan', status: 'Tetap', joinDate: '2021-02-15', contact: '0812-9988-7766' },
  { nik: '367102001', name: 'Zainal Abidin, S.E', role: 'Kepala Divisi Penerimaan', division: 'Penerimaan', status: 'Tetap', joinDate: '2022-05-10', contact: '0813-1122-3344' },
  { nik: '367102002', name: 'Lia Herlina, A.Md', role: 'Staff Front Office & CS', division: 'Penerimaan', status: 'Kontrak', joinDate: '2023-08-01', contact: '0857-4455-6677' },
  { nik: '367103001', name: 'Rahmat Hidayat, S.Sos', role: 'Kepala Divisi Penyaluran', division: 'Penyaluran', status: 'Tetap', joinDate: '2022-05-10', contact: '0811-5566-7788' },
  { nik: '367103002', name: 'Dewi Lestari, S.Pd', role: 'Staff Verifikator Mustahik', division: 'Penyaluran', status: 'Kontrak', joinDate: '2024-01-15', contact: '0819-2233-4455' },
  { nik: '367104001', name: 'Fahmi Idris, S.Ak', role: 'Kepala Divisi Keuangan', division: 'Keuangan', status: 'Tetap', joinDate: '2022-06-01', contact: '0812-7788-9900' },
  { nik: '367104002', name: 'Siti Rahma, A.Md.Ak', role: 'Staff Kasir & Pembukuan', division: 'Keuangan', status: 'Kontrak', joinDate: '2023-11-01', contact: '0852-1234-5678' },
  { nik: '367105001', name: 'Bambang Irawan, S.H', role: 'Kepala Bagian SDM & Umum', division: 'SDM/Umum', status: 'Tetap', joinDate: '2022-07-01', contact: '0813-5678-1234' },
  { nik: '367105002', name: 'Reza Pahlevi', role: 'Staff Operasional & Driver', division: 'SDM/Umum', status: 'Kontrak', joinDate: '2024-03-01', contact: '0878-9012-3456' }
];

export const ABSENSI_LIST = [
  { date: '2026-07-06', nik: '367102001', name: 'Zainal Abidin, S.E', timeIn: '07:45', timeOut: '16:05', status: 'Hadir' },
  { date: '2026-07-06', nik: '367102002', name: 'Lia Herlina, A.Md', timeIn: '07:55', timeOut: '16:00', status: 'Hadir' },
  { date: '2026-07-06', nik: '367103001', name: 'Rahmat Hidayat, S.Sos', timeIn: '08:15', timeOut: '16:10', status: 'Terlambat' },
  { date: '2026-07-06', nik: '367103002', name: 'Dewi Lestari, S.Pd', timeIn: '-', timeOut: '-', status: 'Cuti' },
  { date: '2026-07-06', nik: '367104001', name: 'Fahmi Idris, S.Ak', timeIn: '07:40', timeOut: '16:00', status: 'Hadir' },
  { date: '2026-07-06', nik: '367104002', name: 'Siti Rahma, A.Md.Ak', timeIn: '07:50', timeOut: '16:05', status: 'Hadir' },
  { date: '2026-07-06', nik: '367105001', name: 'Bambang Irawan, S.H', timeIn: '-', timeOut: '-', status: 'Sakit' },
  { date: '2026-07-06', nik: '367105002', name: 'Reza Pahlevi', timeIn: '07:30', timeOut: '16:30', status: 'Hadir' }
];

export const KINERJA_LIST = [
  { period: 'Juni 2026', nik: '367102001', name: 'Zainal Abidin, S.E', division: 'Penerimaan', score: 88, grade: 'Sangat Baik' },
  { period: 'Juni 2026', nik: '367102002', name: 'Lia Herlina, A.Md', division: 'Penerimaan', score: 85, grade: 'Baik' },
  { period: 'Juni 2026', nik: '367103001', name: 'Rahmat Hidayat, S.Sos', division: 'Penyaluran', score: 92, grade: 'Sangat Baik' },
  { period: 'Juni 2026', nik: '367103002', name: 'Dewi Lestari, S.Pd', division: 'Penyaluran', score: 79, grade: 'Baik' },
  { period: 'Juni 2026', nik: '367104001', name: 'Fahmi Idris, S.Ak', division: 'Keuangan', score: 95, grade: 'Sangat Baik' },
  { period: 'Juni 2026', nik: '367104002', name: 'Siti Rahma, A.Md.Ak', division: 'Keuangan', score: 82, grade: 'Baik' },
  { period: 'Juni 2026', nik: '367105001', name: 'Bambang Irawan, S.H', division: 'SDM/Umum', score: 80, grade: 'Baik' },
  { period: 'Juni 2026', nik: '367105002', name: 'Reza Pahlevi', division: 'SDM/Umum', score: 74, grade: 'Cukup' }
];
