import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PublicApplicationForm } from './PublicApplicationForm';

const { submitPublicApplication, downloadSuratPermohonan } = vi.hoisted(() => ({ submitPublicApplication: vi.fn(), downloadSuratPermohonan: vi.fn() }));

vi.mock('@/lib/api/client', () => ({
  api: { submitPublicApplication, downloadSuratPermohonan, getPublicMasterData: vi.fn().mockResolvedValue({ success: true, data: [] }) },
}));

describe('PublicApplicationForm', () => {
  beforeEach(() => {
    submitPublicApplication.mockReset();
    downloadSuratPermohonan.mockReset().mockResolvedValue(new Blob(['pdf content'], { type: 'application/pdf' }));
  });

  it('keeps the visitor on the identity step when required fields are empty', async () => {
    render(<PublicApplicationForm />);

    fireEvent.click(screen.getByRole('button', { name: /lanjut/i }));

    expect(screen.getByText(/nama lengkap wajib diisi/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /data pemohon/i })).toBeInTheDocument();
  });

  it('renders the API registration number after a completed submission', async () => {
    submitPublicApplication.mockResolvedValue({
      success: true,
      data: { id: 44, file_no: 'MST-202609-0044' },
    });
    render(<PublicApplicationForm />);

    fireEvent.change(screen.getByLabelText(/nama lengkap/i), { target: { value: 'Siti Aminah' } });
    fireEvent.change(screen.getByLabelText(/^nik/i), { target: { value: '3671012345678901' } });
    fireEvent.change(screen.getByLabelText(/nomor kartu keluarga/i), { target: { value: '3671012345678902' } });
    fireEvent.change(screen.getByLabelText(/whatsapp/i), { target: { value: '081234567890' } });
    fireEvent.click(screen.getByRole('button', { name: /lanjut/i }));
    fireEvent.change(screen.getByLabelText(/alamat domisili/i), { target: { value: 'Jl. Melati No. 1' } });
    fireEvent.click(screen.getByRole('button', { name: /lanjut/i }));
    fireEvent.change(screen.getByLabelText(/uraian kebutuhan/i), { target: { value: 'Bantuan biaya sekolah' } });
    fireEvent.click(screen.getByRole('button', { name: /lanjut/i }));
    fireEvent.change(screen.getByLabelText(/unggah ktp/i), { target: { files: [new File(['ktp'], 'ktp.jpg', { type: 'image/jpeg' })] } });
    fireEvent.change(screen.getByLabelText(/unggah kartu keluarga/i), { target: { files: [new File(['kk'], 'kk.jpg', { type: 'image/jpeg' })] } });
    fireEvent.click(screen.getByRole('button', { name: /lanjut/i }));
    fireEvent.click(screen.getByLabelText(/saya menyatakan/i));
    fireEvent.click(screen.getByRole('button', { name: /kirim pengajuan/i }));

    expect(await screen.findByText('MST-202609-0044')).toBeInTheDocument();
    const submitted = submitPublicApplication.mock.calls[0]![0] as FormData;
    expect(submitted.has('asnaf')).toBe(false);
  });

  it('switches to organization fields and clears individual values', () => {
    render(<PublicApplicationForm />);
    fireEvent.change(screen.getByLabelText(/nama lengkap/i), { target: { value: 'Siti Aminah' } });
    fireEvent.click(screen.getByRole('radio', { name: /lembaga/i }));
    expect(screen.queryByLabelText(/nama lengkap/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/nama lembaga/i)).toHaveValue('');
    expect(screen.getByLabelText(/nama penanggung jawab/i)).toBeInTheDocument();
  });

  it('rejects attachments larger than 5 MB before proceeding', async () => {
    render(<PublicApplicationForm />);
    fireEvent.change(screen.getByLabelText(/nama lengkap/i), { target: { value: 'Siti Aminah' } });
    fireEvent.change(screen.getByLabelText(/^nik/i), { target: { value: '3671012345678901' } });
    fireEvent.change(screen.getByLabelText(/nomor kartu keluarga/i), { target: { value: '3671012345678902' } });
    fireEvent.change(screen.getByLabelText(/whatsapp/i), { target: { value: '081234567890' } });
    fireEvent.click(screen.getByRole('button', { name: /lanjut/i }));
    fireEvent.change(screen.getByLabelText(/alamat domisili/i), { target: { value: 'Jalan Melati 1' } });
    fireEvent.click(screen.getByRole('button', { name: /lanjut/i }));
    fireEvent.change(screen.getByLabelText(/uraian kebutuhan/i), { target: { value: 'Bantuan biaya sekolah' } });
    fireEvent.click(screen.getByRole('button', { name: /lanjut/i }));
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'besar.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/unggah ktp/i), { target: { files: [oversized] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/besar\.pdf.*melebihi batas 5 mb/i);
    expect(submitPublicApplication).not.toHaveBeenCalled();
  });

  it('downloads a letter populated from the latest draft values', async () => {
    const createObjectURL = vi.fn(() => 'blob:letter');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<PublicApplicationForm />);
    fireEvent.change(screen.getByLabelText(/nama lengkap/i), { target: { value: 'Siti Aminah' } });
    fireEvent.change(screen.getByLabelText(/nomor kartu keluarga/i), { target: { value: '3671012345678902' } });
    fireEvent.change(screen.getByLabelText(/^nik/i), { target: { value: '3671012345678901' } });
    fireEvent.change(screen.getByLabelText(/whatsapp/i), { target: { value: '081234567890' } });
    fireEvent.click(screen.getByRole('button', { name: /lanjut/i }));
    fireEvent.change(screen.getByLabelText(/alamat domisili/i), { target: { value: 'Jl. Melati 1' } });
    fireEvent.click(screen.getByRole('button', { name: /lanjut/i }));
    fireEvent.change(screen.getByLabelText(/uraian kebutuhan/i), { target: { value: 'Biaya sekolah' } });
    fireEvent.change(screen.getByLabelText(/usulan anggaran/i), { target: { value: '1500000' } });
    fireEvent.change(screen.getByLabelText(/deskripsi kondisi ekonomi/i), { target: { value: 'Penghasilan tidak tetap' } });
    fireEvent.click(screen.getByRole('button', { name: /unduh surat permohonan/i }));
    expect(await screen.findByRole('button', { name: /unduh surat permohonan/i })).toBeInTheDocument();
    expect(downloadSuratPermohonan).toHaveBeenCalledWith(expect.objectContaining({ name: 'Siti Aminah', address: 'Jl. Melati 1', request_title: 'Biaya sekolah', proposed_amount: '1500000', notes: 'Penghasilan tidak tetap' }));
    expect(click).toHaveBeenCalled();
  });

  it('validates and submits an organization application without individual fields', async () => {
    submitPublicApplication.mockResolvedValue({ success: true, data: { id: 45, file_no: 'MST-ORG-0045' } });
    render(<PublicApplicationForm />);
    fireEvent.click(screen.getByRole('radio', { name: /lembaga/i }));
    fireEvent.change(screen.getByLabelText(/nama lembaga/i), { target: { value: 'Yayasan Harapan' } });
    fireEvent.change(screen.getByLabelText(/nama penanggung jawab/i), { target: { value: 'Budi' } });
    fireEvent.change(screen.getByLabelText(/nik penanggung jawab/i), { target: { value: '3671012345678901' } });
    fireEvent.change(screen.getByLabelText(/whatsapp penanggung jawab/i), { target: { value: '081234567890' } });
    fireEvent.click(screen.getByRole('button', { name: /lanjut/i }));
    fireEvent.change(screen.getByLabelText(/alamat sekretariat/i), { target: { value: 'Jl. Kantor 2' } });
    fireEvent.click(screen.getByRole('button', { name: /lanjut/i }));
    fireEvent.change(screen.getByLabelText(/uraian kebutuhan/i), { target: { value: 'Bantuan operasional' } });
    fireEvent.click(screen.getByRole('button', { name: /lanjut/i }));
    fireEvent.change(screen.getByLabelText(/ktp penanggung jawab/i), { target: { files: [new File(['ktp'], 'ktp.png', { type: 'image/png' })] } });
    fireEvent.click(screen.getByRole('button', { name: /lanjut/i }));
    fireEvent.click(screen.getByLabelText(/saya menyatakan/i));
    fireEvent.click(screen.getByRole('button', { name: /kirim pengajuan/i }));
    expect(await screen.findByText('MST-ORG-0045')).toBeInTheDocument();
    const submitted = submitPublicApplication.mock.calls[0]![0] as FormData;
    expect(submitted.get('applicant_status')).toBe('Lembaga');
    expect(submitted.get('beneficiary_name')).toBe('Yayasan Harapan');
    expect(submitted.has('kk_number')).toBe(false);
    expect(submitted.has('asnaf')).toBe(false);
  });
});
