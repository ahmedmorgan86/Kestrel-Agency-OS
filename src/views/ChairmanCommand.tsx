import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  BookOpenCheck,
  Building2,
  CheckCheck,
  CircleDollarSign,
  Clock3,
  Network,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { apiRequest } from '../lib/api';

type HqSnapshot = {
  syncedAt?: string;
  counts?: {
    pendingApprovals?: number;
    unreadNotifications?: number;
    activeMeetings?: number;
    workingAgents?: number;
    totalHumans?: number;
    virtualEmployees?: number;
    totalAgents?: number;
    totalDepartments?: number;
  };
};

const formatTime = (value?: string) => {
  if (!value) return 'Awaiting first sync';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Recently synchronized'
    : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
};

export function ChairmanCommand({ onNavigate }: { onNavigate: (route: string) => void }) {
  const [snapshot, setSnapshot] = useState<HqSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await apiRequest<HqSnapshot>('/hq/state'));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The live company snapshot is unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const counts = snapshot?.counts ?? {};
  const metrics = [
    { label: 'Virtual team', value: counts.virtualEmployees, suffix: 'of 30 planned', icon: UsersRound, accent: 'text-sky-300' },
    { label: 'AI colleagues', value: counts.totalAgents, suffix: 'configured agents', icon: Sparkles, accent: 'text-violet-300' },
    { label: 'Departments', value: counts.totalDepartments, suffix: 'operating units', icon: Network, accent: 'text-emerald-300' },
    { label: 'Awaiting decision', value: counts.pendingApprovals, suffix: 'chairman approvals', icon: ShieldCheck, accent: 'text-amber-300' },
  ];

  return (
    <main className="space-y-6 pb-8">
      <section className="relative overflow-hidden rounded-3xl bg-[#0b1726] text-white shadow-xl shadow-slate-900/10">
        <div className="pointer-events-none absolute -right-20 -top-36 h-[28rem] w-[28rem] rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-4 -top-20 h-[22rem] w-[22rem] rounded-full border border-white/10" />
        <div className="pointer-events-none absolute right-10 top-12 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative grid gap-8 p-6 sm:p-9 lg:grid-cols-[1.1fr_.9fr] lg:items-end lg:p-11">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 text-[11px] font-semibold tracking-[.18em] text-cyan-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" />
              CHAIRMAN'S OFFICE <span className="text-white/30">/</span> COMPANY PULSE
            </div>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">Good to see you,<br /><span className="text-cyan-200">Chairman.</span></h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">Your company at a glance. Review what needs your attention, check in with the team, and keep MORGAN GROUP moving forward.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button onClick={() => onNavigate('hq')} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-cyan-50"><Building2 className="h-4 w-4" /> Enter the headquarters <ArrowUpRight className="h-4 w-4" /></button>
              <button onClick={() => onNavigate('approvals')} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/[.06] px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"><CheckCheck className="h-4 w-4" /> Review decisions</button>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[.055] p-5 backdrop-blur sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div><div className="text-[11px] font-semibold tracking-[.17em] text-slate-400">CHAIRMAN DAILY BRIEFING</div><div className="mt-2 text-lg font-medium">Today at MORGAN GROUP</div></div>
              <button onClick={() => void refresh()} aria-label="Refresh company briefing" className="rounded-lg border border-white/10 p-2 text-slate-300 transition hover:bg-white/10"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
            </div>
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3"><span className="flex items-center gap-2.5 text-sm text-slate-300"><CheckCheck className="h-4 w-4 text-amber-300" /> Decisions to review</span><strong className="font-mono text-lg">{counts.pendingApprovals ?? '—'}</strong></div>
              <div className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3"><span className="flex items-center gap-2.5 text-sm text-slate-300"><Sparkles className="h-4 w-4 text-violet-300" /> AI agents working</span><strong className="font-mono text-lg">{counts.workingAgents ?? '—'}</strong></div>
              <div className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3"><span className="flex items-center gap-2.5 text-sm text-slate-300"><Clock3 className="h-4 w-4 text-cyan-300" /> Last live sync</span><strong className="text-xs font-medium">{formatTime(snapshot?.syncedAt)}</strong></div>
            </div>
            {error && <p role="status" className="mt-4 text-xs leading-5 text-amber-200">Live briefing unavailable: {error}</p>}
            {!error && <p className="mt-4 text-xs text-slate-400">Live company data · {loading ? 'updating' : 'synchronized'}</p>}
          </div>
        </div>
      </section>

      <section aria-label="Company metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, suffix, icon: Icon, accent }) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</span><Icon className={`h-4 w-4 ${accent}`} /></div>
            <div className="mt-3 flex items-baseline gap-2"><strong className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{loading && value === undefined ? '—' : value ?? 0}</strong><span className="text-xs text-slate-500 dark:text-slate-400">{suffix}</span></div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
          <div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold tracking-[.16em] text-cyan-700 dark:text-cyan-300">MORGAN ACADEMY</div><h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">Build the company’s next chapter</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">A learning home for the people and AI colleagues who move us forward.</p></div><div className="hidden h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 sm:flex"><BookOpenCheck className="h-5 w-5" /></div></div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              ['01', 'Company foundations', 'Purpose, principles & ways of working'],
              ['02', 'AI collaboration', 'Working confidently with AI colleagues'],
              ['03', 'Leadership & craft', 'Grow skills through practice and feedback'],
            ].map(([number, title, detail]) => <div key={number} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"><span className="font-mono text-xs text-cyan-700 dark:text-cyan-300">{number} / LEARNING PATH</span><h3 className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3><p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</p></div>)}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><Sparkles className="h-3.5 w-3.5 text-violet-500" /> Academy courses and team learning records are available.</div><button onClick={() => onNavigate('academy')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-800 hover:text-cyan-600 dark:text-cyan-300">Open Academy <ArrowUpRight className="h-4 w-4" /></button></div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
          <div className="text-xs font-semibold tracking-[.16em] text-slate-400">YOUR NEXT MOVES</div><h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">Lead from the front</h2>
          <div className="mt-5 space-y-2">
            {[
              { icon: ShieldCheck, title: 'Review approvals', detail: 'Keep important decisions in your hands.', route: 'approvals' },
              { icon: UsersRound, title: 'Meet your people', detail: 'Explore the team and department leads.', route: 'employees' },
              { icon: CircleDollarSign, title: 'Review company finances', detail: 'Open the current finance workspace.', route: 'finance' },
            ].map(({ icon: Icon, title, detail, route }) => <button key={route} onClick={() => onNavigate(route)} className="group flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><strong className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</strong><span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{detail}</span></span><ArrowUpRight className="h-4 w-4 text-slate-400 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></button>)}
          </div>
          <button onClick={() => onNavigate('hq')} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-cyan-800 hover:text-cyan-600 dark:text-cyan-300 dark:hover:text-cyan-200"><Building2 className="h-4 w-4" /> Open virtual headquarters</button>
        </article>
      </section>
    </main>
  );
}
