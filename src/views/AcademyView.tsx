import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, CheckCircle2, GraduationCap, LoaderCircle, RefreshCw, Sparkles, UserRoundPlus } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { ErrorBanner, PageHeader, PRIMARY_BTN, SECONDARY_BTN, SectionCard, StatusText } from '../components/ui';

type Course = {
  id: string;
  title: string;
  description: string;
  lessons: string[];
  enrollment_count: number;
  completion_count: number;
};

type Employee = { id: string; full_name: string; job_title: string; department_name?: string };
type Enrollment = {
  id: string;
  course_id: string;
  employee_id: string;
  full_name: string;
  job_title: string;
  department_name?: string;
  course_title: string;
  progress_percent: number;
  status: 'enrolled' | 'in_progress' | 'completed';
  enrolled_at: string;
};

type AcademyResponse = { courses: Course[]; employees: Employee[]; enrollments: Enrollment[] };

export function AcademyView() {
  const [data, setData] = useState<AcademyResponse>({ courses: [], employees: [], enrollments: [] });
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [progressDrafts, setProgressDrafts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiRequest<AcademyResponse>('/academy');
      setData(response);
      setSelectedEmployee((current) => current || response.employees[0]?.id || '');
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the academy.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedEnrollments = useMemo(
    () => data.enrollments.filter((enrollment) => enrollment.employee_id === selectedEmployee),
    [data.enrollments, selectedEmployee]
  );
  const completedCount = data.enrollments.filter((enrollment) => enrollment.status === 'completed').length;
  const activeCount = data.enrollments.filter((enrollment) => enrollment.status !== 'completed').length;

  const enroll = async (course: Course) => {
    if (!selectedEmployee) return;
    setSavingId(course.id);
    setNotice('');
    try {
      await apiRequest(`/academy/${encodeURIComponent(course.id)}/enrollments`, {
        method: 'POST', body: { employeeId: selectedEmployee },
      });
      setNotice('Enrollment saved.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not enroll this employee.');
    } finally {
      setSavingId('');
    }
  };

  const updateProgress = async (enrollment: Enrollment) => {
    const progressPercent = progressDrafts[enrollment.id] ?? enrollment.progress_percent;
    setSavingId(enrollment.id);
    setNotice('');
    try {
      await apiRequest(`/academy/enrollments/${encodeURIComponent(enrollment.id)}`, {
        method: 'PATCH', body: { progressPercent },
      });
      setNotice('Learning progress saved to the company record.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save learning progress.');
    } finally {
      setSavingId('');
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="MORGAN Academy"
        subtitle="A shared learning space for the people building MORGAN GROUP. Enroll team members and keep a clear record of progress."
        actions={<button onClick={() => void load()} className={SECONDARY_BTN}><RefreshCw className="h-4 w-4" /> Refresh</button>}
      />
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">{notice}</div>}

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#10263a] via-[#12374a] to-[#11615f] p-6 text-white shadow-lg sm:p-9">
        <div className="absolute -right-10 -top-20 h-64 w-64 rounded-full border border-white/10" />
        <div className="absolute -right-2 -top-12 h-48 w-48 rounded-full border border-white/10" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-2xl"><div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide"><GraduationCap className="h-4 w-4" /> LEARN · PRACTICE · GROW</div><h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Grow with every chapter.</h2><p className="mt-3 text-sm leading-6 text-cyan-50/80 sm:text-base">Practical learning paths for company foundations, responsible AI, security, and professional craft. Progress is stored and visible to authorized company leaders.</p></div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-64"><div className="rounded-2xl border border-white/15 bg-black/15 p-4"><BookOpenCheck className="h-4 w-4 text-cyan-200" /><div className="mt-3 text-2xl font-semibold">{loading ? '—' : data.courses.length}</div><div className="mt-1 text-xs text-cyan-50/70">Learning paths</div></div><div className="rounded-2xl border border-white/15 bg-black/15 p-4"><CheckCircle2 className="h-4 w-4 text-emerald-200" /><div className="mt-3 text-2xl font-semibold">{loading ? '—' : completedCount}</div><div className="mt-1 text-xs text-cyan-50/70">Completed paths</div></div></div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Active enrollments', value: activeCount, icon: UserRoundPlus },
          { label: 'Completed learning paths', value: completedCount, icon: CheckCircle2 },
          { label: 'Team members', value: data.employees.length, icon: GraduationCap },
        ].map(({ label, value, icon: Icon }) => <div key={label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-50 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200"><Icon className="h-5 w-5" /></div><div><div className="text-2xl font-semibold text-slate-900 dark:text-white">{loading ? '—' : value}</div><div className="text-xs text-slate-500 dark:text-slate-400">{label}</div></div></div>)}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-semibold text-slate-900 dark:text-white">Learning paths</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose a colleague to review or update their learning plan.</p></div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Team member<select value={selectedEmployee} onChange={(event) => setSelectedEmployee(event.target.value)} className="mt-1.5 block w-full min-w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white"><option value="">Select a team member</option>{data.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.job_title}</option>)}</select></label></div>
        {loading && data.courses.length === 0 ? <div className="flex items-center gap-2 py-12 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading academy…</div> : <div className="grid gap-4 xl:grid-cols-2">
          {data.courses.map((course, index) => {
            const enrollment = selectedEnrollments.find((item) => item.course_id === course.id);
            const progress = enrollment ? progressDrafts[enrollment.id] ?? enrollment.progress_percent : 0;
            return <article key={course.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="h-1.5 bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-400" /><div className="p-5 sm:p-6"><div className="flex items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 font-mono text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">0{index + 1}</div><div className="min-w-0 flex-1"><h3 className="text-base font-semibold text-slate-900 dark:text-white">{course.title}</h3><p className="mt-1.5 text-sm leading-5 text-slate-500 dark:text-slate-400">{course.description}</p></div><Sparkles className="h-4 w-4 shrink-0 text-violet-500" /></div>
              <div className="mt-5"><div className="mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400"><span>Curriculum</span><span>{course.lessons.length} lessons</span></div><ul className="grid gap-2 sm:grid-cols-2">{course.lessons.map((lesson) => <li key={lesson} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:bg-slate-950 dark:text-slate-300"><span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />{lesson}</li>)}</ul></div>
              <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">{enrollment ? <><div className="flex items-center justify-between gap-3"><div><div className="text-xs font-medium text-slate-500 dark:text-slate-400">{enrollment.full_name} · {enrollment.department_name || enrollment.job_title}</div><div className="mt-1"><StatusText status={enrollment.status} /></div></div><div className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-200">{progress}%</div></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all" style={{ width: `${progress}%` }} /></div><div className="mt-3 flex flex-wrap items-center gap-3"><label className="flex min-w-40 flex-1 items-center gap-3 text-xs text-slate-500 dark:text-slate-400"><span>Progress</span><input type="range" min="0" max="100" step="10" value={progress} onChange={(event) => setProgressDrafts((current) => ({ ...current, [enrollment.id]: Number(event.target.value) }))} className="w-full accent-cyan-600" /></label><button disabled={savingId === enrollment.id} onClick={() => void updateProgress(enrollment)} className={PRIMARY_BTN}>{savingId === enrollment.id ? 'Saving…' : 'Save progress'}</button></div></> : <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500 dark:text-slate-400">Enroll the selected team member to start tracking this path.</p><button disabled={!selectedEmployee || savingId === course.id} onClick={() => void enroll(course)} className={PRIMARY_BTN}>{savingId === course.id ? 'Enrolling…' : 'Enroll team member'}</button></div>}</div>
            </div></article>;
          })}
        </div>}
      </section>
      <SectionCard title="Learning records" description="Enrollment and progress changes are kept in the audit log."><p className="text-sm text-slate-600 dark:text-slate-300">{data.enrollments.length === 0 ? 'No one is enrolled yet. Choose a team member above and add them to a learning path.' : `${data.enrollments.length} enrollment${data.enrollments.length === 1 ? '' : 's'} tracked across MORGAN GROUP.`} {data.employees.length === 0 ? 'No team roster is available.' : `${data.employees.length} active virtual team members are available.`}</p></SectionCard>
    </div>
  );
}
