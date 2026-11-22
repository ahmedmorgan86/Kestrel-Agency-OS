import React, { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Play, Plus, RefreshCw, Ban } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatCurrencyCents } from '../domain/finance';
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
  StatTile,
  StatusText,
  formatDateTime,
  formatShortDate,
} from '../components/ui';

export function AgentWorkforceView({
  onOpenAgent,
}: {
  onOpenAgent?: (agentId: string) => void;
} = {}) {
  const [agents, setAgents] = useState<Array<Record<string, any>>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [runPrompt, setRunPrompt] = useState('');
  const [configForm, setConfigForm] = useState({
    systemInstructions: '',
    modelProvider: 'google_gemini',
    modelIdentifier: 'gemini-4-hydrogen',
    monthlyBudgetUsd: '50',
    timeoutSeconds: '60',
    maxRetries: '2',
    status: 'active',
    changeNote: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await apiRequest<{ agents: Array<Record<string, any>> }>('/agents');
      setAgents(res.agents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AI agents.');
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await apiRequest<Record<string, any>>(`/agents/${id}`);
      setDetail(res);
      const a = res.agent;
      setConfigForm({
        systemInstructions: a.system_instructions || '',
        modelProvider: a.model_provider || 'google_gemini',
        modelIdentifier: a.model_identifier || 'gemini-4-hydrogen',
        monthlyBudgetUsd: String(a.monthly_budget_usd ?? 50),
        timeoutSeconds: String(a.timeout_seconds ?? 60),
        maxRetries: String(a.max_retries ?? 2),
        status: a.status || 'active',
        changeNote: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent config.');
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/agents/${selectedId}`, {
        method: 'PATCH',
        body: {
          systemInstructions: configForm.systemInstructions,
          modelProvider: configForm.modelProvider,
          modelIdentifier: configForm.modelIdentifier,
          monthlyBudgetUsd: Number(configForm.monthlyBudgetUsd),
          timeoutSeconds: Number(configForm.timeoutSeconds),
          maxRetries: Number(configForm.maxRetries),
          status: configForm.status,
          changeNote: configForm.changeNote || 'Updated agent parameters',
        },
      });
      setNotice('Agent configuration persisted. Prompt or model changes automatically increment the version history.');
      await loadDetail(selectedId);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update agent.');
    }
  };

  const handleRunDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ jobId: string }>(`/agents/${selectedId}/run`, {
        method: 'POST',
        body: { prompt: runPrompt },
      });
      setRunPrompt('');
      setNotice(`Queued durable execution job ${res.jobId}. Refresh in a few seconds or inspect Execution History.`);
      setTimeout(() => void loadDetail(selectedId), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch agent.');
    }
  };

  if (selectedId && detail) {
    const a = detail.agent;
    const allowedTools = JSON.parse(a.allowed_tools_json || '[]') as string[];
    const versions = (detail.versions ?? []) as Array<Record<string, any>>;
    const runs = (detail.runs ?? []) as Array<Record<string, any>>;

    return (
      <div className="space-y-6">
        <PageHeader
          title={a.name}
          subtitle={`${a.job_title} · ${a.department_name || 'Operations'} · Prompt v${a.prompt_version} · Supervisor: ${a.supervisor_name}`}
          actions={
            <button type="button" onClick={() => setSelectedId(null)} className={SECONDARY_BTN}>
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              All 14 Agents
            </button>
          }
        />
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        {notice && <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-900">{notice}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <SectionCard title="Agent Configuration & System Instructions" description="Versioned governance controls, provider model, and limits">
              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField label="Status" htmlFor="ag-status">
                    <select id="ag-status" value={configForm.status} onChange={(e) => setConfigForm({ ...configForm, status: e.target.value })} className={INPUT_CLASS}>
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                    </select>
                  </FormField>
                  <FormField label="Model Provider" htmlFor="ag-prov">
                    <select id="ag-prov" value={configForm.modelProvider} onChange={(e) => setConfigForm({ ...configForm, modelProvider: e.target.value })} className={INPUT_CLASS}>
                      <option value="google_gemini">Google Gemini</option>
                      <option value="openai">OpenAI (Requires Key)</option>
                      <option value="anthropic">Anthropic (Requires Key)</option>
                    </select>
                  </FormField>
                  <FormField label="Model Identifier" htmlFor="ag-model">
                    <input
                      id="ag-model"
                      list="gemini-model-presets"
                      value={configForm.modelIdentifier}
                      onChange={(e) => setConfigForm({ ...configForm, modelIdentifier: e.target.value })}
                      className={INPUT_CLASS}
                    />
                    <datalist id="gemini-model-presets">
                      <option value="gemini-4-hydrogen">gemini-4-hydrogen (Free Tier Default)</option>
                      <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Free Tier Fast)</option>
                      <option value="gemini-4-neon">gemini-4-neon (Paid Key)</option>
                      <option value="gemini-4-carbon">gemini-4-carbon (Paid Key)</option>
                    </datalist>
                  </FormField>
                  <FormField label="Monthly Budget (USD)" htmlFor="ag-budget">
                    <input id="ag-budget" type="number" min="0" step="1" value={configForm.monthlyBudgetUsd} onChange={(e) => setConfigForm({ ...configForm, monthlyBudgetUsd: e.target.value })} className={INPUT_CLASS} />
                  </FormField>
                  <FormField label="Timeout (Seconds)" htmlFor="ag-timeout">
                    <input id="ag-timeout" type="number" min="10" value={configForm.timeoutSeconds} onChange={(e) => setConfigForm({ ...configForm, timeoutSeconds: e.target.value })} className={INPUT_CLASS} />
                  </FormField>
                  <FormField label="Max Retries" htmlFor="ag-retries">
                    <input id="ag-retries" type="number" min="0" max="10" value={configForm.maxRetries} onChange={(e) => setConfigForm({ ...configForm, maxRetries: e.target.value })} className={INPUT_CLASS} />
                  </FormField>
                </div>

                <FormField label="System Instructions" htmlFor="ag-prompt">
                  <textarea id="ag-prompt" rows={5} value={configForm.systemInstructions} onChange={(e) => setConfigForm({ ...configForm, systemInstructions: e.target.value })} className={INPUT_CLASS} />
                </FormField>

                <FormField label="Change Note (for audit & prompt version)" htmlFor="ag-note">
                  <input id="ag-note" value={configForm.changeNote} onChange={(e) => setConfigForm({ ...configForm, changeNote: e.target.value })} className={INPUT_CLASS} placeholder="e.g., Tightened structured QA rules" />
                </FormField>

                <div className="flex justify-end">
                  <button type="submit" className={PRIMARY_BTN}>Save Configuration</button>
                </div>
              </form>
            </SectionCard>

            <SectionCard title="Dispatch Direct Execution Job" description="Runs asynchronously via the durable worker queue and logs real tokens, latency, output, or errors">
              <form onSubmit={handleRunDirect} className="space-y-3">
                <FormField label="Operational Prompt" htmlFor="ag-run-prompt" required>
                  <textarea id="ag-run-prompt" required rows={3} value={runPrompt} onChange={(e) => setRunPrompt(e.target.value)} className={INPUT_CLASS} placeholder="Specify the exact operational deliverable for this agent..." />
                </FormField>
                <div className="flex justify-end">
                  <button type="submit" className={PRIMARY_BTN}>
                    <Play className="w-4 h-4" aria-hidden="true" />
                    Enqueue Agent Job
                  </button>
                </div>
              </form>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard title="Allowed Tool Boundaries">
              <ul className="space-y-1.5 text-xs font-mono text-slate-700">
                {allowedTools.map((t) => <li key={t}>· {t}</li>)}
              </ul>
              <p className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                Governance invariant: self-approval, unapproved publishing, and unauthorized financial spend are permanently disabled.
              </p>
            </SectionCard>

            <SectionCard title={`Prompt Version History (${versions.length})`}>
              <div className="divide-y divide-slate-100 text-xs">
                {versions.map((v) => (
                  <div key={v.id} className="py-2 first:pt-0 last:pb-0">
                    <div className="font-semibold text-slate-900">v{v.version_number} · {v.model_identifier}</div>
                    <div className="text-slate-600">{v.change_note}</div>
                    <div className="font-mono text-slate-400">{formatDateTime(v.created_at)}</div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title={`Recent Runs (${runs.length})`}>
              {runs.length === 0 ? (
                <p className="text-xs text-slate-500">No executions recorded yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 text-xs">
                  {runs.slice(0, 6).map((r) => (
                    <div key={r.id} className="py-2 first:pt-0 last:pb-0 space-y-1">
                      <div className="flex justify-between">
                        <StatusText status={r.status} />
                        <span className="font-mono text-slate-500">{r.latency_ms}ms</span>
                      </div>
                      {r.error_message && <div className="text-red-700">{r.error_message}</div>}
                      <div className="font-mono text-slate-400">{formatDateTime(r.started_at)}</div>
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
        title="AI Agent Workforce"
        subtitle="14 specialized operational agents governed by explicit tool boundaries, prompt versioning, budget limits, and real execution logs."
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-600 dark:text-slate-400">
              <th className="py-3 px-4">Agent & Role</th>
              <th className="py-3 px-4">Department</th>
              <th className="py-3 px-4">Model</th>
              <th className="py-3 px-4 text-right">Runs (OK / Fail)</th>
              <th className="py-3 px-4 text-right">Recorded Cost</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Profile</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {agents.map((a) => (
              <tr
                key={a.id}
                onClick={() => (onOpenAgent ? onOpenAgent(a.id) : setSelectedId(a.id))}
                className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
              >
                <td className="py-3 px-4">
                  <div className="font-medium text-slate-900 dark:text-slate-100">{a.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{a.job_title} · v{a.prompt_version}</div>
                </td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">{a.department_name || '—'}</td>
                <td className="py-3 px-4 font-mono text-xs text-slate-700 dark:text-slate-300">{a.model_identifier}</td>
                <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-800 dark:text-slate-200">
                  {a.completed_runs} / <span className={a.failed_runs > 0 ? 'text-red-700 dark:text-red-400' : ''}>{a.failed_runs}</span>
                </td>
                <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-800 dark:text-slate-200">
                  ${Number(a.total_cost_usd || 0).toFixed(4)}
                </td>
                <td className="py-3 px-4"><StatusText status={a.status} /></td>
                <td className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenAgent) onOpenAgent(a.id);
                      else setSelectedId(a.id);
                    }}
                    className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                  >
                    Open 9-Tab Profile
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ExecutionHistoryView() {
  const [runs, setRuns] = useState<Array<Record<string, any>>>([]);
  const [jobs, setJobs] = useState<Array<Record<string, any>>>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest<{ runs: Array<Record<string, any>>; jobs: Array<Record<string, any>> }>('/executions');
      setRuns(res.runs);
      setJobs(res.jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load execution history.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCancelJob = async (jobId: string) => {
    try {
      await apiRequest(`/jobs/${jobId}/cancel`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel job.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Execution History & Job Queue"
        subtitle="Traceable evidence of every real AI model invocation, token count, latency, cost, structured output, and background worker status."
        actions={
          <button type="button" onClick={load} className={SECONDARY_BTN}>
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Refresh
          </button>
        }
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <SectionCard title={`AI Model Runs (${runs.length})`} noPadding>
        {runs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No AI agent executions have run yet. Dispatch a task from Task Center or AI Agent Workforce to see live execution evidence.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {runs.map((r) => (
              <div key={r.id} className="p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-sm text-slate-900">{r.agent_name}</span>
                    <span className="text-xs text-slate-500 ml-2 font-mono">{r.model_identifier}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono text-slate-600">
                    <span>{r.prompt_tokens} in / {r.output_tokens} out</span>
                    <span>·</span>
                    <span>{r.latency_ms}ms</span>
                    <span>·</span>
                    <span>${Number(r.cost_usd || 0).toFixed(5)}</span>
                    <StatusText status={r.status} />
                  </div>
                </div>
                {r.error_message && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2.5 font-mono">
                    {r.error_message}
                  </div>
                )}
                {r.structured_output_json && (
                  <pre className="text-xs bg-slate-50 border border-slate-200 rounded p-3 overflow-x-auto max-h-48 text-slate-800">
                    {r.structured_output_json}
                  </pre>
                )}
                <div className="text-[11px] font-mono text-slate-400">
                  Run {r.id} · Correlation {r.correlation_id} · Started {formatDateTime(r.started_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title={`Durable Background Queue (${jobs.length})`} noPadding>
        {jobs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Queue is empty.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-medium text-slate-600">
                  <th className="py-2.5 px-4">Job ID</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Attempts</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Last Error</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="py-2.5 px-4 font-mono">{j.id}</td>
                    <td className="py-2.5 px-4 font-mono">{j.job_type}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">{j.attempts}/{j.max_attempts}</td>
                    <td className="py-2.5 px-4"><StatusText status={j.status} /></td>
                    <td className="py-2.5 px-4 text-red-700 max-w-sm truncate">{j.last_error || '—'}</td>
                    <td className="py-2.5 px-4 text-right">
                      {(j.status === 'queued' || j.status === 'retrying') && (
                        <button type="button" onClick={() => handleCancelJob(j.id)} className="inline-flex items-center gap-1 text-red-700 hover:underline">
                          <Ban className="w-3 h-3" /> Cancel
                        </button>
                      )}
                    </td>
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

export function AnalyticsView() {
  const [data, setData] = useState<{ metrics: Array<Record<string, any>>; syncRuns: Array<Record<string, any>>; accounts: Array<Record<string, any>> }>({
    metrics: [],
    syncRuns: [],
    accounts: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest<{ metrics: Array<Record<string, any>>; syncRuns: Array<Record<string, any>>; accounts: Array<Record<string, any>> }>('/analytics');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSync = async (socialAccountId: string) => {
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ jobId: string }>('/analytics/sync', {
        method: 'POST',
        body: { socialAccountId },
      });
      setNotice(`Queued analytics synchronization job ${res.jobId}. Refresh to inspect real sync status.`);
      setTimeout(() => void load(), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analytics sync failed.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics & Reporting"
        subtitle="Verified platform-reported metrics only. Unavailable metrics are explicitly distinguished from zero; missing integrations never display fabricated charts."
        actions={
          <button type="button" onClick={load} className={SECONDARY_BTN}>
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Refresh
          </button>
        }
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {notice && <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-900">{notice}</div>}

      <SectionCard title="Connected Account Sync Controls" description="Trigger real platform API synchronization per social account">
        {data.accounts.length === 0 ? (
          <p className="text-sm text-slate-500">
            No client social accounts registered yet. Register and authorize accounts under Integrations to sync platform analytics.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.accounts.map((acc) => (
              <div key={acc.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-slate-900">
                    {acc.client_name} · {acc.platform} · @{acc.account_handle}
                  </div>
                  <div className="text-xs text-slate-500">
                    Last sync: {formatDateTime(acc.last_synced_at)} · <StatusText status={acc.connection_status} />
                  </div>
                </div>
                <button type="button" onClick={() => handleSync(acc.id)} className={SECONDARY_BTN}>
                  Sync Metrics Now
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {data.metrics.length === 0 ? (
        <EmptyState
          title="No verified platform metrics synchronized"
          description="Followers, reach, impressions, engagement, likes, comments, shares, saves, and video views will populate here once an authorized social account completes synchronization."
        />
      ) : (
        <SectionCard title="Persisted Performance Metrics" noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  <th className="py-2.5 px-4">Client / Account</th>
                  <th className="py-2.5 px-4">Metric</th>
                  <th className="py-2.5 px-4 text-right">Value</th>
                  <th className="py-2.5 px-4">Period</th>
                  <th className="py-2.5 px-4">Method & Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.metrics.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2.5 px-4">{m.client_name} · @{m.account_handle}</td>
                    <td className="py-2.5 px-4 font-medium">{m.metric_name}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {m.is_unavailable ? 'Unavailable' : m.metric_value}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs">{m.period_start} → {m.period_end}</td>
                    <td className="py-2.5 px-4 text-xs text-slate-500">{m.calculation_method} · {formatDateTime(m.collected_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

export function FinancialManagementView() {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [clients, setClients] = useState<Array<Record<string, any>>>([]);
  const [modal, setModal] = useState<'invoice' | 'expense' | 'payment' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [invForm, setInvForm] = useState({
    clientId: '',
    invoiceNumber: '',
    amountUsd: '',
    issuedDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    notes: '',
  });
  const [expForm, setExpForm] = useState({
    clientId: '',
    category: 'operations',
    description: '',
    amountUsd: '',
    isEstimate: false,
    incurredDate: new Date().toISOString().slice(0, 10),
  });
  const [payForm, setPayForm] = useState({
    invoiceId: '',
    amountUsd: '',
    paymentMethod: 'bank_transfer',
    referenceCode: '',
  });

  const load = useCallback(async () => {
    try {
      const [fRes, cRes] = await Promise.all([
        apiRequest<Record<string, any>>('/finance/summary'),
        apiRequest<{ clients: Array<Record<string, any>> }>('/clients'),
      ]);
      setData(fRes);
      setClients(cRes.clients);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load financial ledger.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/finance/invoices', {
        method: 'POST',
        body: { ...invForm, amountUsd: Number(invForm.amountUsd) },
      });
      setModal(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invoice.');
    }
  };

  const handleExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/finance/expenses', {
        method: 'POST',
        body: {
          ...expForm,
          clientId: expForm.clientId || null,
          amountUsd: Number(expForm.amountUsd),
        },
      });
      setModal(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record expense.');
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/finance/payments', {
        method: 'POST',
        body: { ...payForm, amountUsd: Number(payForm.amountUsd) },
      });
      setModal(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment.');
    }
  };

  const s = data?.summary ?? {};
  const invoices = (data?.invoices ?? []) as Array<Record<string, any>>;
  const expenses = (data?.expenses ?? []) as Array<Record<string, any>>;
  const profitability = (data?.clientProfitability ?? []) as Array<Record<string, any>>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Management"
        subtitle="Actual recorded revenue, payments, expenses (distinct from estimates), AI token usage costs, and client profitability."
        actions={
          <>
            <button type="button" onClick={() => setModal('expense')} className={SECONDARY_BTN}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              Log Expense
            </button>
            <button type="button" onClick={() => setModal('payment')} className={SECONDARY_BTN} disabled={invoices.length === 0}>
              Record Payment
            </button>
            <button type="button" onClick={() => setModal('invoice')} className={PRIMARY_BTN} disabled={clients.length === 0}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              Issue Invoice
            </button>
          </>
        }
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Collected Revenue" value={formatCurrencyCents(s.totalCollectedCents ?? 0)} meta={`Invoiced: ${formatCurrencyCents(s.totalInvoicedCents ?? 0)}`} tone="positive" />
        <StatTile label="Outstanding AR" value={formatCurrencyCents(s.outstandingCents ?? 0)} meta="Unpaid issued invoices" tone={(s.outstandingCents ?? 0) > 0 ? 'warning' : 'default'} />
        <StatTile label="Actual Costs + AI" value={formatCurrencyCents(s.totalActualCostCents ?? 0)} meta={`Estimates (excluded): ${formatCurrencyCents(s.estimatedExpenseCents ?? 0)}`} />
        <StatTile
          label="Net Actual Profit"
          value={formatCurrencyCents(s.netActualProfitCents ?? 0)}
          meta={s.profitMarginPercent !== null && s.profitMarginPercent !== undefined ? `Margin: ${s.profitMarginPercent}%` : 'Margin: N/A (zero revenue)'}
          tone={(s.netActualProfitCents ?? 0) < 0 ? 'danger' : 'positive'}
        />
      </div>

      <SectionCard title="Client Profitability (Actual Recorded Figures)" noPadding>
        {profitability.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No active clients recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  <th className="py-2.5 px-4">Client</th>
                  <th className="py-2.5 px-4 text-right">Collected</th>
                  <th className="py-2.5 px-4 text-right">Actual Expenses</th>
                  <th className="py-2.5 px-4 text-right">AI Usage Cost</th>
                  <th className="py-2.5 px-4 text-right">Net Profit</th>
                  <th className="py-2.5 px-4 text-right">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {profitability.map((row) => (
                  <tr key={row.clientId}>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{row.clientName}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{formatCurrencyCents(row.totalCollectedCents)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{formatCurrencyCents(row.actualExpenseCents)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{formatCurrencyCents(row.aiUsageCostCents)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{formatCurrencyCents(row.netActualProfitCents)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {row.profitMarginPercent === null ? '—' : `${row.profitMarginPercent}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title={`Invoices (${invoices.length})`} noPadding>
          {invoices.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">No invoices issued.</div>
          ) : (
            <div className="divide-y divide-slate-100 text-sm">
              {invoices.map((i) => (
                <div key={i.id} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900">{i.invoice_number} · {i.client_name}</div>
                    <div className="text-xs text-slate-500 font-mono">Due {formatShortDate(i.due_date)} · Paid {formatCurrencyCents(i.paid_cents)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-semibold tabular-nums">{formatCurrencyCents(i.amount_cents)}</div>
                    <StatusText status={i.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title={`Recorded Expenses (${expenses.length})`} noPadding>
          {expenses.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">No expenses logged.</div>
          ) : (
            <div className="divide-y divide-slate-100 text-sm">
              {expenses.map((ex) => (
                <div key={ex.id} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900">{ex.description}</div>
                    <div className="text-xs text-slate-500">
                      {ex.category} · {ex.client_name || 'Overhead'} · {ex.is_estimate ? 'Estimate' : 'Actual'} · {formatShortDate(ex.incurred_date)}
                    </div>
                  </div>
                  <div className="font-mono font-semibold tabular-nums">{formatCurrencyCents(ex.amount_cents)}</div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <Modal open={modal === 'invoice'} title="Issue Client Invoice" onClose={() => setModal(null)}>
        <form onSubmit={handleInvoice} className="space-y-4">
          <FormField label="Client" htmlFor="inv-cli" required>
            <select id="inv-cli" required value={invForm.clientId} onChange={(e) => setInvForm({ ...invForm, clientId: e.target.value })} className={INPUT_CLASS}>
              <option value="">Select client...</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Invoice Number" htmlFor="inv-num" required>
              <input id="inv-num" required value={invForm.invoiceNumber} onChange={(e) => setInvForm({ ...invForm, invoiceNumber: e.target.value })} className={INPUT_CLASS} placeholder="INV-2026-001" />
            </FormField>
            <FormField label="Amount (USD)" htmlFor="inv-amt" required>
              <input id="inv-amt" type="number" min="0.01" step="0.01" required value={invForm.amountUsd} onChange={(e) => setInvForm({ ...invForm, amountUsd: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Issued Date" htmlFor="inv-iss" required>
              <input id="inv-iss" type="date" required value={invForm.issuedDate} onChange={(e) => setInvForm({ ...invForm, issuedDate: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Due Date" htmlFor="inv-due" required>
              <input id="inv-due" type="date" required value={invForm.dueDate} onChange={(e) => setInvForm({ ...invForm, dueDate: e.target.value })} className={INPUT_CLASS} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setModal(null)} className={SECONDARY_BTN}>Cancel</button>
            <button type="submit" className={PRIMARY_BTN}>Issue Invoice</button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'payment'} title="Record Invoice Payment" onClose={() => setModal(null)}>
        <form onSubmit={handlePayment} className="space-y-4">
          <FormField label="Invoice" htmlFor="pay-inv" required>
            <select id="pay-inv" required value={payForm.invoiceId} onChange={(e) => setPayForm({ ...payForm, invoiceId: e.target.value })} className={INPUT_CLASS}>
              <option value="">Select invoice...</option>
              {invoices.map((i) => <option key={i.id} value={i.id}>{i.invoice_number} — {i.client_name} ({formatCurrencyCents(i.amount_cents)})</option>)}
            </select>
          </FormField>
          <FormField label="Payment Amount (USD)" htmlFor="pay-amt" required>
            <input id="pay-amt" type="number" min="0.01" step="0.01" required value={payForm.amountUsd} onChange={(e) => setPayForm({ ...payForm, amountUsd: e.target.value })} className={INPUT_CLASS} />
          </FormField>
          <FormField label="Reference / Wire ID" htmlFor="pay-ref">
            <input id="pay-ref" value={payForm.referenceCode} onChange={(e) => setPayForm({ ...payForm, referenceCode: e.target.value })} className={INPUT_CLASS} />
          </FormField>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setModal(null)} className={SECONDARY_BTN}>Cancel</button>
            <button type="submit" className={PRIMARY_BTN}>Record Payment</button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'expense'} title="Log Expense" onClose={() => setModal(null)}>
        <form onSubmit={handleExpense} className="space-y-4">
          <FormField label="Description" htmlFor="exp-desc" required>
            <input id="exp-desc" required value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} className={INPUT_CLASS} placeholder="e.g., Video editor contractor fee" />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Category" htmlFor="exp-cat" required>
              <select id="exp-cat" value={expForm.category} onChange={(e) => setExpForm({ ...expForm, category: e.target.value })} className={INPUT_CLASS}>
                <option value="operations">Operations</option>
                <option value="employee">Employee</option>
                <option value="campaign_media">Campaign Media</option>
                <option value="ai_model">AI Model</option>
                <option value="image_generation">Image Generation</option>
                <option value="video_generation">Video Generation</option>
                <option value="storage">Storage</option>
                <option value="integration">Integration</option>
              </select>
            </FormField>
            <FormField label="Client (Optional)" htmlFor="exp-cli">
              <select id="exp-cli" value={expForm.clientId} onChange={(e) => setExpForm({ ...expForm, clientId: e.target.value })} className={INPUT_CLASS}>
                <option value="">Agency Overhead</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FormField>
            <FormField label="Amount (USD)" htmlFor="exp-amt" required>
              <input id="exp-amt" type="number" min="0.01" step="0.01" required value={expForm.amountUsd} onChange={(e) => setExpForm({ ...expForm, amountUsd: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Incurred Date" htmlFor="exp-date" required>
              <input id="exp-date" type="date" required value={expForm.incurredDate} onChange={(e) => setExpForm({ ...expForm, incurredDate: e.target.value })} className={INPUT_CLASS} />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={expForm.isEstimate} onChange={(e) => setExpForm({ ...expForm, isEstimate: e.target.checked })} className="rounded border-slate-300" />
            Mark as estimate (excluded from actual net profit calculation)
          </label>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setModal(null)} className={SECONDARY_BTN}>Cancel</button>
            <button type="submit" className={PRIMARY_BTN}>Log Expense</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
