'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api/client';
import type { PilarProgramData } from '@/lib/api/types';
import {
  Users,
  Store,
  Heart,
  Landmark,
  Shield,
  Check,
  Wallet,
  ClipboardList,
  CheckCircle2,
  ArrowRight,
  Stethoscope,
  FileText,
  MapPin,
  Target,
  Award,
  Layers,
  Plus,
  Search,
  X,
  Loader2,
} from 'lucide-react';

interface PilarCardData {
  id: string;
  pilarNum: string;
  name: string;
  category: string;
  amount: string;
  rawAmount: number;
  rawBudget: number;
  percentage: number;
  beneficiaries: string;
  color: string;
  areaGradient: string;
  iconBg: string;
  icon: typeof Users;
  sparklinePoints: string;
  areaPoints: string;
  impactDesc: string;
  metrics: {
    primaryLabel: string;
    primaryValue: string;
    primaryGrowth: string;
    successLabel: string;
    successValue: string;
    successRate: string;
    avgLabel: string;
    avgValue: string;
    progLabel: string;
    progValue: string;
    districtLabel: string;
    districtValue: string;
    newLabel: string;
    newValue: string;
  };
  monthlyBars: { m: string; realisasi: number; target: number; active: boolean }[];
  asnafBreakdown: { name: string; count: string; pct: string; color: string }[];
  topKecamatan: { rank: number; name: string; count: string; pct: string }[];
  subPrograms: {
    code: string;
    name: string;
    pic: string;
    status: string;
    nextMilestone: string;
    mustahik: string;
    realized: string;
    pct: number;
  }[];
}

const formatMiliar = (value: number) =>
  `Rp ${(value / 1_000_000_000).toLocaleString('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} M`;

const PILAR_CARDS: PilarCardData[] = [
  {
    id: 'cerdas',
    pilarNum: '1',
    name: 'Tangerang Cerdas',
    category: 'Pendidikan & Beasiswa',
    amount: 'Rp 8,62 M',
    rawAmount: 8_620_000_000,
    rawBudget: 11_800_000_000,
    percentage: 73,
    beneficiaries: '9.842 penerima manfaat',
    color: '#2563eb',
    areaGradient: 'rgba(37, 99, 235, 0.12)',
    iconBg: 'bg-blue-600',
    icon: Users,
    sparklinePoints: '0,18 15,16 30,13 45,15 60,10 75,12 90,6 100,4',
    areaPoints: '0,18 15,16 30,13 45,15 60,10 75,12 90,6 100,4 100,26 0,26',
    impactDesc: 'Pendidikan merata, angka putus sekolah tertekan drastis, dan lahir sarjana mandiri.',
    metrics: {
      primaryLabel: 'Siswa / Mahasiswa Terbantu',
      primaryValue: '9.842',
      primaryGrowth: '+14,2%',
      successLabel: 'Lulusan Terfasilitasi',
      successValue: '8.660',
      successRate: '88%',
      avgLabel: 'Rata-rata Beasiswa',
      avgValue: 'Rp 875 rb',
      progLabel: 'Sub-Program Aktif',
      progValue: '14 Program',
      districtLabel: 'Kecamatan Terjangkau',
      districtValue: '13 / 13',
      newLabel: 'Penerima Beasiswa Baru',
      newValue: '2.410 Jiwa',
    },
    monthlyBars: [
      { m: 'Jan', realisasi: 45, target: 60, active: true },
      { m: 'Feb', realisasi: 58, target: 65, active: true },
      { m: 'Mar', realisasi: 72, target: 70, active: true },
      { m: 'Apr', realisasi: 85, target: 75, active: true },
      { m: 'Mei', realisasi: 94, target: 80, active: true },
      { m: 'Jun', realisasi: 90, target: 80, active: true },
      { m: 'Jul', realisasi: 82, target: 75, active: true },
      { m: 'Agu', realisasi: 88, target: 75, active: true },
      { m: 'Sep', realisasi: 0, target: 75, active: false },
      { m: 'Okt', realisasi: 0, target: 75, active: false },
      { m: 'Nov', realisasi: 0, target: 75, active: false },
      { m: 'Des', realisasi: 0, target: 75, active: false },
    ],
    asnafBreakdown: [
      { name: 'Miskin', count: '4.250', pct: '43%', color: '#d97706' },
      { name: 'Fakir', count: '3.120', pct: '32%', color: '#e11d48' },
      { name: 'Fisabilillah', count: '1.450', pct: '15%', color: '#059669' },
      { name: 'Ibnu Sabil', count: '680', pct: '7%', color: '#2563eb' },
      { name: 'Mualaf', count: '342', pct: '3%', color: '#0d9488' },
    ],
    topKecamatan: [
      { rank: 1, name: 'Karawaci', count: '1.980', pct: '20%' },
      { rank: 2, name: 'Ciledug', count: '1.720', pct: '17%' },
      { rank: 3, name: 'Cipondoh', count: '1.540', pct: '16%' },
      { rank: 4, name: 'Batuceper', count: '1.380', pct: '14%' },
      { rank: 5, name: 'Periuk', count: '1.150', pct: '12%' },
    ],
    subPrograms: [
      { code: 'TC-01', name: 'Beasiswa Satu Keluarga Satu Sarjana (SKSS)', pic: 'Divisi Pendidikan & UPZ', status: 'Berjalan', nextMilestone: '10 Sep 2026', mustahik: '1.200', realized: 'Rp 2,95 M', pct: 84 },
      { code: 'TC-02', name: 'Penebusan Ijazah & Tunggakan SPP Siswa Dhuafa', pic: 'Divisi Pendidikan', status: 'Berjalan', nextMilestone: '15 Sep 2026', mustahik: '4.200', realized: 'Rp 2,65 M', pct: 83 },
      { code: 'TC-03', name: 'Insentif Guru Ngaji & Marbot Al-Qur’an', pic: 'Bidang Penyaluran', status: 'Berjalan', nextMilestone: '25 Agu 2026', mustahik: '3.100', realized: 'Rp 2,15 M', pct: 72 },
      { code: 'TC-04', name: 'Digitalisasi Lab Komputer Santri Pesantren', pic: 'Divisi Pendidikan & IT', status: 'Berjalan', nextMilestone: '30 Sep 2026', mustahik: '1.342', realized: 'Rp 0,87 M', pct: 64 },
    ],
  },
  {
    id: 'makmur',
    pilarNum: '2',
    name: 'Tangerang Makmur',
    category: 'Pemberdayaan Ekonomi & UMKM',
    amount: 'Rp 7,48 M',
    rawAmount: 7_480_000_000,
    rawBudget: 11_300_000_000,
    percentage: 66,
    beneficiaries: '8.306 penerima manfaat',
    color: '#d97706',
    areaGradient: 'rgba(217, 119, 6, 0.12)',
    iconBg: 'bg-amber-600',
    icon: Store,
    sparklinePoints: '0,20 15,18 30,15 45,17 60,12 75,13 90,8 100,6',
    areaPoints: '0,20 15,18 30,15 45,17 60,12 75,13 90,8 100,6 100,26 0,26',
    impactDesc: 'Mustahik mandiri menjadi muzakki, usaha mikro naik kelas, daya beli meningkat.',
    metrics: {
      primaryLabel: 'Pelaku Usaha Mikro Binaan',
      primaryValue: '8.306',
      primaryGrowth: '+21,4%',
      successLabel: 'Graduasi Mandiri',
      successValue: '6.561',
      successRate: '79%',
      avgLabel: 'Rata-rata Modal',
      avgValue: 'Rp 900 rb',
      progLabel: 'Sub-Program Aktif',
      progValue: '12 Program',
      districtLabel: 'Kecamatan Terjangkau',
      districtValue: '13 / 13',
      newLabel: 'Wirausaha Binaan Baru',
      newValue: '1.980 Jiwa',
    },
    monthlyBars: [
      { m: 'Jan', realisasi: 35, target: 55, active: true },
      { m: 'Feb', realisasi: 46, target: 60, active: true },
      { m: 'Mar', realisasi: 60, target: 65, active: true },
      { m: 'Apr', realisasi: 72, target: 70, active: true },
      { m: 'Mei', realisasi: 80, target: 75, active: true },
      { m: 'Jun', realisasi: 85, target: 75, active: true },
      { m: 'Jul', realisasi: 78, target: 70, active: true },
      { m: 'Agu', realisasi: 82, target: 70, active: true },
      { m: 'Sep', realisasi: 0, target: 70, active: false },
      { m: 'Okt', realisasi: 0, target: 70, active: false },
      { m: 'Nov', realisasi: 0, target: 70, active: false },
      { m: 'Des', realisasi: 0, target: 70, active: false },
    ],
    asnafBreakdown: [
      { name: 'Miskin', count: '4.980', pct: '60%', color: '#d97706' },
      { name: 'Fakir', count: '2.150', pct: '26%', color: '#e11d48' },
      { name: 'Mualaf', count: '650', pct: '8%', color: '#0d9488' },
      { name: 'Gharimin', count: '526', pct: '6%', color: '#7c3aed' },
    ],
    topKecamatan: [
      { rank: 1, name: 'Tangerang', count: '1.840', pct: '22%' },
      { rank: 2, name: 'Jatiuwung', count: '1.650', pct: '20%' },
      { rank: 3, name: 'Cipondoh', count: '1.420', pct: '17%' },
      { rank: 4, name: 'Ciledug', count: '1.280', pct: '15%' },
      { rank: 5, name: 'Larangan', count: '1.120', pct: '13%' },
    ],
    subPrograms: [
      { code: 'TM-01', name: 'Bantuan Modal Usaha Bergulir Z-Mart', pic: 'Divisi Pemberdayaan', status: 'Berjalan', nextMilestone: '12 Sep 2026', mustahik: '3.400', realized: 'Rp 2,45 M', pct: 77 },
      { code: 'TM-02', name: 'Gerobak Kuliner Berkah & Booth Usaha', pic: 'Divisi Pemberdayaan', status: 'Berjalan', nextMilestone: '18 Sep 2026', mustahik: '2.100', realized: 'Rp 1,85 M', pct: 71 },
      { code: 'TM-03', name: 'Pelatihan Vokasi & Bengkel Z-Auto', pic: 'Divisi Pelatihan', status: 'Berjalan', nextMilestone: '22 Sep 2026', mustahik: '1.600', realized: 'Rp 1,35 M', pct: 61 },
      { code: 'TM-04', name: 'Binaan Pertanian & Perikanan Perkotaan', pic: 'Divisi Pemberdayaan', status: 'Berjalan', nextMilestone: '30 Sep 2026', mustahik: '1.206', realized: 'Rp 0,82 M', pct: 45 },
    ],
  },
  {
    id: 'sehat',
    pilarNum: '3',
    name: 'Tangerang Sehat',
    category: 'Kesehatan & Layanan Medis',
    amount: 'Rp 9,21 M',
    rawAmount: 9_210_000_000,
    rawBudget: 11_000_000_000,
    percentage: 84,
    beneficiaries: '12.374 penerima manfaat',
    color: '#008B5A',
    areaGradient: 'rgba(0, 139, 90, 0.15)',
    iconBg: 'bg-[#008B5A]',
    icon: Heart,
    sparklinePoints: '0,17 15,14 30,11 45,13 60,7 75,9 90,4 100,2',
    areaPoints: '0,17 15,14 30,11 45,13 60,7 75,9 90,4 100,2 100,26 0,26',
    impactDesc: 'Kesehatan mustahik meningkat, beban biaya operasi/rawat inap teratasi tuntas.',
    metrics: {
      primaryLabel: 'Pasien Mustahik Dilayani',
      primaryValue: '12.374',
      primaryGrowth: '+18,6%',
      successLabel: 'Intervensi Sukses',
      successValue: '8.921',
      successRate: '72%',
      avgLabel: 'Rata-rata Bantuan',
      avgValue: 'Rp 744 rb',
      progLabel: 'Sub-Program Aktif',
      progValue: '18 Program',
      districtLabel: 'Kecamatan Terjangkau',
      districtValue: '13 / 13',
      newLabel: 'Pasien Mustahik Baru',
      newValue: '3.214 Jiwa',
    },
    monthlyBars: [
      { m: 'Jan', realisasi: 52, target: 75, active: true },
      { m: 'Feb', realisasi: 68, target: 80, active: true },
      { m: 'Mar', realisasi: 85, target: 85, active: true },
      { m: 'Apr', realisasi: 98, target: 90, active: true },
      { m: 'Mei', realisasi: 108, target: 95, active: true },
      { m: 'Jun', realisasi: 112, target: 95, active: true },
      { m: 'Jul', realisasi: 104, target: 90, active: true },
      { m: 'Agu', realisasi: 115, target: 90, active: true },
      { m: 'Sep', realisasi: 0, target: 90, active: false },
      { m: 'Okt', realisasi: 0, target: 90, active: false },
      { m: 'Nov', realisasi: 0, target: 90, active: false },
      { m: 'Des', realisasi: 0, target: 90, active: false },
    ],
    asnafBreakdown: [
      { name: 'Fakir', count: '4.128', pct: '33%', color: '#e11d48' },
      { name: 'Miskin', count: '4.046', pct: '33%', color: '#d97706' },
      { name: 'Amil', count: '1.511', pct: '12%', color: '#2563eb' },
      { name: 'Mualaf', count: '1.187', pct: '10%', color: '#0d9488' },
      { name: 'Gharimin', count: '769', pct: '6%', color: '#7c3aed' },
      { name: 'Lainnya', count: '733', pct: '6%', color: '#64748b' },
    ],
    topKecamatan: [
      { rank: 1, name: 'Karawaci', count: '2.186', pct: '18%' },
      { rank: 2, name: 'Ciledug', count: '1.846', pct: '15%' },
      { rank: 3, name: 'Cipondoh', count: '1.672', pct: '14%' },
      { rank: 4, name: 'Batuceper', count: '1.435', pct: '12%' },
      { rank: 5, name: 'Periuk', count: '1.221', pct: '10%' },
    ],
    subPrograms: [
      { code: 'TS-01', name: 'Klinik Mustahik (Layanan Primer & Obat)', pic: 'UPZ Kesehatan & Klinik', status: 'Berjalan', nextMilestone: '30 Agu 2026', mustahik: '4.982', realized: 'Rp 3,42 M', pct: 82 },
      { code: 'TS-02', name: 'Bantuan Pengobatan & Operasi di RSU Mitra', pic: 'UPZ Kesehatan', status: 'Berjalan', nextMilestone: '05 Sep 2026', mustahik: '3.765', realized: 'Rp 2,68 M', pct: 84 },
      { code: 'TS-03', name: 'Intervensi Gizi Ibu Hamil & Balita Stunting', pic: 'PKK & UPZ Kesehatan', status: 'Berjalan', nextMilestone: '12 Sep 2026', mustahik: '2.143', realized: 'Rp 1,56 M', pct: 79 },
      { code: 'TS-04', name: 'Layanan Ambulans Medis Gratis 24 Jam', pic: 'Divisi Relawan & BTB', status: 'Berjalan', nextMilestone: '01 Sep 2026', mustahik: '1.484', realized: 'Rp 0,89 M', pct: 91 },
    ],
  },
  {
    id: 'beriman',
    pilarNum: '4',
    name: 'Tangerang Takwa',
    category: 'Dakwah & Advokasi Keumatan',
    amount: 'Rp 6,17 M',
    rawAmount: 6_170_000_000,
    rawBudget: 10_100_000_000,
    percentage: 61,
    beneficiaries: '6.501 penerima manfaat',
    color: '#7c3aed',
    areaGradient: 'rgba(124, 58, 237, 0.12)',
    iconBg: 'bg-purple-700',
    icon: Landmark,
    sparklinePoints: '0,22 15,20 30,18 45,16 60,14 75,15 90,11 100,9',
    areaPoints: '0,22 15,20 30,18 45,16 60,14 75,15 90,11 100,9 100,26 0,26',
    impactDesc: 'Syiar Islam semarak, sarana ibadah layak, pembinaan aqidah mualaf rutin terpantau.',
    metrics: {
      primaryLabel: 'Penerima Manfaat Dakwah',
      primaryValue: '6.501',
      primaryGrowth: '+12,5%',
      successLabel: 'Jamaah Terbina',
      successValue: '5.915',
      successRate: '91%',
      avgLabel: 'Rata-rata Kafalah',
      avgValue: 'Rp 950 rb',
      progLabel: 'Sub-Program Aktif',
      progValue: '10 Program',
      districtLabel: 'Kecamatan Terjangkau',
      districtValue: '13 / 13',
      newLabel: 'Mualaf & Santri Baru',
      newValue: '1.420 Jiwa',
    },
    monthlyBars: [
      { m: 'Jan', realisasi: 30, target: 50, active: true },
      { m: 'Feb', realisasi: 42, target: 55, active: true },
      { m: 'Mar', realisasi: 55, target: 60, active: true },
      { m: 'Apr', realisasi: 68, target: 65, active: true },
      { m: 'Mei', realisasi: 74, target: 65, active: true },
      { m: 'Jun', realisasi: 70, target: 65, active: true },
      { m: 'Jul', realisasi: 64, target: 60, active: true },
      { m: 'Agu', realisasi: 68, target: 60, active: true },
      { m: 'Sep', realisasi: 0, target: 60, active: false },
      { m: 'Okt', realisasi: 0, target: 60, active: false },
      { m: 'Nov', realisasi: 0, target: 60, active: false },
      { m: 'Des', realisasi: 0, target: 60, active: false },
    ],
    asnafBreakdown: [
      { name: 'Fisabilillah', count: '3.650', pct: '56%', color: '#059669' },
      { name: 'Mualaf', count: '1.450', pct: '22%', color: '#0d9488' },
      { name: 'Fakir', count: '880', pct: '14%', color: '#e11d48' },
      { name: 'Ibnu Sabil', count: '521', pct: '8%', color: '#2563eb' },
    ],
    topKecamatan: [
      { rank: 1, name: 'Pinang', count: '1.480', pct: '23%' },
      { rank: 2, name: 'Cipondoh', count: '1.380', pct: '21%' },
      { rank: 3, name: 'Tangerang', count: '1.250', pct: '19%' },
      { rank: 4, name: 'Karawaci', count: '1.180', pct: '18%' },
      { rank: 5, name: 'Benda', count: '1.011', pct: '16%' },
    ],
    subPrograms: [
      { code: 'TT-01', name: 'Renovasi Sanitasi & Wudhu Musholla', pic: 'Divisi Sarpras & Dakwah', status: 'Berjalan', nextMilestone: '14 Sep 2026', mustahik: '1.850', realized: 'Rp 2,25 M', pct: 75 },
      { code: 'TT-02', name: 'Bimbingan Aqidah Mualaf Center', pic: 'Mualaf Center BAZNAS', status: 'Berjalan', nextMilestone: '20 Sep 2026', mustahik: '1.450', realized: 'Rp 1,48 M', pct: 68 },
      { code: 'TT-03', name: 'Kafalah Guru Ngaji & Da’i Perkotaan', pic: 'Bidang Penyaluran', status: 'Berjalan', nextMilestone: '28 Agu 2026', mustahik: '2.100', realized: 'Rp 1,35 M', pct: 64 },
      { code: 'TT-04', name: 'Beasiswa Santri Kader Ulama & Tahfidz', pic: 'Divisi Pendidikan', status: 'Berjalan', nextMilestone: '05 Okt 2026', mustahik: '1.101', realized: 'Rp 0,69 M', pct: 52 },
    ],
  },
  {
    id: 'peduli',
    pilarNum: '5',
    name: 'Tangerang Peduli',
    category: 'Sosial & Tanggap Bencana',
    amount: 'Rp 5,86 M',
    rawAmount: 5_860_000_000,
    rawBudget: 7_500_000_000,
    percentage: 78,
    beneficiaries: '5.423 penerima manfaat',
    color: '#2563eb',
    areaGradient: 'rgba(37, 99, 235, 0.12)',
    iconBg: 'bg-blue-600',
    icon: Shield,
    sparklinePoints: '0,19 15,16 30,13 45,14 60,9 75,10 90,6 100,4',
    areaPoints: '0,19 15,16 30,13 45,14 60,9 75,10 90,6 100,4 100,26 0,26',
    impactDesc: 'Respon cepat bencana banjir, bedah rumah duafa tuntas, santunan yatim terjamin.',
    metrics: {
      primaryLabel: 'Keluarga Tertolong',
      primaryValue: '5.423',
      primaryGrowth: '+9,8%',
      successLabel: 'Bedah Rumah & RTLH',
      successValue: '4.850',
      successRate: '89%',
      avgLabel: 'Rata-rata Bantuan',
      avgValue: 'Rp 1,08 jt',
      progLabel: 'Sub-Program Aktif',
      progValue: '10 Program',
      districtLabel: 'Kecamatan Terjangkau',
      districtValue: '13 / 13',
      newLabel: 'Keluarga Mustahik Baru',
      newValue: '1.240 Jiwa',
    },
    monthlyBars: [
      { m: 'Jan', realisasi: 38, target: 45, active: true },
      { m: 'Feb', realisasi: 48, target: 50, active: true },
      { m: 'Mar', realisasi: 60, target: 55, active: true },
      { m: 'Apr', realisasi: 72, target: 60, active: true },
      { m: 'Mei', realisasi: 78, target: 60, active: true },
      { m: 'Jun', realisasi: 75, target: 60, active: true },
      { m: 'Jul', realisasi: 68, target: 55, active: true },
      { m: 'Agu', realisasi: 74, target: 55, active: true },
      { m: 'Sep', realisasi: 0, target: 55, active: false },
      { m: 'Okt', realisasi: 0, target: 55, active: false },
      { m: 'Nov', realisasi: 0, target: 55, active: false },
      { m: 'Des', realisasi: 0, target: 55, active: false },
    ],
    asnafBreakdown: [
      { name: 'Fakir', count: '2.850', pct: '53%', color: '#e11d48' },
      { name: 'Miskin', count: '1.920', pct: '35%', color: '#d97706' },
      { name: 'Gharimin', count: '420', pct: '8%', color: '#7c3aed' },
      { name: 'Ibnu Sabil', count: '233', pct: '4%', color: '#2563eb' },
    ],
    topKecamatan: [
      { rank: 1, name: 'Periuk', count: '1.450', pct: '27%' },
      { rank: 2, name: 'Jatiuwung', count: '1.280', pct: '24%' },
      { rank: 3, name: 'Karawaci', count: '1.050', pct: '19%' },
      { rank: 4, name: 'Ciledug', count: '920', pct: '17%' },
      { rank: 5, name: 'Neglasari', count: '723', pct: '13%' },
    ],
    subPrograms: [
      { code: 'TP-01', name: 'Bedah Rumah Tidak Layak Huni (RTLH)', pic: 'Divisi Tanggap Bencana', status: 'Berjalan', nextMilestone: '15 Sep 2026', mustahik: '185', realized: 'Rp 2,45 M', pct: 81 },
      { code: 'TP-02', name: 'Paket Sembako Lansia & Dhuafa', pic: 'Bidang Penyaluran', status: 'Berjalan', nextMilestone: '25 Sep 2026', mustahik: '3.400', realized: 'Rp 1,75 M', pct: 78 },
      { code: 'TP-03', name: 'Santunan Rutin Yatim Piatu Dhuafa', pic: 'Divisi Sosial', status: 'Berjalan', nextMilestone: '02 Sep 2026', mustahik: '1.200', realized: 'Rp 0,98 M', pct: 75 },
      { code: 'TP-04', name: 'Dapur Umum & Tanggap Darurat Bencana', pic: 'BAZNAS Tanggap Bencana', status: 'Berjalan', nextMilestone: '30 Sep 2026', mustahik: '638', realized: 'Rp 0,68 M', pct: 68 },
    ],
  },
];

export function ProgramPilarWorkspace() {
  const [pilarCards, setPilarCards] = useState<PilarCardData[]>(PILAR_CARDS);
  const [selectedPilar, setSelectedPilar] = useState('sehat');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Semua');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Add initiative form state
  const [newInit, setNewInit] = useState({
    code: '',
    name: '',
    pic: 'Divisi Penyaluran',
    status: 'Aktif',
    nextMilestone: '30 Sep 2026',
    mustahik_target: '500',
    budget_amount: '1000000000',
    realized_amount: '350000000',
  });

  const toast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const loadLivePrograms = () => {
    api.getPilarPrograms().then((res) => {
      if (res.data && res.data.length > 0) {
        setPilarCards((prev) =>
          prev.map((card) => {
            const matched = res.data?.find((d) => d.id === card.id);
            if (!matched) return card;
            return {
              ...card,
              amount: matched.amount || card.amount,
              rawAmount: matched.rawAmount || card.rawAmount,
              rawBudget: matched.rawBudget || card.rawBudget,
              percentage: matched.percentage || card.percentage,
              beneficiaries: matched.beneficiaries || card.beneficiaries,
              subPrograms: matched.subPrograms && matched.subPrograms.length > 0 ? (matched.subPrograms as any) : card.subPrograms,
            };
          })
        );
      }
    }).catch(() => {});
  };

  useEffect(() => {
    loadLivePrograms();
  }, []);

  const activePilarData = pilarCards.find((p) => p.id === selectedPilar) || pilarCards[2]!;
  const remainingBudget = Math.max(activePilarData.rawBudget - activePilarData.rawAmount, 0);
  const projectedAmount = activePilarData.rawAmount * 1.22;
  const projectedPercent = Math.round((projectedAmount / activePilarData.rawBudget) * 100);

  const filteredSubPrograms = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return activePilarData.subPrograms.filter((sub) => {
      const matchSearch = !q || sub.name.toLowerCase().includes(q) || sub.code.toLowerCase().includes(q) || sub.pic.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'Semua' || sub.status.toLowerCase() === statusFilter.toLowerCase();
      return matchSearch && matchStatus;
    });
  }, [activePilarData.subPrograms, searchQuery, statusFilter]);

  const handleCreateInitiative = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInit.name) {
      toast('Nama inisiatif wajib diisi');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.createPilarInitiative({
        pilarId: selectedPilar,
        code: newInit.code || `${activePilarData.id.toUpperCase().slice(0, 2)}-0${activePilarData.subPrograms.length + 1}`,
        name: newInit.name,
        pic: newInit.pic,
        status: newInit.status,
        nextMilestone: newInit.nextMilestone,
        mustahikTarget: parseInt(newInit.mustahik_target, 10) || 500,
        budgetAmount: parseFloat(newInit.budget_amount) || 1000000000,
        realizedAmount: parseFloat(newInit.realized_amount) || 0,
      });
      toast(`Inisiatif ${newInit.name} berhasil ditambahkan ke ${activePilarData.name}!`);
      setAddModalOpen(false);
      setNewInit({
        code: '',
        name: '',
        pic: 'Divisi Penyaluran',
        status: 'Aktif',
        nextMilestone: '30 Sep 2026',
        mustahik_target: '500',
        budget_amount: '1000000000',
        realized_amount: '350000000',
      });
      loadLivePrograms();
    } catch (err: any) {
      toast(`Gagal menambahkan inisiatif: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-[1920px] 2xl:mx-auto space-y-5 sm:space-y-6 pb-12 text-slate-800 antialiased">
      {/* ========================================================================= */}
      {/* 1. HEADER TITLE & STATUS TOOLBAR                                         */}
      {/* ========================================================================= */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-white p-5 sm:p-6 rounded-xl border border-zinc-200">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-950">
              Lima Pilar, Satu Dampak untuk Kota Tangerang
            </h1>
            <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
              RKAT 2026
            </span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 font-medium mt-1">
            Transformasi akuntabel dana zakat, infak, dan sedekah menjadi kemaslahatan nyata bagi mustahik.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-500 bg-zinc-50 px-3.5 py-2 rounded-xl border border-zinc-200/70">
            <span className="size-2 rounded-full bg-emerald-600 animate-pulse" />
            <span className="font-bold text-zinc-800">Sinkronisasi:</span>
            <span className="text-zinc-600">25 Agustus 2026 - 10:15 WIB</span>
          </div>

          <Link
            href="/penyaluran/mustahik"
            className="inline-flex items-center gap-2 rounded-xl bg-[#00704A] px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-[#005a3b] transition-colors cursor-pointer"
          >
            <Users className="size-4" />
            <span>Master Data Mustahik</span>
          </Link>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. TOP 5 PILAR CARDS SELECTOR (GRID 5 COLS)                              */}
      {/* ========================================================================= */}
      <div
        role="tablist"
        aria-label="Pilih Program 5 Pilar"
        data-testid="pilar-tablist"
        className="flex min-w-0 gap-3.5 overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 p-2 sm:gap-4 sm:p-2.5 lg:gap-0"
      >
        {pilarCards.map((pilar, index) => {
          const isSelected = selectedPilar === pilar.id;
          const Icon = pilar.icon;

          return (
            <button
              key={pilar.id}
              type="button"
              role="tab"
              id={`pilar-tab-${pilar.id}`}
              aria-controls="pilar-detail-panel"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setSelectedPilar(pilar.id)}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

                event.preventDefault();
                const lastIndex = pilarCards.length - 1;
                const nextIndex = event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? lastIndex
                    : event.key === 'ArrowRight'
                      ? (index + 1) % pilarCards.length
                      : (index - 1 + pilarCards.length) % pilarCards.length;
                const nextPilar = pilarCards[nextIndex];

                if (!nextPilar) return;
                setSelectedPilar(nextPilar.id);
                event.currentTarget.parentElement
                  ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                  [nextIndex]?.focus();
              }}
              className={`relative flex w-full min-w-[17rem] shrink-0 flex-col justify-between rounded-xl border bg-white p-4 sm:p-5 text-left transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 select-none lg:min-w-0 lg:w-auto ${
                isSelected
                  ? 'border-[#008B5A] bg-emerald-50/20 shadow-md lg:flex-[1.15]'
                  : 'border-zinc-200/90 hover:border-zinc-300 hover:shadow-xs lg:flex-1 lg:rounded-none lg:border-l lg:border-y-0 lg:border-r-0 lg:border-zinc-200/70 lg:bg-transparent lg:shadow-none lg:hover:shadow-none first:lg:border-l-0'
              }`}
            >
              {isSelected && (
                <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-[#008B5A]" />
              )}

              {/* Top Row: Icon + Title + Selected Checkmark */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-xl text-white shadow-xs ${pilar.iconBg}`}>
                    <Icon className="size-4.5 sm:size-5" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-extrabold text-zinc-900 leading-tight">{pilar.name}</h3>
                    <p className="text-base sm:text-lg font-black tracking-tight text-zinc-950 mt-0.5">{pilar.amount}</p>
                  </div>
                </div>

                {isSelected && (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#008B5A] text-white">
                    <Check className="size-3 stroke-[3]" />
                  </span>
                )}
              </div>

              {/* Middle Row: Sub-stats */}
              <div className="mt-2.5">
                <p className="text-xs font-bold text-emerald-700">
                  {pilar.percentage}% <span className="font-normal text-zinc-500">dari target RKAT</span>
                </p>
                <p className="text-xs text-zinc-500 font-medium mt-0.5">{pilar.beneficiaries}</p>
              </div>

              {/* Bottom Row: Smooth Sparkline */}
              <div className="mt-3 h-10 w-full overflow-hidden">
                <svg viewBox="0 0 100 26" className="h-full w-full" preserveAspectRatio="none">
                  <polygon fill={pilar.areaGradient} points={pilar.areaPoints} />
                  <polyline
                    fill="none"
                    stroke={pilar.color}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={pilar.sparklinePoints}
                  />
                </svg>
              </div>
            </button>
          );
        })}
      </div>

      <div
        id="pilar-detail-panel"
        role="tabpanel"
        aria-labelledby={`pilar-tab-${selectedPilar}`}
        className="space-y-5 sm:space-y-6"
      >
        {/* ========================================================================= */}
        {/* 3. VALUE CHAIN: FULL WIDTH HARMONIOUS 5-STEP SECTION                     */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-100 pb-3">
          <div>
            <h2 className="text-base sm:text-lg font-black text-zinc-950 flex items-center gap-2">
              <span>Dari Anggaran ke Dampak Sosial — <span className="text-[#008B5A]">{activePilarData.name}</span></span>
            </h2>
            <p className="text-xs sm:text-sm text-zinc-500 font-medium mt-0.5">
              Rantai nilai terintegrasi dari pagu RKAT, intervensi program, aktivitas lapangan, hingga hasil akhir bagi mustahik
            </p>
          </div>
          <span className="self-start sm:self-auto text-xs font-bold px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/60">
            Fokus: {activePilarData.category}
          </span>
        </div>

        {/* 5 Sequence Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
          {/* Step 1: Anggaran */}
          <div className="p-4 rounded-xl bg-zinc-50/80 border border-zinc-200/70 flex flex-col justify-between space-y-2 hover:bg-zinc-100/60 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold text-zinc-500 tracking-wider">1. Anggaran RKAT</span>
              <div className="size-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Wallet className="size-4" />
              </div>
            </div>
            <div>
              <p className="text-lg sm:text-xl font-black tracking-tight text-zinc-950">{activePilarData.amount}</p>
              <p className="text-xs font-bold text-emerald-700 mt-0.5">{activePilarData.percentage}% dari pagu tahunan</p>
            </div>
          </div>

          {/* Step 2: Intervensi */}
          <div className="p-4 rounded-xl bg-zinc-50/80 border border-zinc-200/70 flex flex-col justify-between space-y-2 hover:bg-zinc-100/60 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold text-zinc-500 tracking-wider">2. Intervensi</span>
              <div className="size-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <ClipboardList className="size-4" />
              </div>
            </div>
            <div>
              <p className="text-lg sm:text-xl font-black tracking-tight text-zinc-950">{activePilarData.subPrograms.length} Sub-Program</p>
              <p className="text-xs text-zinc-500 font-medium mt-0.5">Fasilitas & layanan aktif</p>
            </div>
          </div>

          {/* Step 3: Aktivitas */}
          <div className="p-4 rounded-xl bg-zinc-50/80 border border-zinc-200/70 flex flex-col justify-between space-y-2 hover:bg-zinc-100/60 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold text-zinc-500 tracking-wider">3. Aktivitas Layanan</span>
              <div className="size-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <Users className="size-4" />
              </div>
            </div>
            <div>
              <p className="text-lg sm:text-xl font-black tracking-tight text-zinc-950">63.842 Kegiatan</p>
              <p className="text-xs text-zinc-500 font-medium mt-0.5">Jan–Agu 2026 berjalan</p>
            </div>
          </div>

          {/* Step 4: Output */}
          <div className="p-4 rounded-xl bg-zinc-50/80 border border-zinc-200/70 flex flex-col justify-between space-y-2 hover:bg-zinc-100/60 transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold text-zinc-500 tracking-wider">4. Output Penerima</span>
              <div className="size-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                <CheckCircle2 className="size-4" />
              </div>
            </div>
            <div>
              <p className="text-lg sm:text-xl font-black tracking-tight text-zinc-950">{activePilarData.metrics.primaryValue} Jiwa</p>
              <p className="text-xs font-bold text-emerald-700 mt-0.5">{activePilarData.percentage}% dari target</p>
            </div>
          </div>

          {/* Step 5: Dampak */}
          <div className="p-4 rounded-xl bg-emerald-50/90 border border-emerald-200 flex flex-col justify-between space-y-2 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold text-emerald-800 tracking-wider">5. Dampak Nyata</span>
              <div className="size-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <Heart className="size-4" />
              </div>
            </div>
            <div>
              <p className="text-xs text-zinc-800 font-semibold leading-snug">{activePilarData.impactDesc}</p>
            </div>
          </div>
        </div>
      </div>

      <section
        role="region"
        aria-label="Kinerja Program Terpadu"
        className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
      >
        <div className="border-b border-zinc-100 p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-emerald-700">Kinerja Program Terpadu</p>
              <h2 id="kinerja-program-terpadu-title" className="mt-1 text-lg font-black text-zinc-950 sm:text-xl">
                Kinerja {activePilarData.name}
              </h2>
              <p className="mt-1 text-xs font-medium text-zinc-500 sm:text-sm">
                Tren realisasi, dampak utama, dan ruang penyaluran dalam satu pandangan.
              </p>
            </div>
            <span className="inline-flex w-fit items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 ring-1 ring-inset ring-emerald-200">
              {activePilarData.percentage}% dari target RKAT
            </span>
          </div>

          <div className="mt-5 grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)] lg:gap-6">
            <article className="min-w-0 rounded-lg bg-zinc-50 p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-base font-bold text-zinc-950">Tren Penyaluran Bulanan</h3>
                  <p className="mt-1 text-xs text-zinc-500">Realisasi dan target bulanan dalam indeks RKAT.</p>
                </div>
                <div className="flex items-center gap-3 text-xs font-semibold text-zinc-500">
                  <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#008B5A]" />Realisasi</span>
                  <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-amber-400" />Target</span>
                </div>
              </div>

              <figure className="mt-4 w-full max-w-full overflow-x-auto" aria-label={`Tren penyaluran bulanan ${activePilarData.name}`}>
                <figcaption className="sr-only">Perbandingan indeks realisasi dan target bulanan.</figcaption>
                <ul className="sr-only">
                  {activePilarData.monthlyBars.map((bar) => (
                    <li key={`trend-${bar.m}`}>{bar.m}: realisasi {bar.realisasi}, target {bar.target}.</li>
                  ))}
                </ul>
                <div className="flex h-56 min-w-[560px] items-end gap-3 border-b border-zinc-200 px-1 pb-2">
                  {activePilarData.monthlyBars.map((bar) => (
                    <div key={bar.m} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                      <div className="relative flex h-44 w-full max-w-7 items-end justify-center">
                        <span
                          aria-hidden="true"
                          className="absolute left-[-3px] right-[-3px] h-0.5 rounded-full bg-amber-400"
                          style={{ bottom: `${Math.min(bar.target, 100)}%` }}
                        />
                        <span
                          aria-hidden="true"
                          className={`w-full rounded-t-md transition-[height] duration-500 motion-reduce:transition-none ${bar.active ? 'bg-emerald-700' : 'bg-zinc-200'}`}
                          style={{ height: `${Math.min(bar.realisasi, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-zinc-500">{bar.m}</span>
                    </div>
                  ))}
                </div>
              </figure>
            </article>

            <div role="list" aria-label="Empat indikator dampak utama" className="grid grid-cols-2 gap-3">
              {[
                { label: activePilarData.metrics.primaryLabel, value: activePilarData.metrics.primaryValue, note: `${activePilarData.metrics.primaryGrowth} vs periode lalu`, icon: Stethoscope },
                { label: activePilarData.metrics.successLabel, value: activePilarData.metrics.successValue, note: `Tingkat sukses ${activePilarData.metrics.successRate}`, icon: CheckCircle2 },
                { label: activePilarData.metrics.avgLabel, value: activePilarData.metrics.avgValue, note: 'Rata-rata per mustahik', icon: Wallet },
                { label: activePilarData.metrics.progLabel, value: activePilarData.metrics.progValue, note: 'Layanan operasional aktif', icon: FileText },
              ].map((metric) => {
                const Icon = metric.icon;
                return (
                  <article role="listitem" key={metric.label} className="rounded-lg border border-zinc-200 bg-white p-4">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                      <Icon className="size-4.5" />
                    </div>
                    <p className="mt-4 text-sm font-semibold leading-5 text-zinc-600">{metric.label}</p>
                    <p className="mt-1 text-2xl font-black tracking-tight text-zinc-950">{metric.value}</p>
                    <p className="mt-1 text-xs font-bold text-emerald-700">{metric.note}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>

        <div
          role="group"
          aria-label="Ringkasan proyeksi dan jangkauan"
          className="grid gap-px bg-zinc-200 sm:grid-cols-2 xl:grid-cols-[1.45fr_repeat(4,minmax(0,1fr))]"
        >
          <div className="bg-emerald-950 p-4 text-white sm:col-span-2 sm:p-5 xl:col-span-1">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-emerald-300">Proyeksi Serapan 2026</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <strong className="text-2xl font-black tracking-tight">{formatMiliar(projectedAmount)}</strong>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-emerald-100">{projectedPercent}% target</span>
            </div>
          </div>
          <div className="bg-white p-4 sm:p-5">
            <p className="text-xs font-semibold text-zinc-500">Pagu Tahunan</p>
            <p className="mt-2 text-lg font-black tracking-tight text-zinc-950">{formatMiliar(activePilarData.rawBudget)}</p>
          </div>
          <div className="bg-white p-4 sm:p-5">
            <p className="text-xs font-semibold text-zinc-500">Sisa Kuota</p>
            <p className="mt-2 text-lg font-black tracking-tight text-amber-700">{formatMiliar(remainingBudget)}</p>
          </div>
          <div className="bg-white p-4 sm:p-5">
            <p className="text-xs font-semibold text-zinc-500">Kecamatan Terjangkau</p>
            <p className="mt-2 text-lg font-black tracking-tight text-zinc-950">{activePilarData.metrics.districtValue}</p>
          </div>
          <div className="bg-white p-4 sm:p-5">
            <p className="text-xs font-semibold text-zinc-500">Penerima Baru</p>
            <p className="mt-2 text-lg font-black tracking-tight text-zinc-950">{activePilarData.metrics.newValue}</p>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 5. 3-CARD ANALYTICS ROW (FUNNEL, ASNAF DONUT, TOP KECAMATAN)              */}
      {/* ========================================================================= */}
      <section
        role="region"
        aria-label="Analitik penyaluran program"
        className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 xl:grid-cols-3"
      >
        {/* Card 1: Funnel outcome program */}
        <div className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-zinc-950 flex items-center gap-2">
              <Layers className="size-4 text-emerald-600" /> Alur Dampak Program
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">Tahapan proposal hingga bantuan tersalurkan</p>
          </div>

          <div className="space-y-3">
            {[
              { label: 'Proposal Masuk', count: 42, color: 'bg-[#008B5A]', w: '100%' },
              { label: 'Verifikasi Kelayakan', count: 36, color: 'bg-emerald-400', w: '85%' },
              { label: 'Disetujui MPZIS', count: 28, color: 'bg-amber-400', w: '66%' },
              { label: 'Pencairan PPD', count: 22, color: 'bg-sky-400', w: '52%' },
              { label: 'Bantuan Tersalurkan', count: 18, color: 'bg-purple-400', w: '42%' },
            ].map((f) => (
              <div key={f.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-zinc-600">{f.label}</span>
                  <span className="text-zinc-950 font-bold">{f.count} Berkas</span>
                </div>
                <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${f.color}`} style={{ width: f.w }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Card 2: Komposisi Asnaf */}
        <div className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-zinc-950 flex items-center gap-2">
              <Award className="size-4 text-emerald-600" /> Komposisi Asnaf Penerima
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">Distribusi pembagian hak syar'i 8 asnaf</p>
          </div>

          <div className="flex items-center gap-4">
            {/* Donut chart */}
            <div className="size-24 shrink-0 relative">
              <svg viewBox="0 0 36 36" className="size-full -rotate-90">
                <circle cx="18" cy="18" r="13" fill="transparent" stroke="#00704A" strokeWidth="4.5" strokeDasharray="33 100" strokeDashoffset="0" />
                <circle cx="18" cy="18" r="13" fill="transparent" stroke="#10b981" strokeWidth="4.5" strokeDasharray="33 100" strokeDashoffset="-33" />
                <circle cx="18" cy="18" r="13" fill="transparent" stroke="#6ee7b7" strokeWidth="4.5" strokeDasharray="12 100" strokeDashoffset="-66" />
                <circle cx="18" cy="18" r="13" fill="transparent" stroke="#f59e0b" strokeWidth="4.5" strokeDasharray="10 100" strokeDashoffset="-78" />
                <circle cx="18" cy="18" r="13" fill="transparent" stroke="#a855f7" strokeWidth="4.5" strokeDasharray="6 100" strokeDashoffset="-88" />
                <circle cx="18" cy="18" r="13" fill="transparent" stroke="#cbd5e1" strokeWidth="4.5" strokeDasharray="6 100" strokeDashoffset="-94" />
              </svg>
            </div>

            {/* Legend List */}
            <div className="flex-1 space-y-1.5 text-xs">
              {activePilarData.asnafBreakdown.map((as) => (
                <div key={as.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ backgroundColor: as.color }} />
                    <span className="text-zinc-600 font-medium">{as.name}</span>
                  </div>
                  <span className="text-zinc-950 font-bold">{as.count} ({as.pct})</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 3: Top Kecamatan */}
        <div className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5 sm:col-span-2 sm:p-6 xl:col-span-1">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-zinc-950 flex items-center gap-2">
              <MapPin className="size-4 text-emerald-600" /> Top Kecamatan Penerima
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">Peringkat 5 wilayah sebaran terbanyak</p>
          </div>

          <div className="space-y-2">
            {activePilarData.topKecamatan.map((kec) => (
              <div key={kec.name} className="flex items-center justify-between p-2 rounded-xl bg-zinc-50 text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 w-3">{kec.rank}</span>
                  <span className="text-zinc-900">Kec. {kec.name}</span>
                </div>
                <span className="text-zinc-950 font-bold">{kec.count} Jiwa ({kec.pct})</span>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-zinc-100">
            <Link
              href="/penyaluran/peta"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 hover:text-emerald-950"
            >
              <span>Buka Peta Sebaran 13 Kecamatan</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </section>

          {/* ========================================================================= */}
          {/* 6. SUB-PROGRAM PORTFOLIO TABLE (FULL WIDTH)                               */}
          {/* ========================================================================= */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-100 pb-3">
              <div>
                <h2 className="text-base sm:text-lg font-black text-zinc-950">
                  Portofolio Inisiatif & Sub-Program — {activePilarData.name} ({activePilarData.subPrograms.length})
                </h2>
                <p className="text-xs sm:text-sm text-zinc-500 font-medium">
                  Rincian serapan pagu, progres kuota mustahik, dan jadwal tonggak monev
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-emerald-800 transition-colors"
                >
                  <Plus className="size-4" />
                  <span>Tambah Inisiatif</span>
                </button>
              </div>
            </div>

            {/* Search & Filter Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari kode, inisiatif, atau PIC..."
                  className="w-full h-9 pl-9 pr-8 text-xs rounded-xl border border-zinc-200 bg-zinc-50/50 outline-none focus:border-emerald-500 focus:bg-white"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {['Semua', 'Aktif', 'Berjalan', 'Perencanaan'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                      statusFilter === st
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-zinc-50 text-zinc-600 border border-zinc-200/60 hover:bg-zinc-100'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div
              role="list"
              aria-label="Portofolio sub-program untuk layar kecil"
              className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:hidden"
            >
              {filteredSubPrograms.map((sub) => (
                <article
                  role="listitem"
                  key={`compact-${sub.code}`}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-md border border-emerald-200/70 bg-emerald-50 px-2 py-1 font-mono text-xs font-bold text-emerald-700">
                      {sub.code}
                    </span>
                    <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                      {sub.status}
                    </span>
                  </div>

                  <h3 className="mt-3 text-sm font-black leading-5 text-zinc-950">{sub.name}</h3>

                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-zinc-200 pt-4 text-xs">
                    <div className="col-span-2">
                      <dt className="font-semibold text-zinc-500">Penanggung jawab</dt>
                      <dd className="mt-1 font-bold text-zinc-800">{sub.pic}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-zinc-500">Monev berikutnya</dt>
                      <dd className="mt-1 font-bold text-zinc-900">{sub.nextMilestone}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-zinc-500">Mustahik</dt>
                      <dd className="mt-1 font-bold text-zinc-900">{sub.mustahik} Jiwa</dd>
                    </div>
                    <div className="col-span-2 flex items-end justify-between gap-3 rounded-xl bg-white p-3 ring-1 ring-inset ring-zinc-200">
                      <div>
                        <dt className="font-semibold text-zinc-500">Realisasi pagu</dt>
                        <dd className="mt-1 text-sm font-black text-zinc-950">{sub.realized}</dd>
                      </div>
                      <span className="text-xs font-bold text-emerald-700">{sub.pct}% terserap</span>
                    </div>
                  </dl>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-[960px] w-full text-left text-sm">
                <thead className="border-b border-zinc-200 text-xs text-zinc-500 font-bold uppercase tracking-wider bg-zinc-50/50">
                  <tr>
                    <th className="py-3 px-4">Kode &amp; Nama Program</th>
                    <th className="py-3 px-4">PIC Operasional</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Tonggak Monev</th>
                    <th className="py-3 px-4 text-right">Mustahik</th>
                    <th className="py-3 px-4 text-right">Realisasi Pagu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredSubPrograms.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-zinc-500">
                        Tidak ada inisiatif yang sesuai dengan filter.
                      </td>
                    </tr>
                  ) : (
                    filteredSubPrograms.map((sub) => (
                      <tr key={sub.code} className="hover:bg-zinc-50/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                              {sub.code}
                            </span>
                            <span className="font-bold text-zinc-900">{sub.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-zinc-600 font-medium">{sub.pic}</td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                            {sub.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="text-xs font-bold text-zinc-900">{sub.nextMilestone}</p>
                          <p className="text-[11px] text-zinc-400">Evaluasi lapangan</p>
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-zinc-900">{sub.mustahik} Jiwa</td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-bold text-zinc-950">{sub.realized}</span>
                            <span className="text-xs font-semibold text-emerald-700">({sub.pct}%)</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Add Initiative Modal */}
        {addModalOpen && (
          <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-950/50" onClick={() => setAddModalOpen(false)} />
            <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-lg font-black text-slate-900">Tambah Inisiatif Sub-Program</h2>
                  <p className="text-xs text-slate-500">Pilar: {activePilarData.name}</p>
                </div>
                <button type="button" onClick={() => setAddModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                  <X className="size-5" />
                </button>
              </div>
              <form onSubmit={handleCreateInitiative} className="mt-4 space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600">Kode Program (opsional)</label>
                    <input
                      value={newInit.code}
                      onChange={(e) => setNewInit({ ...newInit, code: e.target.value })}
                      placeholder={`e.g. ${activePilarData.id.toUpperCase().slice(0, 2)}-05`}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600">Status Inisiatif</label>
                    <select
                      value={newInit.status}
                      onChange={(e) => setNewInit({ ...newInit, status: e.target.value })}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
                    >
                      <option value="Aktif">Aktif</option>
                      <option value="Berjalan">Berjalan</option>
                      <option value="Perencanaan">Perencanaan</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">Nama Inisiatif Program *</label>
                  <input
                    required
                    value={newInit.name}
                    onChange={(e) => setNewInit({ ...newInit, name: e.target.value })}
                    placeholder="e.g. Program Pemberdayaan Ternak Lele Dhuafa"
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600">PIC Operasional</label>
                    <input
                      value={newInit.pic}
                      onChange={(e) => setNewInit({ ...newInit, pic: e.target.value })}
                      placeholder="Divisi Penyaluran"
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600">Jadwal Monev</label>
                    <input
                      value={newInit.nextMilestone}
                      onChange={(e) => setNewInit({ ...newInit, nextMilestone: e.target.value })}
                      placeholder="30 Sep 2026"
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600">Target Mustahik</label>
                    <input
                      type="number"
                      value={newInit.mustahik_target}
                      onChange={(e) => setNewInit({ ...newInit, mustahik_target: e.target.value })}
                      placeholder="500"
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600">Pagu Anggaran (Rp)</label>
                    <input
                      type="number"
                      value={newInit.budget_amount}
                      onChange={(e) => setNewInit({ ...newInit, budget_amount: e.target.value })}
                      placeholder="1000000000"
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600">Realisasi (Rp)</label>
                    <input
                      type="number"
                      value={newInit.realized_amount}
                      onChange={(e) => setNewInit({ ...newInit, realized_amount: e.target.value })}
                      placeholder="350000000"
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setAddModalOpen(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
                    <span>Simpan Inisiatif</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {notice && (
          <div role="status" className="fixed bottom-5 right-5 z-[100] flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-bold text-white shadow-lg">
            <CheckCircle2 className="size-4 text-emerald-400" />
            {notice}
          </div>
        )}
    </div>
  );
}
