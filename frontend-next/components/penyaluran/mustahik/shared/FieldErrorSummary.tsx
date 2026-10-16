'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { AlertCircle } from 'lucide-react';

export interface FieldErrorItem {
  field: string;
  message: string;
}

export interface FieldErrorSummaryProps {
  errors?: Record<string, string> | FieldErrorItem[] | null;
  title?: string;
  id?: string;
  autoFocus?: boolean;
  className?: string;
}

export function FieldErrorSummary({
  errors,
  title,
  id = 'form-error-summary',
  autoFocus = true,
  className = '',
}: FieldErrorSummaryProps) {
  const summaryRef = useRef<HTMLDivElement>(null);

  const normalizedErrors: FieldErrorItem[] = useMemo(() => {
    if (!errors) return [];
    if (Array.isArray(errors)) {
      return errors.filter(
        (err): err is FieldErrorItem =>
          typeof err === 'object' &&
          err !== null &&
          Boolean(err.field && err.message)
      );
    }
    if (typeof errors === 'object') {
      return Object.entries(errors)
        .filter(([, msg]) => Boolean(msg))
        .map(([field, message]) => ({ field, message: String(message) }));
    }
    return [];
  }, [errors]);

  useEffect(() => {
    if (normalizedErrors.length > 0 && autoFocus) {
      summaryRef.current?.focus();
    }
  }, [normalizedErrors.length, autoFocus]);

  if (normalizedErrors.length === 0) {
    return null;
  }

  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, fieldId: string) => {
    e.preventDefault();
    const target =
      document.getElementById(fieldId) ||
      document.querySelector<HTMLElement>(`[name="${fieldId}"]`);
    if (target) {
      target.focus();
      target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }
  };

  const displayTitle =
    title ?? `Terdapat ${normalizedErrors.length} kesalahan pengisian formulir:`;

  return (
    <div
      ref={summaryRef}
      id={id}
      role="alert"
      aria-live="polite"
      tabIndex={-1}
      className={`rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${className}`}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-rose-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-rose-900">{displayTitle}</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm">
            {normalizedErrors.map((err) => (
              <li key={err.field}>
                <a
                  href={`#${err.field}`}
                  onClick={(e) => handleAnchorClick(e, err.field)}
                  className="inline-flex min-h-[44px] items-center underline font-medium text-rose-800 hover:text-rose-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 rounded px-1"
                >
                  {err.message}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

export default FieldErrorSummary;
