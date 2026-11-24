import React, { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, LoaderCircle, Play, RotateCcw, Sparkles } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { ErrorBanner, FormField, INPUT_CLASS, PageHeader, PRIMARY_BTN, SECONDARY_BTN, SectionCard } from '../components/ui';

type Run = Record<string, any>;

const STATUS_LABELS: Record<string, string> = {
  queued: 'في قائمة التشغيل', researching: 'يرصد المصادر الآن', producing: 'ينتج المحتوى',
  owner_review: 'بانتظار قرارك', accepted: 'قبلته', changes_requested: 'طُلبت إعادة إنتاجه', failed: 'توقف بسبب مشكلة',
};
const TASK_STATUS_LABELS: Record<string, string> = {
  queued: 'لم تبدأ بعد', running: 'قيد التنفيذ', completed: 'اكتملت', failed: 'تعذرت',
};
const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'إنستغرام', tiktok: 'تيك توك', youtube: 'يوتيوب', facebook: 'فيسبوك', linkedin: 'لينكدإن',
};
const FORMAT_LABELS: Record<string, string> = {
  reel: 'ريل قصير', short_video: 'فيديو قصير', carousel: 'منشور متعدد الشرائح', post: 'منشور ثابت', thread: 'سلسلة منشورات',
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="mb-4 text-lg font-semibold">{title}</h2>{children}</section>;
}

export function MorganProductionView() {
  const [form, setForm] = useState({ niche: '', audience: '', platform: 'instagram', format: 'reel' });
  const [readiness, setReadiness] = useState<Record<string, any> | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const loadRuns = useCallback(async () => {
    const [history, status] = await Promise.all([
      apiRequest<{ runs: Run[] }>('/morgan-production'),
      apiRequest<Record<string, any>>('/morgan-production/readiness'),
    ]);
    setRuns(history.runs);
    setReadiness(status);
  }, []);

  const loadRun = useCallback(async (id: string) => {
    const result = await apiRequest<{ run: Run }>(`/morgan-production/${id}`);
    setActiveRun(result.run);
    return result.run;
  }, []);

  useEffect(() => {
    void loadRuns().catch((err) => setError(err instanceof Error ? err.message : 'تعذر تحميل لوحة الإنتاج.'));
  }, [loadRuns]);

  useEffect(() => {
    if (!activeRunId) return;
    let disposed = false;
    const poll = async () => {
      try {
        const result = await apiRequest<{ run: Run }>(`/morgan-production/${activeRunId}`);
        if (!disposed) {
          setActiveRun(result.run);
          setRuns((current) => [result.run, ...current.filter((run) => run.id !== result.run.id)]);
        }
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : 'تعذر تحديث حالة التشغيل.');
      }
    };
    void poll();
    const timer = window.setInterval(() => {
      if (!['owner_review', 'accepted', 'changes_requested', 'failed'].includes(activeRun?.status)) void poll();
    }, 2500);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [activeRunId, activeRun?.status]);

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null); setNotice(''); setBusy(true);
    try {
      const result = await apiRequest<{ runId: string; assignedEmployeeCount: number }>('/morgan-production', { method: 'POST', body: form });
      setActiveRunId(result.runId);
      setNotice(`بدأ التشغيل وأُسندت ${result.assignedEmployeeCount} مهام إلى وكلاء الذكاء الاصطناعي المتخصصين.`);
      setReviewNote('');
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر بدء الإنتاج.');
    } finally { setBusy(false); }
  };

  const decide = async (decision: 'accepted' | 'changes_requested') => {
    if (!activeRun) return;
    setError(null); setNotice(''); setBusy(true);
    try {
      const result = await apiRequest<{ nextRunId?: string }>(`/morgan-production/${activeRun.id}/decision`, {
        method: 'POST', body: { decision, comments: reviewNote },
      });
      if (result.nextRunId) {
        setActiveRunId(result.nextRunId);
        setNotice('وصلت ملاحظاتك للفريق وبدأت جولة إنتاج جديدة.');
      } else {
        setNotice('سُجل قبولك لهذه النسخة. لم يتم نشرها أو إرسالها لأي منصة.');
        await loadRun(activeRun.id);
      }
      setReviewNote('');
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل قرارك.');
    } finally { setBusy(false); }
  };

  const retryFailedRun = async () => {
    if (!activeRun) return;
    setError(null); setNotice(''); setBusy(true);
    try {
      const result = await apiRequest<{ runId: string; assignedEmployeeCount: number }>(`/morgan-production/${activeRun.id}/retry`, {
        method: 'POST', body: {},
      });
      setActiveRunId(result.runId);
      setReviewNote('');
      setNotice(`أُنشئت جولة بديلة وأُسندت ${result.assignedEmployeeCount} مهام للفريق. لم يُنشر أي محتوى.`);
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذرت إعادة تشغيل الإنتاج.');
    } finally { setBusy(false); }
  };

  const current = activeRun;
  const deliverable = current?.deliverable || {};
  const content = deliverable.content || {};
  const quality = deliverable.qualityReview || {};

  return <div className="space-y-6" dir="rtl">
    <PageHeader title="تشغيل إنتاج المحتوى" subtitle="اختر المجال والجمهور والمنصة. يبحث النظام في مصادر فعلية، يوزع مهاماً على الفريق، ثم يرفع النسخة لمراجعتك. لا يحدث أي نشر تلقائي." />
    <ErrorBanner message={error} onDismiss={() => setError(null)} />
    {notice && <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">{notice}</div>}

    <div role="status" className={`rounded-xl border p-4 text-sm ${readiness?.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100' : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'}`}>
      <div className="font-semibold">{readiness?.ready ? 'محرك الذكاء الاصطناعي جاهز' : readiness?.workerConnected ? 'العامل متصل والنموذج غير جاهز' : 'عامل الإنتاج غير متصل'}</div>
      <p className="mt-1">{readiness?.detail || 'جارٍ التحقق من محرك الكتابة ومصادر البحث.'} {readiness?.model ? `النموذج: ${readiness.model}.` : ''}</p>
      {readiness?.lastSeenAt && <p className="mt-1 text-xs opacity-75">آخر اتصال بعامل الإنتاج: {new Date(readiness.lastSeenAt).toLocaleString('ar-EG')}</p>}
    </div>
    <p className="text-xs leading-6 text-slate-500">رصد الموضوعات يعتمد حالياً على مصادر أخبار عامة حديثة وروابطها؛ لا يعرض أرقام رواج رسمية من تيك توك أو إنستغرام أو يوتيوب.</p>

    <Panel title="ابدأ إنتاجاً جديداً">
      <form onSubmit={start} className="grid gap-4 md:grid-cols-2">
        <FormField label="مجال المحتوى" htmlFor="morgan-niche" required>
          <input id="morgan-niche" required minLength={3} maxLength={180} value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} placeholder="مثال: أدوات الذكاء الاصطناعي للطلاب" className={INPUT_CLASS} />
        </FormField>
        <FormField label="الجمهور المستهدف" htmlFor="morgan-audience">
          <input id="morgan-audience" maxLength={300} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} placeholder="مثال: طلاب الجامعات في مصر" className={INPUT_CLASS} />
        </FormField>
        <FormField label="المنصة" htmlFor="morgan-platform">
          <select id="morgan-platform" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className={INPUT_CLASS}>
            <option value="instagram">إنستغرام</option><option value="tiktok">تيك توك</option><option value="youtube">يوتيوب</option><option value="facebook">فيسبوك</option><option value="linkedin">لينكدإن</option>
          </select>
        </FormField>
        <FormField label="شكل المحتوى" htmlFor="morgan-format">
          <select id="morgan-format" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} className={INPUT_CLASS}>
            <option value="reel">ريل قصير</option><option value="short_video">فيديو قصير</option><option value="carousel">منشور متعدد الشرائح</option><option value="post">منشور ثابت</option><option value="thread">سلسلة منشورات</option>
          </select>
        </FormField>
        <div className="md:col-span-2 flex justify-start">
          <button type="submit" disabled={busy || !readiness?.ready} className={`${PRIMARY_BTN} disabled:cursor-not-allowed disabled:opacity-50`}><Play className="h-4 w-4" /> ابدأ البحث والإنتاج</button>
        </div>
        {!readiness?.ready && <p className="md:col-span-2 text-xs text-slate-500">{readiness?.workerConnected ? 'العامل متصل بالفعل؛ انتظر اكتمال تثبيت النموذج المجاني على Ollama. سيُفتح الإنتاج تلقائياً بعد تأكيد جاهزيته.' : 'لن ينشئ النظام طلباً وهمياً. يلزم تشغيل عامل إنتاج مجاني متصل بقاعدة Neon وبمحرك Ollama، ثم سيظهر هنا أنه جاهز.'}</p>}
      </form>
    </Panel>

    {current && <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div><div className="text-xs text-slate-500">{current.niche} · {PLATFORM_LABELS[current.platform] || current.platform} · {FORMAT_LABELS[current.format] || current.format} · الجولة {current.iteration}</div><div className="mt-1 text-lg font-semibold">{STATUS_LABELS[current.status] || current.status}</div></div>
        {['queued', 'researching', 'producing'].includes(current.status) && <span className="inline-flex items-center gap-2 text-sm text-blue-700"><LoaderCircle className="h-4 w-4 animate-spin" /> جارٍ التنفيذ</span>}
        {current.status === 'accepted' && <span className="text-sm font-medium text-emerald-700">قرار المالك محفوظ</span>}
      </div>

      {!!current.tasks?.length && <Panel title="تكليفات فريق الشركة الافتراضي"><div className="mb-2 text-xs text-slate-500">هذه الشخصيات وسير العمل رقمية. النموذج المحلي ينفذ العمل ويحفظ نتيجة كل تخصص في سجل المهمة.</div><div className="divide-y divide-slate-100 dark:divide-slate-800">{current.tasks.map((task: Run) => <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span><strong>{task.employee_name || 'موظف'}</strong> · {task.title}</span><span className="text-slate-500">{TASK_STATUS_LABELS[task.status] || 'حالة غير معروفة'}</span></div>)}</div></Panel>}

      {!!current.sources?.length && <Panel title={`اتجاهات البحث والأخبار (${current.sources.length})`}><div className="grid gap-3 md:grid-cols-2">{current.sources.map((source: Run) => <div key={source.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><a href={source.url} target="_blank" rel="noreferrer" className="block rounded-md hover:text-blue-700"><div className="flex items-start justify-between gap-2"><div className="font-medium">{source.title}</div><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-800">{source.sourceType === 'search_trend' ? 'مؤشر بحث' : 'خبر مرتبط'}</span></div><div className="mt-1 flex items-center gap-2 text-xs text-slate-500">{source.publisher} · {source.publishedAt ? new Date(source.publishedAt).toLocaleDateString('ar-EG') : 'تاريخ غير متاح'} <ExternalLink className="h-3 w-3" /></div>{source.approxTraffic && <p className="mt-2 text-xs font-medium text-blue-700">حركة البحث التقريبية في Google Trends: {source.approxTraffic}</p>}{source.snippet && <p className="mt-2 text-sm text-slate-600">{source.snippet}</p>}</a>{source.relatedArticles?.length > 0 && <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800"><div className="mb-1 text-xs font-medium text-slate-500">تغطيات مرتبطة</div>{source.relatedArticles.map((article: Run, index: number) => <a key={`${source.id}-article-${index}`} href={article.url} target="_blank" rel="noreferrer" className="mt-1 block text-xs leading-5 text-blue-700 hover:underline">{article.publisher}: {article.title}</a>)}</div>}</div>)}</div><p className="mt-3 text-xs leading-6 text-slate-500">مؤشرات Google Trends تقيس اهتمام البحث العام في مصر، والأخبار تساعد في فهم السياق؛ لا تمثل أرقام رواج تيك توك أو إنستغرام أو يوتيوب.</p></Panel>}

      {!!content.title && <>
        <Panel title="استراتيجية المحتوى"><div className="space-y-2 text-sm"><p><strong>الزاوية:</strong> {deliverable.strategy?.contentAngle || '—'}</p><p><strong>هدف المادة:</strong> {deliverable.strategy?.objective || '—'}</p><p><strong>قراءة الجمهور:</strong> {deliverable.strategy?.audienceInsight || '—'}</p></div></Panel>
        <Panel title={content.title}><div className="space-y-4 text-sm"><p className="rounded-lg bg-slate-50 p-3 font-semibold dark:bg-slate-800">{content.hook}</p><div><h3 className="mb-1 font-semibold">النص المنشور</h3><p className="whitespace-pre-wrap leading-7">{content.caption}</p></div>{content.script && <div><h3 className="mb-1 font-semibold">السيناريو</h3><p className="whitespace-pre-wrap leading-7">{content.script}</p></div>}<p><strong>دعوة التفاعل:</strong> {content.callToAction}</p><p className="text-blue-700">{content.hashtags?.join(' ')}</p></div></Panel>
        <Panel title="التنفيذ البصري"><div className="space-y-3 text-sm"><p>{deliverable.creative?.visualDirection}</p>{deliverable.creative?.storyboard?.map((shot: Run, index: number) => <div key={index} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><strong>لقطة {shot.number || index + 1}</strong>{shot.duration ? ` · ${shot.duration}` : ''}<div className="mt-1">{shot.description || shot.scene || JSON.stringify(shot)}</div></div>)}</div></Panel>
        <Panel title="المراجعة الداخلية"><div className="space-y-2 text-sm"><div className={`font-semibold ${quality.readyForOwner ? 'text-emerald-700' : 'text-amber-700'}`}>{quality.readyForOwner ? 'اجتازت المراجعة الأولية وتنتظر قرارك' : 'لم تجتز مراجعة الجودة'}</div>{[...quality.languageIssues || [], ...quality.unsupportedClaims || [], ...quality.policyRisks || [], ...quality.recommendations || []].map((item: string, index: number) => <p key={index}>• {item}</p>)}{content.factsToVerify?.length > 0 && <p><strong>تحقق قبل الاستخدام:</strong> {content.factsToVerify.join(' · ')}</p>}</div></Panel>
      </>}

      {current.status === 'failed' && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><div><strong>توقف الإنتاج:</strong> {current.error_message} لا توجد نسخة جاهزة للموافقة.</div>{!(content.title && quality.readyForOwner === false) && <button type="button" disabled={busy || !readiness?.ready} onClick={() => void retryFailedRun()} className={SECONDARY_BTN}><RotateCcw className="h-4 w-4" /> إعادة تشغيل الطلب</button>}</div>}

      {current.status === 'owner_review' && <Panel title={quality.readyForOwner ? 'قرارك النهائي' : 'ملاحظات الجودة وإعادة الإنتاج'}><p className="mb-3 text-sm text-slate-600">{quality.readyForOwner ? 'موافقتك تسجل قبول النسخة فقط. النشر الخارجي يظل خطوة منفصلة تتطلب موافقتك الصريحة على المنصة والموعد.' : 'المراجع الداخلي يوصي بعدم قبول هذه النسخة. يمكنك الاطلاع عليها وكتابة توجيهات لجولة إنتاج جديدة؛ يظل القبول مقفولاً حتى تجتاز الجودة.'}</p><textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={3} placeholder={quality.readyForOwner ? 'اكتب ملاحظاتك إذا أردت إعادة الإنتاج' : 'ما الذي تريد تغييره قبل إعادة الإنتاج؟'} className={INPUT_CLASS} /><div className="mt-3 flex flex-wrap gap-2">{quality.readyForOwner && <button type="button" disabled={busy} onClick={() => void decide('accepted')} className={PRIMARY_BTN}><Check className="h-4 w-4" /> أقبل النسخة</button>}<button type="button" disabled={busy || reviewNote.trim().length < 2} onClick={() => void decide('changes_requested')} className={SECONDARY_BTN}><RotateCcw className="h-4 w-4" /> {quality.readyForOwner ? 'أعد الإنتاج بملاحظاتي' : 'ابدأ جولة إنتاج جديدة'}</button></div></Panel>}
      {current.status === 'failed' && content.title && quality.readyForOwner === false && <Panel title="إعادة الإنتاج بعد ملاحظات الجودة"><p className="mb-3 text-sm text-amber-800">أوقف المراجع الداخلي النسخة. يمكنك إضافة توجيهاتك ليستخدمها الفريق في جولة جديدة؛ لا يمكن قبول هذه النسخة.</p><textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={3} placeholder="ما الذي تريد تغييره؟" className={INPUT_CLASS} /><button type="button" disabled={busy || reviewNote.trim().length < 2} onClick={() => void decide('changes_requested')} className={`${SECONDARY_BTN} mt-3`}><RotateCcw className="h-4 w-4" /> ابدأ إعادة الإنتاج</button></Panel>}
      {!!current.decisions?.length && <Panel title="سجل قرارات المالك"><div className="space-y-3">{current.decisions.map((decision: Run, index: number) => <div key={`${decision.version_hash}-${index}`} className="border-r-2 border-blue-300 pr-3 text-sm"><div className="font-medium">{decision.decision === 'accepted' ? 'قبول النسخة' : 'طلب إعادة الإنتاج'} · {decision.reviewer_name || 'المالك'}</div><div className="mt-1 text-slate-500">بصمة النسخة {String(decision.version_hash || '').slice(0, 16)} · {new Date(decision.decided_at).toLocaleString('ar-EG')}</div>{decision.comments && <p className="mt-1">الملاحظات: {decision.comments}</p>}</div>)}</div></Panel>}
    </>}

    <Panel title="سجل الإنتاج"><div className="space-y-2">{runs.length ? runs.map((run) => <button key={run.id} type="button" onClick={() => { setActiveRunId(run.id); setReviewNote(''); void loadRun(run.id); }} className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-right hover:border-blue-400 dark:border-slate-800"><span><span className="block font-medium">{run.niche}</span><span className="text-xs text-slate-500">{new Date(run.created_at).toLocaleString('ar-EG')} · {PLATFORM_LABELS[run.platform] || 'منصة أخرى'}</span></span><span className="text-sm">{STATUS_LABELS[run.status] || 'حالة غير معروفة'}</span></button>) : <div className="text-sm text-slate-500">لا توجد عمليات إنتاج سابقة.</div>}</div></Panel>
    <div className="flex items-center gap-2 text-xs text-slate-500"><Sparkles className="h-3.5 w-3.5" /> المصادر مرتبطة بمراجع فعلية، ومخرجات الذكاء الاصطناعي مسجلة؛ لا يتم النشر تلقائياً.</div>
  </div>;
}
