import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ClipboardList,
  Gavel,
  Play,
  Plus,
  Send,
  Sparkles,
  Square,
  Users,
  Video,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { ActorAvatar } from '../components/BrandMark';
import {
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

export function MeetingsView({
  initialMeetingId = null,
  onNavigate,
}: {
  initialMeetingId?: string | null;
  onNavigate: (route: string) => void;
}) {
  const [rooms, setRooms] = useState<Array<Record<string, any>>>([]);
  const [meetings, setMeetings] = useState<Array<Record<string, any>>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialMeetingId);
  const [detail, setDetail] = useState<Record<string, any> | null>(null);

  const [employees, setEmployees] = useState<Array<Record<string, any>>>([]);
  const [agents, setAgents] = useState<Array<Record<string, any>>>([]);
  const [clients, setClients] = useState<Array<Record<string, any>>>([]);
  const [departments, setDepartments] = useState<Array<Record<string, any>>>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    meetingType: 'human_ai_collaboration',
    roomId: 'room_strategy_war_room',
    agenda: '',
    clientId: '',
    departmentId: '',
    humanParticipantIds: [] as string[],
    agentParticipantIds: [] as string[],
    startImmediately: true,
  });

  const [msgText, setMsgText] = useState('');
  const [orchestrateTopic, setOrchestrateTopic] = useState('');
  const [orchestrating, setOrchestrating] = useState(false);

  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionForm, setDecisionForm] = useState({ title: '', rationale: '', ownerLabel: '' });

  const [actionOpen, setActionOpen] = useState(false);
  const [actionForm, setActionForm] = useState({
    title: '',
    description: '',
    assigneeType: 'agent' as 'human' | 'agent',
    assigneeId: '',
    dueDate: '',
    convertToTask: true,
  });

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const [mRes, eRes, aRes, cRes, dRes] = await Promise.all([
        apiRequest<{ rooms: Array<Record<string, any>>; meetings: Array<Record<string, any>> }>('/meetings'),
        apiRequest<{ employees: Array<Record<string, any>> }>('/employees'),
        apiRequest<{ agents: Array<Record<string, any>> }>('/agents'),
        apiRequest<{ clients: Array<Record<string, any>> }>('/clients'),
        apiRequest<{ departments: Array<Record<string, any>> }>('/departments'),
      ]);
      setRooms(mRes.rooms);
      setMeetings(mRes.meetings);
      setEmployees(eRes.employees);
      setAgents(aRes.agents);
      setClients(cRes.clients);
      setDepartments(dRes.departments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meetings.');
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await apiRequest<Record<string, any>>(`/meetings/${id}`);
      setDetail(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meeting room.');
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (initialMeetingId) setSelectedId(initialMeetingId);
  }, [initialMeetingId]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const toggleSelection = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiRequest<{ meeting: { id: string } }>('/meetings', {
        method: 'POST',
        body: {
          ...form,
          clientId: form.clientId || null,
          departmentId: form.departmentId || null,
        },
      });
      setCreateOpen(false);
      setForm({
        title: '',
        meetingType: 'human_ai_collaboration',
        roomId: 'room_strategy_war_room',
        agenda: '',
        clientId: '',
        departmentId: '',
        humanParticipantIds: [],
        agentParticipantIds: [],
        startImmediately: true,
      });
      await loadList();
      setSelectedId(res.meeting.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create meeting.');
    }
  };

  const handleTransitionStatus = async (status: 'active' | 'completed' | 'cancelled') => {
    if (!selectedId) return;
    setError(null);
    try {
      await apiRequest(`/meetings/${selectedId}`, { method: 'PATCH', body: { status } });
      await loadDetail(selectedId);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update meeting status.');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !msgText.trim()) return;
    setError(null);
    try {
      await apiRequest(`/meetings/${selectedId}/messages`, {
        method: 'POST',
        body: { content: msgText.trim() },
      });
      setMsgText('');
      await loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message.');
    }
  };

  const handleOrchestrateAi = async () => {
    if (!selectedId) return;
    setError(null);
    setNotice(null);
    setOrchestrating(true);
    try {
      const res = await apiRequest<{ contributions: Array<Record<string, any>> }>(
        `/meetings/${selectedId}/orchestrate`,
        {
          method: 'POST',
          body: { topicPrompt: orchestrateTopic.trim() || undefined },
        }
      );
      setOrchestrateTopic('');
      setNotice(`Completed real AI multi-agent round (${res.contributions.length} recorded contributions).`);
      await loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI multi-agent discussion failed.');
      await loadDetail(selectedId);
    } finally {
      setOrchestrating(false);
    }
  };

  const handleRecordDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    setError(null);
    try {
      await apiRequest(`/meetings/${selectedId}/decisions`, {
        method: 'POST',
        body: decisionForm,
      });
      setDecisionOpen(false);
      setDecisionForm({ title: '', rationale: '', ownerLabel: '' });
      await loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record decision.');
    }
  };

  const handleAddActionItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    setError(null);
    const label =
      actionForm.assigneeType === 'agent'
        ? agents.find((a) => a.id === actionForm.assigneeId)?.name || 'AI Agent'
        : employees.find((emp) => emp.id === actionForm.assigneeId)?.full_name || 'Team Member';

    try {
      const res = await apiRequest<{ linkedTaskId?: string | null }>(`/meetings/${selectedId}/action-items`, {
        method: 'POST',
        body: {
          ...actionForm,
          assigneeId: actionForm.assigneeId || null,
          assigneeLabel: label,
          dueDate: actionForm.dueDate || null,
        },
      });
      setActionOpen(false);
      setActionForm({
        title: '',
        description: '',
        assigneeType: 'agent',
        assigneeId: '',
        dueDate: '',
        convertToTask: true,
      });
      if (res.linkedTaskId) {
        setNotice(`Action item recorded and converted into operational Task ${res.linkedTaskId}.`);
      }
      await loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add action item.');
    }
  };

  const handleConvertAction = async (itemId: string) => {
    if (!selectedId) return;
    setError(null);
    try {
      const res = await apiRequest<{ linkedTaskId: string }>(
        `/meetings/${selectedId}/action-items/${itemId}/convert`,
        { method: 'POST' }
      );
      setNotice(`Converted action item to operational Task ${res.linkedTaskId}.`);
      await loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert action item.');
    }
  };

  // MEETING ROOM WORKSPACE VIEW
  if (selectedId && detail) {
    const m = detail.meeting;
    const participants = (detail.participants ?? []) as Array<Record<string, any>>;
    const contributions = (detail.contributions ?? []) as Array<Record<string, any>>;
    const decisions = (detail.decisions ?? []) as Array<Record<string, any>>;
    const actionItems = (detail.actionItems ?? []) as Array<Record<string, any>>;
    const aiParticipantCount = participants.filter((p) => p.participant_type === 'agent').length;

    return (
      <div className="space-y-6">
        <PageHeader
          title={m.title}
          subtitle={`${m.room_name || 'Conference Room'} · ${m.meeting_type.replace(/_/g, ' ')} · ${participants.length} participants${m.client_name ? ` · Client: ${m.client_name}` : ''}`}
          actions={
            <>
              <button type="button" onClick={() => setSelectedId(null)} className={SECONDARY_BTN}>
                <ArrowLeft className="w-4 h-4" /> All Meetings
              </button>
              {m.status === 'scheduled' && (
                <button type="button" onClick={() => handleTransitionStatus('active')} className={PRIMARY_BTN}>
                  <Play className="w-4 h-4" /> Start Meeting
                </button>
              )}
              {m.status === 'active' && (
                <button type="button" onClick={() => handleTransitionStatus('completed')} className={SECONDARY_BTN}>
                  <Square className="w-4 h-4" /> End Meeting
                </button>
              )}
            </>
          }
        />

        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        {notice && (
          <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-lg px-4 py-3 text-sm text-blue-900 dark:text-blue-200">
            {notice}
          </div>
        )}

        {/* Conference Table Visualization & Agenda */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <SectionCard
              title="Virtual Conference Table"
              description={
                m.status === 'active'
                  ? 'Active session — participating avatars are seated in this room in the 3D Virtual HQ'
                  : `Session status: ${m.status}`
              }
              right={<StatusText status={m.status === 'active' ? 'in_meeting' : m.status} />}
            >
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {participants.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2.5 p-2.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                    >
                      <ActorAvatar
                        name={p.display_name}
                        actorType={p.participant_type === 'agent' ? 'agent' : 'human'}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {p.display_name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {p.participant_type === 'agent' ? 'AI Agent' : 'Human'} · {p.role_title}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {m.agenda && (
                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">Agenda: </span>
                    {m.agenda}
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Real Meeting Transcript & AI Orchestration */}
            <SectionCard
              title={`Meeting Transcript (${contributions.length})`}
              description="Human messages and real AI model contributions are explicitly distinguished and persisted"
            >
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {contributions.map((c) => {
                  const isAi = c.participant_type === 'agent';
                  const isCoord = c.participant_type === 'coordinator';
                  return (
                    <div
                      key={c.id}
                      className={`p-3.5 rounded-lg border text-sm ${
                        isCoord
                          ? 'bg-slate-50 dark:bg-slate-950/70 border-slate-200 dark:border-slate-800'
                          : isAi
                          ? 'bg-blue-50/50 dark:bg-blue-950/25 border-blue-200 dark:border-blue-900/70'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{c.display_name}</span>
                          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {isAi
                              ? `AI Contribution · ${c.model_identifier || 'model'}`
                              : isCoord
                              ? c.contribution_kind === 'summary'
                                ? 'AI Coordinator Summary'
                                : 'System'
                              : 'Human Message'}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">
                          {formatDateTime(c.created_at)}
                          {Number(c.cost_usd || 0) > 0 ? ` · $${Number(c.cost_usd).toFixed(5)}` : ''}
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {c.content}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Human Message Input */}
              <form onSubmit={handleSendMessage} className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex gap-2">
                <input
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  placeholder="Post a human message or operational directive to the meeting..."
                  className={INPUT_CLASS}
                />
                <button type="submit" disabled={!msgText.trim()} className={PRIMARY_BTN}>
                  <Send className="w-4 h-4" /> Send
                </button>
              </form>

              {/* Real AI Multi-Agent Orchestration Controls */}
              {aiParticipantCount > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-2">
                  <input
                    value={orchestrateTopic}
                    onChange={(e) => setOrchestrateTopic(e.target.value)}
                    placeholder={`Optional focus prompt for ${aiParticipantCount} AI participant(s)...`}
                    className={INPUT_CLASS}
                  />
                  <button
                    type="button"
                    disabled={orchestrating}
                    onClick={handleOrchestrateAi}
                    className={SECONDARY_BTN}
                  >
                    <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    {orchestrating ? 'Running AI Agents...' : `Run AI Discussion (${aiParticipantCount})`}
                  </button>
                </div>
              )}
            </SectionCard>
          </div>

          {/* Right Column: Decisions & Action Items -> Real Tasks */}
          <div className="space-y-6">
            <SectionCard
              title={`Recorded Decisions (${decisions.length})`}
              right={
                <button type="button" onClick={() => setDecisionOpen(true)} className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline">
                  + Record
                </button>
              }
            >
              {decisions.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No formal decisions recorded yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 space-y-2 text-xs">
                  {decisions.map((d) => (
                    <div key={d.id} className="pt-2 first:pt-0 space-y-1">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <Gavel className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        {d.title}
                      </div>
                      {d.rationale && <p className="text-slate-600 dark:text-slate-400">{d.rationale}</p>}
                      <div className="font-mono text-slate-400">Owner: {d.owner_label} · {formatDateTime(d.created_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title={`Action Items (${actionItems.length})`}
              description="Convert directly into real operational tasks"
              right={
                <button type="button" onClick={() => setActionOpen(true)} className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline">
                  + Add Action
                </button>
              }
            >
              {actionItems.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No action items created yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {actionItems.map((item) => (
                    <div key={item.id} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{item.title}</span>
                        <StatusText status={item.status} />
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {item.assignee_label} ({item.assignee_type}) · Due {formatShortDate(item.due_date)}
                      </div>
                      {item.linked_task_id ? (
                        <button
                          type="button"
                          onClick={() => onNavigate('tasks')}
                          className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium hover:underline"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Linked Task {item.linked_task_id}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleConvertAction(item.id)}
                          className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 font-medium hover:underline"
                        >
                          <ClipboardList className="w-3.5 h-3.5" /> Convert to Real Task
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        <Modal open={decisionOpen} title="Record Meeting Decision" onClose={() => setDecisionOpen(false)}>
          <form onSubmit={handleRecordDecision} className="space-y-4">
            <FormField label="Decision Summary" htmlFor="dec-title" required>
              <input id="dec-title" required value={decisionForm.title} onChange={(e) => setDecisionForm({ ...decisionForm, title: e.target.value })} className={INPUT_CLASS} placeholder="e.g., Prioritize short-form Reels for Q4 launch" />
            </FormField>
            <FormField label="Rationale / Context" htmlFor="dec-rat">
              <textarea id="dec-rat" rows={3} value={decisionForm.rationale} onChange={(e) => setDecisionForm({ ...decisionForm, rationale: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Accountable Owner" htmlFor="dec-own">
              <input id="dec-own" value={decisionForm.ownerLabel} onChange={(e) => setDecisionForm({ ...decisionForm, ownerLabel: e.target.value })} className={INPUT_CLASS} placeholder="Defaults to your name" />
            </FormField>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button type="button" onClick={() => setDecisionOpen(false)} className={SECONDARY_BTN}>Cancel</button>
              <button type="submit" className={PRIMARY_BTN}>Save Decision</button>
            </div>
          </form>
        </Modal>

        <Modal open={actionOpen} title="Add Meeting Action Item" onClose={() => setActionOpen(false)}>
          <form onSubmit={handleAddActionItem} className="space-y-4">
            <FormField label="Action Item Title" htmlFor="act-title" required>
              <input id="act-title" required value={actionForm.title} onChange={(e) => setActionForm({ ...actionForm, title: e.target.value })} className={INPUT_CLASS} placeholder="e.g., Draft 5 campaign hooks for client approval" />
            </FormField>
            <FormField label="Deliverable Details" htmlFor="act-desc">
              <textarea id="act-desc" rows={2} value={actionForm.description} onChange={(e) => setActionForm({ ...actionForm, description: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField label="Assignee Type" htmlFor="act-type">
                <select id="act-type" value={actionForm.assigneeType} onChange={(e) => setActionForm({ ...actionForm, assigneeType: e.target.value as 'human' | 'agent', assigneeId: '' })} className={INPUT_CLASS}>
                  <option value="agent">AI Agent</option>
                  <option value="human">Human Employee</option>
                </select>
              </FormField>
              <FormField label="Assignee" htmlFor="act-who">
                <select id="act-who" value={actionForm.assigneeId} onChange={(e) => setActionForm({ ...actionForm, assigneeId: e.target.value })} className={INPUT_CLASS}>
                  <option value="">Select...</option>
                  {actionForm.assigneeType === 'agent'
                    ? agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)
                    : employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                </select>
              </FormField>
              <FormField label="Due Date" htmlFor="act-due">
                <input id="act-due" type="date" value={actionForm.dueDate} onChange={(e) => setActionForm({ ...actionForm, dueDate: e.target.value })} className={INPUT_CLASS} />
              </FormField>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={actionForm.convertToTask}
                onChange={(e) => setActionForm({ ...actionForm, convertToTask: e.target.checked })}
                className="rounded border-slate-300 dark:border-slate-700"
              />
              Immediately create a linked operational Task in Task Center
            </label>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button type="button" onClick={() => setActionOpen(false)} className={SECONDARY_BTN}>Cancel</button>
              <button type="submit" className={PRIMARY_BTN}>Save Action Item</button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }

  // MEETINGS DIRECTORY & ROOMS OVERVIEW
  return (
    <div className="space-y-6">
      <PageHeader
        title="Virtual Meeting System"
        subtitle="Host structured Executive, Department, Project, Client, and Human + AI collaboration sessions backed by real participants, decisions, and task creation."
        actions={
          <button type="button" onClick={() => setCreateOpen(true)} className={PRIMARY_BTN}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            New Meeting
          </button>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* Virtual Conference Rooms */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {rooms.map((room) => {
          const activeInRoom = meetings.find((m) => m.room_id === room.id && m.status === 'active');
          return (
            <div
              key={room.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">{room.name}</h3>
                  <StatusText status={activeInRoom ? 'in_meeting' : 'idle'} label={activeInRoom ? 'In Use' : 'Available'} />
                </div>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{room.description}</p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <span className="font-mono text-slate-500 dark:text-slate-400">{room.capacity} seats</span>
                {activeInRoom ? (
                  <button
                    type="button"
                    onClick={() => setSelectedId(activeInRoom.id)}
                    className="font-medium text-indigo-700 dark:text-indigo-400 hover:underline"
                  >
                    Enter Live Room
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, roomId: room.id }));
                      setCreateOpen(true);
                    }}
                    className="font-medium text-blue-700 dark:text-blue-400 hover:underline"
                  >
                    Book Room
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Meetings List */}
      {meetings.length === 0 ? (
        <EmptyState
          title="No virtual meetings recorded yet"
          description="Create a real Human + AI or Executive meeting to move avatars into a 3D conference room, run multi-agent discussions, record decisions, and spawn tasks."
          action={
            <button type="button" onClick={() => setCreateOpen(true)} className={PRIMARY_BTN}>
              <Video className="w-4 h-4" /> Start First Meeting
            </button>
          }
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-600 dark:text-slate-400">
                <th className="py-3 px-4">Meeting & Room</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-right">Participants</th>
                <th className="py-3 px-4 text-right">Decisions / Actions</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {meetings.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{m.title}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {m.room_name || 'Virtual Room'} {m.client_name ? `· ${m.client_name}` : ''} · {formatDateTime(m.created_at)}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">
                    {m.meeting_type.replace(/_/g, ' ')}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">{m.participant_count}</td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                    {m.decision_count} / {m.action_item_count}
                  </td>
                  <td className="py-3 px-4">
                    <StatusText status={m.status === 'active' ? 'in_meeting' : m.status} label={m.status === 'active' ? 'Live' : undefined} />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedId(m.id)}
                      className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                    >
                      Enter Room
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={createOpen} title="Start or Schedule Virtual Meeting" onClose={() => setCreateOpen(false)} maxWidth="max-w-2xl">
        <form onSubmit={handleCreateMeeting} className="space-y-4">
          <FormField label="Meeting Title" htmlFor="mtg-title" required>
            <input
              id="mtg-title"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={INPUT_CLASS}
              placeholder="e.g., Q4 Brand Campaign Strategy Alignment"
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Meeting Type" htmlFor="mtg-type">
              <select id="mtg-type" value={form.meetingType} onChange={(e) => setForm({ ...form, meetingType: e.target.value })} className={INPUT_CLASS}>
                <option value="human_ai_collaboration">Human + AI Collaboration</option>
                <option value="executive">Executive Leadership</option>
                <option value="department">Department Standup</option>
                <option value="project">Project Review</option>
                <option value="client">Client Briefing</option>
                <option value="ai_coordination">AI Agent Coordination</option>
                <option value="emergency">Emergency Escalation</option>
              </select>
            </FormField>

            <FormField label="Virtual Meeting Room" htmlFor="mtg-room">
              <select id="mtg-room" value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })} className={INPUT_CLASS}>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} ({r.capacity} seats)</option>
                ))}
              </select>
            </FormField>

            <FormField label="Linked Client (Optional)" htmlFor="mtg-cli">
              <select id="mtg-cli" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} className={INPUT_CLASS}>
                <option value="">Internal / No Client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FormField>

            <FormField label="Linked Department (Optional)" htmlFor="mtg-dept">
              <select id="mtg-dept" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className={INPUT_CLASS}>
                <option value="">Cross-Functional</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </FormField>
          </div>

          <FormField label="Agenda & Discussion Topics" htmlFor="mtg-agenda">
            <textarea
              id="mtg-agenda"
              rows={2}
              value={form.agenda}
              onChange={(e) => setForm({ ...form, agenda: e.target.value })}
              className={INPUT_CLASS}
              placeholder="Define key questions, deliverables, or decisions needed."
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Human Participants
              </div>
              <div className="max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-md p-2 space-y-1">
                {employees.map((emp) => (
                  <label key={emp.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.humanParticipantIds.includes(emp.id)}
                      onChange={() =>
                        setForm((prev) => ({
                          ...prev,
                          humanParticipantIds: toggleSelection(prev.humanParticipantIds, emp.id),
                        }))
                      }
                    />
                    <span className="truncate">{emp.full_name} · {emp.job_title}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5" /> AI Agent Participants
              </div>
              <div className="max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-md p-2 space-y-1">
                {agents.map((ag) => (
                  <label key={ag.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.agentParticipantIds.includes(ag.id)}
                      onChange={() =>
                        setForm((prev) => ({
                          ...prev,
                          agentParticipantIds: toggleSelection(prev.agentParticipantIds, ag.id),
                        }))
                      }
                    />
                    <span className="truncate">{ag.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.startImmediately}
              onChange={(e) => setForm({ ...form, startImmediately: e.target.checked })}
            />
            Start meeting immediately (moves participating avatars into this 3D conference room)
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => setCreateOpen(false)} className={SECONDARY_BTN}>Cancel</button>
            <button type="submit" className={PRIMARY_BTN}>
              {form.startImmediately ? 'Launch Meeting Room' : 'Schedule Meeting'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
