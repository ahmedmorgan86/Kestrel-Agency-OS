import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, UserRound } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { PageHeader, SectionCard } from '../components/ui';

export function EmployeeSummaryView({ employeeId, onBack }: { employeeId: string; onBack: () => void }) {
  const [employee, setEmployee] = useState<Record<string, any> | null>(null);
  const [coworkers, setCoworkers] = useState<Array<Record<string, any>>>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const hq = await apiRequest<{ humans: Array<Record<string, any>> }>('/hq/state');
      const selected = hq.humans.find((person) => person.id === employeeId) || null;
      setEmployee(selected);
      setCoworkers(selected ? hq.humans.filter((person) => person.department_id === selected.department_id && person.id !== selected.id) : []);
      setError(selected ? null : 'هذا العضو غير موجود في قائمة الفريق.');
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذّر تحميل بيانات عضو الفريق.'); }
  }, [employeeId]);

  useEffect(() => { void load(); }, [load]);

  return <div className="space-y-5" dir="rtl">
    <PageHeader title={employee?.full_name || 'ملف عضو الفريق'} subtitle="تخصصات وقيادات الفريق الافتراضي لإنتاج المحتوى" actions={<button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"><ArrowRight className="h-4 w-4" /> العودة</button>} />
    {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>}
    {employee && <div className="grid gap-5 lg:grid-cols-2">
      <SectionCard title="بيانات الدور الوظيفي" description="هذه شخصية افتراضية مرتبطة بمهام إنتاج المحتوى.">
        <div className="flex items-center gap-4"><span className="rounded-full bg-blue-50 p-4 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"><UserRound className="h-7 w-7" /></span><div><div className="text-lg font-semibold">{employee.full_name}</div><div className="text-sm text-slate-500">{employee.job_title}</div></div></div>
        <dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between gap-4 border-t border-slate-200 pt-3 dark:border-slate-800"><dt className="text-slate-500">القسم</dt><dd>{employee.department_name || 'غير محدد'}</dd></div><div className="flex justify-between gap-4 border-t border-slate-200 pt-3 dark:border-slate-800"><dt className="text-slate-500">المدير المباشر</dt><dd>{employee.manager_name || 'إدارة الشركة'}</dd></div><div className="flex justify-between gap-4 border-t border-slate-200 pt-3 dark:border-slate-800"><dt className="text-slate-500">الحالة</dt><dd>{employee.activeMeetingId ? 'في اجتماع' : employee.operationalStatus === 'working' ? 'يعمل على مهمة' : 'متاح'}</dd></div></dl>
      </SectionCard>
      <SectionCard title="زملاء التخصص" description={`أعضاء فريق ${employee.department_name || 'الإنتاج'} `}>
        {coworkers.length ? <div className="divide-y divide-slate-200 dark:divide-slate-800">{coworkers.map((person) => <div key={person.id} className="flex justify-between gap-3 py-3 text-sm"><span className="font-medium">{person.full_name}</span><span className="text-left text-xs text-slate-500">{person.job_title}</span></div>)}</div> : <p className="text-sm text-slate-500">لا يوجد زملاء آخرون في هذا التخصص.</p>}
      </SectionCard>
    </div>}
  </div>;
}
