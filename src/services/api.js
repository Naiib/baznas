const API_URL = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? '/api' : 'http://localhost:3001/api');

function getAuthToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('baznas_auth_token');
}

async function fetchJson(url, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_URL}${url}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Network error' }));
    throw new Error(err.message || `HTTP ${response.status}`);
  }
  return response.json();
}

export const api = {
  // Authentication Methods
  login: (credentials) => fetchJson('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  getMe: () => fetchJson('/auth/me'),
  logout: () => fetchJson('/auth/logout', { method: 'POST' }),
  listUsers: () => fetchJson('/auth/users'),
  // Public Portal Methods
  submitPublicApplication: async (formData) => {
    // If formData is an instance of FormData, send as multipart/form-data
    if (formData instanceof FormData) {
      const response = await fetch(`${API_URL}/public/pengajuan`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Gagal mengajukan permohonan' }));
        throw new Error(err.message || `HTTP ${response.status}`);
      }
      return response.json();
    }
    return fetchJson('/public/pengajuan', { method: 'POST', body: JSON.stringify(formData) });
  },

  trackApplication: async (query) => {
    try {
      const trimmed = query?.trim();
      const list = await fetchJson('/mustahik');
      if (!list?.data) return { success: false, message: 'Data tidak ditemukan' };
      const found = list.data.find(
        (m) =>
          (m.file_no && m.file_no.toLowerCase() === trimmed.toLowerCase()) ||
          (m.nik && m.nik === trimmed) ||
          (m.phone && m.phone === trimmed) ||
          (m.name && m.name.toLowerCase().includes(trimmed.toLowerCase()))
      );
      if (found) {
        const detail = await fetchJson(`/mustahik/${found.id}`);
        return { success: true, data: detail.data || found };
      }
      return { success: false, message: 'Permohonan dengan No. Berkas / NIK tersebut tidak ditemukan.' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  // Backoffice Mustahik CRUD
  listMustahik: () => fetchJson('/mustahik'),
  getMustahik: (id) => fetchJson(`/mustahik/${id}`),
  createMustahik: (data) => fetchJson('/mustahik', { method: 'POST', body: JSON.stringify(data) }),
  updateMustahik: (id, data) => fetchJson(`/mustahik/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMustahik: (id) => fetchJson(`/mustahik/${id}`, { method: 'DELETE' }),

  // Workflow Phases (Assessment, MPZIS, PPD)
  addAssessment: (mustahikId, data) =>
    fetchJson(`/mustahik/${mustahikId}/assessments`, { method: 'POST', body: JSON.stringify(data) }),

  addMpzis: (mustahikId, data) =>
    fetchJson(`/mustahik/${mustahikId}/mpzis`, { method: 'POST', body: JSON.stringify({ ...data, mustahik_id: mustahikId }) }),

  addPpd: (mustahikId, data) =>
    fetchJson(`/mustahik/${mustahikId}/ppd`, { method: 'POST', body: JSON.stringify({ ...data, mustahik_id: mustahikId }) }),

  // Documents
  uploadDocument: (formData) =>
    fetch(`${API_URL}/upload`, {
      method: 'POST',
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Gagal mengupload dokumen' }));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      return res.json();
    }),

  addDocument: (mustahikId, docData) =>
    fetchJson(`/mustahik/${mustahikId}/documents`, { method: 'POST', body: JSON.stringify(docData) }),

  getDocuments: (mustahikId) => fetchJson(`/mustahik/${mustahikId}/documents`),

  // WhatsApp Notification Generation & Trigger
  sendWhatsAppNotification: async (mustahikId, phase, customNotes = '') => {
    // 5-Phase automated notification message templates
    const templates = {
      diajukan: (m) =>
        `*BAZNAS Data Center - Konfirmasi Pengajuan Bantuan*\n\n` +
        `Assalamu'alaikum Wr. Wb. Yth. *${m.name}*,\n` +
        `Pengajuan permohonan bantuan Anda untuk program *${m.program || 'BAZNAS'}* telah kami terima di sistem dengan nomor registrasi berkas:\n` +
        `📄 *No. Berkas:* ${m.file_no || 'MST-' + m.id}\n` +
        `📅 *Tanggal:* ${m.received_date || new Date().toLocaleDateString('id-ID')}\n\n` +
        `Status saat ini: *Menunggu Verifikasi Administrasi*.\n` +
        (customNotes ? `Catatan: ${customNotes}\n\n` : '') +
        `Pantau progress pengajuan Anda secara berkala melalui portal resmi BAZNAS.\nWassalamu'alaikum Wr. Wb.`,

      administrasi: (m) =>
        `*BAZNAS Data Center - Update Verifikasi Administrasi*\n\n` +
        `Assalamu'alaikum Wr. Wb. Yth. *${m.name}*,\n` +
        `Dokumen administrasi Anda untuk berkas *${m.file_no || 'MST-' + m.id}* telah *Diverifikasi & Dinyatakan Lengkap*.\n\n` +
        `Tahap selanjutnya adalah *Penjadwalan Survey Lapangan (F-BPP/04)* oleh tim verifikator BAZNAS.\n` +
        (customNotes ? `Catatan Khusus: ${customNotes}\n\n` : '') +
        `Mohon pastikan nomor telepon ini tetap aktif.\nWassalamu'alaikum Wr. Wb.`,

      survey: (m) =>
        `*BAZNAS Data Center - Pemberitahuan Survey Lapangan*\n\n` +
        `Assalamu'alaikum Wr. Wb. Yth. *${m.name}*,\n` +
        `Tim Verifikator Lapangan BAZNAS telah menjadwalkan / menyelesaikan assessment survey faktual (F-BPP/04) untuk berkas *${m.file_no || 'MST-' + m.id}*.\n\n` +
        `Status: *Survey Selesai & Masuk Sidang Pleno / MPZIS*.\n` +
        (customNotes ? `Catatan: ${customNotes}\n\n` : '') +
        `Terima kasih atas kerja samanya.\nWassalamu'alaikum Wr. Wb.`,

      mpzis: (m) =>
        `*BAZNAS Data Center - Persetujuan Bantuan (MPZIS)*\n\n` +
        `Assalamu'alaikum Wr. Wb. Yth. *${m.name}*,\n` +
        `Alhamdulillah, permohonan bantuan Anda dengan No. Berkas *${m.file_no || 'MST-' + m.id}* telah *DISETUJUI* dalam Sidang Pertimbangan MPZIS BAZNAS.\n\n` +
        `💵 *Nominal Bantuan Disetujui:* Rp ${(Number(m.approved_amount || m.recommended_amount || 0)).toLocaleString('id-ID')}\n` +
        `🏷️ *Program:* ${m.program || 'Penyaluran Zakat'}\n\n` +
        `Saat ini berkas sedang diproses pada bagian Keuangan untuk penerbitan Formulir Pengajuan Dana (PPD).\nWassalamu'alaikum Wr. Wb.`,

      penyaluran: (m) =>
        `*BAZNAS Data Center - Penyaluran Bantuan Selesai*\n\n` +
        `Assalamu'alaikum Wr. Wb. Yth. *${m.name}*,\n` +
        `Alhamdulillah, dana bantuan BAZNAS dengan No. Berkas *${m.file_no || 'MST-' + m.id}* sebesar *Rp ${(Number(m.approved_amount || 0)).toLocaleString('id-ID')}* telah *SELESAI DISALURKAN*.\n\n` +
        `💳 *Metode:* ${m.payment_method || 'Transfer Bank'} ${m.bank_name ? `(${m.bank_name} - ${m.bank_account})` : ''}\n` +
        (customNotes ? `Catatan: ${customNotes}\n\n` : '') +
        `Semoga bantuan ini membawa keberkahan dan manfaat bagi Bapak/Ibu sekeluarga. Aamiin ya Rabbal 'Alamin.\nWassalamu'alaikum Wr. Wb.`,
    };

    let detail;
    try {
      const res = await api.getMustahik(mustahikId);
      detail = res.data;
    } catch {
      detail = { id: mustahikId, name: 'Mustahik' };
    }

    const generator = templates[phase.toLowerCase()] || templates.diajukan;
    const message = generator(detail);
    const rawPhone = detail.phone || '';
    let formattedPhone = rawPhone.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '62' + formattedPhone.slice(1);
    }

    const waUrl = formattedPhone
      ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`
      : null;

    return {
      success: true,
      message,
      phone: formattedPhone,
      waUrl,
    };
  },

  // Export 60-Column Master BAZNAS Spreadsheet
  exportMustahikData: (mustahikList = []) => {
    const headers = [
      'No', 'No. Berkas', 'Tanggal Terima', 'Nama Lengkap', 'Nama Penerima Manfaat', 'NIK', 'No. KK',
      'No. HP / WhatsApp', 'Status Perkawinan', 'Tanggal Lahir', 'Alamat Lengkap', 'RT / RW', 'Kelurahan / Desa',
      'Kecamatan', 'Kabupaten / Kota', 'Provinsi', 'Pekerjaan', 'Pendidikan Terakhir', 'Kepemilikan Rumah',
      'Jumlah Tanggungan', 'Pendapatan Bulanan (Rp)', 'Pengeluaran Bulanan (Rp)', 'Golongan Asnaf',
      'Program Bantuan', 'Uraian Pengajuan', 'Status Terkini', 'Skor Prioritas', 'Nominal Rekomendasi Survey (Rp)',
      'Nominal Disetujui MPZIS (Rp)', 'Metode Penyaluran', 'Nama Bank', 'No. Rekening', 'Atas Nama Rekening',
      'Status Survey', 'Surveyor', 'Tgl Survey', 'Indeks Rumah', 'Indeks Aset', 'Indeks Pendapatan',
      'Rekomendasi Survey', 'Catatan Survey', 'No. Form MPZIS', 'Tgl MPZIS', 'Klasifikasi MPZIS',
      'Sumber Dana Zakat', 'No. Form PPD', 'No. Transaksi Kas', 'Pemohon Dana (PPD)', 'Tgl Pencairan',
      'Created At', 'Updated At'
    ];

    const rows = mustahikList.map((m, idx) => [
      idx + 1,
      m.file_no || `MST-${String(m.id).padStart(3, '0')}`,
      m.received_date || '-',
      m.name || '-',
      m.beneficiary_name || m.name || '-',
      m.nik ? `'${m.nik}` : '-',
      m.kk_number ? `'${m.kk_number}` : '-',
      m.phone || '-',
      m.marital_status || '-',
      m.dob || '-',
      m.address || '-',
      m.rt_rw || '-',
      m.kelurahan || '-',
      m.kecamatan || '-',
      m.kabupaten_kota || 'Tangerang',
      m.province || 'Banten',
      m.occupation || '-',
      m.education_level || '-',
      m.house_ownership || '-',
      m.family_dependents || 0,
      m.monthly_income || 0,
      m.monthly_expense || 0,
      m.asnaf || 'Miskin',
      m.program || 'Kemanusiaan',
      m.request_title || '-',
      m.status || 'Diajukan',
      m.priority || 'Prioritas 2',
      m.recommended_amount || 0,
      m.approved_amount || 0,
      m.payment_method || 'Transfer',
      m.bank_name || '-',
      m.bank_account ? `'${m.bank_account}` : '-',
      m.bank_account_name || '-',
      m.assessments?.length > 0 ? 'Sudah Survey' : 'Belum Survey',
      m.assessments?.[0]?.surveyor_name || '-',
      m.assessments?.[0]?.survey_date || '-',
      m.assessments?.[0]?.house_index || '-',
      m.assessments?.[0]?.asset_index || '-',
      m.assessments?.[0]?.income_index || '-',
      m.assessments?.[0]?.recommendation || '-',
      m.assessments?.[0]?.notes || '-',
      m.applications?.[0]?.mpzis?.[0]?.form_number || '-',
      m.applications?.[0]?.mpzis?.[0]?.mpzis_date || '-',
      m.applications?.[0]?.mpzis?.[0]?.program_classification || '-',
      m.applications?.[0]?.mpzis?.[0]?.fund_source || 'Zakat Maal',
      m.applications?.[0]?.ppd?.[0]?.form_number || '-',
      m.applications?.[0]?.ppd?.[0]?.transaction_number || '-',
      m.applications?.[0]?.ppd?.[0]?.requester_name || '-',
      m.status === 'Penyaluran Selesai' ? (m.updated_at || '-') : '-',
      m.created_at || '-',
      m.updated_at || '-',
    ]);

    const csvContent = [
      headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Master_Data_Mustahik_BAZNAS_60Kolom_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return { success: true, count: mustahikList.length };
  },
};

