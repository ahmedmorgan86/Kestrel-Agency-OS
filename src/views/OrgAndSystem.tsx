import React, { useEffect, useState, useCallback } from 'react';
import { Plus, RefreshCw, Shield, Link as LinkIcon, ExternalLink, Moon, Sun } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useThemeAndBrand } from '../context/ThemeAndBrandContext';
import { BrandLockup, BrandSymbol, type BrandSymbolType } from '../components/BrandMark';
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
} from '../components/ui';

export function CompanyAndDepartmentsView({
  mode,
  onOpenDepartment,
}: {
  mode: 'company' | 'departments' | 'settings';
  onOpenDepartment?: (departmentId: string) => void;
}) {
  const { theme, toggleTheme, reducedMotion, setReducedMotion, updateBrandFromOrg } = useThemeAndBrand();
  const [org, setOrg] = useState<Record<string, any> | null>(null);
  const [departments, setDepartments] = useState<Array<Record<string, any>>>([]);
  const [counts, setCounts] = useState({ employees: 0, agents: 0 });
  const [modalOpen, setModalOpen] = useState(false);
  const [deptName, setDeptName] = useState('');
  const [deptDesc, setDeptDesc] = useState('');
  const [orgForm, setOrgForm] = useState({
    name: '',
    legalName: '',
    tagline: '',
    website: '',
    timezone: 'UTC',
    defaultCurrency: 'USD',
    brandPrimaryColor: '#1d4ed8',
    brandSecondaryColor: '#0f172a',
    brandSymbol: 'kestrel' as BrandSymbolType,
    logoStyle: 'lockup' as 'lockup' | 'compact' | 'symbol',
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [oRes, dRes] = await Promise.all([
        apiRequest<Record<string, any>>('/organization'),
        apiRequest<{ departments: Array<Record<string, any>> }>('/departments'),
      ]);
      setOrg(oRes.organization);
      setCounts({ employees: oRes.employeeCount, agents: oRes.agentCount });
      setDepartments(dRes.departments);
      if (oRes.organization) {
        updateBrandFromOrg(oRes.organization);
        setOrgForm({
          name: oRes.organization.name || '',
          legalName: oRes.organization.legal_name || '',
          tagline: oRes.organization.tagline || 'AI-First Social Media Operations',
          website: oRes.organization.website || '',
          timezone: oRes.organization.timezone || 'UTC',
          defaultCurrency: oRes.organization.default_currency || 'USD',
          brandPrimaryColor: oRes.organization.brand_primary_color || '#1d4ed8',
          brandSecondaryColor: oRes.organization.brand_secondary_color || '#0f172a',
          brandSymbol: (['kestrel', 'prism', 'compass', 'aperture'].includes(oRes.organization.brand_symbol)
            ? oRes.organization.brand_symbol
            : 'kestrel') as BrandSymbolType,
          logoStyle: (['lockup', 'compact', 'symbol'].includes(oRes.organization.logo_style)
            ? oRes.organization.logo_style
            : 'lockup') as 'lockup' | 'compact' | 'symbol',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load organization.');
    }
  }, [updateBrandFromOrg]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/departments', { method: 'POST', body: { name: deptName, description: deptDesc } });
      setModalOpen(false);
      setDeptName('');
      setDeptDesc('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create department.');
    }
  };

  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ organization?: Record<string, unknown> }>('/organization', {
        method: 'PATCH',
        body: orgForm,
      });
      if (res.organization) {
        updateBrandFromOrg(res.organization);
      }
      setNotice('Company brand identity and operational settings persisted and recorded in the audit log.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save organization settings.');
    }
  };

  if (mode === 'settings') {
    const symbols: Array<{ id: BrandSymbolType; label: string; desc: string }> = [
      { id: 'kestrel', label: 'Kestrel Wing', desc: 'Angular twin-wing precision mark' },
      { id: 'prism', label: 'Prism Facet', desc: 'Architectural geometric prism' },
      { id: 'compass', label: 'Strategic Compass', desc: 'Directional agency emblem' },
      { id: 'aperture', label: 'Creative Aperture', desc: 'Studio lens geometry' },
    ];

    return (
      <div className="space-y-6">
        <PageHeader
          title="Company Brand Identity & Settings"
          subtitle="Configure the operating company's visual identity, brand symbol, color tokens, appearance preferences, and operational defaults."
        />
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        {notice && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200">
            {notice}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <SectionCard
              title="Configurable Brand Identity & Organization Profile"
              description="Authorized administrators can customize the agency name, tagline, brand symbol, and primary colors without code changes."
            >
              <form onSubmit={handleSaveOrg} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Operating Company Name" htmlFor="set-name" required>
                    <input
                      id="set-name"
                      required
                      value={orgForm.name}
                      onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                      className={INPUT_CLASS}
                    />
                  </FormField>
                  <FormField label="Legal Entity Name" htmlFor="set-legal">
                    <input
                      id="set-legal"
                      value={orgForm.legalName}
                      onChange={(e) => setOrgForm({ ...orgForm, legalName: e.target.value })}
                      className={INPUT_CLASS}
                    />
                  </FormField>
                </div>

                <FormField label="Agency Brand Tagline" htmlFor="set-tagline">
                  <input
                    id="set-tagline"
                    value={orgForm.tagline}
                    onChange={(e) => setOrgForm({ ...orgForm, tagline: e.target.value })}
                    className={INPUT_CLASS}
                    placeholder="AI-First Social Media Operations"
                  />
                </FormField>

                <div>
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Brand Symbol</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {symbols.map((sym) => {
                      const active = orgForm.brandSymbol === sym.id;
                      return (
                        <button
                          key={sym.id}
                          type="button"
                          onClick={() => setOrgForm({ ...orgForm, brandSymbol: sym.id })}
                          className={`flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors ${
                            active
                              ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/50 dark:border-blue-500'
                              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <BrandSymbol symbol={sym.id} primaryColor={orgForm.brandPrimaryColor} size={28} />
                          <div>
                            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{sym.label}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">{sym.desc}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField label="Primary Brand Color" htmlFor="set-primary-color">
                    <div className="flex items-center gap-2">
                      <input
                        id="set-primary-color"
                        type="color"
                        value={orgForm.brandPrimaryColor}
                        onChange={(e) => setOrgForm({ ...orgForm, brandPrimaryColor: e.target.value })}
                        className="h-9 w-12 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5 cursor-pointer"
                      />
                      <input
                        value={orgForm.brandPrimaryColor}
                        onChange={(e) => setOrgForm({ ...orgForm, brandPrimaryColor: e.target.value })}
                        className={`${INPUT_CLASS} font-mono`}
                        maxLength={7}
                      />
                    </div>
                  </FormField>
                  <FormField label="Secondary Slate Color" htmlFor="set-secondary-color">
                    <div className="flex items-center gap-2">
                      <input
                        id="set-secondary-color"
                        type="color"
                        value={orgForm.brandSecondaryColor}
                        onChange={(e) => setOrgForm({ ...orgForm, brandSecondaryColor: e.target.value })}
                        className="h-9 w-12 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5 cursor-pointer"
                      />
                      <input
                        value={orgForm.brandSecondaryColor}
                        onChange={(e) => setOrgForm({ ...orgForm, brandSecondaryColor: e.target.value })}
                        className={`${INPUT_CLASS} font-mono`}
                        maxLength={7}
                      />
                    </div>
                  </FormField>
                  <FormField label="Logo Presentation" htmlFor="set-logo-style">
                    <select
                      id="set-logo-style"
                      value={orgForm.logoStyle}
                      onChange={(e) => setOrgForm({ ...orgForm, logoStyle: e.target.value as 'lockup' | 'compact' | 'symbol' })}
                      className={INPUT_CLASS}
                    >
                      <option value="lockup">Full Lockup</option>
                      <option value="compact">Compact Header</option>
                      <option value="symbol">Symbol Mark</option>
                    </select>
                  </FormField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <FormField label="Website" htmlFor="set-web">
                    <input id="set-web" value={orgForm.website} onChange={(e) => setOrgForm({ ...orgForm, website: e.target.value })} className={INPUT_CLASS} />
                  </FormField>
                  <FormField label="Timezone" htmlFor="set-tz">
                    <input id="set-tz" value={orgForm.timezone} onChange={(e) => setOrgForm({ ...orgForm, timezone: e.target.value })} className={INPUT_CLASS} />
                  </FormField>
                  <FormField label="Currency (ISO 4217)" htmlFor="set-curr">
                    <input id="set-curr" maxLength={3} value={orgForm.defaultCurrency} onChange={(e) => setOrgForm({ ...orgForm, defaultCurrency: e.target.value.toUpperCase() })} className={INPUT_CLASS} />
                  </FormField>
                </div>

                <div className="flex justify-end">
                  <button type="submit" className={PRIMARY_BTN}>Save Brand & Organization Settings</button>
                </div>
              </form>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard title="Live Identity Preview" description="Light & dark header and report lockups">
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-[11px] font-medium text-slate-400 mb-2">Light Surface</div>
                  <BrandLockup
                    name={orgForm.name || 'Agency'}
                    tagline={orgForm.tagline}
                    symbol={orgForm.brandSymbol}
                    primaryColor={orgForm.brandPrimaryColor}
                  />
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 dark">
                  <div className="text-[11px] font-medium text-slate-400 mb-2">Dark Surface</div>
                  <div className="flex items-center gap-2.5">
                    <BrandSymbol symbol={orgForm.brandSymbol} primaryColor={orgForm.brandPrimaryColor} size={34} />
                    <div className="min-w-0">
                      <div className="text-base font-bold tracking-tight text-slate-100 truncate">
                        {orgForm.name || 'Agency'}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{orgForm.tagline}</div>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Interface Appearance" description="Saved locally for your workstation">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Color Theme</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Current mode: {theme === 'dark' ? 'Dark' : 'Light'}
                    </div>
                  </div>
                  <button type="button" onClick={toggleTheme} className={SECONDARY_BTN}>
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                  </button>
                </div>
                <label className="flex items-start gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reducedMotion}
                    onChange={(e) => setReducedMotion(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 dark:border-slate-600"
                  />
                  <span>
                    <strong className="block text-slate-900 dark:text-slate-100">Reduce 3D Motion</strong>
                    Minimizes subtle active-worker motion in the 3D Virtual HQ for lower CPU usage or motion sensitivity.
                  </span>
                </label>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={mode === 'company' ? 'Company Overview' : 'Departments'}
        subtitle={
          mode === 'company'
            ? `${org?.name || 'Agency'} — internal organizational structure combining human leadership with 14 operational AI agents.`
            : 'Manage internal agency departments, leadership, and click any department to enter its workspace.'
        }
        actions={
          <button type="button" onClick={() => setModalOpen(true)} className={PRIMARY_BTN}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add Department
          </button>
        }
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {mode === 'company' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile label="Operating Company" value={org?.default_currency || 'USD'} meta={org?.name || '—'} />
          <StatTile label="Departments" value={departments.length} meta="Operational units" />
          <StatTile label="Human Employees" value={counts.employees} meta="Internal management & staff" />
          <StatTile label="Configured AI Agents" value={counts.agents} meta="Specialized workers" />
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-600 dark:text-slate-400">
              <th className="py-3 px-4">Department</th>
              <th className="py-3 px-4">Mandate</th>
              <th className="py-3 px-4 text-right">Human Staff</th>
              <th className="py-3 px-4 text-right">AI Agents</th>
              {onOpenDepartment && <th className="py-3 px-4 text-right">Workspace</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {departments.map((d) => (
              <tr
                key={d.id}
                onClick={onOpenDepartment ? () => onOpenDepartment(d.id) : undefined}
                className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${onOpenDepartment ? 'cursor-pointer' : ''}`}
              >
                <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">{d.name}</td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">{d.description}</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">{d.employee_count ?? 0}</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">{d.agent_count ?? 0}</td>
                {onOpenDepartment && (
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDepartment(d.id);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                    >
                      Open
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} title="Add Department" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleCreateDept} className="space-y-4">
          <FormField label="Department Name" htmlFor="d-name" required>
            <input id="d-name" required value={deptName} onChange={(e) => setDeptName(e.target.value)} className={INPUT_CLASS} />
          </FormField>
          <FormField label="Description" htmlFor="d-desc">
            <textarea id="d-desc" rows={2} value={deptDesc} onChange={(e) => setDeptDesc(e.target.value)} className={INPUT_CLASS} />
          </FormField>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => setModalOpen(false)} className={SECONDARY_BTN}>Cancel</button>
            <button type="submit" className={PRIMARY_BTN}>Create Department</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function EmployeesAndRolesView({
  mode,
  onOpenEmployee,
}: {
  mode: 'employees' | 'roles';
  onOpenEmployee?: (employeeId: string) => void;
}) {
  const [employees, setEmployees] = useState<Array<Record<string, any>>>([]);
  const [departments, setDepartments] = useState<Array<Record<string, any>>>([]);
  const [rolesData, setRolesData] = useState<{ roles: Array<Record<string, any>>; permissions: Array<Record<string, any>> }>({ roles: [], permissions: [] });
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    jobTitle: '',
    departmentId: '',
    roleCode: 'account_manager',
    monthlyCostUsd: '0',
    initialPassword: '',
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [eRes, dRes, rRes] = await Promise.all([
        apiRequest<{ employees: Array<Record<string, any>> }>('/employees'),
        apiRequest<{ departments: Array<Record<string, any>> }>('/departments'),
        apiRequest<{ roles: Array<Record<string, any>>; permissions: Array<Record<string, any>> }>('/roles'),
      ]);
      setEmployees(eRes.employees);
      setDepartments(dRes.departments);
      setRolesData(rRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team data.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/employees', {
        method: 'POST',
        body: {
          ...form,
          departmentId: form.departmentId || null,
          monthlyCostUsd: Number(form.monthlyCostUsd || 0),
          initialPassword: form.initialPassword.trim() || undefined,
        },
      });
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add employee.');
    }
  };

  if (mode === 'roles') {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Roles & Permissions"
          subtitle="Server-enforced RBAC matrix governing human authorization boundaries across the platform."
        />
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        <div className="space-y-4">
          {rolesData.roles.map((r) => (
            <SectionCard key={r.id} title={r.name} description={`${r.code} · ${r.description}`}>
              <div className="text-xs font-mono text-slate-700 dark:text-slate-300 leading-relaxed">
                {(r.permissions as string[]).join(' · ')}
              </div>
            </SectionCard>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Human Employees"
        subtitle="Internal management and operations team with department assignments, reporting hierarchy, and RBAC credentials."
        actions={
          <button type="button" onClick={() => setModalOpen(true)} className={PRIMARY_BTN}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add Employee
          </button>
        }
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-600 dark:text-slate-400">
              <th className="py-3 px-4">Employee</th>
              <th className="py-3 px-4">Job Title</th>
              <th className="py-3 px-4">Department</th>
              <th className="py-3 px-4">Assigned Role</th>
              <th className="py-3 px-4">Status</th>
              {onOpenEmployee && <th className="py-3 px-4 text-right">Profile</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {employees.map((emp) => (
              <tr
                key={emp.id}
                onClick={onOpenEmployee ? () => onOpenEmployee(emp.id) : undefined}
                className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${onOpenEmployee ? 'cursor-pointer' : ''}`}
              >
                <td className="py-3 px-4">
                  <div className="font-medium text-slate-900 dark:text-slate-100">{emp.full_name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{emp.email}</div>
                </td>
                <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">{emp.job_title}</td>
                <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">{emp.department_name || '—'}</td>
                <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">{emp.role_names || 'No login account'}</td>
                <td className="py-3 px-4"><StatusText status={emp.employment_status} /></td>
                {onOpenEmployee && (
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenEmployee(emp.id);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                    >
                      View Profile
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} title="Add Human Employee" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleCreateEmployee} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Full Name" htmlFor="emp-name" required>
              <input id="emp-name" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Email" htmlFor="emp-email" required>
              <input id="emp-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Job Title" htmlFor="emp-title" required>
              <input id="emp-title" required value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Department" htmlFor="emp-dept">
              <select id="emp-dept" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className={INPUT_CLASS}>
                <option value="">Select department...</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </FormField>
            <FormField label="RBAC Role" htmlFor="emp-role">
              <select id="emp-role" value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })} className={INPUT_CLASS}>
                <option value="agency_director">Agency Director</option>
                <option value="account_manager">Account Manager</option>
                <option value="creative_lead">Creative Lead</option>
                <option value="analyst">Operations & Analytics Specialist</option>
                <option value="super_admin">Super Administrator</option>
              </select>
            </FormField>
            <FormField label="Initial Login Password (Optional, min 8 chars)" htmlFor="emp-pwd">
              <input id="emp-pwd" type="password" minLength={8} value={form.initialPassword} onChange={(e) => setForm({ ...form, initialPassword: e.target.value })} className={INPUT_CLASS} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setModalOpen(false)} className={SECONDARY_BTN}>Cancel</button>
            <button type="submit" className={PRIMARY_BTN}>Save Employee</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function IntegrationsView() {
  const [integrations, setIntegrations] = useState<Array<Record<string, any>>>([]);
  const [socialAccounts, setSocialAccounts] = useState<Array<Record<string, any>>>([]);
  const [clients, setClients] = useState<Array<Record<string, any>>>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [acctForm, setAcctForm] = useState({ clientId: '', platform: 'instagram', accountHandle: '', externalAccountId: '' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [iRes, cRes] = await Promise.all([
        apiRequest<{ integrations: Array<Record<string, any>>; socialAccounts: Array<Record<string, any>> }>('/integrations'),
        apiRequest<{ clients: Array<Record<string, any>> }>('/clients'),
      ]);
      setIntegrations(iRes.integrations);
      setSocialAccounts(iRes.socialAccounts);
      setClients(cRes.clients);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integrations.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleVerify = async (code: string) => {
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ status: string; error?: string; message?: string }>(
        `/integrations/${code}/verify`,
        { method: 'POST' }
      );
      if (res.error) setError(res.error);
      else setNotice(`Verification result for ${code}: ${res.status}${res.message ? ` — ${res.message}` : ''}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    }
  };

  const handleRegisterAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/social-accounts', { method: 'POST', body: acctForm });
      setModalOpen(false);
      setAcctForm({ clientId: '', platform: 'instagram', accountHandle: '', externalAccountId: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register social account.');
    }
  };

  const [syncingSupabase, setSyncingSupabase] = useState(false);

  const handleSyncSupabase = async () => {
    setError(null);
    setNotice(null);
    setSyncingSupabase(true);
    try {
      const res = await apiRequest<{ syncedTables: Record<string, number>; syncedAt: string }>(
        '/integrations/supabase/sync',
        { method: 'POST' }
      );
      const totalRows = Object.values(res.syncedTables).reduce((acc, n) => acc + n, 0);
      setNotice(`Synced ${totalRows} workspace records across ${Object.keys(res.syncedTables).length} tables to Supabase.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Supabase sync failed.');
    } finally {
      setSyncingSupabase(false);
    }
  };

  const handleStartOAuth = async (platform: string) => {
    setError(null);
    try {
      const res = await apiRequest<{ url: string }>(`/oauth/${platform}/url`);
      setNotice(`OAuth URL generated for ${platform}. Official popup authorization requires registered platform credentials.`);
      // Open only the external provider URL (never container URL) per OAuth skill
      window.open(res.url, 'oauth_popup', 'width=600,height=700');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OAuth provider not configured.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations & Social Accounts"
        subtitle="Honest real-time integration status. Providers are never marked Connected until credentials and permissions are validated."
        actions={
          <button type="button" onClick={() => setModalOpen(true)} className={PRIMARY_BTN} disabled={clients.length === 0}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Register Client Social Account
          </button>
        }
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {notice && <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-900">{notice}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {integrations.map((integ) => {
          const envVars = JSON.parse(integ.required_env_vars_json || '[]') as string[];
          const scopes = JSON.parse(integ.required_scopes_json || '[]') as string[];
          return (
            <SectionCard
              key={integ.provider_code}
              title={integ.display_name}
              description={integ.category.replace('_', ' ')}
              right={<StatusText status={integ.status} />}
            >
              <div className="space-y-2.5 text-xs">
                <p className="text-slate-600">{integ.limitations_note}</p>
                <div className="text-slate-700">
                  <strong>Required Env Vars:</strong> <span className="font-mono">{envVars.join(', ')}</span>
                </div>
                {scopes.length > 0 && (
                  <div className="text-slate-700">
                    <strong>Required Scopes:</strong> <span className="font-mono">{scopes.join(', ')}</span>
                  </div>
                )}
                {integ.callbackUrl && (
                  <div className="text-slate-700 break-all">
                    <strong>OAuth Callback URI:</strong> <span className="font-mono text-slate-600">{integ.callbackUrl}</span>
                  </div>
                )}
                {integ.last_error && (
                  <div className="text-red-700 bg-red-50 border border-red-200 rounded p-2">
                    {integ.last_error}
                  </div>
                )}
                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => handleVerify(integ.provider_code)} className={SECONDARY_BTN}>
                    <Shield className="w-3.5 h-3.5" aria-hidden="true" />
                    Verify Status
                  </button>
                  {integ.provider_code === 'supabase' && (
                    <button
                      type="button"
                      onClick={handleSyncSupabase}
                      disabled={syncingSupabase}
                      className={SECONDARY_BTN}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncingSupabase ? 'animate-spin' : ''}`} aria-hidden="true" />
                      {syncingSupabase ? 'Syncing...' : 'Sync Workspace to Supabase'}
                    </button>
                  )}
                  {integ.callbackUrl && (
                    <button type="button" onClick={() => handleStartOAuth(integ.provider_code)} className={SECONDARY_BTN}>
                      <LinkIcon className="w-3.5 h-3.5" aria-hidden="true" />
                      Authorize OAuth
                    </button>
                  )}
                </div>
              </div>
            </SectionCard>
          );
        })}
      </div>

      <SectionCard title={`Registered Client Social Accounts (${socialAccounts.length})`} noPadding>
        {socialAccounts.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No client social accounts registered yet. Register a client social handle above to track authorization and publishing eligibility.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                  <th className="py-2.5 px-4">Client</th>
                  <th className="py-2.5 px-4">Platform</th>
                  <th className="py-2.5 px-4">Handle</th>
                  <th className="py-2.5 px-4">Connection Status</th>
                  <th className="py-2.5 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {socialAccounts.map((sa) => (
                  <tr key={sa.id}>
                    <td className="py-2.5 px-4 font-medium">{sa.client_name}</td>
                    <td className="py-2.5 px-4">{sa.platform}</td>
                    <td className="py-2.5 px-4 font-mono text-xs">@{sa.account_handle}</td>
                    <td className="py-2.5 px-4"><StatusText status={sa.connection_status} /></td>
                    <td className="py-2.5 px-4 text-xs text-slate-500">{sa.last_error || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Modal open={modalOpen} title="Register Client Social Account" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleRegisterAccount} className="space-y-4">
          <FormField label="Client" htmlFor="sa-cli" required>
            <select id="sa-cli" required value={acctForm.clientId} onChange={(e) => setAcctForm({ ...acctForm, clientId: e.target.value })} className={INPUT_CLASS}>
              <option value="">Select client...</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="Platform" htmlFor="sa-plat" required>
            <select id="sa-plat" value={acctForm.platform} onChange={(e) => setAcctForm({ ...acctForm, platform: e.target.value })} className={INPUT_CLASS}>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="tiktok">TikTok</option>
              <option value="youtube">YouTube</option>
              <option value="linkedin">LinkedIn</option>
            </select>
          </FormField>
          <FormField label="Account Handle" htmlFor="sa-handle" required>
            <input id="sa-handle" required value={acctForm.accountHandle} onChange={(e) => setAcctForm({ ...acctForm, accountHandle: e.target.value })} className={INPUT_CLASS} placeholder="meridianroasters" />
          </FormField>
          <p className="text-xs text-slate-500">
            Account will register in "Not Configured" status until official OAuth authorization completes. Passwords are never requested.
          </p>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setModalOpen(false)} className={SECONDARY_BTN}>Cancel</button>
            <button type="submit" className={PRIMARY_BTN}>Register Account</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function AuditAndHealthView({ mode }: { mode: 'audit' | 'health' }) {
  const [logs, setLogs] = useState<Array<Record<string, any>>>([]);
  const [health, setHealth] = useState<Record<string, any> | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      if (mode === 'audit') {
        const res = await apiRequest<{ logs: Array<Record<string, any>> }>(`/audit-logs?q=${encodeURIComponent(search)}`);
        setLogs(res.logs);
      } else {
        const res = await apiRequest<Record<string, any>>('/system/health');
        setHealth(res);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load observability data.');
    }
  }, [mode, search]);

  useEffect(() => {
    void load();
  }, [load]);

  if (mode === 'health') {
    const dbInfo = health?.database ?? {};
    const worker = health?.worker ?? {};
    const storage = health?.storage ?? {};
    const ai = health?.aiTelemetry ?? {};

    return (
      <div className="space-y-6">
        <PageHeader
          title="System Health & Monitoring"
          subtitle="Live database latency, background worker lease health, queue depth, storage utilization, and AI provider error telemetry."
          actions={
            <button type="button" onClick={load} className={SECONDARY_BTN}>
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Run Health Check
            </button>
          }
        />
        <ErrorBanner message={error} onDismiss={() => setError(null)} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile label="Database Status" value={dbInfo.healthy ? 'Healthy' : 'Degraded'} meta={`Latency: ${dbInfo.latencyMs ?? 0}ms · Migrations: ${dbInfo.appliedMigrations ?? 0}`} tone={dbInfo.healthy ? 'positive' : 'danger'} />
          <StatTile label="Background Worker" value={worker.running ? 'Running' : 'Stopped'} meta={`Processed: ${worker.jobsProcessedCount ?? 0} · Queued: ${worker.queueCounts?.queued ?? 0}`} tone={worker.running ? 'positive' : 'danger'} />
          <StatTile label="Dead-Letter Jobs" value={worker.queueCounts?.dead_letter ?? 0} meta={`Retrying: ${worker.queueCounts?.retrying ?? 0}`} tone={(worker.queueCounts?.dead_letter ?? 0) > 0 ? 'danger' : 'default'} />
          <StatTile label="Object Storage" value={`${storage.fileCount ?? 0} files`} meta={`${((storage.totalBytes ?? 0) / 1024).toFixed(1)} KB on disk`} />
        </div>

        <SectionCard title="AI Provider Telemetry">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><div className="text-xs text-slate-500">Total Runs</div><div className="font-mono text-lg font-semibold">{ai.total_runs ?? 0}</div></div>
            <div><div className="text-xs text-slate-500">Failed Runs</div><div className="font-mono text-lg font-semibold text-red-700">{ai.failed_runs ?? 0}</div></div>
            <div><div className="text-xs text-slate-500">Avg Latency</div><div className="font-mono text-lg font-semibold">{ai.avg_ms ? `${Math.round(ai.avg_ms)}ms` : '—'}</div></div>
            <div><div className="text-xs text-slate-500">Recorded AI Cost</div><div className="font-mono text-lg font-semibold">${Number(ai.total_ai_cost || 0).toFixed(4)}</div></div>
          </div>
        </SectionCard>

        <SectionCard title="Recent System Events" noPadding>
          {!health?.recentEvents || health.recentEvents.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No system errors or worker warnings recorded.</div>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {health.recentEvents.map((ev: Record<string, any>) => (
                <div key={ev.id} className="p-3.5 flex items-start justify-between gap-4">
                  <div>
                    <div className="font-mono font-medium text-slate-900">{ev.event_type}</div>
                    <div className="text-slate-600 mt-0.5">{ev.message}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <StatusText status={ev.severity} />
                    <div className="font-mono text-slate-400 mt-0.5">{formatDateTime(ev.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Immutable Audit Logs"
        subtitle="Append-only operational ledger tracing every authenticated human, AI agent, and system action with correlation IDs."
        actions={
          <input
            type="search"
            aria-label="Filter audit logs"
            placeholder="Filter by action, actor, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${INPUT_CLASS} w-64`}
          />
        }
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {logs.length === 0 ? (
        <EmptyState title="No matching audit entries" description="Audit entries are appended automatically for every state-mutating operation." />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 font-medium text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-4">Timestamp</th>
                <th className="py-2.5 px-4">Actor</th>
                <th className="py-2.5 px-4">Action</th>
                <th className="py-2.5 px-4">Entity</th>
                <th className="py-2.5 px-4">Correlation ID</th>
                <th className="py-2.5 px-4">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatDateTime(l.created_at)}</td>
                  <td className="py-2.5 px-4 text-slate-900 dark:text-slate-100">{l.actor_label} ({l.actor_type})</td>
                  <td className="py-2.5 px-4 font-mono text-slate-800 dark:text-slate-200">{l.action}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-400">{l.entity_type}:{l.entity_id}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-500 dark:text-slate-400">{l.correlation_id}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-500 dark:text-slate-400 max-w-xs truncate">{l.metadata_json}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
