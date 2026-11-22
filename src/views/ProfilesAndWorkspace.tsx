import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  Bot,
  Edit3,
  Mail,
  Pause,
  Phone,
  Play,
  Shield,
  Sliders,
  UserCheck,
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
  SegmentedTabs,
  StatTile,
  StatusText,
  formatDateTime,
  formatShortDate,
} from '../components/ui';

export function MyWorkspaceView({
  onNavigate,
  onOpenMeeting,
  onOpenEmployee,
}: {
  onNavigate: (route: string) => void;
  onOpenMeeting: (id?: string) => void;
  onOpenEmployee: (id: string) => void;
}) {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [tab, setTab] = useState<'tasks' | 'approvals' | 'meetings' | 'activity'>('tasks');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest<Record<string, any>>('/me/workspace');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load personal workspace.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return (
      <div className="space-y-4">
        <PageHeader title="My Workspace" subtitle="Loading your operational queue, pending approvals, and activity..." />
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        <div className="h-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  const user = data.user;
  const emp = data.employee;
  const tasks = (data.assignedTasks ?? []) as Array<Record<string, any>>;
  const approvals = (data.pendingApprovals ?? []) as Array<Record<string, any>>;
  const notifications = (data.notifications ?? []) as Array<Record<string, any>>;
  const activity = (data.recentActivity ?? []) as Array<Record<string, any>>;
  const meetings = (data.myMeetings ?? []) as Array<Record<string, any>>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`My Workspace — ${user.fullName}`}
        subtitle={`${emp?.job_title || 'Agency Operator'} · ${emp?.department_name || 'Executive Management'} · Roles: ${(user.roles || []).join(', ')}`}
        actions={
          <>
            {emp?.id && (
              <button type="button" onClick={() => onOpenEmployee(emp.id)} className={SECONDARY_BTN}>
                <UserCheck className="w-4 h-4" /> My Profile
              </button>
            )}
            <button type="button" onClick={() => onNavigate('hq')} className={PRIMARY_BTN}>
              Enter Virtual HQ
            </button>
          </>
        }
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="My Tasks" value={tasks.length} meta="Assigned or created by you" onClick={() => setTab('tasks')} />
        <StatTile
          label="Pending Approvals"
          value={approvals.length}
          meta="Awaiting human governance sign-off"
          tone={approvals.length > 0 ? 'warning' : 'default'}
          onClick={() => onNavigate('approvals')}
        />
        <StatTile
          label="Unread Alerts"
          value={notifications.filter((n) => !n.read_at).length}
          meta={`${notifications.length} recent notifications`}
          onClick={() => onNavigate('notifications')}
        />
        <StatTile
          label="My Meetings"
          value={meetings.length}
          meta="Scheduled & active sessions"
          onClick={() => setTab('meetings')}
        />
      </div>

      <SegmentedTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'tasks', label: `Tasks (${tasks.length})` },
          { value: 'approvals', label: `Pending Approvals (${approvals.length})` },
          { value: 'meetings', label: `Meetings (${meetings.length})` },
          { value: 'activity', label: `Activity History (${activity.length})` },
        ]}
      />

      {tab === 'tasks' && (
        <SectionCard title="Assigned & Owned Tasks" noPadding>
          {tasks.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No tasks assigned to you yet. Create or assign a task in Task Center.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {tasks.map((t) => (
                <div key={t.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">{t.title}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {t.client_name || 'Internal'} · {t.agent_name || 'Human'} · Due {formatShortDate(t.due_date)}
                    </div>
                  </div>
                  <StatusText status={t.status} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {tab === 'approvals' && (
        <SectionCard
          title="Pending Human Approval Gates"
          right={
            <button type="button" onClick={() => onNavigate('approvals')} className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline">
              Open Approval Center
            </button>
          }
          noPadding
        >
          {approvals.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">No pending approval requests.</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {approvals.map((a) => (
                <div key={a.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">{a.summary}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {a.gate_type} · Requested {formatDateTime(a.created_at)}
                    </div>
                  </div>
                  <StatusText status={a.status} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {tab === 'meetings' && (
        <SectionCard title="My Virtual Meetings" noPadding>
          {meetings.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No virtual meetings yet.{' '}
              <button type="button" onClick={() => onOpenMeeting()} className="text-blue-700 dark:text-blue-400 hover:underline">
                Start a meeting
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {meetings.map((m) => (
                <div key={m.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">{m.title}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {m.room_name || 'Conference Room'} · {formatDateTime(m.created_at)}
                    </div>
                  </div>
                  <button type="button" onClick={() => onOpenMeeting(m.id)} className={SECONDARY_BTN}>
                    <Video className="w-3.5 h-3.5" /> Enter
                  </button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {tab === 'activity' && (
        <SectionCard title="Personal Audit Activity" noPadding>
          {activity.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">No recorded actions yet.</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {activity.map((ev) => (
                <div key={ev.id} className="p-3.5 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-mono font-medium text-slate-900 dark:text-slate-100">{ev.action}</span>
                    <span className="text-slate-500 dark:text-slate-400 ml-2">
                      {ev.entity_type}:{ev.entity_id}
                    </span>
                  </div>
                  <span className="font-mono text-slate-400 shrink-0">{formatDateTime(ev.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}

export function HumanEmployeeProfileView({
  employeeId,
  onBack,
  onOpenEmployee,
  onOpenAgent,
  onOpenDepartment,
}: {
  employeeId: string;
  onBack: () => void;
  onOpenEmployee: (id: string) => void;
  onOpenAgent: (id: string) => void;
  onOpenDepartment: (id: string) => void;
}) {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [departments, setDepartments] = useState<Array<Record<string, any>>>([]);
  const [allEmployees, setAllEmployees] = useState<Array<Record<string, any>>>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    jobTitle: '',
    departmentId: '',
    managerEmployeeId: '',
    phone: '',
    photoUrl: '',
    joiningDate: '',
    employmentStatus: 'active',
    roleCode: 'account_manager',
    accentColor: '#1e40af',
    bodyColor: '#334155',
    accessory: 'none',
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [res, dRes, eRes] = await Promise.all([
        apiRequest<Record<string, any>>(`/employees/${employeeId}`),
        apiRequest<{ departments: Array<Record<string, any>> }>('/departments'),
        apiRequest<{ employees: Array<Record<string, any>> }>('/employees'),
      ]);
      setData(res);
      setDepartments(dRes.departments);
      setAllEmployees(eRes.employees);
      const emp = res.employee;
      const roleCode = (res.roles?.[0]?.code as string) || 'account_manager';
      setForm({
        fullName: emp.full_name || '',
        jobTitle: emp.job_title || '',
        departmentId: emp.department_id || '',
        managerEmployeeId: emp.manager_employee_id || '',
        phone: emp.phone || '',
        photoUrl: emp.photo_url || '',
        joiningDate: emp.joining_date || (emp.created_at ? String(emp.created_at).slice(0, 10) : ''),
        employmentStatus: emp.employment_status || 'active',
        roleCode,
        accentColor: emp.avatarConfig?.accentColor || '#1e40af',
        bodyColor: emp.avatarConfig?.bodyColor || '#334155',
        accessory: emp.avatarConfig?.accessory || 'none',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load employee profile.');
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/employees/${employeeId}`, {
        method: 'PATCH',
        body: {
          fullName: form.fullName,
          jobTitle: form.jobTitle,
          departmentId: form.departmentId || null,
          managerEmployeeId: form.managerEmployeeId || null,
          phone: form.phone,
          photoUrl: form.photoUrl,
          joiningDate: form.joiningDate,
          employmentStatus: form.employmentStatus,
          roleCode: form.roleCode,
          avatarConfig: {
            accentColor: form.accentColor,
            bodyColor: form.bodyColor,
            accessory: form.accessory,
          },
        },
      });
      setEditOpen(false);
      setNotice('Employee profile and 3D HQ avatar updated.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update employee profile.');
    }
  };

  if (!data) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className={SECONDARY_BTN}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        <div className="h-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  const emp = data.employee;
  const roles = (data.roles ?? []) as Array<Record<string, string>>;
  const permissions = (data.permissions ?? []) as Array<Record<string, string>>;
  const directReports = (data.directReports ?? []) as Array<Record<string, any>>;
  const supervisedAgents = (data.supervisedAgents ?? []) as Array<Record<string, any>>;
  const tasks = (data.tasks ?? []) as Array<Record<string, any>>;
  const clients = (data.managedClients ?? []) as Array<Record<string, any>>;
  const activity = (data.activity ?? []) as Array<Record<string, any>>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={emp.full_name}
        subtitle={`${emp.job_title} · ${emp.department_name || 'Unassigned Department'}`}
        actions={
          <>
            <button type="button" onClick={onBack} className={SECONDARY_BTN}>
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button type="button" onClick={() => setEditOpen(true)} className={PRIMARY_BTN}>
              <Edit3 className="w-4 h-4" /> Edit Profile & Avatar
            </button>
          </>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {notice && (
        <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-lg px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200">
          {notice}
        </div>
      )}

      {/* Identity Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <ActorAvatar
            name={emp.full_name}
            actorType="human"
            photoUrl={emp.photo_url}
            avatarConfig={emp.avatarConfig}
            size="lg"
          />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{emp.full_name}</h2>
              <StatusText status={emp.employment_status} />
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400">{emp.job_title}</div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400 pt-1">
              <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {emp.email}</span>
              {emp.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {emp.phone}</span>}
              <span>Joined: {formatShortDate(emp.joining_date || emp.created_at)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 pt-4 md:pt-0 md:pl-6">
          <div>
            <div className="text-slate-500 dark:text-slate-400">Department</div>
            {emp.department_id ? (
              <button
                type="button"
                onClick={() => onOpenDepartment(emp.department_id)}
                className="font-semibold text-blue-700 dark:text-blue-400 hover:underline mt-0.5 text-left"
              >
                {emp.department_name}
              </button>
            ) : (
              <div className="font-medium mt-0.5">Unassigned</div>
            )}
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Reports To</div>
            {emp.manager_employee_id ? (
              <button
                type="button"
                onClick={() => onOpenEmployee(emp.manager_employee_id)}
                className="font-semibold text-blue-700 dark:text-blue-400 hover:underline mt-0.5 text-left"
              >
                {emp.manager_name}
              </button>
            ) : (
              <div className="font-medium mt-0.5">Executive / Top Level</div>
            )}
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">RBAC Role</div>
            <div className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
              {roles.map((r) => r.name).join(', ') || 'No login account'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title={`Assigned Tasks (${tasks.length})`} noPadding>
            {tasks.length === 0 ? (
              <div className="p-6 text-xs text-slate-500 dark:text-slate-400">No tasks currently assigned to this employee.</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {tasks.map((t) => (
                  <div key={t.id} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{t.title}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {t.client_name || 'Internal'} · Due {formatShortDate(t.due_date)}
                      </div>
                    </div>
                    <StatusText status={t.status} />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title={`Activity History (${activity.length})`} noPadding>
            {activity.length === 0 ? (
              <div className="p-6 text-xs text-slate-500 dark:text-slate-400">No audited activity recorded for this account yet.</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {activity.map((ev) => (
                  <div key={ev.id} className="p-3.5 flex items-center justify-between gap-3">
                    <div>
                      <span className="font-mono font-medium text-slate-900 dark:text-slate-100">{ev.action}</span>
                      <span className="text-slate-500 ml-2">{ev.entity_type}:{ev.entity_id}</span>
                    </div>
                    <span className="font-mono text-slate-400">{formatDateTime(ev.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Reporting & Supervision">
            <div className="space-y-4 text-xs">
              <div>
                <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Direct Human Reports ({directReports.length})
                </div>
                {directReports.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400">None assigned</p>
                ) : (
                  <div className="space-y-1.5">
                    {directReports.map((dr) => (
                      <button key={dr.id} type="button" onClick={() => onOpenEmployee(dr.id)} className="block text-blue-700 dark:text-blue-400 hover:underline">
                        {dr.full_name} · {dr.job_title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Supervised AI Agents ({supervisedAgents.length})
                </div>
                {supervisedAgents.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400">None assigned directly</p>
                ) : (
                  <div className="space-y-1.5">
                    {supervisedAgents.map((ag) => (
                      <button key={ag.id} type="button" onClick={() => onOpenAgent(ag.id)} className="block text-blue-700 dark:text-blue-400 hover:underline">
                        {ag.name} · {ag.job_title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Managed Client Accounts ({clients.length})
                </div>
                {clients.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-400">No assigned client accounts</p>
                ) : (
                  <div className="space-y-1">
                    {clients.map((c) => (
                      <div key={c.id} className="text-slate-700 dark:text-slate-300">{c.name} ({c.industry})</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title={`Granted Permissions (${permissions.length})`}>
            {permissions.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No login credentials or RBAC grants assigned.</p>
            ) : (
              <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed">
                {permissions.map((p) => p.code).join(' · ')}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <Modal open={editOpen} title="Edit Employee Profile & 3D Avatar" onClose={() => setEditOpen(false)} maxWidth="max-w-2xl">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Full Name" htmlFor="ep-name" required>
              <input id="ep-name" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Job Title" htmlFor="ep-title" required>
              <input id="ep-title" required value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Department" htmlFor="ep-dept">
              <select id="ep-dept" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className={INPUT_CLASS}>
                <option value="">Unassigned</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </FormField>
            <FormField label="Manager" htmlFor="ep-mgr">
              <select id="ep-mgr" value={form.managerEmployeeId} onChange={(e) => setForm({ ...form, managerEmployeeId: e.target.value })} className={INPUT_CLASS}>
                <option value="">Top-Level / Executive</option>
                {allEmployees
                  .filter((e) => e.id !== employeeId)
                  .map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.job_title})</option>)}
              </select>
            </FormField>
            <FormField label="Phone" htmlFor="ep-phone">
              <input id="ep-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={INPUT_CLASS} placeholder="+1 ..." />
            </FormField>
            <FormField label="Joining Date" htmlFor="ep-join">
              <input id="ep-join" type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Employment Status" htmlFor="ep-st">
              <select id="ep-st" value={form.employmentStatus} onChange={(e) => setForm({ ...form, employmentStatus: e.target.value })} className={INPUT_CLASS}>
                <option value="active">Active</option>
                <option value="on_leave">On Leave</option>
                <option value="offboarded">Offboarded / Inactive</option>
              </select>
            </FormField>
            <FormField label="RBAC Role" htmlFor="ep-role">
              <select id="ep-role" value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })} className={INPUT_CLASS}>
                <option value="super_admin">Super Administrator</option>
                <option value="agency_director">Agency Director</option>
                <option value="account_manager">Account Manager</option>
                <option value="creative_lead">Creative Lead</option>
                <option value="analyst">Operations & Analytics Specialist</option>
              </select>
            </FormField>
          </div>

          <FormField label="Profile Photo URL (Optional — leave blank for honest monogram)" htmlFor="ep-photo">
            <input id="ep-photo" value={form.photoUrl} onChange={(e) => setForm({ ...form, photoUrl: e.target.value })} className={INPUT_CLASS} placeholder="https://..." />
          </FormField>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-3">3D Virtual HQ Avatar Appearance</div>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Outfit Accent" htmlFor="ep-acc">
                <input id="ep-acc" type="color" value={form.accentColor} onChange={(e) => setForm({ ...form, accentColor: e.target.value })} className="h-9 w-full rounded border border-slate-300 dark:border-slate-700 p-1 bg-white dark:bg-slate-950" />
              </FormField>
              <FormField label="Base Suit" htmlFor="ep-body">
                <input id="ep-body" type="color" value={form.bodyColor} onChange={(e) => setForm({ ...form, bodyColor: e.target.value })} className="h-9 w-full rounded border border-slate-300 dark:border-slate-700 p-1 bg-white dark:bg-slate-950" />
              </FormField>
              <FormField label="Accessory" htmlFor="ep-accessory">
                <select id="ep-accessory" value={form.accessory} onChange={(e) => setForm({ ...form, accessory: e.target.value })} className={INPUT_CLASS}>
                  <option value="none">None</option>
                  <option value="headset">Headset</option>
                  <option value="badge">ID Badge</option>
                  <option value="tablet">Studio Tablet</option>
                </select>
              </FormField>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => setEditOpen(false)} className={SECONDARY_BTN}>Cancel</button>
            <button type="submit" className={PRIMARY_BTN}>Save Profile</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

type AgentTab =
  | 'overview'
  | 'responsibilities'
  | 'tasks'
  | 'executions'
  | 'tools'
  | 'model'
  | 'costs'
  | 'performance'
  | 'logs';

export function AiAgentProfileView({
  agentId,
  onBack,
  onOpenDepartment,
  onOpenEmployee,
}: {
  agentId: string;
  onBack: () => void;
  onOpenDepartment: (id: string) => void;
  onOpenEmployee: (id: string) => void;
}) {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [employees, setEmployees] = useState<Array<Record<string, any>>>([]);
  const [departments, setDepartments] = useState<Array<Record<string, any>>>([]);
  const [tab, setTab] = useState<AgentTab>('overview');
  const [runPrompt, setRunPrompt] = useState('');
  const [configForm, setConfigForm] = useState({
    systemInstructions: '',
    modelProvider: 'ollama',
    modelIdentifier: 'qwen3.5:4b',
    monthlyBudgetUsd: '50',
    timeoutSeconds: '60',
    maxRetries: '2',
    status: 'active',
    changeNote: '',
  });
  const [avatarForm, setAvatarForm] = useState({
    accentColor: '#2563eb',
    bodyColor: '#1e293b',
    headStyle: 'visor',
    accessory: 'badge',
    managerEmployeeId: '',
    departmentId: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [res, eRes, dRes] = await Promise.all([
        apiRequest<Record<string, any>>(`/agents/${agentId}/profile`),
        apiRequest<{ employees: Array<Record<string, any>> }>('/employees'),
        apiRequest<{ departments: Array<Record<string, any>> }>('/departments'),
      ]);
      setData(res);
      setEmployees(eRes.employees);
      setDepartments(dRes.departments);
      const a = res.agent;
      setConfigForm({
        systemInstructions: a.system_instructions || '',
        modelProvider: a.model_provider || 'ollama',
        modelIdentifier: a.model_identifier || 'gemini-4-hydrogen',
        monthlyBudgetUsd: String(a.monthly_budget_usd ?? 50),
        timeoutSeconds: String(a.timeout_seconds ?? 60),
        maxRetries: String(a.max_retries ?? 2),
        status: a.status || 'active',
        changeNote: '',
      });
      setAvatarForm({
        accentColor: a.avatarConfig?.accentColor || '#2563eb',
        bodyColor: a.avatarConfig?.bodyColor || '#1e293b',
        headStyle: a.avatarConfig?.headStyle || 'visor',
        accessory: a.avatarConfig?.accessory || 'badge',
        managerEmployeeId: a.manager_employee_id || '',
        departmentId: a.department_id || '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AI employee profile.');
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleTogglePause = async () => {
    if (!data) return;
    const isPaused = data.agent.status === 'paused';
    setError(null);
    try {
      await apiRequest(`/agents/${agentId}/${isPaused ? 'resume' : 'pause'}`, { method: 'POST' });
      setNotice(`AI agent ${isPaused ? 'resumed' : 'paused'} successfully.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change agent status.');
    }
  };

  const handleSaveModelConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/agents/${agentId}`, {
        method: 'PATCH',
        body: {
          systemInstructions: configForm.systemInstructions,
          modelProvider: configForm.modelProvider,
          modelIdentifier: configForm.modelIdentifier,
          monthlyBudgetUsd: Number(configForm.monthlyBudgetUsd),
          timeoutSeconds: Number(configForm.timeoutSeconds),
          maxRetries: Number(configForm.maxRetries),
          status: configForm.status,
          changeNote: configForm.changeNote || 'Updated configuration via AI Employee Profile',
        },
      });
      setNotice('Model configuration and versioned instructions persisted.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration.');
    }
  };

  const handleSaveAvatar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/agents/${agentId}/avatar`, {
        method: 'PATCH',
        body: {
          managerEmployeeId: avatarForm.managerEmployeeId || null,
          departmentId: avatarForm.departmentId || null,
          avatarConfig: {
            accentColor: avatarForm.accentColor,
            bodyColor: avatarForm.bodyColor,
            headStyle: avatarForm.headStyle,
            accessory: avatarForm.accessory,
          },
        },
      });
      setNotice('AI Employee 3D avatar and reporting assignment saved.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save avatar settings.');
    }
  };

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runPrompt.trim()) return;
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ jobId: string }>(`/agents/${agentId}/run`, {
        method: 'POST',
        body: { prompt: runPrompt.trim() },
      });
      setRunPrompt('');
      setNotice(`Dispatched durable job ${res.jobId} to worker queue. Refresh shortly to inspect output or errors.`);
      setTimeout(() => void load(), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch agent.');
    }
  };

  if (!data) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className={SECONDARY_BTN}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        <div className="h-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  const a = data.agent;
  const perf = data.performance;
  const tasks = (data.tasks ?? []) as Array<Record<string, any>>;
  const runs = (data.runs ?? []) as Array<Record<string, any>>;
  const tools = (data.tools ?? []) as Array<Record<string, any>>;
  const versions = (data.versions ?? []) as Array<Record<string, any>>;
  const usage = (data.usage ?? []) as Array<Record<string, any>>;
  const logs = (data.logs ?? []) as Array<Record<string, any>>;
  const allowedTools = JSON.parse(a.allowed_tools_json || '[]') as string[];

  return (
    <div className="space-y-6">
      <PageHeader
        title={a.name}
        subtitle={`AI Employee · ${a.job_title} · ${a.department_name || 'Operations'} · Prompt v${a.prompt_version}`}
        actions={
          <>
            <button type="button" onClick={onBack} className={SECONDARY_BTN}>
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button type="button" onClick={handleTogglePause} className={SECONDARY_BTN}>
              {a.status === 'paused' ? (
                <>
                  <Play className="w-4 h-4" /> Resume Agent
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4" /> Pause Agent
                </>
              )}
            </button>
          </>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {notice && (
        <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-lg px-4 py-3 text-sm text-blue-900 dark:text-blue-200">
          {notice}
        </div>
      )}

      {/* Agent Identity Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <ActorAvatar name={a.name} actorType="agent" avatarConfig={a.avatarConfig} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">{a.name}</span>
              <StatusText status={a.operationalStatus} />
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
              {a.model_provider} / {a.model_identifier} · Budget ${Number(a.monthly_budget_usd || 0).toFixed(2)}/mo
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-slate-500 dark:text-slate-400">Department</div>
            {a.department_id ? (
              <button type="button" onClick={() => onOpenDepartment(a.department_id)} className="font-semibold text-blue-700 dark:text-blue-400 hover:underline">
                {a.department_name}
              </button>
            ) : (
              <span>Unassigned</span>
            )}
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Supervisor</div>
            {a.manager_employee_id ? (
              <button type="button" onClick={() => onOpenEmployee(a.manager_employee_id)} className="font-semibold text-blue-700 dark:text-blue-400 hover:underline">
                {a.manager_name}
              </button>
            ) : (
              <span className="font-medium">{a.supervisor_name}</span>
            )}
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Total Runs</div>
            <div className="font-mono font-semibold tabular-nums">{perf.totalRuns}</div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">Recorded Cost</div>
            <div className="font-mono font-semibold tabular-nums">${Number(perf.totalCostUsd || 0).toFixed(4)}</div>
          </div>
        </div>
      </div>

      {/* 9-Tab Navigation */}
      <SegmentedTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: '1. Overview' },
          { value: 'responsibilities', label: '2. Responsibilities' },
          { value: 'tasks', label: `3. Tasks (${tasks.length})` },
          { value: 'executions', label: `4. Execution History (${runs.length})` },
          { value: 'tools', label: '5. Tools & Permissions' },
          { value: 'model', label: '6. Model Config' },
          { value: 'costs', label: '7. Costs & Usage' },
          { value: 'performance', label: '8. Performance' },
          { value: 'logs', label: `9. Logs (${logs.length})` },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard title="Dispatch Operational Task" description="Executes asynchronously via background worker with real model output & audit trail">
            <form onSubmit={handleDispatch} className="space-y-3">
              <FormField label="Direct Operational Prompt" htmlFor="ag-direct-p" required>
                <textarea
                  id="ag-direct-p"
                  required
                  rows={4}
                  value={runPrompt}
                  onChange={(e) => setRunPrompt(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Provide concrete instructions for this AI employee..."
                />
              </FormField>
              <button type="submit" disabled={a.status === 'paused'} className={PRIMARY_BTN}>
                <Play className="w-4 h-4" /> Enqueue Real Execution
              </button>
            </form>
          </SectionCard>

          <SectionCard title="3D Avatar & Reporting Assignment" description="Customize how this AI employee appears inside the 3D Virtual Headquarters">
            <form onSubmit={handleSaveAvatar} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Department" htmlFor="ag-av-dept">
                  <select id="ag-av-dept" value={avatarForm.departmentId} onChange={(e) => setAvatarForm({ ...avatarForm, departmentId: e.target.value })} className={INPUT_CLASS}>
                    <option value="">Unassigned</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Human Manager" htmlFor="ag-av-mgr">
                  <select id="ag-av-mgr" value={avatarForm.managerEmployeeId} onChange={(e) => setAvatarForm({ ...avatarForm, managerEmployeeId: e.target.value })} className={INPUT_CLASS}>
                    <option value="">Default ({a.supervisor_name})</option>
                    {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                  </select>
                </FormField>
                <FormField label="Visor / Accent Color" htmlFor="ag-av-acc">
                  <input id="ag-av-acc" type="color" value={avatarForm.accentColor} onChange={(e) => setAvatarForm({ ...avatarForm, accentColor: e.target.value })} className="h-9 w-full rounded border border-slate-300 dark:border-slate-700 p-1 bg-white dark:bg-slate-950" />
                </FormField>
                <FormField label="Chassis Finish" htmlFor="ag-av-body">
                  <input id="ag-av-body" type="color" value={avatarForm.bodyColor} onChange={(e) => setAvatarForm({ ...avatarForm, bodyColor: e.target.value })} className="h-9 w-full rounded border border-slate-300 dark:border-slate-700 p-1 bg-white dark:bg-slate-950" />
                </FormField>
                <FormField label="Head Style" htmlFor="ag-av-head">
                  <select id="ag-av-head" value={avatarForm.headStyle} onChange={(e) => setAvatarForm({ ...avatarForm, headStyle: e.target.value })} className={INPUT_CLASS}>
                    <option value="visor">Precision Visor</option>
                    <option value="halo">Halo Array</option>
                    <option value="studio">Studio Crest</option>
                  </select>
                </FormField>
                <FormField label="Accessory" htmlFor="ag-av-item">
                  <select id="ag-av-item" value={avatarForm.accessory} onChange={(e) => setAvatarForm({ ...avatarForm, accessory: e.target.value })} className={INPUT_CLASS}>
                    <option value="badge">Department Badge</option>
                    <option value="headset">Comms Headset</option>
                    <option value="none">Minimal</option>
                  </select>
                </FormField>
              </div>
              <button type="submit" className={PRIMARY_BTN}>Save Avatar & Assignment</button>
            </form>
          </SectionCard>
        </div>
      )}

      {tab === 'responsibilities' && (
        <SectionCard title="Operational Mandate & Quality Standards">
          <div className="space-y-4 text-sm">
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Role Description</h3>
              <p className="mt-1 text-slate-800 dark:text-slate-200 leading-relaxed">{a.role_description}</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Quality Requirements</h3>
              <p className="mt-1 text-slate-800 dark:text-slate-200 leading-relaxed">{a.quality_requirements || 'Standard agency governance and schema compliance.'}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Input Contract</h3>
                <pre className="text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded p-3 overflow-x-auto">
                  {a.input_schema_json}
                </pre>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Output Contract</h3>
                <pre className="text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded p-3 overflow-x-auto">
                  {a.output_schema_json}
                </pre>
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {tab === 'tasks' && (
        <SectionCard title={`Assigned Tasks (${tasks.length})`} noPadding>
          {tasks.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">No tasks assigned to this AI employee yet.</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {tasks.map((t) => (
                <div key={t.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">{t.title}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {t.client_name || 'Internal'} · Priority: {t.priority} · Due {formatShortDate(t.due_date)}
                    </div>
                  </div>
                  <StatusText status={t.status} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {tab === 'executions' && (
        <SectionCard title={`Execution Runs (${runs.length})`} noPadding>
          {runs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">No executions recorded yet.</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {runs.map((r) => (
                <div key={r.id} className="p-4 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-medium">{r.id} · {r.model_identifier}</span>
                    <div className="flex items-center gap-3 font-mono">
                      <span>{r.prompt_tokens}/{r.output_tokens} tok</span>
                      <span>{r.latency_ms}ms</span>
                      <span>${Number(r.cost_usd || 0).toFixed(5)}</span>
                      <StatusText status={r.status} />
                    </div>
                  </div>
                  {r.error_message && <div className="text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-2 rounded font-mono">{r.error_message}</div>}
                  {r.structured_output_json && (
                    <pre className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded p-2.5 overflow-x-auto max-h-40">
                      {r.structured_output_json}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {tab === 'tools' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SectionCard title="Authorized Tool Boundaries">
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {(tools.length > 0 ? tools : allowedTools.map((t) => ({ tool_name: t, requires_human_approval: 0, rate_limit_per_hour: 60 }))).map((tool: any) => (
                <div key={tool.tool_name} className="py-2.5 flex items-center justify-between">
                  <span className="font-mono font-medium text-slate-900 dark:text-slate-100">{tool.tool_name}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {tool.requires_human_approval ? 'Human Approval Required' : 'Autonomous Read/Draft'} · {tool.rate_limit_per_hour}/hr
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Hard Governance Policies">
            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-600 shrink-0" /> Self-approval of content or tasks is permanently prohibited.</div>
              <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-600 shrink-0" /> Direct external social publishing without verified human approval hash is blocked.</div>
              <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-600 shrink-0" /> Autonomous financial execution or payment dispatch is permanently disabled.</div>
              <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-600 shrink-0" /> External and client data are wrapped in untrusted-content delimiters.</div>
            </div>
          </SectionCard>
        </div>
      )}

      {tab === 'model' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <SectionCard title="Model Configuration & Versioned Instructions">
              <form onSubmit={handleSaveModelConfig} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField label="Provider" htmlFor="m-prov">
                    <select id="m-prov" value={configForm.modelProvider} onChange={(e) => setConfigForm({ ...configForm, modelProvider: e.target.value })} className={INPUT_CLASS}>
                      <option value="ollama">Ollama Local AI (Free)</option>
                      <option value="google_gemini">Google Gemini</option>
                      <option value="openai">OpenAI (Requires Key)</option>
                      <option value="anthropic">Anthropic (Requires Key)</option>
                    </select>
                  </FormField>
                  <FormField label="Model Identifier" htmlFor="m-id">
                    <input id="m-id" list="profile-model-presets" value={configForm.modelIdentifier} onChange={(e) => setConfigForm({ ...configForm, modelIdentifier: e.target.value })} className={INPUT_CLASS} />
                    <datalist id="profile-model-presets">
                      <option value="qwen3.5:4b">qwen3.5:4b (Local, no API fees)</option>
                      <option value="qwen3.5:0.8b">qwen3.5:0.8b (Smaller local model)</option>
                      <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (Google free tier, key required)</option>
                    </datalist>
                  </FormField>
                  <FormField label="Monthly Budget (USD)" htmlFor="m-bud">
                    <input id="m-bud" type="number" min="0" value={configForm.monthlyBudgetUsd} onChange={(e) => setConfigForm({ ...configForm, monthlyBudgetUsd: e.target.value })} className={INPUT_CLASS} />
                  </FormField>
                </div>
                <FormField label="System Instructions" htmlFor="m-inst">
                  <textarea id="m-inst" rows={5} value={configForm.systemInstructions} onChange={(e) => setConfigForm({ ...configForm, systemInstructions: e.target.value })} className={INPUT_CLASS} />
                </FormField>
                <FormField label="Version Change Note" htmlFor="m-note">
                  <input id="m-note" value={configForm.changeNote} onChange={(e) => setConfigForm({ ...configForm, changeNote: e.target.value })} className={INPUT_CLASS} placeholder="Describe why instructions or model changed" />
                </FormField>
                <button type="submit" className={PRIMARY_BTN}>Save Versioned Config</button>
              </form>
            </SectionCard>
          </div>
          <SectionCard title={`Prompt Versions (${versions.length})`}>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {versions.map((v) => (
                <div key={v.id} className="py-2 first:pt-0">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">v{v.version_number} · {v.model_identifier}</div>
                  <div className="text-slate-600 dark:text-slate-400">{v.change_note}</div>
                  <div className="font-mono text-slate-400">{formatDateTime(v.created_at)}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {tab === 'costs' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatTile label="Recorded Cost" value={`$${Number(perf.totalCostUsd || 0).toFixed(4)}`} meta={`Monthly cap: $${Number(a.monthly_budget_usd || 0).toFixed(2)}`} />
            <StatTile label="Prompt Tokens" value={perf.totalPromptTokens.toLocaleString()} meta="Real provider usage" />
            <StatTile label="Output Tokens" value={perf.totalOutputTokens.toLocaleString()} meta="Real provider usage" />
          </div>
          <SectionCard title={`Usage Records (${usage.length})`} noPadding>
            {usage.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">No token usage recorded yet.</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {usage.map((u) => (
                  <div key={u.id} className="p-3.5 flex items-center justify-between font-mono">
                    <span>{u.model} ({u.modality}) · {u.prompt_tokens} in / {u.output_tokens} out</span>
                    <span>${Number(u.cost_usd || 0).toFixed(5)} · {formatDateTime(u.recorded_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {tab === 'performance' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile label="Completed Runs" value={perf.completedRuns} tone="positive" meta={`Of ${perf.totalRuns} total`} />
          <StatTile label="Failed Runs" value={perf.failedRuns} tone={perf.failedRuns > 0 ? 'danger' : 'default'} meta="Honest provider/validation errors" />
          <StatTile
            label="Success Rate"
            value={perf.successRatePercent !== null ? `${perf.successRatePercent}%` : '—'}
            meta={perf.totalRuns === 0 ? 'No runs yet' : 'Verified completion ratio'}
          />
          <StatTile
            label="Average Latency"
            value={perf.avgLatencyMs !== null ? `${perf.avgLatencyMs}ms` : '—'}
            meta="Measured round-trip"
          />
        </div>
      )}

      {tab === 'logs' && (
        <SectionCard title={`Immutable Agent Audit Logs (${logs.length})`} noPadding>
          {logs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">No audit entries for this AI employee yet.</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {logs.map((l) => (
                <div key={l.id} className="p-3.5 flex items-center justify-between gap-4">
                  <div>
                    <span className="font-mono font-medium text-slate-900 dark:text-slate-100">{l.action}</span>
                    <span className="text-slate-500 ml-2">{l.actor_label}</span>
                  </div>
                  <span className="font-mono text-slate-400">{formatDateTime(l.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
