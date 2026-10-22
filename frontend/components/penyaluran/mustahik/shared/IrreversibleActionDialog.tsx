'use client';

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Hash, Loader2, ShieldAlert, X } from 'lucide-react';

export type DialogVariant = 'primary' | 'danger' | 'warning';

export interface IrreversibleActionDialogProps {
  isOpen: boolean;
  title: string;
  description: ReactNode;
  actionLabel: string;
  cancelLabel?: string;
  variant?: DialogVariant;
  snapshotHash?: string | null;
  requiresConfirmationPhrase?: boolean;
  confirmationPhrase?: string;
  noteLabel?: string;
  notePlaceholder?: string;
  noteRequired?: boolean;
  noteValue?: string;
  onNoteChange?: (note: string) => void;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export function IrreversibleActionDialog({
  isOpen,
  title,
  description,
  actionLabel,
  cancelLabel = 'Batal',
  variant = 'primary',
  snapshotHash,
  requiresConfirmationPhrase = false,
  confirmationPhrase = 'SETUJU',
  noteLabel,
  notePlaceholder = 'Tuliskan catatan...',
  noteRequired = false,
  noteValue = '',
  onNoteChange,
  isSubmitting = false,
  errorMessage = null,
  onConfirm,
  onClose,
}: IrreversibleActionDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const [typedPhrase, setTypedPhrase] = useState('');

  // Reset typed phrase on open
  useEffect(() => {
    if (isOpen) {
      setTypedPhrase('');
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    }
  }, [isOpen]);

  // Focus trap & Escape key
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const focusableElements = dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0]!;
        const lastElement = focusableElements[focusableElements.length - 1]!;

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Initial focus: focus first interactive element or dialog
    const timer = setTimeout(() => {
      const dialog = dialogRef.current;
      if (dialog) {
        const firstInput = dialog.querySelector<HTMLElement>(
          'input:not([disabled]), textarea:not([disabled]), button:not([disabled])'
        );
        if (firstInput) {
          firstInput.focus();
        } else {
          dialog.focus();
        }
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const isPhraseValid =
    !requiresConfirmationPhrase ||
    typedPhrase.trim().toUpperCase() === confirmationPhrase.trim().toUpperCase();

  const isNoteValid = !noteRequired || Boolean(noteValue && noteValue.trim());
  const canSubmit = isPhraseValid && isNoteValid && !isSubmitting;

  const variantStyles = {
    primary: {
      button:
        'bg-emerald-700 hover:bg-emerald-800 text-white focus-visible:ring-emerald-200',
      iconBg: 'bg-emerald-100 text-emerald-700',
      Icon: ShieldAlert,
    },
    warning: {
      button:
        'bg-amber-600 hover:bg-amber-700 text-white focus-visible:ring-amber-200',
      iconBg: 'bg-amber-100 text-amber-700',
      Icon: AlertTriangle,
    },
    danger: {
      button:
        'bg-rose-700 hover:bg-rose-800 text-white focus-visible:ring-rose-200',
      iconBg: 'bg-rose-100 text-rose-700',
      Icon: AlertTriangle,
    },
  }[variant];

  const { Icon } = variantStyles;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-desc"
        tabIndex={-1}
        className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all focus:outline-none"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="Tutup dialog"
          className="absolute right-4 top-4 inline-flex size-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
        >
          <X className="size-5" />
        </button>

        <div className="flex items-start gap-4">
          <div
            className={`grid size-12 shrink-0 place-items-center rounded-2xl ${variantStyles.iconBg}`}
          >
            <Icon className="size-6" aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <h2 id="dialog-title" className="text-lg font-extrabold text-slate-900">
              {title}
            </h2>
            <div id="dialog-desc" className="mt-2 text-sm text-slate-600">
              {description}
            </div>
          </div>
        </div>

        {/* Cryptographic Snapshot Hash */}
        {snapshotHash && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <Hash className="size-3.5 text-slate-400" aria-hidden="true" />
              <span>Snapshot SHA-256 Terikat:</span>
            </div>
            <p
              className="mt-1 font-mono text-xs font-semibold text-slate-800 break-all"
              title={snapshotHash}
              aria-label={`Snapshot SHA-256: ${snapshotHash}`}
            >
              sha256:{snapshotHash.slice(0, 16)}...
            </p>
          </div>
        )}

        {/* Note input if provided */}
        {noteLabel && (
          <div className="mt-4 space-y-1.5">
            <label
              htmlFor="dialog-note-input"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700"
            >
              {noteLabel}
              {noteRequired && <span className="ml-1 text-rose-600">*</span>}
            </label>
            <textarea
              id="dialog-note-input"
              rows={3}
              value={noteValue}
              onChange={(e) => onNoteChange?.(e.target.value)}
              disabled={isSubmitting}
              required={noteRequired}
              placeholder={notePlaceholder}
              className="w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:bg-slate-100"
            />
          </div>
        )}

        {/* Confirmation Phrase Input */}
        {requiresConfirmationPhrase && (
          <div className="mt-4 space-y-1.5">
            <label
              htmlFor="dialog-confirm-phrase"
              className="block text-xs font-bold text-slate-700"
            >
              Ketik <span className="font-mono font-bold text-rose-700">{confirmationPhrase}</span> untuk mengonfirmasi tindakan ini:
            </label>
            <input
              id="dialog-confirm-phrase"
              type="text"
              value={typedPhrase}
              onChange={(e) => setTypedPhrase(e.target.value)}
              disabled={isSubmitting}
              placeholder={confirmationPhrase}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 py-2 font-mono text-sm font-bold uppercase text-slate-900 focus-visible:border-rose-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100 disabled:bg-slate-100"
            />
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-800"
          >
            {errorMessage}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm()}
            disabled={!canSubmit}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl px-5 py-2 text-sm font-extrabold shadow-sm transition focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50 ${variantStyles.button}`}
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default IrreversibleActionDialog;
