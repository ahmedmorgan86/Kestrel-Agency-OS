import React, { useEffect, useState, useCallback } from 'react';
import { Plus, ArrowLeft, Search, Archive, ExternalLink } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatCurrencyCents } from '../domain/finance';
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
  formatShortDate,
} from '../components/ui';

export function ClientsCrmView() {
  const [clients, setClients] = useState<Array<Record<string, any>>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    legalName: '',
    industry: '',
    servicePackage: 'Full Social Media Management',
    monthlyRetainerUsd: '0',
    billingEmail: '',
    contractStartDate: new Date().toISOString().slice(0, 10),
    contractRenewalDate: '',
    primaryContactName: '',
    primaryContactEmail: '',
    primaryContactPhone: '',
    notes: '',
  });

  const loadClients = useCallback(async () => {
    try {
      const res = await apiRequest<{ clients: Array<Record<string, any>> }>('/clients');
      setClients(res.clients);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clients.');
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await apiRequest<Record<string, any>>(`/clients/${id}`);
      setDetail(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load client details.');
    }
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/clients', {
        method: 'POST',
        body: {
          ...form,
          monthlyRetainerUsd: Number(form.monthlyRetainerUsd || 0),
          contractRenewalDate: form.contractRenewalDate || null,
        },
      });
      setModalOpen(false);
      setForm({
        name: '',
        legalName: '',
        industry: '',
        servicePackage: 'Full Social Media Management',
        monthlyRetainerUsd: '0',
        billingEmail: '',
        contractStartDate: new Date().toISOString().slice(0, 10),
        contractRenewalDate: '',
        primaryContactName: '',
        primaryContactEmail: '',
        primaryContactPhone: '',
        notes: '',
      });
      await loadClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create client.');
    }
  };

  const handleArchive = async (id: string) => {
    setError(null);
    try {
      await apiRequest(`/clients/${id}`, { method: 'DELETE' });
      setSelectedId(null);
      await loadClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive client.');
    }
  };

  if (selectedId && detail) {
    const c = detail.client;
    return (
      <div className="space-y-6">
        <PageHeader
          title={c.name}
          subtitle={`${c.industry} · ${c.service_package || 'Custom Package'} · Monthly Retainer ${formatCurrencyCents(c.monthly_retainer_cents)}`}
          actions={
            <>
              <button type="button" onClick={() => setSelectedId(null)} className={SECONDARY_BTN}>
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                Back to CRM
              </button>
              <button type="button" onClick={() => handleArchive(c.id)} className={DANGER_BTN}>
                <Archive className="w-4 h-4" aria-hidden="true" />
                Archive Client
              </button>
            </>
          }
        />
        <ErrorBanner message={error} onDismiss={() => setError(null)} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <SectionCard title="Contract & Billing">
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd><StatusText status={c.status} /></dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Legal Entity</dt><dd className="text-slate-900">{c.legal_name || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Billing Email</dt><dd className="text-slate-900">{c.billing_email || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Start Date</dt><dd className="font-mono text-xs">{formatShortDate(c.contract_start_date)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Renewal Date</dt><dd className="font-mono text-xs">{formatShortDate(c.contract_renewal_date)}</dd></div>
            </dl>
          </SectionCard>

          <SectionCard title={`Contacts (${detail.contacts.length})`}>
            {detail.contacts.length === 0 ? (
              <p className="text-sm text-slate-500">No contacts recorded.</p>
            ) : (
              <div className="space-y-3">
                {detail.contacts.map((ct: Record<string, any>) => (
                  <div key={ct.id} className="text-sm">
                    <div className="font-medium text-slate-900">{ct.full_name}</div>
                    <div className="text-xs text-slate-500">{ct.email || 'No email'} · {ct.phone || 'No phone'}</div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title={`Linked Records`}>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Brand Profiles</dt><dd className="font-mono">{detail.brands.length}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Projects</dt><dd className="font-mono">{detail.projects.length}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Campaigns</dt><dd className="font-mono">{detail.campaigns.length}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Social Accounts</dt><dd className="font-mono">{detail.socialAccounts.length}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Invoices</dt><dd className="font-mono">{detail.invoices.length}</dd></div>
            </dl>
          </SectionCard>
        </div>

        {c.notes && (
          <SectionCard title="Account Notes">
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.notes}</p>
          </SectionCard>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client CRM"
        subtitle="Manage real agency clients, contracts, retainers, contacts, multi-brand portfolios, and connected social accounts."
        actions={
          <button type="button" onClick={() => setModalOpen(true)} className={PRIMARY_BTN}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add Client
          </button>
        }
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {clients.length === 0 ? (
        <EmptyState
          title="No clients onboarded yet"
          description="Add your first real agency client to create brand profiles, projects, content workflows, and financial records."
          action={
            <button type="button" onClick={() => setModalOpen(true)} className={PRIMARY_BTN}>
              Add First Client
            </button>
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Industry</th>
                <th className="py-3 px-4">Package</th>
                <th className="py-3 px-4 text-right">Monthly Retainer</th>
                <th className="py-3 px-4 text-right">Brands</th>
                <th className="py-3 px-4 text-right">Projects</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-medium text-slate-900">{c.name}</td>
                  <td className="py-3 px-4 text-slate-600">{c.industry}</td>
                  <td className="py-3 px-4 text-xs text-slate-600">{c.service_package || '—'}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {formatCurrencyCents(c.monthly_retainer_cents)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">{c.brand_count}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">{c.project_count}</td>
                  <td className="py-3 px-4">
                    <StatusText status={c.status} />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className="text-xs font-medium text-blue-700 hover:underline"
                    >
                      Open Client
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} title="Onboard New Client" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Client Name" htmlFor="cli-name" required>
              <input id="cli-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT_CLASS} placeholder="e.g., Meridian Roasters" />
            </FormField>
            <FormField label="Industry" htmlFor="cli-industry" required>
              <input id="cli-industry" required value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className={INPUT_CLASS} placeholder="e.g., Specialty Coffee & Retail" />
            </FormField>
            <FormField label="Legal Business Name" htmlFor="cli-legal">
              <input id="cli-legal" value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Service Package" htmlFor="cli-pkg">
              <input id="cli-pkg" value={form.servicePackage} onChange={(e) => setForm({ ...form, servicePackage: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Monthly Retainer (USD)" htmlFor="cli-retainer">
              <input id="cli-retainer" type="number" min="0" step="0.01" value={form.monthlyRetainerUsd} onChange={(e) => setForm({ ...form, monthlyRetainerUsd: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Billing Email" htmlFor="cli-billing">
              <input id="cli-billing" type="email" value={form.billingEmail} onChange={(e) => setForm({ ...form, billingEmail: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Primary Contact Name" htmlFor="cli-contact">
              <input id="cli-contact" value={form.primaryContactName} onChange={(e) => setForm({ ...form, primaryContactName: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Primary Contact Email" htmlFor="cli-cemail">
              <input id="cli-cemail" type="email" value={form.primaryContactEmail} onChange={(e) => setForm({ ...form, primaryContactEmail: e.target.value })} className={INPUT_CLASS} />
            </FormField>
          </div>
          <FormField label="Account Notes" htmlFor="cli-notes">
            <textarea id="cli-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={INPUT_CLASS} />
          </FormField>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setModalOpen(false)} className={SECONDARY_BTN}>Cancel</button>
            <button type="submit" className={PRIMARY_BTN}>Create Client</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function BrandProfilesView() {
  const [brands, setBrands] = useState<Array<Record<string, any>>>([]);
  const [clients, setClients] = useState<Array<Record<string, any>>>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    clientId: '',
    name: '',
    description: '',
    industry: '',
    targetAudience: '',
    positioning: '',
    toneOfVoice: '',
    preferredLanguage: 'English',
    writingStyle: '',
    preferredExpressions: '',
    prohibitedExpressions: '',
    hashtagPreferences: '',
    ctaPreferences: '',
    colorPalette: '',
  });

  const load = useCallback(async () => {
    try {
      const [bRes, cRes] = await Promise.all([
        apiRequest<{ brands: Array<Record<string, any>> }>('/brands'),
        apiRequest<{ clients: Array<Record<string, any>> }>('/clients'),
      ]);
      setBrands(bRes.brands);
      setClients(cRes.clients);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load brands.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const splitCsv = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/brands', {
        method: 'POST',
        body: {
          ...form,
          preferredExpressions: splitCsv(form.preferredExpressions),
          prohibitedExpressions: splitCsv(form.prohibitedExpressions),
          hashtagPreferences: splitCsv(form.hashtagPreferences),
          ctaPreferences: splitCsv(form.ctaPreferences),
          colorPalette: splitCsv(form.colorPalette),
        },
      });
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create brand profile.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Brand Profiles"
        subtitle="Versioned brand voice, visual identity, prohibited expressions, and platform guidelines retrieved by AI agents prior to production."
        actions={
          <button type="button" onClick={() => setModalOpen(true)} className={PRIMARY_BTN} disabled={clients.length === 0}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            New Brand Profile
          </button>
        }
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {brands.length === 0 ? (
        <EmptyState
          title="No brand profiles configured"
          description={
            clients.length === 0
              ? 'Onboard a client in Client CRM first, then create their versioned brand profile.'
              : 'Define voice, prohibited words, audience positioning, and visual rules so AI agents produce on-brand work.'
          }
          action={
            clients.length > 0 ? (
              <button type="button" onClick={() => setModalOpen(true)} className={PRIMARY_BTN}>
                Create First Brand Profile
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {brands.map((b) => {
            const latest = b.versions?.[0];
            const prohibited = latest ? (JSON.parse(latest.prohibited_expressions_json || '[]') as string[]) : [];
            const palette = latest ? (JSON.parse(latest.color_palette_json || '[]') as string[]) : [];
            return (
              <SectionCard
                key={b.id}
                title={b.name}
                description={`${b.client_name} · Version ${b.current_version_number} · ${latest?.preferred_language || 'English'}`}
              >
                <div className="space-y-3 text-sm">
                  <p className="text-slate-700">{b.description || 'No description provided.'}</p>
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <div className="text-slate-500">Target Audience</div>
                      <div className="text-slate-900 mt-0.5">{latest?.target_audience || '—'}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Tone of Voice</div>
                      <div className="text-slate-900 mt-0.5">{latest?.tone_of_voice || '—'}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Prohibited Terms</div>
                      <div className="text-red-700 mt-0.5">{prohibited.length > 0 ? prohibited.join(', ') : 'None defined'}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Color Palette</div>
                      <div className="font-mono text-slate-900 mt-0.5">{palette.length > 0 ? palette.join(' · ') : '—'}</div>
                    </div>
                  </div>
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} title="Create Versioned Brand Profile" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Client" htmlFor="brd-client" required>
              <select id="brd-client" required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} className={INPUT_CLASS}>
                <option value="">Select client...</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FormField>
            <FormField label="Brand Name" htmlFor="brd-name" required>
              <input id="brd-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Tone of Voice" htmlFor="brd-tone">
              <input id="brd-tone" value={form.toneOfVoice} onChange={(e) => setForm({ ...form, toneOfVoice: e.target.value })} className={INPUT_CLASS} placeholder="e.g., Direct, informed, warm" />
            </FormField>
            <FormField label="Preferred Language" htmlFor="brd-lang">
              <input id="brd-lang" value={form.preferredLanguage} onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value })} className={INPUT_CLASS} />
            </FormField>
          </div>
          <FormField label="Brand Description & Positioning" htmlFor="brd-desc">
            <textarea id="brd-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={INPUT_CLASS} />
          </FormField>
          <FormField label="Target Audience" htmlFor="brd-aud">
            <input id="brd-aud" value={form.targetAudience} onChange={(e) => setForm({ ...form, targetAudience: e.target.value })} className={INPUT_CLASS} />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Prohibited Expressions (comma-separated)" htmlFor="brd-prohib">
              <input id="brd-prohib" value={form.prohibitedExpressions} onChange={(e) => setForm({ ...form, prohibitedExpressions: e.target.value })} className={INPUT_CLASS} placeholder="cheap, guaranteed, miracle" />
            </FormField>
            <FormField label="Color Palette Hexes (comma-separated)" htmlFor="brd-colors">
              <input id="brd-colors" value={form.colorPalette} onChange={(e) => setForm({ ...form, colorPalette: e.target.value })} className={INPUT_CLASS} placeholder="#0F172A, #1D4ED8" />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setModalOpen(false)} className={SECONDARY_BTN}>Cancel</button>
            <button type="submit" className={PRIMARY_BTN}>Save Brand v1</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function ProjectsAndCampaignsView({ mode }: { mode: 'projects' | 'campaigns' }) {
  const [items, setItems] = useState<Array<Record<string, any>>>([]);
  const [clients, setClients] = useState<Array<Record<string, any>>>([]);
  const [brands, setBrands] = useState<Array<Record<string, any>>>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    clientId: '',
    brandId: '',
    name: '',
    objectives: '',
    scope: '',
    budgetUsd: '0',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    platforms: 'instagram, linkedin',
  });

  const load = useCallback(async () => {
    try {
      const [mainRes, cRes, bRes] = await Promise.all([
        apiRequest<Record<string, Array<Record<string, any>>>>(mode === 'projects' ? '/projects' : '/campaigns'),
        apiRequest<{ clients: Array<Record<string, any>> }>('/clients'),
        apiRequest<{ brands: Array<Record<string, any>> }>('/brands'),
      ]);
      setItems(mainRes[mode] || []);
      setClients(cRes.clients);
      setBrands(bRes.brands);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load ${mode}.`);
    }
  }, [mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (mode === 'projects') {
        await apiRequest('/projects', {
          method: 'POST',
          body: {
            clientId: form.clientId,
            brandId: form.brandId || null,
            name: form.name,
            objectives: form.objectives,
            scope: form.scope,
            budgetUsd: Number(form.budgetUsd || 0),
            startDate: form.startDate || null,
            targetEndDate: form.endDate || null,
          },
        });
      } else {
        await apiRequest('/campaigns', {
          method: 'POST',
          body: {
            clientId: form.clientId,
            brandId: form.brandId || null,
            name: form.name,
            objective: form.objectives,
            platforms: form.platforms.split(',').map((p) => p.trim()).filter(Boolean),
            budgetUsd: Number(form.budgetUsd || 0),
            startDate: form.startDate || null,
            endDate: form.endDate || null,
          },
        });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to create ${mode.slice(0, -1)}.`);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={mode === 'projects' ? 'Projects' : 'Campaigns'}
        subtitle={
          mode === 'projects'
            ? 'Client engagements with scope, deliverables, budgets, timelines, and linked tasks/content.'
            : 'Multi-platform marketing campaigns linked to clients, creative direction, content items, and KPIs.'
        }
        actions={
          <button type="button" onClick={() => setModalOpen(true)} className={PRIMARY_BTN} disabled={clients.length === 0}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            New {mode === 'projects' ? 'Project' : 'Campaign'}
          </button>
        }
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {items.length === 0 ? (
        <EmptyState
          title={`No ${mode} created yet`}
          description={clients.length === 0 ? 'Add a client first to start managing engagements.' : `Create your first real ${mode.slice(0, -1)} to track deliverables and budgets.`}
          action={
            clients.length > 0 ? (
              <button type="button" onClick={() => setModalOpen(true)} className={PRIMARY_BTN}>
                Create {mode === 'projects' ? 'Project' : 'Campaign'}
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Client / Brand</th>
                <th className="py-3 px-4 text-right">Budget</th>
                <th className="py-3 px-4">Timeline</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{item.name}</div>
                    <div className="text-xs text-slate-500 truncate max-w-md">{item.objectives || item.objective || '—'}</div>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">
                    {item.client_name} {item.brand_name ? `/ ${item.brand_name}` : ''}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {formatCurrencyCents(item.budget_cents)}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-600">
                    {formatShortDate(item.start_date)} → {formatShortDate(item.target_end_date || item.end_date)}
                  </td>
                  <td className="py-3 px-4"><StatusText status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} title={`Create ${mode === 'projects' ? 'Project' : 'Campaign'}`} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Client" htmlFor="pc-client" required>
              <select id="pc-client" required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} className={INPUT_CLASS}>
                <option value="">Select client...</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FormField>
            <FormField label="Brand Profile" htmlFor="pc-brand">
              <select id="pc-brand" value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })} className={INPUT_CLASS}>
                <option value="">Optional</option>
                {brands.filter((b) => !form.clientId || b.client_id === form.clientId).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </FormField>
          </div>
          <FormField label="Name" htmlFor="pc-name" required>
            <input id="pc-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT_CLASS} />
          </FormField>
          <FormField label="Objectives" htmlFor="pc-obj">
            <textarea id="pc-obj" rows={2} value={form.objectives} onChange={(e) => setForm({ ...form, objectives: e.target.value })} className={INPUT_CLASS} />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Budget (USD)" htmlFor="pc-budget">
              <input id="pc-budget" type="number" min="0" step="0.01" value={form.budgetUsd} onChange={(e) => setForm({ ...form, budgetUsd: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Start Date" htmlFor="pc-start">
              <input id="pc-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="End Date" htmlFor="pc-end">
              <input id="pc-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={INPUT_CLASS} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setModalOpen(false)} className={SECONDARY_BTN}>Cancel</button>
            <button type="submit" className={PRIMARY_BTN}>Save</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function ResearchIntelligenceView({ mode }: { mode: 'trends' | 'competitors' }) {
  const [trends, setTrends] = useState<Array<Record<string, any>>>([]);
  const [competitors, setCompetitors] = useState<Array<Record<string, any>>>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [researchTopic, setResearchTopic] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [trendForm, setTrendForm] = useState({
    title: '',
    description: '',
    sourceName: '',
    sourceUrl: '',
    industry: '',
    epistemicStatus: 'source_reported',
    supportingEvidence: '',
  });
  const [compForm, setCompForm] = useState({
    name: '',
    websiteUrl: '',
    positioningSummary: '',
    observedStrengths: '',
    observedGaps: '',
  });

  const load = useCallback(async () => {
    try {
      if (mode === 'trends') {
        const res = await apiRequest<{ trends: Array<Record<string, any>> }>('/trends');
        setTrends(res.trends);
      } else {
        const res = await apiRequest<{ competitors: Array<Record<string, any>> }>('/competitors');
        setCompetitors(res.competitors);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load research records.');
    }
  }, [mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDispatchResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const res = await apiRequest<{ jobId: string }>('/trends/research', {
        method: 'POST',
        body: { topic: researchTopic },
      });
      setNotice(`Dispatched grounded Research Agent job (${res.jobId}). Real Google Search URLs will be persisted upon completion.`);
      setResearchTopic('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch research job.');
    }
  };

  const handleSaveTrend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/trends', { method: 'POST', body: trendForm });
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record trend.');
    }
  };

  const handleSaveCompetitor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/competitors', { method: 'POST', body: compForm });
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record competitor.');
    }
  };

  if (mode === 'competitors') {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Competitor Research"
          subtitle="Observed competitor positioning, strengths, content gaps, and verifiable source references."
          actions={
            <button type="button" onClick={() => setModalOpen(true)} className={PRIMARY_BTN}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              Log Competitor
            </button>
          }
        />
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        {competitors.length === 0 ? (
          <EmptyState
            title="No competitor dossiers logged"
            description="Record verified competitor observations with real website links and positioning notes."
            action={<button type="button" onClick={() => setModalOpen(true)} className={PRIMARY_BTN}>Log First Competitor</button>}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {competitors.map((c) => (
              <SectionCard key={c.id} title={c.name} description={`Observed ${formatShortDate(c.observed_at)}`}>
                <div className="space-y-2 text-sm">
                  {c.website_url && (
                    <a href={c.website_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline">
                      {c.website_url} <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <p className="text-slate-700">{c.positioning_summary || '—'}</p>
                  <div className="text-xs text-slate-600 pt-2 border-t border-slate-100">
                    <strong>Strengths:</strong> {c.observed_strengths || '—'}
                  </div>
                  <div className="text-xs text-slate-600">
                    <strong>Gaps:</strong> {c.observed_gaps || '—'}
                  </div>
                </div>
              </SectionCard>
            ))}
          </div>
        )}
        <Modal open={modalOpen} title="Log Observed Competitor" onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSaveCompetitor} className="space-y-4">
            <FormField label="Competitor Name" htmlFor="comp-name" required>
              <input id="comp-name" required value={compForm.name} onChange={(e) => setCompForm({ ...compForm, name: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Website URL" htmlFor="comp-url">
              <input id="comp-url" type="url" value={compForm.websiteUrl} onChange={(e) => setCompForm({ ...compForm, websiteUrl: e.target.value })} className={INPUT_CLASS} placeholder="https://example.com" />
            </FormField>
            <FormField label="Positioning Summary" htmlFor="comp-pos">
              <textarea id="comp-pos" rows={2} value={compForm.positioningSummary} onChange={(e) => setCompForm({ ...compForm, positioningSummary: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Observed Strengths" htmlFor="comp-str">
              <textarea id="comp-str" rows={2} value={compForm.observedStrengths} onChange={(e) => setCompForm({ ...compForm, observedStrengths: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Observed Gaps / Opportunities" htmlFor="comp-gap">
              <textarea id="comp-gap" rows={2} value={compForm.observedGaps} onChange={(e) => setCompForm({ ...compForm, observedGaps: e.target.value })} className={INPUT_CLASS} />
            </FormField>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button type="button" onClick={() => setModalOpen(false)} className={SECONDARY_BTN}>Cancel</button>
              <button type="submit" className={PRIMARY_BTN}>Save Competitor</button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trend Intelligence"
        subtitle="Verified and source-reported trends only. Every record preserves its exact source URL, observation date, and epistemic classification."
        actions={
          <button type="button" onClick={() => setModalOpen(true)} className={PRIMARY_BTN}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Log Verified Trend
          </button>
        }
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {notice && <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-900">{notice}</div>}

      <SectionCard
        title="Dispatch Grounded Research Agent"
        description="Uses Google Search grounding via the Research Agent worker to collect real-world sources (never fabricates URLs)"
      >
        <form onSubmit={handleDispatchResearch} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            required
            aria-label="Research topic"
            value={researchTopic}
            onChange={(e) => setResearchTopic(e.target.value)}
            placeholder="e.g., Short-form video retention trends for specialty coffee brands"
            className={`${INPUT_CLASS} flex-1`}
          />
          <button type="submit" className={PRIMARY_BTN}>
            <Search className="w-4 h-4" aria-hidden="true" />
            Run Grounded Research
          </button>
        </form>
      </SectionCard>

      {trends.length === 0 ? (
        <EmptyState
          title="No observed trends recorded"
          description="Run the Research Agent with Google Search grounding or manually log a verified trend with its source URL."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
          {trends.map((t) => (
            <div key={t.id} className="p-4 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">{t.title}</h3>
                <StatusText status={t.epistemic_status} />
              </div>
              <p className="text-sm text-slate-600">{t.description}</p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-1">
                <span>Source: {t.source_name}</span>
                <span>·</span>
                <a href={t.source_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline inline-flex items-center gap-1">
                  {t.source_url} <ExternalLink className="w-3 h-3" />
                </a>
                <span>·</span>
                <span className="font-mono">Observed {formatShortDate(t.observed_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} title="Log Verified Trend" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSaveTrend} className="space-y-4">
          <FormField label="Trend Title" htmlFor="tr-title" required>
            <input id="tr-title" required value={trendForm.title} onChange={(e) => setTrendForm({ ...trendForm, title: e.target.value })} className={INPUT_CLASS} />
          </FormField>
          <FormField label="Source Name" htmlFor="tr-src" required>
            <input id="tr-src" required value={trendForm.sourceName} onChange={(e) => setTrendForm({ ...trendForm, sourceName: e.target.value })} className={INPUT_CLASS} />
          </FormField>
          <FormField label="Real Source URL" htmlFor="tr-url" required>
            <input id="tr-url" type="url" required value={trendForm.sourceUrl} onChange={(e) => setTrendForm({ ...trendForm, sourceUrl: e.target.value })} className={INPUT_CLASS} placeholder="https://..." />
          </FormField>
          <FormField label="Epistemic Classification" htmlFor="tr-epi">
            <select id="tr-epi" value={trendForm.epistemicStatus} onChange={(e) => setTrendForm({ ...trendForm, epistemicStatus: e.target.value })} className={INPUT_CLASS}>
              <option value="verified">Verified Information</option>
              <option value="source_reported">Source-Reported Information</option>
              <option value="ai_interpretation">AI Interpretation</option>
              <option value="unverified">Unverified Claim</option>
            </select>
          </FormField>
          <FormField label="Description & Evidence" htmlFor="tr-desc" required>
            <textarea id="tr-desc" required rows={3} value={trendForm.description} onChange={(e) => setTrendForm({ ...trendForm, description: e.target.value })} className={INPUT_CLASS} />
          </FormField>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button type="button" onClick={() => setModalOpen(false)} className={SECONDARY_BTN}>Cancel</button>
            <button type="submit" className={PRIMARY_BTN}>Save Trend</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
