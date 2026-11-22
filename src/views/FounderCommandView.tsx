import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpLeft, BookOpenCheck, Building2, FilePlus2, ShieldCheck, Users, Video } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { PRIMARY_BTN, SectionCard } from '../components/ui';

interface FounderSnapshot {
  hq: { counts: Record<string, number>; departments: Array<Record<string, any>> };
  items: Array<Record<string, any>>;
  approvals: Array<Record<string, any>>;
}

export function FounderCommandView({ onNavigate }: { onNavigate: (route: string) => void }) {
  const [snapshot, setSnapshot] = useState<FounderSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [hq, content, approvals] = await Promise.all([
        apiRequest<FounderSnapshot['hq']>('/hq/state'),
        apiRequest<{ items: Array<Record<string, any>> }>('/content'),
        apiRequest<{ approvals: Array<Record<string, any>> }>('/approvals'),
      ]);
      setSnapshot({ hq, items: content.items, approvals: approvals.approvals });
      setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذّر تحميل لوحة المالك.'); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const pendingCount = snapshot?.approvals.filter((item) => item.status === 'pending').length ?? 0;
  const activeMeetingCount = snapshot?.hq.counts.activeMeetings ?? 0;
  const inProgressCount = snapshot?.items.filter((item) => !['approved', 'published', 'archived'].includes(item.status)).length ?? 0;

  return <main className="space-y-5 pb-8" dir="rtl">
    <section className="overflow-hidden rounded-3xl bg-gradient-to-bl from-[#0b1726] via-[#12304a] to-[#0d4852] text-white shadow-xl">
      <div className="grid gap-8 p-6 sm:p-9 lg:grid-cols-[1.2fr_.8fr] lg:items-end lg:p-11">
        <div><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 text-xs text-cyan-100"><ShieldCheck className="h-4 w-4" /> لوحة المالك</div><h1 className="max-w-2xl text-3xl font-semibold sm:text-5xl">أهلاً بك في MORGAN GROUP</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200">مساحة خاصة لإدارة فريق إنتاج المحتوى ومراجعة كل منشور قبل اعتماده. قرار النشر النهائي لك وحدك.</p><button type="button" onClick={() => onNavigate('hq')} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-cyan-50"><Building2 className="h-4 w-4" /> دخول مقر الشركة ثلاثي الأبعاد <ArrowLeft className="h-4 w-4" /></button></div>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['فريق العمل', snapshot?.hq.counts.virtualEmployees ?? '—', Users],
            ['تخصصات الفريق', snapshot?.hq.counts.totalDepartments ?? '—', BookOpenCheck],
            ['موافقات تنتظر قرارك', pendingCount, ShieldCheck],
            ['محتوى قيد الإنتاج', inProgressCount, FilePlus2],
          ].map(([label, value, Icon]) => { const TileIcon = Icon as typeof Users; return <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[.07] p-4"><TileIcon className="h-4 w-4 text-cyan-200" /><div className="mt-3 text-2xl font-semibold">{value as React.ReactNode}</div><div className="mt-1 text-xs text-slate-300">{label as string}</div></div>; })}
        </div>
      </div>
    </section>
    {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}<button className="mr-3 underline" onClick={() => void refresh()}>إعادة المحاولة</button></div>}
    <div className="grid gap-5 lg:grid-cols-2">
      <SectionCard title="القرار النهائي للنشر" description="الموافقة محفوظة على نسخة محددة، وأي تعديل يبطلها.">
        {pendingCount ? <div className="space-y-3">{snapshot?.approvals.filter((approval) => approval.status === 'pending').slice(0, 4).map((approval) => <button key={approval.id} className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-right dark:border-amber-900 dark:bg-amber-950/30" onClick={() => onNavigate('approvals')}><span className="font-medium">{approval.summary}</span><ArrowUpLeft className="h-4 w-4" /></button>)}<button type="button" className={PRIMARY_BTN} onClick={() => onNavigate('approvals')}>مراجعة كل طلبات الموافقة</button></div> : <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-950/50 dark:text-slate-300">لا توجد منشورات تنتظر قرارك. كل محتوى جديد يحتاج موافقتك قبل النشر.</div>}
      </SectionCard>
      <SectionCard title="فريق إنتاج المحتوى" description="30 شخصية افتراضية، لكل منها تخصص ومدير ضمن الهيكل.">
        <div className="grid grid-cols-2 gap-2">{(snapshot?.hq.departments || []).slice(0, 6).map((department) => <div key={department.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"><div className="font-medium">{department.name}</div><div className="mt-1 text-xs text-slate-500">{department.employee_count || 0} أعضاء</div></div>)}</div>
        <button type="button" className={`${PRIMARY_BTN} mt-4`} onClick={() => onNavigate('hq')}><Users className="h-4 w-4" /> استكشاف الفريق في المقر</button>
      </SectionCard>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        { label: 'إنتاج محتوى جديد', detail: 'مسودة لمنصات التواصل', route: 'content', icon: FilePlus2 },
        { label: 'اجتماع فريق', detail: `${activeMeetingCount} اجتماعات جارية`, route: 'meetings', icon: Video },
        { label: 'أكاديمية الفريق', detail: 'مواد تدريبية داخلية', route: 'academy', icon: BookOpenCheck },
      ].map(({ label, detail, route, icon: Icon }) => <button key={route} type="button" onClick={() => onNavigate(route)} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-right transition hover:border-blue-400 dark:border-slate-800 dark:bg-slate-900"><span className="rounded-lg bg-blue-50 p-2 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"><Icon className="h-5 w-5" /></span><span><span className="block font-semibold">{label}</span><span className="text-xs text-slate-500">{detail}</span></span><ArrowLeft className="mr-auto h-4 w-4 text-slate-400" /></button>)}
    </div>
  </main>;
}
