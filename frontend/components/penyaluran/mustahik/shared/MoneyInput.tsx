'use client';

import React, { useEffect, useId, useMemo, useState } from 'react';

export interface MoneyInputProps {
  id?: string;
  name?: string;
  label: string;
  value?: number | string | null;
  onChange?: (rawValue: number | null, formattedString: string) => void;
  error?: string | null;
  hint?: string;
  disabled?: boolean;
  required?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
}

export function numberToTerbilang(num: number): string {
  if (!Number.isFinite(num)) return '';
  const n = Math.floor(Math.abs(num));
  if (n === 0) return 'Nol rupiah';

  const units = [
    '',
    'satu',
    'dua',
    'tiga',
    'empat',
    'lima',
    'enam',
    'tujuh',
    'delapan',
    'sembilan',
    'sepuluh',
    'sebelas',
  ];

  function convert(val: number): string {
    if (val < 12) {
      return units[val]!;
    }
    if (val < 20) {
      return `${convert(val - 10)} belas`;
    }
    if (val < 100) {
      const remainder = val % 10;
      return `${convert(Math.floor(val / 10))} puluh${remainder ? ` ${convert(remainder)}` : ''}`;
    }
    if (val < 200) {
      const remainder = val - 100;
      return `seratus${remainder ? ` ${convert(remainder)}` : ''}`;
    }
    if (val < 1000) {
      const remainder = val % 100;
      return `${convert(Math.floor(val / 100))} ratus${remainder ? ` ${convert(remainder)}` : ''}`;
    }
    if (val < 2000) {
      const remainder = val - 1000;
      return `seribu${remainder ? ` ${convert(remainder)}` : ''}`;
    }
    if (val < 1000000) {
      const remainder = val % 1000;
      return `${convert(Math.floor(val / 1000))} ribu${remainder ? ` ${convert(remainder)}` : ''}`;
    }
    if (val < 1000000000) {
      const remainder = val % 1000000;
      return `${convert(Math.floor(val / 1000000))} juta${remainder ? ` ${convert(remainder)}` : ''}`;
    }
    if (val < 1000000000000) {
      const remainder = val % 1000000000;
      return `${convert(Math.floor(val / 1000000000))} miliar${remainder ? ` ${convert(remainder)}` : ''}`;
    }
    const remainder = val % 1000000000000;
    return `${convert(Math.floor(val / 1000000000000))} triliun${remainder ? ` ${convert(remainder)}` : ''}`;
  }

  const rawWords = convert(n).trim().replace(/\s+/g, ' ');
  const capitalized = rawWords.charAt(0).toUpperCase() + rawWords.slice(1);
  const prefix = num < 0 ? 'Minus ' : '';
  return `${prefix}${capitalized} rupiah`;
}

export function formatRupiah(num: number | null | undefined): string {
  if (num === null || num === undefined || Number.isNaN(num)) return '';
  return `Rp ${num.toLocaleString('id-ID')}`;
}

export function MoneyInput({
  id: propId,
  name,
  label,
  value,
  onChange,
  error,
  hint,
  disabled = false,
  required = false,
  min,
  max,
  placeholder = 'Rp 0',
  className = '',
}: MoneyInputProps) {
  const generatedId = useId();
  const inputId = propId || `money-input-${generatedId.replace(/:/g, '')}`;

  const parseRaw = (val: number | string | null | undefined): number | null => {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number') return Number.isNaN(val) ? null : val;
    const digits = String(val).replace(/\D/g, '');
    if (!digits) return null;
    const parsed = parseInt(digits, 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const initialRaw = parseRaw(value);
  const [displayValue, setDisplayValue] = useState<string>(
    initialRaw !== null ? formatRupiah(initialRaw) : ''
  );
  const [currentRaw, setCurrentRaw] = useState<number | null>(initialRaw);

  useEffect(() => {
    const raw = parseRaw(value);
    setCurrentRaw(raw);
    setDisplayValue(raw !== null ? formatRupiah(raw) : '');
  }, [value]);

  const terbilangText = useMemo(() => {
    if (currentRaw === null || currentRaw === undefined) return '';
    return numberToTerbilang(currentRaw);
  }, [currentRaw]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawInput = e.target.value;
    const digits = rawInput.replace(/\D/g, '');
    if (!digits) {
      setCurrentRaw(null);
      setDisplayValue('');
      onChange?.(null, '');
      return;
    }

    let parsed = parseInt(digits, 10);
    if (min !== undefined && parsed < min) {
      // Allow user typing, min checked via form validation or error
    }
    if (max !== undefined && parsed > max) {
      parsed = max;
    }

    const formatted = formatRupiah(parsed);
    setCurrentRaw(parsed);
    setDisplayValue(formatted);
    onChange?.(parsed, formatted);
  };

  const describedBy = [
    hint ? `${inputId}-hint` : null,
    terbilangText ? `${inputId}-terbilang` : null,
    error ? `${inputId}-error` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`space-y-1.5 ${className}`}>
      <label
        htmlFor={inputId}
        className="block text-xs font-bold uppercase tracking-wider text-slate-700"
      >
        {label}
        {required && <span className="ml-1 text-rose-600" aria-hidden="true">*</span>}
      </label>

      <div className="relative">
        <input
          id={inputId}
          name={name || inputId}
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          aria-required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy || undefined}
          className={`w-full min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 font-mono text-sm font-semibold text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${
            error ? 'border-rose-400 focus-visible:border-rose-600 focus-visible:ring-rose-100' : 'border-slate-300'
          }`}
        />
      </div>

      {hint && (
        <p id={`${inputId}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      )}

      {terbilangText ? (
        <p
          id={`${inputId}-terbilang`}
          aria-live="polite"
          aria-atomic="true"
          className="text-xs font-medium text-emerald-800"
        >
          Terbilang: <span className="italic">{terbilangText}</span>
        </p>
      ) : null}

      {error && (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="text-xs font-semibold text-rose-600"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export default MoneyInput;
