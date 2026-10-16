export const formatRupiah = (val, compact = false) => {
  if (!compact) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  }

  if (val >= 1_000_000_000_000) {
    return `Rp ${(val / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '')} T`;
  }
  if (val >= 1_000_000_000) {
    return `Rp ${(val / 1_000_000_000).toFixed(1).replace(/\.0$/, '')} M`;
  }
  if (val >= 1_000_000) {
    return `Rp ${(val / 1_000_000).toFixed(0)} jt`;
  }
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(val);
};

export const formatRupiahChart = (val) => {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1).replace(/\.0$/, '')} M`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(0)} jt`;
  return `${val}`;
};
