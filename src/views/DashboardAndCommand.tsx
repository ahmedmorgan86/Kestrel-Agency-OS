import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Building2, Play, Plus, RefreshCw, Check, Video, ArrowRight } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatCurrencyCents } from '../domain/finance';
import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from '../domain/workflows';
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
  SegmentedTabs,
  StatTile,
  StatusText,
  formatDateTime,
  formatShortDate,
} from '../components/ui';

export function DashboardView({
  onNavigate,
  onOpenAgent,
  onOpenMeeting,
}: {
  onNavigate: (route: string) => void;
  onOpenAgent?: (agentId: string) => void;
  onOpenMeeting?: (meetingId?: string) => void;
}) {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState('');
  const [agentStatusFilter, setAgentStatusFilter] = useState<'all' | 'active' | 'paused'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<Record<string, any>>('/dashboard');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const workload = (data?.agentWorkload ?? []) as Array<Record<string, any>>;
  const filteredWorkload = useMemo(() => {
    return workload.filter((a) => {
      if (agentStatusFilter !== 'all' && a.status !== agentStatusFilter) return false;
      if (agentFilter.trim()) {
        const q = agentFilter.trim().toLowerCase();
        return (
          String(a.name || '').toLowerCase().includes(q) ||
          String(a.model_identifier || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [workload, agentFilter, agentStatusFilter]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Operations Dashboard" subtitle="Loading live database metrics..." />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const m = data?.metrics ?? {};
  const fin = data?.finance ?? {};
  const integrations = (data?.integrations ?? []) as Array<Record<string, any>>;
  const activity = (data?.recentActivity ?? []) as Array<Record<string, any>>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Dashboard"
        subtitle="Real-time agency metrics queried directly from persistent storage. Click any KPI to drill directly into the underlying module."
        actions={
          <>
            <button type="button" onClick={load} className={SECONDARY_BTN}>
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Refresh
            </button>
            <button type="button" onClick={() => onNavigate('hq')} className={SECONDARY_BTN}>
              <Building2 className="w-4 h-4" aria-hidden="true" />
              Enter 3D HQ
            </button>
            <button type="button" onClick={() => onNavigate('clients')} className={PRIMARY_BTN}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              New Client
            </button>
          </>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* HQ & Virtual Meetings Quick Operations Strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('hq')}
          className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 rounded-lg p-4 flex items-center justify-between gap-4 transition-colors"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Interactive 3D Company Headquarters
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Explore 13 departments, live human & AI operational states, org chart, and 2D floor map.
              </div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => (onOpenMeeting ? onOpenMeeting() : onNavigate('meetings'))}
          className="text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 rounded-lg p-4 flex items-center justify-between gap-4 transition-colors"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Video className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Virtual Meeting Rooms & AI Discussions
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Host Human + AI conference sessions, record decisions, and convert action items into tasks.
              </div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="Active Clients" value={m.activeClients ?? 0} meta="Non-archived CRM accounts" onClick={() => onNavigate('clients')} />
        <StatTile label="Active Projects" value={m.activeProjects ?? 0} meta="In active delivery" onClick={() => onNavigate('projects')} />
        <StatTile
          label="Pending Tasks"
          value={m.pendingTasks ?? 0}
          meta={`${m.overdueTasks ?? 0} overdue`}
          tone={(m.overdueTasks ?? 0) > 0 ? 'danger' : 'default'}
          onClick={() => onNavigate('tasks')}
        />
        <StatTile
          label="Pending Approvals"
          value={m.pendingApprovals ?? 0}
          meta="Human review gates"
          tone={(m.pendingApprovals ?? 0) > 0 ? 'warning' : 'default'}
          onClick={() => onNavigate('approvals')}
        />
        <StatTile
          label="Published Content"
          value={m.publishedContent ?? 0}
          meta="Verified external posts"
          tone={(m.publishedContent ?? 0) > 0 ? 'positive' : 'default'}
          onClick={() => onNavigate('publishing')}
        />
        <StatTile
          label="Failed Agent Runs"
          value={m.failedExecutions ?? 0}
          meta={`${m.activeAgents ?? 0}/${m.totalAgents ?? 0} agents active`}
          tone={(m.failedExecutions ?? 0) > 0 ? 'danger' : 'default'}
          onClick={() => onNavigate('executions')}
        />
        <StatTile
          label="Collected Revenue"
          value={formatCurrencyCents(fin.totalCollectedCents ?? 0)}
          meta={`${formatCurrencyCents(fin.outstandingCents ?? 0)} outstanding`}
          tone="positive"
          onClick={() => onNavigate('finance')}
        />
        <StatTile
          label="Actual Expenses + AI"
          value={formatCurrencyCents(fin.totalActualCostCents ?? 0)}
          meta={`AI usage: ${formatCurrencyCents(fin.aiUsageCostCents ?? 0)}`}
          onClick={() => onNavigate('finance')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SectionCard
            title="AI Workforce Workload"
            description="Configured operational agents, live assigned tasks, and actual recorded run costs"
            right={
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  aria-label="Filter agents"
                  placeholder="Filter agents..."
                  value={agentFilter}
                  onChange={(e) => setAgentFilter(e.target.value)}
                  className={`${INPUT_CLASS} w-36 !py-1 text-xs`}
                />
                <select
                  aria-label="Filter agent status"
                  value={agentStatusFilter}
                  onChange={(e) => setAgentStatusFilter(e.target.value as 'all' | 'active' | 'paused')}
                  className={`${INPUT_CLASS} w-28 !py-1 text-xs`}
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </select>
                <button type="button" onClick={() => onNavigate('agents')} className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap">
                  All 14 Agents
                </button>
              </div>
            }
            noPadding
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-600 dark:text-slate-400">
                    <th className="py-2.5 px-4">Agent</th>
                    <th className="py-2.5 px-4">Model</th>
                    <th className="py-2.5 px-4 text-right">Open Tasks</th>
                    <th className="py-2.5 px-4 text-right">Runs</th>
                    <th className="py-2.5 px-4 text-right">Recorded Cost</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredWorkload.slice(0, 10).map((a) => (
                    <tr
                      key={a.id}
                      onClick={onOpenAgent ? () => onOpenAgent(a.id) : undefined}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${onOpenAgent ? 'cursor-pointer' : ''}`}
                    >
                      <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">{a.name}</td>
                      <td className="py-2.5 px-4 font-mono text-xs text-slate-600 dark:text-slate-400">{a.model_identifier}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">{a.open_tasks}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">{a.total_runs}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                        ${Number(a.total_cost_usd || 0).toFixed(4)}
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusText status={a.status} />
                      </td>
                    </tr>
                  ))}
                  {filteredWorkload.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
                        No agents match the active filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title="External Integrations"
          description="Real credential and verification status"
          right={
            <button type="button" onClick={() => onNavigate('integrations')} className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline">
              Configure
            </button>
          }
        >
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {integrations.map((integ) => (
              <div key={integ.provider_code} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug">{integ.display_name}</div>
                  {integ.last_error && (
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{integ.last_error}</div>
                  )}
                </div>
                <div className="shrink-0 pt-0.5">
                  <StatusText status={integ.status} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Recent Immutable Activity"
        description="Audited operational events recorded in the database"
        right={
          <button type="button" onClick={() => onNavigate('audit')} className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline">
            Full Audit Log
          </button>
        }
        noPadding
      >
        {activity.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No operational events recorded yet. Actions taken across the workspace appear here automatically.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">Actor</th>
                  <th className="py-2.5 px-4">Action</th>
                  <th className="py-2.5 px-4">Entity</th>
                  <th className="py-2.5 px-4">Correlation ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {activity.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatDateTime(ev.created_at)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-900 dark:text-slate-100">
                      {ev.actor_label} <span className="text-xs text-slate-500 dark:text-slate-400">· {ev.actor_type}</span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-800 dark:text-slate-200">{ev.action}</td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 dark:text-slate-400">
                      {ev.entity_type} / <span className="font-mono">{ev.entity_id}</span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-500 dark:text-slate-400">{ev.correlation_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export function NotificationsView() {
  const [items, setItems] = useState<Array<Record<string, any>>>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest<{ notifications: Array<Record<string, any>> }>('/notifications');
      setItems(res.notifications);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id: string) => {
    await apiRequest(`/notifications/${id}/read`, { method: 'POST' });
    await load();
  };

  const markAllRead = async () => {
    await apiRequest('/notifications/read-all', { method: 'POST' });
    await load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Real operational alerts generated by approval requests, failed background jobs, and publishing outcomes."
        actions={
          <button type="button" onClick={markAllRead} className={SECONDARY_BTN}>
            <Check className="w-4 h-4" aria-hidden="true" />
            Mark All Read
          </button>
        }
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {items.length === 0 ? (
        <EmptyState
          title="No notifications"
          description="Alerts are generated only when real operational events occur—such as pending human approvals or failed worker jobs."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
          {items.map((n) => (
            <div key={n.id} className={`p-4 flex items-start justify-between gap-4 ${n.read_at ? 'opacity-65' : ''}`}>
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-900">{n.title}</span>
                  <StatusText status={n.severity === 'error' ? 'error' : n.severity === 'warning' ? 'pending' : 'active'} label={n.severity} />
                </div>
                <p className="text-sm text-slate-600">{n.message}</p>
                <div className="text-xs text-slate-500 font-mono">{formatDateTime(n.created_at)}</div>
              </div>
              {!n.read_at && (
                <button type="button" onClick={() => markRead(n.id)} className={SECONDARY_BTN}>
                  Mark Read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TaskCenterView() {
  const [tasks, setTasks] = useState<Array<Record<string, any>>>([]);
  const [clients, setClients] = useState<Array<Record<string, any>>>([]);
  const [projects, setProjects] = useState<Array<Record<string, any>>>([]);
  const [agents, setAgents] = useState<Array<Record<string, any>>>([]);
  const [departments, setDepartments] = useState<Array<Record<string, any>>>([]);
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'calendar'>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    taskType: 'content_production',
    clientId: '',
    projectId: '',
    departmentId: '',
    assignedAgentId: '',
    priority: 'medium',
    dueDate: '',
    requiresApproval: true,
    dependsOnTaskId: '',
  });

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set('status', statusFilter);
      if (search.trim()) qs.set('q', search.trim());
      const [tRes, cRes, pRes, aRes, dRes] = await Promise.all([
        apiRequest<{ tasks: Array<Record<string, any>> }>(`/tasks?${qs.toString()}`),
        apiRequest<{ clients: Array<Record<string, any>> }>('/clients'),
        apiRequest<{ projects: Array<Record<string, any>> }>('/projects'),
        apiRequest<{ agents: Array<Record<string, any>> }>('/agents'),
        apiRequest<{ departments: Array<Record<string, any>> }>('/departments'),
      ]);
      setTasks(tRes.tasks);
      setClients(cRes.clients);
      setProjects(pRes.projects);
      setAgents(aRes.agents);
      setDepartments(dRes.departments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks.');
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/tasks', {
        method: 'POST',
        body: {
          ...form,
          clientId: form.clientId || null,
          projectId: form.projectId || null,
          departmentId: form.departmentId || null,
          assignedAgentId: form.assignedAgentId || null,
          dueDate: form.dueDate || null,
          dependsOnTaskId: form.dependsOnTaskId || null,
        },
      });
      setModalOpen(false);
      setForm({
        title: '',
        description: '',
        taskType: 'content_production',
        clientId: '',
        projectId: '',
        departmentId: '',
        assignedAgentId: '',
        priority: 'medium',
        dueDate: '',
        requiresApproval: true,
        dependsOnTaskId: '',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task.');
    }
  };

  const handleDispatch = async (taskId: string) => {
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ jobId: string }>(`/tasks/${taskId}/execute`, { method: 'POST' });
      setNotice(`Dispatched to background worker (Job ID: ${res.jobId}). Check Execution History for real AI output or provider errors.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch task.');
    }
  };

  const handleStatusChange = async (taskId: string, nextStatus: TaskStatus) => {
    setError(null);
    try {
      await apiRequest(`/tasks/${taskId}`, { method: 'PATCH', body: { status: nextStatus } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task status.');
    }
  };

  const kanbanColumns: Array<{ key: string; title: string; statuses: TaskStatus[] }> = [
    { key: 'backlog', title: 'Queued & Assigned', statuses: ['queued', 'assigned', 'waiting_for_input'] },
    { key: 'active', title: 'Running & Validating', statuses: ['running', 'validating', 'retrying'] },
    { key: 'review', title: 'Review & Approval', statuses: ['waiting_for_approval', 'in_review'] },
    { key: 'done', title: 'Completed & Closed', statuses: ['completed', 'failed', 'rejected', 'cancelled'] },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Task Center"
        subtitle="Operational task queue with dependencies, human & AI agent assignment, durable worker dispatch, and deliverable validation."
        actions={
          <button type="button" onClick={() => setModalOpen(true)} className={PRIMARY_BTN}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Create Task
          </button>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {notice && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-900">
          {notice}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: 'list', label: 'List View' },
            { value: 'kanban', label: 'Kanban Board' },
            { value: 'calendar', label: 'Deadline Calendar' },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            aria-label="Search tasks"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${INPUT_CLASS} w-56`}
          />
          <select
            aria-label="Filter by task status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`${INPUT_CLASS} w-44`}
          >
            <option value="">All Statuses</option>
            {TASK_STATUSES.map((st) => (
              <option key={st} value={st}>
                {TASK_STATUS_LABELS[st]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          title="No operational tasks yet"
          description="Create a task, link it to a client or project, assign an AI agent or team member, and dispatch it to the persistent worker."
          action={
            <button type="button" onClick={() => setModalOpen(true)} className={PRIMARY_BTN}>
              Create First Task
            </button>
          }
        />
      ) : viewMode === 'list' ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-600 dark:text-slate-400">
                <th className="py-3 px-4">Task</th>
                <th className="py-3 px-4">Client / Project</th>
                <th className="py-3 px-4">Assigned Agent</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {tasks.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{t.title}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {t.task_type} {t.requires_approval ? '· Human Approval Gate' : ''}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">
                    {t.client_name || 'Internal'} {t.project_name ? `/ ${t.project_name}` : ''}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">{t.agent_name || 'Unassigned'}</td>
                  <td className="py-3 px-4">
                    <StatusText status={t.priority} />
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-400">{formatShortDate(t.due_date)}</td>
                  <td className="py-3 px-4">
                    <select
                      aria-label={`Status for ${t.title}`}
                      value={t.status}
                      onChange={(e) => handleStatusChange(t.id, e.target.value as TaskStatus)}
                      className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-800 dark:text-slate-200"
                    >
                      {TASK_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {TASK_STATUS_LABELS[st]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {t.assigned_agent_id && (
                      <button
                        type="button"
                        onClick={() => handleDispatch(t.id)}
                        className={SECONDARY_BTN}
                      >
                        <Play className="w-3.5 h-3.5" aria-hidden="true" />
                        Run Agent
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {kanbanColumns.map((col) => {
            const colTasks = tasks.filter((t) => col.statuses.includes(t.status));
            return (
              <div key={col.key} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">{col.title}</h3>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">{colTasks.length}</span>
                </div>
                {colTasks.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 py-4 text-center">Empty column</p>
                ) : (
                  <div className="space-y-2.5">
                    {colTasks.map((t) => (
                      <div key={t.id} className="border border-slate-200 dark:border-slate-700 rounded-md p-3 bg-slate-50/50 dark:bg-slate-800/50 space-y-2">
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{t.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {t.agent_name || 'No agent'} · {formatShortDate(t.due_date)}
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <StatusText status={t.status} />
                          {t.assigned_agent_id && (
                            <button
                              type="button"
                              onClick={() => handleDispatch(t.id)}
                              className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                            >
                              Run
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <SectionCard title="Upcoming Task Deadlines" description="Chronological schedule grouped by due date">
          <div className="divide-y divide-slate-100">
            {[...tasks]
              .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))
              .map((t) => (
                <div key={t.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{t.title}</div>
                    <div className="text-xs text-slate-500">
                      {t.client_name || 'Internal'} · {t.agent_name || 'Unassigned'}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-xs text-slate-600">{formatShortDate(t.due_date)}</span>
                    <StatusText status={t.status} />
                  </div>
                </div>
              ))}
          </div>
        </SectionCard>
      )}

      <Modal open={modalOpen} title="Create Operational Task" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <FormField label="Task Title" htmlFor="task-title" required>
            <input
              id="task-title"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={INPUT_CLASS}
              placeholder="e.g., Draft November Instagram Reels scripts"
            />
          </FormField>

          <FormField label="Operational Instructions / Deliverable Spec" htmlFor="task-desc">
            <textarea
              id="task-desc"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={INPUT_CLASS}
              placeholder="Define concrete inputs, constraints, and expected outputs."
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Client" htmlFor="task-client">
              <select
                id="task-client"
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">Internal / No Client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Project" htmlFor="task-project">
              <select
                id="task-project"
                value={form.projectId}
                onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">No Project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Department" htmlFor="task-dept">
              <select
                id="task-dept"
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">Select department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Assign AI Agent" htmlFor="task-agent">
              <select
                id="task-agent"
                value={form.assignedAgentId}
                onChange={(e) => setForm({ ...form, assignedAgentId: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">Human Only / Unassigned</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Priority" htmlFor="task-priority">
              <select
                id="task-priority"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </FormField>

            <FormField label="Due Date" htmlFor="task-due">
              <input
                id="task-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className={INPUT_CLASS}
              />
            </FormField>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.requiresApproval}
              onChange={(e) => setForm({ ...form, requiresApproval: e.target.checked })}
              className="rounded border-slate-300"
            />
            Require human approval before task can be marked completed
          </label>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setModalOpen(false)} className={SECONDARY_BTN}>
              Cancel
            </button>
            <button type="submit" className={PRIMARY_BTN}>
              Create Task
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
