import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Users } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { PageHeader, SectionCard } from '../components/ui';

export function DepartmentSummaryView({ departmentId, onBack, onOpenEmployee }: { departmentId: string; onBack: () => void; onOpenEmployee: (id: string) => void }) {
  const [department, setDepartment] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const hq = await apiRequest<{ departments: Array<Record<string, any>> }>('/hq/state');
      const current = hq.departments.find((item) => item.id === departmentId) || null;
      setDepartment(current);
      setError(current ? null : 'القسم غير موجود في الهيكل الحالي.');
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذّر تحميل بيانات القسم.'); }
  }, [departmentId]);

  useEffect(() => { void load(); }, [load]);

  return <div className="space-y-5" dir="rtl">
    <PageHeader title={department?.name || 'ملف القسم'} subtitle="تخصص داخلي ضمن فريق إنتاج محتوى MORGAN GROUP" actions={<button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"><ArrowRight className="h-4 w-4" /> العودة</button>} />
    {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>}
    {department && <div className="grid gap-5 lg:grid-cols-2">
      <SectionCard title="تخصص القسم" description={department.description || 'تخصص ضمن دورة إنتاج المحتوى.'}>
        <dl className="space-y-3 text-sm"><div className="flex justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-800"><dt className="text-slate-500">المدير</dt><dd>{department.manager_name || 'غير محدد'}</dd></div><div className="flex justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-800"><dt className="text-slate-500">أعضاء الفريق</dt><dd>{department.employee_count || 0}</dd></div><div className="flex justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-800"><dt className="text-slate-500">الحالة</dt><dd>{department.status === 'active' ? 'نشط' : 'متوقف'}</dd></div></dl>
      </SectionCard>
      <SectionCard title="أعضاء التخصص" description="اختر عضواً لعرض دوره ومديره المباشر.">
        <div className="divide-y divide-slate-200 dark:divide-slate-800">{(department.members || []).map((member: Record<string, any>) => <button key={member.id} type="button" onClick={() => onOpenEmployee(member.id)} className="flex w-full items-center justify-between gap-3 py-3 text-right"><span><span className="block text-sm font-medium">{member.full_name}</span><span className="text-xs text-slate-500">{member.job_title}</span></span><Users className="h-4 w-4 text-slate-400" /></button>)}</div>
      </SectionCard>
    </div>}
  </div>;
}
