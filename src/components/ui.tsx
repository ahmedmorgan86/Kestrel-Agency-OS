import React from 'react';
import { AlertCircle, CheckCircle2, Clock, X, AlertTriangle, MinusCircle, Users, Activity } from 'lucide-react';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between pb-5 border-b border-slate-200 dark:border-slate-800">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 max-w-3xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  meta,
  tone = 'default',
  onClick,
}: {
  label: string;
  value: string | number;
  meta?: string;
  tone?: 'default' | 'positive' | 'warning' | 'danger';
  onClick?: () => void;
}) {
  const valueTone =
    tone === 'positive'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'warning'
      ? 'text-amber-700 dark:text-amber-400'
      : tone === 'danger'
      ? 'text-red-700 dark:text-red-400'
      : 'text-slate-900 dark:text-slate-100';

  const baseClass =
    'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 text-left w-full';

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseClass} hover:border-blue-500 dark:hover:border-blue-500 transition-colors cursor-pointer`}
      >
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
        <div className={`mt-1.5 text-2xl font-semibold font-mono tabular-nums ${valueTone}`}>
          {value}
        </div>
        {meta && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{meta}</div>}
      </button>
    );
  }

  return (
    <div className={baseClass}>
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1.5 text-2xl font-semibold font-mono tabular-nums ${valueTone}`}>
        {value}
      </div>
      {meta && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{meta}</div>}
    </div>
  );
}

export function StatusText({ status, label }: { status: string; label?: string }) {
  const normalized = status.toLowerCase();
  const display =
    label ||
    status
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

  if (normalized === 'in_meeting') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400 whitespace-nowrap">
        <Users className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        {display}
      </span>
    );
  }

  if (normalized === 'working' || normalized === 'running' || normalized === 'validating') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 whitespace-nowrap">
        <Activity className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        {display}
      </span>
    );
  }

  if (
    ['active', 'connected', 'approved', 'published', 'completed', 'paid', 'succeeded', 'operational', 'verified', 'converted'].includes(
      normalized
    )
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        {display}
      </span>
    );
  }

  if (
    ['failed', 'rejected', 'error', 'dead_letter', 'permission_denied', 'authentication_expired', 'overdue', 'urgent'].includes(
      normalized
    )
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400 whitespace-nowrap">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        {display}
      </span>
    );
  }

  if (
    [
      'pending',
      'human_review',
      'waiting_for_approval',
      'waiting_for_input',
      'changes_requested',
      'retrying',
      'publishing',
      'configuration_incomplete',
      'unknown_outcome_reconciliation_required',
      'high',
      'source_reported',
      'on_leave',
    ].includes(normalized)
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        {display}
      </span>
    );
  }

  if (
    ['idle', 'not_configured', 'disconnected', 'paused', 'disabled', 'inactive', 'offboarded', 'archived', 'cancelled', 'invalidated', 'unverified'].includes(
      normalized
    )
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
        <MinusCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        {display}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 whitespace-nowrap">
      <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      {display}
    </span>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string | null; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-4 py-3 text-sm text-red-800 dark:text-red-200"
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-700 dark:text-red-400" aria-hidden="true" />
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-200 p-0.5"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-10 text-center">
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  right,
  children,
  noPadding = false,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  noPadding?: boolean;
}) {
  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      <div className={noPadding ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  maxWidth = 'max-w-xl',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-full ${maxWidth} max-h-[90vh] flex flex-col overflow-hidden`}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 p-1 rounded-md focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function FormField({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="text-red-600 dark:text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

export const INPUT_CLASS =
  'w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20';

export const PRIMARY_BTN =
  'inline-flex items-center justify-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700';

export const SECONDARY_BTN =
  'inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700';

export const DANGER_BTN =
  'inline-flex items-center justify-center gap-2 rounded-md border border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0';

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (val: T) => void;
}) {
  return (
    <div
      className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md"
      role="tablist"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
            value === opt.value
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
