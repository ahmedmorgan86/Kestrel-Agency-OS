import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, FilePlus2, Send, ShieldCheck, XCircle } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { CONTENT_STATUS_LABELS, type ContentStatus } from '../domain/workflows';
import {
  DANGER_BTN,
  EmptyState,
  ErrorBanner,
  FormField,
  INPUT_CLASS,
  Modal,
  PageHeader,
  PRIMARY_BTN,
  SECONDARY_BTN,
  SectionCard,
  StatusText,
  formatDateTime,
} from '../components/ui';

type ContentForm = {
  title: string;
  platform: string;
  contentFormat: string;
  brief: string;
  caption: string;
  script: string;
  hashtags: string;
  cta: string;
  changeNote: string;
};

const EMPTY_FORM: ContentForm = {
  title: '', platform: 'instagram', contentFormat: 'reel', brief: '', caption: '', script: '', hashtags: '', cta: '', changeNote: '',
};

const PLATFORMS: Record<string, string> = {
  instagram: 'إنستغرام', facebook: 'فيسبوك', tiktok: 'تيك توك', youtube: 'يوتيوب', linkedin: 'لينكدإن', x: 'إكس', snapchat: 'سناب شات',
};

const FORMATS: Record<string, string> = {
  static_post: 'منشور ثابت', carousel: 'منشور متعدد الشرائح', story: 'قصة', reel: 'ريلز', short_form_video: 'فيديو قصير', long_form_video: 'فيديو طويل', text_post: 'منشور نصي',
};

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; }
  }
  return [];
}

function editFormFromVersion(version: Record<string, any>): ContentForm {
  return {
    title: version.title || '', platform: version.platform || 'instagram', contentFormat: version.content_format || 'reel',
    brief: version.brief || '', caption: version.caption || '', script: version.script || '', hashtags: parseTags(version.hashtags_json).join(', '), cta: version.cta || '', changeNote: '',
  };
}

function tagList(value: string) {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 40);
}

function ContentFields({ value, setValue, includePlatform = false }: { value: ContentForm; setValue: (next: ContentForm) => void; includePlatform?: boolean }) {
  return (
    <div className="space-y-4">
      <FormField label="عنوان المحتوى" htmlFor="content-title" required>
        <input id="content-title" required minLength={2} maxLength={180} value={value.title} onChange={(e) => setValue({ ...value, title: e.target.value })} className={INPUT_CLASS} placeholder="مثال: فكرة ريلز عن صناعة المحتوى" />
      </FormField>
      {includePlatform && <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="المنصة" htmlFor="content-platform" required>
          <select id="content-platform" value={value.platform} onChange={(e) => setValue({ ...value, platform: e.target.value })} className={INPUT_CLASS}>{Object.entries(PLATFORMS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        </FormField>
        <FormField label="الصيغة" htmlFor="content-format" required>
          <select id="content-format" value={value.contentFormat} onChange={(e) => setValue({ ...value, contentFormat: e.target.value })} className={INPUT_CLASS}>{Object.entries(FORMATS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        </FormField>
      </div>}
      <FormField label="الفكرة والتوجيه الإبداعي" htmlFor="content-brief"><textarea id="content-brief" rows={3} value={value.brief} onChange={(e) => setValue({ ...value, brief: e.target.value })} className={INPUT_CLASS} /></FormField>
      <FormField label="نص المنشور" htmlFor="content-caption"><textarea id="content-caption" rows={4} value={value.caption} onChange={(e) => setValue({ ...value, caption: e.target.value })} className={INPUT_CLASS} /></FormField>
      <FormField label="سيناريو الفيديو" htmlFor="content-script"><textarea id="content-script" rows={5} value={value.script} onChange={(e) => setValue({ ...value, script: e.target.value })} className={INPUT_CLASS} /></FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="الوسوم، افصل بينها بفاصلة" htmlFor="content-tags"><input id="content-tags" value={value.hashtags} onChange={(e) => setValue({ ...value, hashtags: e.target.value })} className={INPUT_CLASS} placeholder="#محتوى, #إبداع" /></FormField>
        <FormField label="دعوة لاتخاذ إجراء" htmlFor="content-cta"><input id="content-cta" value={value.cta} onChange={(e) => setValue({ ...value, cta: e.target.value })} className={INPUT_CLASS} /></FormField>
      </div>
    </div>
  );
}

export function ContentStudioView({ calendarOnly = false }: { calendarOnly?: boolean }) {
  const [items, setItems] = useState<Array<Record<string, any>>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState<ContentForm>(EMPTY_FORM);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const result = await apiRequest<{ items: Array<Record<string, any>> }>('/content');
      setItems(result.items);
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذّر تحميل المحتوى.'); }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const result = await apiRequest<Record<string, any>>(`/content/${id}`);
      setDetail(result);
      if (result.versions?.[0]) setForm(editFormFromVersion({ ...result.versions[0], platform: result.item.platform, content_format: result.item.content_format }));
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذّر تحميل تفاصيل المحتوى.'); }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); else setDetail(null); }, [selectedId, loadDetail]);

  const createContent = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const result = await apiRequest<{ id: string }>('/content', { method: 'POST', body: { ...form, hashtags: tagList(form.hashtags) } });
      setCreateOpen(false); setForm(EMPTY_FORM); await loadList(); setSelectedId(result.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذّر حفظ المحتوى.'); }
    finally { setBusy(false); }
  };

  const saveVersion = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selectedId) return; setBusy(true); setError(null); setNotice(null);
    try {
      const result = await apiRequest<{ versionNumber: number; approvalInvalidated: boolean }>(`/content/${selectedId}`, { method: 'PATCH', body: { ...form, hashtags: tagList(form.hashtags), changeNote: form.changeNote || 'مراجعة المحتوى' } });
      setNotice(result.approvalInvalidated ? `حُفظت النسخة ${result.versionNumber} وأُبطلت الموافقة السابقة تلقائياً.` : `حُفظت النسخة ${result.versionNumber} من المحتوى.`);
      await Promise.all([loadDetail(selectedId), loadList()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذّر حفظ المراجعة.'); }
    finally { setBusy(false); }
  };

  const sendForApproval = async () => {
    if (!selectedId) return; setBusy(true); setError(null); setNotice(null);
    try {
      const result = await apiRequest<{ approvalRequestId: string; versionHash: string }>(`/content/${selectedId}/submit-approval`, { method: 'POST' });
      setNotice(`أُرسلت النسخة ${result.versionHash.slice(0, 12)} إلى قائمة موافقتك النهائية.`);
      await Promise.all([loadDetail(selectedId), loadList()]);
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذّر إرسال المحتوى للاعتماد.'); }
    finally { setBusy(false); }
  };

  const completeQa = async () => {
    if (!selectedId) return; setBusy(true); setError(null);
    try { await apiRequest(`/content/${selectedId}`, { method: 'PATCH', body: { status: 'quality_assurance' } }); await Promise.all([loadDetail(selectedId), loadList()]); }
    catch (err) { setError(err instanceof Error ? err.message : 'تعذّرت مراجعة المحتوى.'); }
    finally { setBusy(false); }
  };

  const currentItem = detail?.item;
  const currentVersion = detail?.versions?.[0];
  const displayed = calendarOnly ? items.filter((item) => item.scheduled_for || item.published_at) : items;

  if (selectedId && currentItem && currentVersion) {
    const status = currentItem.status as ContentStatus;
    return <div className="space-y-5" dir="rtl">
      <PageHeader title={currentItem.title} subtitle={`${PLATFORMS[currentItem.platform] || currentItem.platform} · ${FORMATS[currentItem.content_format] || currentItem.content_format} · النسخة ${currentVersion.version_number}`} actions={<button type="button" className={SECONDARY_BTN} onClick={() => setSelectedId(null)}><ArrowRight className="h-4 w-4" /> العودة للمحتوى</button>} />
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}</div>}
      <SectionCard title="حالة المحتوى" description="كل نسخة محفوظة ببصمة مستقلة، وأي تعديل يُبطل الموافقة السابقة.">
        <div className="flex flex-wrap items-center justify-between gap-3"><StatusText status={status} label={CONTENT_STATUS_LABELS[status]} /><span className="font-mono text-xs text-slate-500">SHA-256 · {currentVersion.version_hash}</span></div>
        {(status === 'draft' || status === 'creative_production') && <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={SECONDARY_BTN} disabled={busy} onClick={() => void completeQa()}>إنهاء مراجعة الجودة</button></div>}
        {(status === 'quality_assurance' || status === 'human_review') && <div className="mt-4"><button type="button" className={PRIMARY_BTN} disabled={busy} onClick={() => void sendForApproval()}><Send className="h-4 w-4" /> أرسل النسخة لموافقتي النهائية</button></div>}
        {status === 'approved' && <p className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-950/30 dark:text-blue-200">اعتمدت هذه النسخة. النشر الخارجي غير مفعّل في هذه النسخة من النظام.</p>}
      </SectionCard>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <SectionCard title="محرر المحتوى" description="حفظ أي تعديل ينشئ نسخة جديدة، ويعيدها لمسودة للمراجعة.">
          <form className="space-y-4" onSubmit={(event) => void saveVersion(event)}><ContentFields value={form} setValue={setForm} /><FormField label="ملاحظة المراجعة" htmlFor="content-change-note"><input id="content-change-note" value={form.changeNote} onChange={(e) => setForm({ ...form, changeNote: e.target.value })} className={INPUT_CLASS} /></FormField><div className="flex justify-end"><button type="submit" className={PRIMARY_BTN} disabled={busy}>حفظ نسخة جديدة</button></div></form>
        </SectionCard>
        <SectionCard title="سجل النسخ والموافقة">
          <div className="space-y-3">{(detail.versions || []).map((version: Record<string, any>) => <div key={version.id} className="border-b border-slate-200 pb-3 text-xs dark:border-slate-800"><div className="flex justify-between gap-2"><strong>النسخة {version.version_number}</strong><span className="font-mono text-slate-500">{String(version.version_hash).slice(0, 12)}</span></div><div className="mt-1 text-slate-500">{version.change_note} · {formatDateTime(version.created_at)}</div></div>)}</div>
          <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800"><h3 className="mb-2 text-sm font-semibold">قرارات الاعتماد</h3>{(detail.approvals || []).length ? detail.approvals.map((approval: Record<string, any>) => <div key={approval.id} className="mb-2 text-xs"><StatusText status={approval.status} /><span className="mr-2 font-mono text-slate-500">{String(approval.version_hash).slice(0, 12)}</span>{approval.comments && <p className="mt-1 text-slate-600">{approval.comments}</p>}</div>) : <p className="text-xs text-slate-500">لم يُرسل هذا المحتوى للاعتماد بعد.</p>}</div>
        </SectionCard>
      </div>
    </div>;
  }

  return <div className="space-y-5" dir="rtl">
    <PageHeader title={calendarOnly ? 'تقويم المحتوى' : 'استوديو المحتوى'} subtitle="مساحة خاصة لإنتاج محتواك على منصات التواصل، ومراجعة كل نسخة قبل أن تصل إليك للموافقة النهائية." actions={!calendarOnly && <button type="button" className={PRIMARY_BTN} onClick={() => { setForm(EMPTY_FORM); setCreateOpen(true); }}><FilePlus2 className="h-4 w-4" /> محتوى جديد</button>} />
    {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
    {displayed.length === 0 ? <EmptyState title={calendarOnly ? 'لا يوجد محتوى مجدول' : 'لا يوجد محتوى بعد'} description={calendarOnly ? 'احفظ موعداً مستهدفاً داخل تفاصيل المحتوى بعد تفعيل الجدولة.' : 'ابدأ بفكرة أو مسودة، وراجع النسخ، ثم أرسلها إلى قائمة موافقتك النهائية.'} action={!calendarOnly && <button type="button" className={PRIMARY_BTN} onClick={() => setCreateOpen(true)}>إنشاء أول محتوى</button>} /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{displayed.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="rounded-xl border border-slate-200 bg-white p-4 text-right shadow-sm transition hover:border-blue-400 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><span className="font-semibold text-slate-900 dark:text-white">{item.title}</span><StatusText status={item.status} label={CONTENT_STATUS_LABELS[item.status as ContentStatus]} /></div><div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{PLATFORMS[item.platform] || item.platform} · {FORMATS[item.content_format] || item.content_format}</span><span>النسخة {item.current_version_number}</span></div><p className="mt-3 line-clamp-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{item.caption || item.brief || 'أضف تفاصيل الفكرة في المحرر.'}</p><div className="mt-3 text-[11px] text-slate-400">آخر تعديل: {formatDateTime(item.updated_at)}</div></button>)}</div>}
    <Modal open={createOpen} title="إنشاء محتوى اجتماعي" onClose={() => setCreateOpen(false)} maxWidth="max-w-2xl"><form onSubmit={(event) => void createContent(event)} className="space-y-4 overflow-y-auto p-5"><ContentFields value={form} setValue={setForm} includePlatform /><div className="flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800"><button type="button" className={SECONDARY_BTN} onClick={() => setCreateOpen(false)}>إلغاء</button><button type="submit" disabled={busy} className={PRIMARY_BTN}><FilePlus2 className="h-4 w-4" /> حفظ المسودة</button></div></form></Modal>
  </div>;
}

export function ApprovalCenterView() {
  const [approvals, setApprovals] = useState<Array<Record<string, any>>>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const result = await apiRequest<{ approvals: Array<Record<string, any>> }>('/approvals'); setApprovals(result.approvals); }
    catch (err) { setError(err instanceof Error ? err.message : 'تعذّر تحميل قائمة الموافقات.'); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const decide = async (id: string, decision: 'approved' | 'rejected' | 'changes_requested') => {
    setBusyId(id); setError(null); setNotice(null);
    try {
      const result = await apiRequest<{ status: string; versionHash: string }>(`/approvals/${id}/decide`, { method: 'POST', body: { decision, comments: comments[id] || '' } });
      setNotice(decision === 'approved' ? `اعتمدت النسخة المحددة، وبصمتها ${result.versionHash.slice(0, 16)}.` : 'سُجّل قرارك وأُعيد المحتوى للمراجعة.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذّر تسجيل قرارك.'); }
    finally { setBusyId(null); }
  };

  const pending = approvals.filter((approval) => approval.status === 'pending');
  return <div className="space-y-5" dir="rtl">
    <PageHeader title="موافقتك النهائية قبل النشر" subtitle="أنت وحدك صاحب قرار الاعتماد. كل قرار مرتبط ببصمة النسخة نفسها، وأي تعديل يُبطل الموافقة السابقة." />
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><p>لا تُرسل المنصة أي محتوى تلقائياً. تحتاج كل نسخة إلى موافقتك الصريحة، والنشر الخارجي غير مفعّل حالياً.</p></div>
    {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
    {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}</div>}
    {approvals.length === 0 ? <EmptyState title="قائمة الموافقات فارغة" description="عندما تنتهي مراجعة جودة مسودة وترسلها للاعتماد، ستظهر النسخة هنا لتقرر بنفسك." /> : <div className="space-y-4">{approvals.map((approval) => <SectionCard key={approval.id} title={approval.summary} description={`${PLATFORMS[approval.platform] || approval.platform} · ${FORMATS[approval.content_format] || approval.content_format} · النسخة ${approval.version_number} · ${formatDateTime(approval.created_at)}`} right={<StatusText status={approval.status} label={approval.status === 'pending' ? 'بانتظار قرارك' : approval.status === 'approved' ? 'معتمد' : approval.status === 'invalidated' ? 'أُبطل' : approval.status === 'changes_requested' ? 'مطلوب تعديل' : 'مرفوض'} />}>
      <div className="space-y-3"><div className="break-all rounded-md bg-slate-50 p-3 font-mono text-[11px] text-slate-600 dark:bg-slate-950/50 dark:text-slate-400">SHA-256 · {approval.version_hash}</div>{approval.caption && <div className="whitespace-pre-wrap rounded-lg border border-slate-200 p-4 text-sm leading-7 dark:border-slate-800">{approval.caption}</div>}{approval.script && <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-7 dark:bg-slate-950/40"><strong className="mb-2 block">سيناريو الفيديو</strong>{approval.script}</div>}{approval.brief && <p className="text-sm text-slate-600 dark:text-slate-300">{approval.brief}</p>}
        {approval.status === 'pending' ? <div className="space-y-3"><FormField label="سبب الرفض أو التعديلات المطلوبة" htmlFor={`owner-note-${approval.id}`}><textarea id={`owner-note-${approval.id}`} rows={2} value={comments[approval.id] || ''} onChange={(event) => setComments({ ...comments, [approval.id]: event.target.value })} className={INPUT_CLASS} /></FormField><div className="flex flex-wrap gap-2"><button type="button" disabled={busyId === approval.id} onClick={() => void decide(approval.id, 'approved')} className={PRIMARY_BTN}><CheckCircle2 className="h-4 w-4" /> اعتماد هذه النسخة</button><button type="button" disabled={busyId === approval.id || (comments[approval.id] || '').trim().length < 2} onClick={() => void decide(approval.id, 'changes_requested')} className={SECONDARY_BTN}>طلب تعديلات</button><button type="button" disabled={busyId === approval.id || (comments[approval.id] || '').trim().length < 2} onClick={() => void decide(approval.id, 'rejected')} className={DANGER_BTN}><XCircle className="h-4 w-4" /> رفض المحتوى</button></div></div> : <div className="text-xs text-slate-500">{approval.reviewer_name && `القرار بواسطة ${approval.reviewer_name}`} {approval.decided_at && `· ${formatDateTime(approval.decided_at)}`} {approval.comments && <p className="mt-2">ملاحظتك: {approval.comments}</p>}</div>}
      </div>
    </SectionCard>)}</div>}
    {pending.length > 0 && <p className="text-xs text-slate-500">لديك {pending.length} نسخة تنتظر قرارك.</p>}
  </div>;
}
