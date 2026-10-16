/**
 * Rich seed data generator for BAZNAS Kota Tangerang Data Center V2
 * Generates 218 realistic mustahik across 13 kecamatan, 5 pilar programs, 8 asnafs, and 7 workflow stages.
 */

export const KECAMATAN_KELURAHAN_MAP = {
  Cipondoh: ['Cipondoh', 'Cipondoh Indah', 'Cipondoh Makmur', 'Gondrong', 'Kenanga', 'Ketapang', 'Petir', 'Poris Plawad', 'Poris Plawad Indah', 'Poris Plawad Utara'],
  Tangerang: ['Sukasari', 'Babakan', 'Buaran Indah', 'Cikokol', 'Kelapa Indah', 'Sukaasih', 'Sukarasa', 'Tanah Tinggi'],
  Karawaci: ['Bojong Jaya', 'Bugel', 'Cimone', 'Cimone Jaya', 'Gerendeng', 'Karawaci', 'Karawaci Baru', 'Koang Jaya', 'Margasari', 'Nambo Jaya', 'Nusa Jaya', 'Pabuaran', 'Pabuaran Tumpeng', 'Pasar Baru', 'Sukajadi', 'Sumur Pacing'],
  Ciledug: ['Paninggilan', 'Paninggilan Utara', 'Parung Serab', 'Sudimara Barat', 'Sudimara Jaya', 'Sudimara Selatan', 'Sudimara Timur', 'Tajur'],
  Cibodas: ['Cibodas', 'Cibodasari', 'Cibodas Baru', 'Jatiuwung', 'Panunggangan Barat', 'Uwung Jaya'],
  Batuceper: ['Batuceper', 'Batujaya', 'Batusari', 'Kebon Besar', 'Poris Gaga', 'Poris Gaga Baru', 'Poris Jaya'],
  Benda: ['Belendung', 'Benda', 'Jurumudi', 'Jurumudi Baru', 'Pajang'],
  Pinang: ['Cipete', 'Kunciran', 'Kunciran Indah', 'Kunciran Jaya', 'Nerogtog', 'Pakujan', 'Panunggangan', 'Panunggangan Timur', 'Panunggangan Utara', 'Pinang'],
  Larangan: ['Cipadu', 'Cipadu Jaya', 'Gaga', 'Kreo', 'Kreo Selatan', 'Larangan Indah', 'Larangan Selatan', 'Larangan Utara'],
  Neglasari: ['Karang Anyar', 'Karangsari', 'Kedaung Baru', 'Kedaung Wetan', 'Mekarsari', 'Neglasari', 'Selapajang Jaya'],
  Periuk: ['Gebang Raya', 'Gembor', 'Periuk', 'Periuk Jaya', 'Sangiang Jaya'],
  Jatiuwung: ['Alam Jaya', 'Gandasari', 'Jatake', 'Keroncong', 'Manis Jaya', 'Pasir Jaya'],
  'Karang Tengah': ['Karang Mulya', 'Karang Tengah', 'Karang Timur', 'Parung Jaya', 'Pedurenan', 'Pondok Bahar', 'Pondok Pucung']
};

export const KECAMATAN_COORDINATES = {
  Cipondoh: { lat: -6.1925, lng: 106.6789 },
  Tangerang: { lat: -6.1783, lng: 106.6319 },
  Karawaci: { lat: -6.1950, lng: 106.6150 },
  Ciledug: { lat: -6.2280, lng: 106.7080 },
  Cibodas: { lat: -6.1980, lng: 106.5890 },
  Batuceper: { lat: -6.1550, lng: 106.6710 },
  Benda: { lat: -6.1180, lng: 106.6850 },
  Pinang: { lat: -6.2190, lng: 106.6720 },
  Larangan: { lat: -6.2370, lng: 106.7320 },
  Neglasari: { lat: -6.1480, lng: 106.6350 },
  Periuk: { lat: -6.1620, lng: 106.5920 },
  Jatiuwung: { lat: -6.2080, lng: 106.5650 },
  'Karang Tengah': { lat: -6.2150, lng: 106.7150 }
};

const FIRST_NAMES_M = [
  'Ahmad', 'Muhammad', 'Bambang', 'Hendra', 'Dedi', 'Rizky', 'Fajar', 'Suryadi', 'Mulyono', 'Eko',
  'Gunawan', 'Imam', 'Agus', 'Wahyudi', 'Supriyanto', 'Irfan', 'Arif', 'Taufik', 'Yusuf', 'Lukman',
  'Hasan', 'Ali', 'Zainal', 'Farhan', 'Rian', 'Bayu', 'Ade', 'Ujang', 'Asep', 'Dani'
];

const FIRST_NAMES_F = [
  'Siti', 'Nur', 'Maryam', 'Aminah', 'Fatimah', 'Yuniarti', 'Mimin', 'Dewi', 'Sri', 'Ratna',
  'Endang', 'Rina', 'Wulandari', 'Kurniasih', 'Suhartini', 'Lestari', 'Fitri', 'Ayu', 'Rostina', 'Halimah',
  'Sumarni', 'Rohanah', 'Neneng', 'Warsinah', 'Haryati', 'Nurjanah', 'Munawaroh', 'Khadijah', 'Sulastri', 'Ida'
];

const LAST_NAMES = [
  'Fauzi', 'Rahayu', 'Supriadi', 'Nurhayati', 'Firmansyah', 'Hidayat', 'Saputra', 'Kusuma', 'Santoso', 'Utami',
  'Pratama', 'Setiawan', 'Susanto', 'Wibowo', 'Kurniawan', 'Ramadhan', 'Wijaya', 'Putra', 'Maulana', 'Siregar',
  'Nasution', 'Lubis', 'Purnomo', 'Cahyono', 'Subekti', 'Kosasih', 'Mubarok', 'Zakaria', 'Sulaeman', 'Mulyadi'
];

const STREET_NAMES = [
  'Jl. KH Hasyim Ashari', 'Jl. Daan Mogot', 'Jl. Merdeka', 'Jl. Gatot Subroto', 'Jl. Raden Fatah',
  'Jl. Hos Cokroaminoto', 'Jl. Moh. Toha', 'Jl. Sudirman', 'Jl. Imam Bonjol', 'Jl. K.H. Soleh Ali',
  'Jl. Maulana Hasanudin', 'Jl. Benteng Betawi', 'Jl. Veteran', 'Jl. Kisamaun', 'Jl. Keadilan'
];

const OCCUPATIONS = [
  'Buruh Harian Lepas', 'Pedagang Keliling', 'Guru Honorer / Ngaji', 'Penjual Makanan Kecil', 'Ojek Online / Pangkalan',
  'Buruh Cuci & Setrika', 'Petugas Kebersihan', 'Penjahit Rumahan', 'Karyawan Toko Kecil', 'Pemulung / Daur Ulang',
  'Montir Bengkel Kecil', 'Tukang Pijat Tuna Netra', 'Pekerja Serabutan', 'Ibu Rumah Tangga (Janda Dhuafa)'
];

const PROGRAMS = [
  'Tangerang Cerdas',
  'Tangerang Makmur',
  'Tangerang Sehat',
  'Tangerang Peduli',
  'Tangerang Takwa'
];

const ASNAF_LIST = [
  'Fakir', 'Miskin', 'Fisabilillah', 'Ibnu Sabil', 'Gharimin', 'Muallaf', 'Riqab', 'Amil'
];

export function generateMustahikSeed() {
  const list = [];
  const kecKeys = Object.keys(KECAMATAN_KELURAHAN_MAP);

  // Define target distribution by stage
  const stageDistribution = [
    { stage: 'Diajukan', count: 18 },
    { stage: 'Verifikasi Administrasi', count: 24 },
    { stage: 'Survey', count: 8 },
    { stage: 'Persetujuan MPZIS', count: 12 },
    { stage: 'Pengajuan Dana (FPD)', count: 3 },
    { stage: 'Pengajuan Dana (PPD)', count: 2 },
    { stage: 'Penyaluran Selesai', count: 146 },
    { stage: 'Ditolak', count: 5 }
  ];

  let idCounter = 1;

  for (const { stage, count } of stageDistribution) {
    for (let i = 0; i < count; i++) {
      const isFemale = (idCounter % 2 === 0);
      const firstNames = isFemale ? FIRST_NAMES_F : FIRST_NAMES_M;
      const firstName = firstNames[idCounter % firstNames.length];
      const lastName = LAST_NAMES[(idCounter * 3) % LAST_NAMES.length];
      const name = `${firstName} ${lastName}`;

      const kecName = kecKeys[idCounter % kecKeys.length];
      const kelList = KECAMATAN_KELURAHAN_MAP[kecName];
      const kelName = kelList[idCounter % kelList.length];

      const street = STREET_NAMES[idCounter % STREET_NAMES.length];
      const rt = String((idCounter % 9) + 1).padStart(3, '0');
      const rw = String(((idCounter * 2) % 8) + 1).padStart(3, '0');
      const address = `${street} No. ${(idCounter % 85) + 1} RT ${rt}/RW ${rw}, Kel. ${kelName}`;

      const nikMiddle = String(10000000 + idCounter * 739).padStart(8, '0');
      const nik = `3671${String((idCounter % 13) + 1).padStart(2, '0')}${nikMiddle}`;
      const kkNumber = `367101${String(20000000 + idCounter * 412).padStart(8, '0')}`;
      const phone = `08${(10 + (idCounter % 89))}-${String(1000 + (idCounter * 37) % 9000)}-${String(1000 + (idCounter * 91) % 9000)}`;

      const program = PROGRAMS[idCounter % PROGRAMS.length];
      const asnaf = (idCounter % 10 === 0) ? 'Fisabilillah' :
                    (idCounter % 12 === 0) ? 'Ibnu Sabil' :
                    (idCounter % 14 === 0) ? 'Gharimin' :
                    (idCounter % 16 === 0) ? 'Muallaf' :
                    (idCounter % 3 === 0) ? 'Fakir' : 'Miskin';

      const occupation = OCCUPATIONS[idCounter % OCCUPATIONS.length];
      const familyDependents = (idCounter % 5) + 1;
      const monthlyIncome = (idCounter % 4 === 0) ? 900000 : (idCounter % 3 === 0) ? 1400000 : 1850000;
      const monthlyExpense = monthlyIncome + ((idCounter % 4) + 1) * 350000;
      const remainingIncome = monthlyIncome - monthlyExpense;

      const baseAmount = program === 'Tangerang Cerdas' ? 1500000 :
                         program === 'Tangerang Makmur' ? 3500000 :
                         program === 'Tangerang Sehat' ? 2500000 :
                         program === 'Tangerang Peduli' ? 2000000 : 1200000;
      const recommendedAmount = baseAmount + (idCounter % 4) * 500000;
      const approvedAmount = (stage === 'Diajukan' || stage === 'Verifikasi Administrasi' || stage === 'Ditolak') ? 0 : recommendedAmount;

      const fileNo = `MST-202608-${String(idCounter).padStart(4, '0')}`;
      const receivedDate = `2026-08-${String((idCounter % 24) + 1).padStart(2, '0')}`;
      const surveyDate = (stage !== 'Diajukan' && stage !== 'Verifikasi Administrasi') ? `2026-08-${String((idCounter % 20) + 5).padStart(2, '0')}` : null;
      const mpzisDate = (stage === 'Persetujuan MPZIS' || stage.startsWith('Pengajuan') || stage === 'Penyaluran Selesai') ? `2026-08-${String((idCounter % 15) + 10).padStart(2, '0')}` : null;
      const disbursementDate = (stage === 'Penyaluran Selesai') ? `2026-08-${String((idCounter % 10) + 16).padStart(2, '0')}` : null;

      const ppdNumber = (stage === 'Pengajuan Dana (PPD)' || stage === 'Penyaluran Selesai') ? `PPD/202608/${String(idCounter).padStart(3, '0')}` :
                        (stage === 'Pengajuan Dana (FPD)') ? `FPD/202608/${String(idCounter).padStart(3, '0')}` : null;

      const banks = ['BSI', 'BRI', 'Bank Banten', 'BCA', 'Mandiri'];
      const bankName = banks[idCounter % banks.length];
      const bankAccount = String(1000000000 + idCounter * 4921);

      const desil = (asnaf === 'Fakir') ? 1 : (asnaf === 'Miskin') ? 2 : 3;
      const houseIndex = (idCounter % 3) + 1;
      const assetIndex = (idCounter % 3) + 1;
      const incomeIndex = (idCounter % 3) + 1;
      const spiritualScore = 75 + (idCounter % 25);
      const overallScore = 72 + (idCounter % 26);

      list.push({
        id: idCounter,
        file_no: fileNo,
        received_date: receivedDate,
        name,
        applicant_status: 'Perorangan',
        beneficiary_name: name,
        nik,
        kk_number: kkNumber,
        phone,
        marital_status: isFemale ? (idCounter % 3 === 0 ? 'Janda' : 'Menikah') : 'Menikah',
        pob: 'Tangerang',
        dob: `19${65 + (idCounter % 30)}-${String((idCounter % 12) + 1).padStart(2, '0')}-${String((idCounter % 28) + 1).padStart(2, '0')}`,
        occupation,
        work_place: 'Kota Tangerang',
        education_level: (idCounter % 3 === 0) ? 'SMA' : (idCounter % 2 === 0) ? 'SMP' : 'SD',
        address,
        rt_rw: `${rt}/${rw}`,
        kelurahan: kelName,
        kecamatan: kecName,
        kabupaten_kota: 'Kota Tangerang',
        province: 'Banten',
        survey_date: surveyDate,
        surveyor_name: surveyDate ? (idCounter % 2 === 0 ? 'Bambang Irawan' : 'H. Ahmad Subarkah') : null,
        surveyor_phone: surveyDate ? '081287654321' : null,
        house_ownership: (idCounter % 3 === 0) ? 'Kontrak' : (idCounter % 2 === 0) ? 'Menumpang' : 'Milik Sendiri',
        family_dependents: familyDependents,
        monthly_income: monthlyIncome,
        monthly_expense: monthlyExpense,
        remaining_income: remainingIncome,
        survey_recommendation: stage === 'Ditolak' ? 'Tidak Layak' : 'Layak',
        survey_notes: `Kondisi ekonomi keluarga ${name} membutuhkan dukungan ${program} untuk asnaf ${asnaf}.`,
        application_count: 1,
        beneficiary_count: familyDependents + 1,
        priority: (desil === 1) ? '1' : '2',
        recommended_amount: recommendedAmount,
        approved_amount: approvedAmount,
        mpzis_date: mpzisDate,
        ppd_number: ppdNumber,
        disbursement_date: disbursementDate,
        payment_method: 'Transfer',
        bank_account: bankAccount,
        bank_name: bankName,
        bank_account_name: name,
        asnaf,
        fund_source: 'Zakat',
        distribution_purpose: `Bantuan ${program} kategori asnaf ${asnaf} untuk pemenuhan kebutuhan dasar dhuafa.`,
        parent_occupation: '-',
        desil_score: desil,
        program,
        request_title: `Permohonan Bantuan ${program}`,
        status: stage,
        rejection_reason: stage === 'Ditolak' ? 'Pendapatan melebihi ambang batas desil mustahik zakat' : null,
        house_index: houseIndex,
        asset_index: assetIndex,
        income_index: incomeIndex,
        spiritual_score: spiritualScore,
        overall_score: overallScore,
        notes: `Tercatat dalam sistem penyaluran BAZNAS Kota Tangerang - Tahap: ${stage}`
      });

      idCounter++;
    }
  }

  return list;
}

export const INITIAL_PROGRAM_INITIATIVES = [
  // Tangerang Cerdas (cerdas)
  { pilar_id: 'cerdas', code: 'TC-01', name: 'Beasiswa Pendidikan Dhuafa SD/SMP/SMA', pic: 'Drs. H. Mulyadi', status: 'Aktif', next_milestone: 'Pencairan Beasiswa Tahap II (Sept 2026)', mustahik_target: 3500, mustahik_count: 3120, budget_amount: 3500000000, realized_amount: 2850000000, percentage: 81 },
  { pilar_id: 'cerdas', code: 'TC-02', name: 'Beasiswa Satu Keluarga Satu Sarjana (SKSS)', pic: 'Ust. Farhan Kamil', status: 'Aktif', next_milestone: 'Monev IPK Mahasiswa Semester Genap', mustahik_target: 250, mustahik_count: 240, budget_amount: 2400000000, realized_amount: 1980000000, percentage: 83 },
  { pilar_id: 'cerdas', code: 'TC-03', name: 'Bantuan Seragam & Perlengkapan Sekolah Yatim', pic: 'Siti Fatimah, S.Pd', status: 'Selesai', next_milestone: 'Laporan Pertanggungjawaban Tahap I', mustahik_target: 1500, mustahik_count: 1500, budget_amount: 900000000, realized_amount: 900000000, percentage: 100 },
  { pilar_id: 'cerdas', code: 'TC-04', name: 'Pelatihan Kompetensi & Vokasi Kerja Dhuafa', pic: 'Ir. Hendra Gunawan', status: 'Aktif', next_milestone: 'Uji Sertifikasi BNSP Batch 3', mustahik_target: 400, mustahik_count: 320, budget_amount: 1200000000, realized_amount: 890000000, percentage: 74 },
  { pilar_id: 'cerdas', code: 'TC-05', name: 'Tebus Ijazah Siswa Kurang Mampu', pic: 'Drs. H. Mulyadi', status: 'Aktif', next_milestone: 'Verifikasi Berkas Sekolah Swasta', mustahik_target: 600, mustahik_count: 512, budget_amount: 1800000000, realized_amount: 1420000000, percentage: 79 },

  // Tangerang Makmur (makmur)
  { pilar_id: 'makmur', code: 'TM-01', name: 'Z-Auto: Pemberdayaan Bengkel Motor Mustahik', pic: 'Ir. Bambang S.', status: 'Aktif', next_milestone: 'Pendampingan Manajemen Usaha & Omset', mustahik_target: 120, mustahik_count: 105, budget_amount: 1500000000, realized_amount: 1250000000, percentage: 83 },
  { pilar_id: 'makmur', code: 'TM-02', name: 'Z-Mart: Warung Ritel Dhuafa Mandiri', pic: 'Ahmad Fauzi, M.M', status: 'Aktif', next_milestone: 'Distribusi Pasokan Barang Grosir Tahap 4', mustahik_target: 300, mustahik_count: 265, budget_amount: 2200000000, realized_amount: 1820000000, percentage: 83 },
  { pilar_id: 'makmur', code: 'TM-03', name: 'Gerobak Berkah & Modal Usaha Mikro Kuliner', pic: 'Hj. Ratna Dewi', status: 'Aktif', next_milestone: 'Penyerahan 50 Gerobak Batch 2', mustahik_target: 500, mustahik_count: 430, budget_amount: 2000000000, realized_amount: 1650000000, percentage: 82 },
  { pilar_id: 'makmur', code: 'TM-04', name: 'Kelompok Usaha Bersama (KUBE) Kerajinan & Olahan', pic: 'Ahmad Fauzi, M.M', status: 'Perencanaan', next_milestone: 'Seleksi Kelompok Binaan Baru', mustahik_target: 200, mustahik_count: 50, budget_amount: 800000000, realized_amount: 210000000, percentage: 26 },

  // Tangerang Sehat (sehat)
  { pilar_id: 'sehat', code: 'TS-01', name: 'Layanan Ambulans Tanggap Darurat 24 Jam', pic: 'dr. H. Wahyudi', status: 'Aktif', next_milestone: 'Operasional 4 Armada & Call Center 112', mustahik_target: 2000, mustahik_count: 1850, budget_amount: 1200000000, realized_amount: 1050000000, percentage: 88 },
  { pilar_id: 'sehat', code: 'TS-02', name: 'Bantuan Biaya Pengobatan & Tunggakan BPJS', pic: 'Ns. Siti Maryam', status: 'Aktif', next_milestone: 'Rekonsiliasi RSUD Kota Tangerang', mustahik_target: 1200, mustahik_count: 1080, budget_amount: 2500000000, realized_amount: 2150000000, percentage: 86 },
  { pilar_id: 'sehat', code: 'TS-03', name: 'Khitanan Massal Ceria Yatim & Dhuafa', pic: 'dr. H. Wahyudi', status: 'Selesai', next_milestone: 'Pelaksanaan 500 Anak Libur Sekolah', mustahik_target: 500, mustahik_count: 500, budget_amount: 450000000, realized_amount: 450000000, percentage: 100 },
  { pilar_id: 'sehat', code: 'TS-04', name: 'Paket Nutrisi Cegah Stunting Balita & Ibu Hamil', pic: 'Ns. Siti Maryam', status: 'Aktif', next_milestone: 'Distribusi Susu & Vitamin Posyandu', mustahik_target: 800, mustahik_count: 680, budget_amount: 950000000, realized_amount: 760000000, percentage: 80 },

  // Tangerang Peduli (peduli)
  { pilar_id: 'peduli', code: 'TP-01', name: 'Bedah Rumah Tidak Layak Huni (RTLH)', pic: 'Ir. H. Syarifudin', status: 'Aktif', next_milestone: 'Penyelesaian Konstruksi 25 Unit Tahap 2', mustahik_target: 100, mustahik_count: 78, budget_amount: 3000000000, realized_amount: 2340000000, percentage: 78 },
  { pilar_id: 'peduli', code: 'TP-02', name: 'Tanggap Bencana & Dapur Umum Siaga', pic: 'M. Rizky Saputra', status: 'Aktif', next_milestone: 'Siaga Logistik Musim Penghujan', mustahik_target: 5000, mustahik_count: 4200, budget_amount: 1500000000, realized_amount: 1180000000, percentage: 79 },
  { pilar_id: 'peduli', code: 'TP-03', name: 'Santunan Hidup Lansia & Difabel Sebatang Kara', pic: 'Dra. Hj. Aminah', status: 'Aktif', next_milestone: 'Penyaluran Uang Saku & Sembako Bulanan', mustahik_target: 800, mustahik_count: 750, budget_amount: 1600000000, realized_amount: 1350000000, percentage: 84 },
  { pilar_id: 'peduli', code: 'TP-04', name: 'Paket Ramadhan Bahagia & Idul Fitri', pic: 'M. Rizky Saputra', status: 'Selesai', next_milestone: 'Evaluasi & Laporan Audit Syariah', mustahik_target: 10000, mustahik_count: 10000, budget_amount: 3500000000, realized_amount: 3500000000, percentage: 100 },

  // Tangerang Takwa (takwa)
  { pilar_id: 'takwa', code: 'TT-01', name: 'Bantuan Insentif Guru Ngaji & Marbot Masjid', pic: 'Drs. KH. Syihabuddin', status: 'Aktif', next_milestone: 'Pencairan Insentif Triwulan III', mustahik_target: 2500, mustahik_count: 2300, budget_amount: 3200000000, realized_amount: 2600000000, percentage: 81 },
  { pilar_id: 'takwa', code: 'TT-02', name: 'Pembinaan & Kemandirian Ekonomi Muallaf', pic: 'Ust. Lukman Hakim', status: 'Aktif', next_milestone: 'Pelatihan Keislaman & Usaha Muallaf Center', mustahik_target: 150, mustahik_count: 128, budget_amount: 600000000, realized_amount: 480000000, percentage: 80 },
  { pilar_id: 'takwa', code: 'TT-03', name: 'Renovasi Sanitasi & Sarpras Musholla Pelosok', pic: 'Ir. H. Syarifudin', status: 'Aktif', next_milestone: 'Pengerjaan 15 Musholla di 6 Kecamatan', mustahik_target: 50, mustahik_count: 38, budget_amount: 1200000000, realized_amount: 890000000, percentage: 74 },
  { pilar_id: 'takwa', code: 'TT-04', name: 'Da\'i Pemberdaya Masyarakat Pesisir & Bantaran', pic: 'Ust. Lukman Hakim', status: 'Aktif', next_milestone: 'Halaqah Bulanan Da\'i BAZNAS', mustahik_target: 80, mustahik_count: 75, budget_amount: 800000000, realized_amount: 640000000, percentage: 80 }
];

export const INITIAL_REPORTS = [
  {
    id: 'lap-202608-ringkasan',
    category: 'Ringkasan',
    period: 'Agustus 2026',
    title: 'Rekapitulasi Penyaluran ZIS Bulanan',
    description: 'Laporan eksekutif realisasi penyaluran dana zakat, infak, dan sedekah periode Agustus 2026.',
    scope: '13 Kecamatan · 5 Pilar Program',
    status: 'Siap diekspor',
    file_url: '/api/penyaluran/laporan/export/lap-202608-ringkasan',
    updated_at: '25 Agu 2026',
    metrics_json: JSON.stringify({ totalRealisasi: 29840000000, totalMustahik: 38450, efektivitas: 93.4 })
  },
  {
    id: 'lap-202608-rkat-triwulan',
    category: 'Ringkasan',
    period: 'Triwulan III 2026',
    title: 'Kinerja Capaian Target RKAT Penyaluran',
    description: 'Perbandingan target indikator kinerja penyaluran RKAT 2026 terhadap realisasi operasional.',
    scope: 'Tingkat Kota Tangerang',
    status: 'Perlu pembaruan',
    file_url: '/api/penyaluran/laporan/export/lap-202608-rkat-triwulan',
    updated_at: '24 Agu 2026',
    metrics_json: JSON.stringify({ targetRkat: 32000000000, realisasiRkat: 29840000000, capaian: 93.25 })
  },
  {
    id: 'lap-202608-program-cerdas',
    category: 'Per Program',
    period: 'Agustus 2026',
    title: 'Laporan Realisasi Program Tangerang Cerdas',
    description: 'Rincian penyaluran beasiswa, seragam yatim, dan tebus ijazah santri/siswa dhuafa.',
    scope: 'Pilar Pendidikan · 9.842 Penerima',
    status: 'Siap diekspor',
    file_url: '/api/penyaluran/laporan/export/lap-202608-program-cerdas',
    updated_at: '25 Agu 2026',
    metrics_json: JSON.stringify({ realisasi: 8620000000, mustahik: 9842, subProgram: 5 })
  },
  {
    id: 'lap-202608-program-makmur',
    category: 'Per Program',
    period: 'Agustus 2026',
    title: 'Laporan Realisasi Program Tangerang Makmur',
    description: 'Progres pendistribusian modal usaha Z-Mart, Z-Auto, dan Gerobak Berkah mustahik.',
    scope: 'Pilar Ekonomi & UMKM · 6.120 Penerima',
    status: 'Siap diekspor',
    file_url: '/api/penyaluran/laporan/export/lap-202608-program-makmur',
    updated_at: '25 Agu 2026',
    metrics_json: JSON.stringify({ realisasi: 6480000000, mustahik: 6120, subProgram: 4 })
  },
  {
    id: 'lap-202608-program-sehat',
    category: 'Per Program',
    period: 'Agustus 2026',
    title: 'Laporan Realisasi Program Tangerang Sehat',
    description: 'Cakupan layanan ambulans gratis, bantuan biaya operasi, dan paket nutrisi stunting.',
    scope: 'Pilar Kesehatan · 7.430 Penerima',
    status: 'Siap diekspor',
    file_url: '/api/penyaluran/laporan/export/lap-202608-program-sehat',
    updated_at: '25 Agu 2026',
    metrics_json: JSON.stringify({ realisasi: 5120000000, mustahik: 7430, subProgram: 4 })
  },
  {
    id: 'lap-202608-program-peduli',
    category: 'Per Program',
    period: 'Agustus 2026',
    title: 'Laporan Realisasi Program Tangerang Peduli',
    description: 'Rekapitulasi bantuan RTLH, respon kebencanaan, dan santunan lansia dhuafa.',
    scope: 'Pilar Kemanusiaan · 11.200 Penerima',
    status: 'Siap diekspor',
    file_url: '/api/penyaluran/laporan/export/lap-202608-program-peduli',
    updated_at: '25 Agu 2026',
    metrics_json: JSON.stringify({ realisasi: 6240000000, mustahik: 11200, subProgram: 4 })
  },
  {
    id: 'lap-202608-program-takwa',
    category: 'Per Program',
    period: 'Agustus 2026',
    title: 'Laporan Realisasi Program Tangerang Takwa',
    description: 'Insentif guru ngaji tradisional, pembinaan muallaf, dan renovasi sarana ibadah.',
    scope: 'Pilar Dakwah & Advokasi · 3.858 Penerima',
    status: 'Siap diekspor',
    file_url: '/api/penyaluran/laporan/export/lap-202608-program-takwa',
    updated_at: '25 Agu 2026',
    metrics_json: JSON.stringify({ realisasi: 3380000000, mustahik: 3858, subProgram: 4 })
  },
  {
    id: 'lap-202608-kecamatan-sebaran',
    category: 'Per Kecamatan',
    period: 'Agustus 2026',
    title: 'Distribusi Geospasial 13 Kecamatan',
    description: 'Analisis rasio penerimaan manfaat per kecamatan terhadap tingkat kemiskinan wilayah.',
    scope: '13 Kecamatan Kota Tangerang',
    status: 'Siap diekspor',
    file_url: '/api/penyaluran/laporan/export/lap-202608-kecamatan-sebaran',
    updated_at: '25 Agu 2026',
    metrics_json: JSON.stringify({ totalKecamatan: 13, topKecamatan: 'Cipondoh', pemerataanIndex: 0.91 })
  },
  {
    id: 'lap-202608-asnaf-komposisi',
    category: 'Per Asnaf',
    period: 'Agustus 2026',
    title: 'Laporan Proporsi Penyaluran 8 Asnaf',
    description: 'Kepatuhan syariah proporsi distribusi asnaf Fakir, Miskin, Fisabilillah, Gharim, Ibnu Sabil, Muallaf, Riqab, Amil.',
    scope: 'Audit Kepatuhan Syariah Zakat',
    status: 'Siap diekspor',
    file_url: '/api/penyaluran/laporan/export/lap-202608-asnaf-komposisi',
    updated_at: '25 Agu 2026',
    metrics_json: JSON.stringify({ fakirMiskinPct: 76.5, fisabilillahPct: 11.2, kepatuhanSyariah: '100% Sesuai Fatwa MUI' })
  },
  {
    id: 'lap-202608-keuangan-ppd',
    category: 'Audit & LPJ',
    period: 'Agustus 2026',
    title: 'Buku Kas Pengeluaran Dana Penyaluran (PPD/FPD)',
    description: 'Rekonsiliasi transaksi pencairan bank, nomor formulir F-PKP/03, dan bukti transfer mustahik.',
    scope: 'Divisi Penyaluran & Divisi Keuangan',
    status: 'Siap diekspor',
    file_url: '/api/penyaluran/laporan/export/lap-202608-keuangan-ppd',
    updated_at: '25 Agu 2026',
    metrics_json: JSON.stringify({ totalPpd: 218, totalDisbursed: 29840000000, auditStatus: 'WTP Terverifikasi' })
  }
];
