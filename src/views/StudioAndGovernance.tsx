import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Play,
  Plus,
  Send,
  Upload,
  Image as ImageIcon,
  Video,
  XCircle,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import {
  ALLOWED_CONTENT_TRANSITIONS,
  CONTENT_STATUS_LABELS,
  type ContentStatus,
} from '../domain/workflows';
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
  formatShortDate,
} from '../components/ui';

export function ContentStudioView({ calendarOnly = false }: { calendarOnly?: boolean }) {
  const [items, setItems] = useState<Array<Record<string, any>>>([]);
  const [clients, setClients] = useState<Array<Record<string, any>>>([]);
  const [brands, setBrands] = useState<Array<Record<string, any>>>([]);
  const [projects, setProjects] = useState<Array<Record<string, any>>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    clientId: '',
    brandId: '',
    projectId: '',
    platform: 'instagram',
    contentFormat: 'static_post',
    title: '',
    brief: '',
    caption: '',
    script: '',
    hashtags: '',
    cta: '',
    scheduledFor: '',
  });

  const [editForm, setEditForm] = useState({
    title: '',
    brief: '',
    caption: '',
    script: '',
    cta: '',
    hashtags: '',
    changeNote: '',
  });

  const loadList = useCallback(async () => {
    try {
      const [cRes, cliRes, bRes, pRes] = await Promise.all([
        apiRequest<{ items: Array<Record<string, any>> }>('/content'),
        apiRequest<{ clients: Array<Record<string, any>> }>('/clients'),
        apiRequest<{ brands: Array<Record<string, any>> }>('/brands'),
        apiRequest<{ projects: Array<Record<string, any>> }>('/projects'),
      ]);
      setItems(cRes.items);
      setClients(cliRes.clients);
      setBrands(bRes.brands);
      setProjects(pRes.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load content studio.');
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await apiRequest<Record<string, any>>(`/content/${id}`);
      setDetail(res);
      const latest = res.versions?.[0];
      if (latest) {
        setEditForm({
          title: latest.title || '',
          brief: latest.brief || '',
          caption: latest.caption || '',
          script: latest.script || '',
          cta: latest.cta || '',
          hashtags: (JSON.parse(latest.hashtags_json || '[]') as string[]).join(', '),
          changeNote: '',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load content details.');
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiRequest<{ id: string }>('/content', {
        method: 'POST',
        body: {
          ...createForm,
          projectId: createForm.projectId || null,
          scheduledFor: createForm.scheduledFor || null,
          hashtags: createForm.hashtags.split(',').map((h) => h.trim()).filter(Boolean),
        },
      });
      setModalOpen(false);
      setCreateForm({
        clientId: '',
        brandId: '',
        projectId: '',
        platform: 'instagram',
        contentFormat: 'static_post',
        title: '',
        brief: '',
        caption: '',
        script: '',
        hashtags: '',
        cta: '',
        scheduledFor: '',
      });
      await loadList();
      setSelectedId(res.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create content item.');
    }
  };

  const handleSaveNewVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ versionNumber: number; approvalInvalidated: boolean }>(
        `/content/${selectedId}`,
        {
          method: 'PATCH',
          body: {
            title: editForm.title,
            brief: editForm.brief,
            caption: editForm.caption,
            script: editForm.script,
            cta: editForm.cta,
            hashtags: editForm.hashtags.split(',').map((h) => h.trim()).filter(Boolean),
            changeNote: editForm.changeNote || 'Manual revision',
          },
        }
      );
      setNotice(
        res.approvalInvalidated
          ? `Saved version v${res.versionNumber}. Prior approval was automatically invalidated because content changed.`
          : `Saved content version v${res.versionNumber}.`
      );
      await loadDetail(selectedId);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save version.');
    }
  };

  const handleTransition = async (nextStatus: ContentStatus) => {
    if (!selectedId) return;
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/content/${selectedId}`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      setNotice(`Workflow status transitioned to "${CONTENT_STATUS_LABELS[nextStatus]}".`);
      await loadDetail(selectedId);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Illegal workflow transition.');
    }
  };

  const handleSubmitApproval = async () => {
    if (!selectedId) return;
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ approvalRequestId: string; versionHash: string }>(
        `/content/${selectedId}/submit-approval`,
        { method: 'POST' }
      );
      setNotice(
        `Submitted exact version hash ${res.versionHash.slice(0, 12)}… to Approval Center (${res.approvalRequestId}).`
      );
      await loadDetail(selectedId);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit for approval.');
    }
  };

  const handleRunAgent = async (agentId: string) => {
    if (!selectedId) return;
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ jobId: string }>(`/content/${selectedId}/run-agent`, {
        method: 'POST',
        body: { agentId },
      });
      setNotice(`Dispatched agent job ${res.jobId} to durable background worker. Check Execution History for output.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run agent.');
    }
  };

  if (calendarOnly && !selectedId) {
    const scheduled = items.filter((i) => i.scheduled_for || i.published_at);
    return (
      <div className="space-y-6">
        <PageHeader
          title="Content Calendar"
          subtitle="Chronological schedule of dated, scheduled, and published client content items."
        />
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        {scheduled.length === 0 ? (
          <EmptyState
            title="No dated content on calendar yet"
            description="Create content items in Content Studio with a target date or schedule approved items in Publishing Center."
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
            {[...scheduled]
              .sort((a, b) => String(a.scheduled_for || a.published_at).localeCompare(String(b.scheduled_for || b.published_at)))
              .map((item) => (
                <div key={item.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                    <div className="text-xs text-slate-500">
                      {item.client_name} · {item.brand_name} · {item.platform} · {item.content_format}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-xs text-slate-600">
                      {formatDateTime(item.published_at || item.scheduled_for)}
                    </span>
                    <StatusText status={item.status} />
                    <button type="button" onClick={() => setSelectedId(item.id)} className="text-xs font-medium text-blue-700 hover:underline">
                      Inspect
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    );
  }

  if (selectedId && detail) {
    const item = detail.item;
    const status = item.status as ContentStatus;
    const allowedNext = ALLOWED_CONTENT_TRANSITIONS[status] ?? [];
    const versions = (detail.versions ?? []) as Array<Record<string, any>>;
    const latestHash = versions[0]?.version_hash || '';

    return (
      <div className="space-y-6">
        <PageHeader
          title={item.title}
          subtitle={`${item.client_name} / ${item.brand_name} · ${item.platform} · ${item.content_format} · v${item.current_version_number} · Hash ${latestHash.slice(0, 12)}`}
          actions={
            <>
              <button type="button" onClick={() => setSelectedId(null)} className={SECONDARY_BTN}>
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                Back to Studio
              </button>
              {(status === 'quality_assurance' || status === 'human_review') && (
                <button type="button" onClick={handleSubmitApproval} className={PRIMARY_BTN}>
                  <Send className="w-4 h-4" aria-hidden="true" />
                  Submit for Human Approval
                </button>
              )}
            </>
          }
        />

        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        {notice && <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-900">{notice}</div>}

        <SectionCard
          title="Workflow State & Legal Transitions"
          description="Enforced 14-state workflow. Illegal skips are blocked server-side."
          right={<StatusText status={status} label={CONTENT_STATUS_LABELS[status]} />}
        >
          <div className="flex flex-wrap items-center gap-2">
            {allowedNext
              .filter((st) => st !== 'published' && st !== 'publishing' && st !== 'approved')
              .map((next) => (
                <button
                  key={next}
                  type="button"
                  onClick={() => handleTransition(next)}
                  className={SECONDARY_BTN}
                >
                  Advance to {CONTENT_STATUS_LABELS[next]}
                </button>
              ))}
            <button type="button" onClick={() => handleRunAgent('agent_copywriter_agent')} className={SECONDARY_BTN}>
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              Run Copywriter Agent
            </button>
            <button type="button" onClick={() => handleRunAgent('agent_quality_assurance_agent')} className={SECONDARY_BTN}>
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              Run QA Agent
            </button>
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <SectionCard
              title="Content Editor (Creates Immutable Version)"
              description="Any material edit creates a new SHA-256 version and automatically invalidates prior human approvals."
            >
              <form onSubmit={handleSaveNewVersion} className="space-y-4">
                <FormField label="Title" htmlFor="ed-title" required>
                  <input id="ed-title" required value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className={INPUT_CLASS} />
                </FormField>
                <FormField label="Creative Brief" htmlFor="ed-brief">
                  <textarea id="ed-brief" rows={2} value={editForm.brief} onChange={(e) => setEditForm({ ...editForm, brief: e.target.value })} className={INPUT_CLASS} />
                </FormField>
                <FormField label="Caption / Post Copy" htmlFor="ed-caption">
                  <textarea id="ed-caption" rows={4} value={editForm.caption} onChange={(e) => setEditForm({ ...editForm, caption: e.target.value })} className={INPUT_CLASS} />
                </FormField>
                <FormField label="Video / Reels Script" htmlFor="ed-script">
                  <textarea id="ed-script" rows={3} value={editForm.script} onChange={(e) => setEditForm({ ...editForm, script: e.target.value })} className={INPUT_CLASS} />
                </FormField>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Call to Action (CTA)" htmlFor="ed-cta">
                    <input id="ed-cta" value={editForm.cta} onChange={(e) => setEditForm({ ...editForm, cta: e.target.value })} className={INPUT_CLASS} />
                  </FormField>
                  <FormField label="Hashtags (comma-separated)" htmlFor="ed-tags">
                    <input id="ed-tags" value={editForm.hashtags} onChange={(e) => setEditForm({ ...editForm, hashtags: e.target.value })} className={INPUT_CLASS} />
                  </FormField>
                </div>
                <FormField label="Revision Note" htmlFor="ed-note">
                  <input id="ed-note" value={editForm.changeNote} onChange={(e) => setEditForm({ ...editForm, changeNote: e.target.value })} className={INPUT_CLASS} placeholder="Describe what changed in this version" />
                </FormField>
                <div className="flex justify-end">
                  <button type="submit" className={PRIMARY_BTN}>Save New Version</button>
                </div>
              </form>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard title={`Version History (${versions.length})`}>
              <div className="divide-y divide-slate-100">
                {versions.map((v) => (
                  <div key={v.id} className="py-2.5 first:pt-0 last:pb-0 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">Version {v.version_number}</span>
                      <span className="font-mono text-slate-500">{String(v.version_hash).slice(0, 10)}</span>
                    </div>
                    <div className="text-slate-600">{v.change_note}</div>
                    <div className="text-slate-400 font-mono">{formatDateTime(v.created_at)}</div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title={`Approval Audit (${detail.approvals?.length ?? 0})`}>
              {!detail.approvals || detail.approvals.length === 0 ? (
                <p className="text-xs text-slate-500">No approval requests submitted yet.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {detail.approvals.map((ap: Record<string, any>) => (
                    <div key={ap.id} className="py-2.5 first:pt-0 last:pb-0 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <StatusText status={ap.status} />
                        <span className="font-mono text-slate-500">{String(ap.version_hash).slice(0, 10)}</span>
                      </div>
                      {ap.reviewer_name && <div className="text-slate-700">Reviewer: {ap.reviewer_name}</div>}
                      {ap.comments && <div className="text-slate-600">{ap.comments}</div>}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Studio"
        subtitle="End-to-end social content production with enforced 14-state workflow, SHA-256 versioning, AI QA/Copywriting dispatch, and human approval binding."
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className={PRIMARY_BTN}
            disabled={brands.length === 0}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            New Content Item
          </button>
        }
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {items.length === 0 ? (
        <EmptyState
          title="No content items in production"
          description={
            brands.length === 0
              ? 'Create a Client and a Brand Profile first so content items inherit approved brand voice and guidelines.'
              : 'Create a content brief to start moving deliverables through drafting, QA, human approval, and publishing.'
          }
          action={
            brands.length > 0 ? (
              <button type="button" onClick={() => setModalOpen(true)} className={PRIMARY_BTN}>
                Create First Content Item
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="py-3 px-4">Title</th>
                <th className="py-3 px-4">Client / Brand</th>
                <th className="py-3 px-4">Platform / Format</th>
                <th className="py-3 px-4">Version</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-medium text-slate-900">{item.title}</td>
                  <td className="py-3 px-4 text-xs text-slate-600">
                    {item.client_name} / {item.brand_name}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">
                    {item.platform} · {item.content_format}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-600">
                    v{item.current_version_number}
                  </td>
                  <td className="py-3 px-4">
                    <StatusText
                      status={item.status}
                      label={CONTENT_STATUS_LABELS[item.status as ContentStatus]}
                    />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className="text-xs font-medium text-blue-700 hover:underline"
                    >
                      Open Studio
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} title="Create Content Item" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Client" htmlFor="cnt-client" required>
              <select
                id="cnt-client"
                required
                value={createForm.clientId}
                onChange={(e) => setCreateForm({ ...createForm, clientId: e.target.value, brandId: '' })}
                className={INPUT_CLASS}
              >
                <option value="">Select client...</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FormField>
            <FormField label="Brand Profile" htmlFor="cnt-brand" required>
              <select
                id="cnt-brand"
                required
                value={createForm.brandId}
                onChange={(e) => setCreateForm({ ...createForm, brandId: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">Select brand...</option>
                {brands.filter((b) => !createForm.clientId || b.client_id === createForm.clientId).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Platform" htmlFor="cnt-plat" required>
              <select id="cnt-plat" value={createForm.platform} onChange={(e) => setCreateForm({ ...createForm, platform: e.target.value })} className={INPUT_CLASS}>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="tiktok">TikTok</option>
                <option value="youtube">YouTube</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </FormField>
            <FormField label="Content Format" htmlFor="cnt-fmt" required>
              <select id="cnt-fmt" value={createForm.contentFormat} onChange={(e) => setCreateForm({ ...createForm, contentFormat: e.target.value })} className={INPUT_CLASS}>
                <option value="static_post">Static Post</option>
                <option value="carousel">Carousel</option>
                <option value="story">Story</option>
                <option value="reel">Reel</option>
                <option value="short_form_video">Short-Form Video</option>
                <option value="long_form_video">Long-Form Video</option>
                <option value="text_post">Text Post</option>
              </select>
            </FormField>
          </div>
          <FormField label="Project (Optional)" htmlFor="cnt-proj">
            <select id="cnt-proj" value={createForm.projectId} onChange={(e) => setCreateForm({ ...createForm, projectId: e.target.value })} className={INPUT_CLASS}>
              <option value="">None</option>
              {projects.filter((p) => !createForm.clientId || p.client_id === createForm.clientId).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Content Title" htmlFor="cnt-title" required>
            <input id="cnt-title" required value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} className={INPUT_CLASS} placeholder="e.g., Autumn Single-Origin Launch Carousel" />
          </FormField>
          <FormField label="Brief" htmlFor="cnt-brief">
            <textarea id="cnt-brief" rows={2} value={createForm.brief} onChange={(e) => setCreateForm({ ...createForm, brief: e.target.value })} className={INPUT_CLASS} />
          </FormField>
          <FormField label="Initial Caption Draft" htmlFor="cnt-cap">
            <textarea id="cnt-cap" rows={3} value={createForm.caption} onChange={(e) => setCreateForm({ ...createForm, caption: e.target.value })} className={INPUT_CLASS} />
          </FormField>
          <FormField label="Target Schedule Date (Optional)" htmlFor="cnt-date">
            <input id="cnt-date" type="datetime-local" value={createForm.scheduledFor} onChange={(e) => setCreateForm({ ...createForm, scheduledFor: e.target.value })} className={INPUT_CLASS} />
          </FormField>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setModalOpen(false)} className={SECONDARY_BTN}>Cancel</button>
            <button type="submit" className={PRIMARY_BTN}>Create Content Item</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function ApprovalCenterView() {
  const [approvals, setApprovals] = useState<Array<Record<string, any>>>([]);
  const [commentsById, setCommentsById] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest<{ approvals: Array<Record<string, any>> }>('/approvals');
      setApprovals(res.approvals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load approvals.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDecide = async (id: string, decision: 'approved' | 'rejected' | 'changes_requested') => {
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ decisionId: string; status: string }>(`/approvals/${id}/decide`, {
        method: 'POST',
        body: { decision, comments: commentsById[id] || '' },
      });
      setNotice(`Recorded immutable decision "${res.status}" (${res.decisionId}).`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval decision failed.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval Center"
        subtitle="Immutable human governance gate. Decisions bind cryptographically to the exact content version SHA-256 hash; AI agents cannot self-approve."
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {notice && <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-900">{notice}</div>}

      {approvals.length === 0 ? (
        <EmptyState
          title="No approval requests in queue"
          description="Submit a content item that has passed Quality Assurance in Content Studio to initiate a human approval gate."
        />
      ) : (
        <div className="space-y-4">
          {approvals.map((ap) => (
            <SectionCard
              key={ap.id}
              title={ap.summary}
              description={`Version v${ap.version_number ?? '—'} · Hash ${String(ap.version_hash).slice(0, 16)} · Requested ${formatDateTime(ap.created_at)}`}
              right={<StatusText status={ap.status} />}
            >
              <div className="space-y-4">
                {ap.caption && (
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-sm text-slate-800 whitespace-pre-wrap">
                    {ap.caption}
                  </div>
                )}

                {ap.status === 'pending' ? (
                  <div className="space-y-3">
                    <FormField label="Reviewer Comments (required for Reject / Changes Requested)" htmlFor={`cmt-${ap.id}`}>
                      <input
                        id={`cmt-${ap.id}`}
                        value={commentsById[ap.id] || ''}
                        onChange={(e) => setCommentsById({ ...commentsById, [ap.id]: e.target.value })}
                        className={INPUT_CLASS}
                        placeholder="Record review rationale for the immutable audit log..."
                      />
                    </FormField>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => handleDecide(ap.id, 'approved')} className={PRIMARY_BTN}>
                        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                        Approve Exact Version
                      </button>
                      <button type="button" onClick={() => handleDecide(ap.id, 'changes_requested')} className={SECONDARY_BTN}>
                        Request Changes
                      </button>
                      <button type="button" onClick={() => handleDecide(ap.id, 'rejected')} className={DANGER_BTN}>
                        <XCircle className="w-4 h-4" aria-hidden="true" />
                        Reject
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-600 space-y-1">
                    {ap.reviewer_name && <div>Decided by: <strong>{ap.reviewer_name}</strong> on {formatDateTime(ap.decided_at)}</div>}
                    {ap.comments && <div>Rationale: {ap.comments}</div>}
                    {ap.status === 'invalidated' && (
                      <div className="text-amber-700">Invalidated automatically because the underlying content version was edited.</div>
                    )}
                  </div>
                )}
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}

export function AssetLibraryView() {
  const [assets, setAssets] = useState<Array<Record<string, any>>>([]);
  const [clients, setClients] = useState<Array<Record<string, any>>>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [genOpen, setGenOpen] = useState<'image' | 'video' | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [genPrompt, setGenPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [aRes, cRes] = await Promise.all([
        apiRequest<{ assets: Array<Record<string, any>> }>('/assets'),
        apiRequest<{ clients: Array<Record<string, any>> }>('/clients'),
      ]);
      setAssets(aRes.assets);
      setClients(cRes.clients);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assets.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title || file.name);
      if (clientId) fd.append('clientId', clientId);
      await apiRequest('/assets/upload', { method: 'POST', body: fd, isFormData: true });
      setUploadOpen(false);
      setFile(null);
      setTitle('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (genOpen === 'image') {
        await apiRequest('/assets/generate-image', {
          method: 'POST',
          body: { title: title || 'Generated Image', prompt: genPrompt, aspectRatio, clientId: clientId || null },
        });
      } else {
        await apiRequest('/assets/generate-video', {
          method: 'POST',
          body: { prompt: genPrompt, aspectRatio },
        });
      }
      setGenOpen(null);
      setGenPrompt('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Media generation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asset Library"
        subtitle="Real disk-backed object storage with SHA-256 checksums, MIME validation, HMAC-signed download URLs, and honest AI media provider adapters."
        actions={
          <>
            <button type="button" onClick={() => setGenOpen('image')} className={SECONDARY_BTN}>
              <ImageIcon className="w-4 h-4" aria-hidden="true" />
              Generate Image
            </button>
            <button type="button" onClick={() => setGenOpen('video')} className={SECONDARY_BTN}>
              <Video className="w-4 h-4" aria-hidden="true" />
              Generate Video
            </button>
            <button type="button" onClick={() => setUploadOpen(true)} className={PRIMARY_BTN}>
              <Upload className="w-4 h-4" aria-hidden="true" />
              Upload File
            </button>
          </>
        }
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {assets.length === 0 ? (
        <EmptyState
          title="No media assets stored yet"
          description="Upload brand logos, campaign photography, PDFs, or videos to store them securely with SHA-256 integrity checks."
          action={
            <button type="button" onClick={() => setUploadOpen(true)} className={PRIMARY_BTN}>
              Upload First Asset
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((a) => (
            <div key={a.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              {String(a.mime_type).startsWith('image/') ? (
                <div className="h-44 bg-slate-100 flex items-center justify-center overflow-hidden">
                  <img
                    src={a.signedUrl}
                    alt={a.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="h-44 bg-slate-100 flex items-center justify-center text-xs font-mono text-slate-600">
                  {a.mime_type}
                </div>
              )}
              <div className="p-4 space-y-1.5">
                <div className="text-sm font-semibold text-slate-900 truncate">{a.title}</div>
                <div className="text-xs text-slate-500">
                  {a.source_type} · {(Number(a.byte_size) / 1024).toFixed(1)} KB · {formatShortDate(a.created_at)}
                </div>
                <div className="font-mono text-[11px] text-slate-400 truncate">
                  SHA-256: {a.sha256_checksum}
                </div>
                <div className="pt-2">
                  <a href={a.signedUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-700 hover:underline">
                    Open Signed Asset URL
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={uploadOpen} title="Upload Asset to Storage" onClose={() => setUploadOpen(false)}>
        <form onSubmit={handleUpload} className="space-y-4">
          <FormField label="Asset Title" htmlFor="ast-title" required>
            <input id="ast-title" required value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT_CLASS} />
          </FormField>
          <FormField label="Client (Optional)" htmlFor="ast-client">
            <select id="ast-client" value={clientId} onChange={(e) => setClientId(e.target.value)} className={INPUT_CLASS}>
              <option value="">Agency Shared Asset</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="File (PNG, JPEG, WebP, MP4, PDF, TXT, CSV — max 25MB)" htmlFor="ast-file" required>
            <input
              id="ast-file"
              type="file"
              required
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-700"
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setUploadOpen(false)} className={SECONDARY_BTN}>Cancel</button>
            <button type="submit" disabled={busy} className={PRIMARY_BTN}>{busy ? 'Uploading...' : 'Upload & Verify'}</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={genOpen !== null}
        title={genOpen === 'image' ? 'Invoke Real Image Generation Provider' : 'Invoke Real Video Generation Provider'}
        onClose={() => setGenOpen(null)}
      >
        <form onSubmit={handleGenerateMedia} className="space-y-4">
          <p className="text-xs text-slate-600">
            Calls the configured server-side provider adapter directly. If credentials or billing eligibility are absent, the real error is returned without generating placeholder media.
          </p>
          {genOpen === 'image' && (
            <FormField label="Asset Title" htmlFor="gen-title" required>
              <input id="gen-title" required value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT_CLASS} />
            </FormField>
          )}
          <FormField label="Creative Prompt" htmlFor="gen-prompt" required>
            <textarea id="gen-prompt" required rows={3} value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} className={INPUT_CLASS} />
          </FormField>
          <FormField label="Aspect Ratio" htmlFor="gen-ar">
            <select id="gen-ar" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className={INPUT_CLASS}>
              <option value="1:1">1:1 (Square)</option>
              <option value="3:4">3:4 (Portrait Feed)</option>
              <option value="9:16">9:16 (Reels / TikTok / Shorts)</option>
              <option value="16:9">16:9 (Landscape / YouTube)</option>
            </select>
          </FormField>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setGenOpen(null)} className={SECONDARY_BTN}>Cancel</button>
            <button type="submit" disabled={busy} className={PRIMARY_BTN}>
              {busy ? 'Invoking Provider...' : 'Dispatch Generation'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function PublishingCenterView() {
  const [jobs, setJobs] = useState<Array<Record<string, any>>>([]);
  const [approvedContent, setApprovedContent] = useState<Array<Record<string, any>>>([]);
  const [accounts, setAccounts] = useState<Array<Record<string, any>>>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ contentItemId: '', socialAccountId: '', scheduledFor: '' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pRes, cRes, iRes] = await Promise.all([
        apiRequest<{ jobs: Array<Record<string, any>> }>('/publishing-jobs'),
        apiRequest<{ items: Array<Record<string, any>> }>('/content?status=approved'),
        apiRequest<{ socialAccounts: Array<Record<string, any>> }>('/integrations'),
      ]);
      setJobs(pRes.jobs);
      setApprovedContent(cRes.items);
      setAccounts(iRes.socialAccounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load publishing engine.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/publishing-jobs', { method: 'POST', body: form });
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scheduling rejected.');
    }
  };

  const handleExecuteNow = async (id: string) => {
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/publishing-jobs/${id}/execute`, { method: 'POST' });
      setNotice('Queued publishing attempt on worker. External post ID is recorded only upon verified platform API response.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to queue publish.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Publishing Center"
        subtitle="Idempotent publishing queue enforcing human approval hash verification, real platform API dispatch, and timeout reconciliation."
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className={PRIMARY_BTN}
            disabled={approvedContent.length === 0 || accounts.length === 0}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Schedule Approved Content
          </button>
        }
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {notice && <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-900">{notice}</div>}

      {jobs.length === 0 ? (
        <EmptyState
          title="No publishing jobs scheduled"
          description="Only human-approved content versions paired with a registered client social account can enter the publishing queue."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="py-3 px-4">Content / Version</th>
                <th className="py-3 px-4">Destination Account</th>
                <th className="py-3 px-4">Idempotency Key</th>
                <th className="py-3 px-4">Scheduled</th>
                <th className="py-3 px-4">State</th>
                <th className="py-3 px-4">External Evidence / Error</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{j.content_title}</div>
                    <div className="text-xs text-slate-500">v{j.version_number} · {j.client_name}</div>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-700">
                    {j.platform} · @{j.account_handle}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-500">{j.idempotency_key}</td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-600">{formatDateTime(j.scheduled_for)}</td>
                  <td className="py-3 px-4"><StatusText status={j.state} /></td>
                  <td className="py-3 px-4 text-xs max-w-xs">
                    {j.external_post_id ? (
                      <span className="font-mono text-emerald-700">{j.external_post_id}</span>
                    ) : j.last_error ? (
                      <span className="text-red-700">{j.last_error}</span>
                    ) : (
                      <span className="text-slate-400">Pending execution</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {(j.state === 'scheduled' || j.state === 'failed') && (
                      <button type="button" onClick={() => handleExecuteNow(j.id)} className={SECONDARY_BTN}>
                        <Play className="w-3.5 h-3.5" aria-hidden="true" />
                        Publish Now
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} title="Schedule Approved Content" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSchedule} className="space-y-4">
          <FormField label="Approved Content Item" htmlFor="pub-content" required>
            <select id="pub-content" required value={form.contentItemId} onChange={(e) => setForm({ ...form, contentItemId: e.target.value })} className={INPUT_CLASS}>
              <option value="">Select approved item...</option>
              {approvedContent.map((c) => (
                <option key={c.id} value={c.id}>{c.title} (v{c.current_version_number} · {c.platform})</option>
              ))}
            </select>
          </FormField>
          <FormField label="Client Social Account" htmlFor="pub-acct" required>
            <select id="pub-acct" required value={form.socialAccountId} onChange={(e) => setForm({ ...form, socialAccountId: e.target.value })} className={INPUT_CLASS}>
              <option value="">Select social account...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.platform} · @{a.account_handle} ({a.connection_status})</option>
              ))}
            </select>
          </FormField>
          <FormField label="Scheduled Publication Time" htmlFor="pub-time" required>
            <input id="pub-time" type="datetime-local" required value={form.scheduledFor} onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })} className={INPUT_CLASS} />
          </FormField>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setModalOpen(false)} className={SECONDARY_BTN}>Cancel</button>
            <button type="submit" className={PRIMARY_BTN}>Create Publishing Job</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
