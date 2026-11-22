import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Activity,
  ArrowLeft,
  Bot,
  Building2,
  ChevronDown,
  ChevronRight,
  Edit3,
  ExternalLink,
  Layers,
  Map as MapIcon,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  Video,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useThemeAndBrand } from '../context/ThemeAndBrandContext';
import { ActorAvatar } from '../components/BrandMark';
import {
  VirtualHq3D,
  type Hq3DActor,
  type Hq3DMeetingRoom,
  type Hq3DSelection,
} from '../components/VirtualHq3D';
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
import type { OrgChartHierarchy, ZoneRect } from '../domain/hq';

interface HqStateResponse {
  syncedAt: string;
  organization: Record<string, any>;
  departments: Array<Record<string, any>>;
  meetingRooms: Array<Record<string, any>>;
  activeMeetings: Array<Record<string, any>>;
  zones: ZoneRect[];
  humans: Array<Record<string, any>>;
  agents: Array<Record<string, any>>;
  orgChart: OrgChartHierarchy;
  recentEvents: Array<Record<string, any>>;
  counts: {
    pendingApprovals: number;
    unreadNotifications: number;
    activeMeetings: number;
    workingAgents: number;
    totalHumans: number;
    virtualEmployees: number;
    totalAgents: number;
    totalDepartments: number;
  };
}

export function VirtualHqView({
  initialTab = 'lobby',
  onOpenEmployee,
  onOpenAgent,
  onOpenDepartment,
  onOpenMeeting,
  onNavigate,
}: {
  initialTab?: 'lobby' | 'hq3d' | 'floor2d' | 'orgchart' | 'directory';
  onOpenEmployee: (employeeId: string) => void;
  onOpenAgent: (agentId: string) => void;
  onOpenDepartment: (departmentId: string) => void;
  onOpenMeeting: (meetingId?: string) => void;
  onNavigate: (route: string) => void;
}) {
  const { theme, reducedMotion, setReducedMotion, brand, updateBrandFromOrg } = useThemeAndBrand();
  const [tab, setTab] = useState<'lobby' | 'hq3d' | 'floor2d' | 'orgchart' | 'directory'>(initialTab);
  const [hq, setHq] = useState<HqStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Hq3DSelection | null>(null);

  // Org chart & Directory filters
  const [orgSearch, setOrgSearch] = useState('');
  const [orgTypeFilter, setOrgTypeFilter] = useState<'all' | 'human' | 'agent'>('all');
  const [orgDeptFilter, setOrgDeptFilter] = useState('');
  const [collapsedDepts, setCollapsedDepts] = useState<Record<string, boolean>>({});

  // Create Department modal
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDesc, setNewDeptDesc] = useState('');

  const loadState = useCallback(async () => {
    try {
      const res = await apiRequest<HqStateResponse>('/hq/state');
      setHq(res);
      updateBrandFromOrg(res.organization);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات مقر الشركة الآن.');
    } finally {
      setLoading(false);
    }
  }, [updateBrandFromOrg]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  // Reconcile the room, attendance, and staff positions while this view is open.
  useEffect(() => {
    const timer = window.setInterval(() => void loadState(), 8000);
    return () => window.clearInterval(timer);
  }, [loadState]);

  const actors3d: Hq3DActor[] = useMemo(() => {
    if (!hq) return [];
    const humans: Hq3DActor[] = hq.humans.map((h) => ({
      id: h.id,
      actorType: 'human',
      name: h.full_name,
      jobTitle: h.job_title,
      departmentId: h.department_id,
      departmentName: h.department_name,
      operationalStatus: h.operationalStatus,
      avatarConfig: h.avatarConfig,
      worldPosition: h.worldPosition,
      activeMeetingId: h.activeMeetingId,
      activeMeetingTitle: h.activeMeetingTitle,
      openTasks: Number(h.open_tasks || 0),
    }));
    const agents: Hq3DActor[] = hq.agents.map((a) => ({
      id: a.id,
      actorType: 'agent',
      name: a.name,
      jobTitle: a.job_title,
      departmentId: a.department_id,
      departmentName: a.department_name,
      operationalStatus: a.operationalStatus,
      avatarConfig: a.avatarConfig,
      worldPosition: a.worldPosition,
      currentTaskTitle: a.current_task_title,
      activeMeetingId: a.activeMeetingId,
      activeMeetingTitle: a.activeMeetingTitle,
      openTasks: Number(a.open_tasks || 0),
    }));
    return [...humans, ...agents];
  }, [hq]);

  const rooms3d: Hq3DMeetingRoom[] = useMemo(() => {
    if (!hq) return [];
    return hq.meetingRooms.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      capacity: Number(r.capacity || 6),
      activeMeeting: r.activeMeeting ? { id: r.activeMeeting.id, title: r.activeMeeting.title } : null,
    }));
  }, [hq]);

  const handle3DSelect = useCallback(
    (sel: Hq3DSelection) => {
      if (sel.kind === 'screen' && sel.targetRoute) {
        onNavigate(sel.targetRoute);
        return;
      }
      setSelection(sel);
    },
    [onNavigate]
  );

  const handlePauseOrResumeAgent = async (agentId: string, currentlyPaused: boolean) => {
    try {
      await apiRequest(`/agents/${agentId}/${currentlyPaused ? 'resume' : 'pause'}`, { method: 'POST' });
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change agent status.');
    }
  };

  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/departments', {
        method: 'POST',
        body: { name: newDeptName, description: newDeptDesc },
      });
      setDeptModalOpen(false);
      setNewDeptName('');
      setNewDeptDesc('');
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create department.');
    }
  };

  const selectedHuman =
    selection?.kind === 'human' ? hq?.humans.find((h) => h.id === selection.id) ?? null : null;
  const selectedAgent =
    selection?.kind === 'agent' ? hq?.agents.find((a) => a.id === selection.id) ?? null : null;
  const selectedDept =
    selection?.kind === 'department' ? hq?.departments.find((d) => d.id === selection.id) ?? null : null;
  const selectedRoom =
    selection?.kind === 'meeting_room' ? hq?.meetingRooms.find((r) => r.id === selection.id) ?? null : null;

  if (loading && !hq) {
    return (
      <div className="space-y-6">
        <PageHeader title="مقر الشركة" subtitle="جارٍ تحميل مخطط المقر والفريق والمهام والاجتماعات..." />
        <div className="h-[520px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      </div>
    );
  }

  const counts = hq?.counts;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`مقر ${brand.name}`}
        subtitle="مساحة العمل الرئيسية لإنتاج محتوى الشركة. استعرض الفريق وتخصصاته ومهامه واجتماعاته، وراجع كل محتوى قبل نشره."
        actions={
          <>
            <button
              type="button"
              onClick={() => onOpenMeeting()}
              className={PRIMARY_BTN}
            >
              <Video className="w-4 h-4" aria-hidden="true" />
              الاجتماعات {counts?.activeMeetings ? `(${counts.activeMeetings} جارية)` : ''}
            </button>
            <button
              type="button"
              onClick={() => setDeptModalOpen(true)}
              className={SECONDARY_BTN}
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              إضافة قسم
            </button>
            <button type="button" onClick={loadState} className={SECONDARY_BTN} aria-label="تحديث بيانات المقر">
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
            </button>
          </>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* Top Operational Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile label="أقسام الإنتاج" value={counts?.totalDepartments ?? 0} meta="تخصصات فريق الشركة" onClick={() => setTab('directory')} />
        <StatTile label="شخصيات الفريق" value={counts?.virtualEmployees ?? 0} meta="نماذج افتراضية بأدوار وتخصصات محددة" onClick={() => onNavigate('employees')} />
        <StatTile
          label="وكلاء الذكاء الاصطناعي"
          value={counts?.totalAgents ?? 0}
          meta={`${counts?.workingAgents ?? 0} ينفذون مهام الآن`}
          tone={(counts?.workingAgents ?? 0) > 0 ? 'positive' : 'default'}
          onClick={() => onNavigate('agents')}
        />
        <StatTile
          label="اجتماعات جارية"
          value={counts?.activeMeetings ?? 0}
          meta="غرف اجتماعات الشركة"
          tone={(counts?.activeMeetings ?? 0) > 0 ? 'positive' : 'default'}
          onClick={() => onOpenMeeting()}
        />
        <StatTile
          label="بانتظار موافقتك للنشر"
          value={counts?.pendingApprovals ?? 0}
          meta="تتحدث تلقائياً كل 8 ثوانٍ"
          tone={(counts?.pendingApprovals ?? 0) > 0 ? 'warning' : 'default'}
          onClick={() => onNavigate('approvals')}
        />
      </div>

      {/* Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'hq3d', label: 'مقر الشركة ثلاثي الأبعاد' },
            { value: 'floor2d', label: 'مخطط المقر' },
            { value: 'orgchart', label: 'الهيكل الإداري' },
            { value: 'directory', label: 'تخصصات الفريق' },
          ]}
        />

        <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-700"
            />
            تقليل الحركة
          </label>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-700">|</span>
          <span className="hidden sm:inline font-mono">
            تحديث تلقائي كل 8 ثوانٍ
          </span>
        </div>
      </div>

      {tab === 'lobby' && hq && (
        <section
          aria-label="MORGAN GROUP headquarters lobby preview"
          className="relative isolate min-h-[540px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 bg-cover bg-center shadow-2xl"
          style={{ backgroundImage: 'linear-gradient(90deg, rgba(8,17,24,0.82) 0%, rgba(8,17,24,0.45) 42%, rgba(8,17,24,0.06) 78%), linear-gradient(0deg, rgba(8,17,24,0.92) 0%, rgba(8,17,24,0.05) 44%), url("/assets/morgan-group-lobby.png")' }}
        >
          <div className="absolute left-7 top-7 z-10 flex items-center gap-2 rounded-full border border-white/20 bg-slate-950/55 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-teal-300 shadow-[0_0_12px_rgba(94,234,212,0.9)]" />
            MORGAN GROUP · Headquarters
          </div>
          <div className="absolute right-7 top-7 z-10 rounded-full border border-white/20 bg-slate-950/55 px-3.5 py-2 text-xs text-slate-100 backdrop-blur-sm">
            Virtual company preview
          </div>

          <div className="relative z-10 flex min-h-[540px] flex-col justify-between p-7 sm:p-10">
            <div className="max-w-xl pt-16 sm:pt-20">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">Technology, built together</p>
              <h2 className="mt-4 max-w-lg text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl">
                Welcome to a more human kind of technology company.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-6 text-slate-200 sm:text-base">
                Meet the team, explore the operating floor, and see how people and AI colleagues work together.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={() => setTab('hq3d')} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg transition hover:bg-teal-50">
                  <Layers className="h-4 w-4" aria-hidden="true" /> Explore the interactive HQ
                </button>
                <button type="button" onClick={() => onNavigate('employees')} className="rounded-lg border border-white/35 bg-slate-950/25 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/10">
                  Meet the team
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <button type="button" onClick={() => onNavigate('employees')} className="group rounded-xl border border-white/15 bg-slate-950/65 p-4 text-left backdrop-blur-md transition hover:border-teal-200/60 hover:bg-slate-950/80">
                <span className="flex items-center gap-2 text-xs text-slate-300"><Users className="h-4 w-4 text-teal-200" aria-hidden="true" /> Virtual colleagues</span>
                <span className="mt-2 block text-2xl font-semibold text-white">{hq.counts.virtualEmployees}</span>
                <span className="mt-1 block text-xs text-slate-400">Fictional roster, real company structure</span>
              </button>
              <button type="button" onClick={() => onNavigate('agents')} className="group rounded-xl border border-white/15 bg-slate-950/65 p-4 text-left backdrop-blur-md transition hover:border-teal-200/60 hover:bg-slate-950/80">
                <span className="flex items-center gap-2 text-xs text-slate-300"><Sparkles className="h-4 w-4 text-teal-200" aria-hidden="true" /> AI colleagues</span>
                <span className="mt-2 block text-2xl font-semibold text-white">{hq.counts.totalAgents}</span>
                <span className="mt-1 block text-xs text-slate-400">Local model setup is available in the HQ map</span>
              </button>
              <button type="button" onClick={() => onOpenMeeting()} className="group rounded-xl border border-white/15 bg-slate-950/65 p-4 text-left backdrop-blur-md transition hover:border-teal-200/60 hover:bg-slate-950/80">
                <span className="flex items-center gap-2 text-xs text-slate-300"><Video className="h-4 w-4 text-teal-200" aria-hidden="true" /> Operating divisions</span>
                <span className="mt-2 block text-2xl font-semibold text-white">{hq.counts.totalDepartments}</span>
                <span className="mt-1 block text-xs text-slate-400">Plus {hq.counts.activeMeetings} live meetings</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* TAB 1: 3D VIRTUAL HQ */}
      {tab === 'hq3d' && hq && (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
          <div className="xl:col-span-3 space-y-4">
            <VirtualHq3D
              companyName={brand.name}
              primaryColor={brand.primaryColor}
              theme={theme}
              reducedMotion={reducedMotion}
              zones={hq.zones}
              actors={actors3d}
              meetingRooms={rooms3d}
              pendingApprovalsCount={hq.counts.pendingApprovals}
              selectedId={selection?.id ?? null}
              onSelect={handle3DSelect}
              onWebglUnavailable={() => setTab('floor2d')}
            />

            {/* Status Legend Bar */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex flex-wrap items-center gap-4">
                <span className="font-semibold text-slate-800 dark:text-slate-200">حالة الفريق:</span>
                <span>متاح</span>
                <span className="text-blue-700 dark:text-blue-400 font-medium">ينفذ مهمة</span>
                <span className="text-indigo-700 dark:text-indigo-400 font-medium">في اجتماع</span>
                <span className="text-amber-700 dark:text-amber-400 font-medium">بانتظار موافقتك</span>
                <span className="text-red-700 dark:text-red-400 font-medium">تحتاج إلى متابعة</span>
              </div>
              <span className="text-slate-500 dark:text-slate-400" title="الحركة مرتبطة بحالة العمل المسجلة؛ المقر نموذج تفاعلي ولا يتتبع موقع أشخاص حقيقيين.">
                فريق افتراضي · نشاط مرتبط بحالة العمل
              </span>
              <button
                type="button"
                onClick={() => setTab('floor2d')}
                className="text-blue-700 dark:text-blue-400 font-medium hover:underline inline-flex items-center gap-1"
              >
                <MapIcon className="w-3.5 h-3.5" />
                عرض مخطط ثنائي الأبعاد
              </button>
            </div>
          </div>

          {/* Right Context Inspector & Live Company Feed */}
          <div className="space-y-4">
            <SectionCard
              title={selection ? `تفاصيل · ${selection.label}` : 'معلومات مقر الشركة'}
              description={selection ? 'بيانات العنصر المحدد' : 'اختر شخصية أو قسماً أو غرفة اجتماعات'}
            >
              {selectedHuman ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-3">
                    <ActorAvatar
                      name={selectedHuman.full_name}
                      actorType="human"
                      photoUrl={selectedHuman.photo_url}
                      avatarConfig={selectedHuman.avatarConfig}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{selectedHuman.full_name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{selectedHuman.job_title}</div>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs border-t border-slate-200 dark:border-slate-800 pt-3">
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">نوع الشخصية</span>
                      <span className="font-medium">عضو افتراضي في الفريق</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">القسم</span>
                      <span className="font-medium">{selectedHuman.department_name || 'غير محدد'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">الحالة</span>
                      <StatusText status={selectedHuman.operationalStatus} />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">المهام المفتوحة</span>
                      <span className="font-mono tabular-nums">{selectedHuman.open_tasks ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">المقعد</span>
                      <span className="font-mono">{selectedHuman.worldPosition.stationCode}</span>
                    </div>
                  </div>
                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenEmployee(selectedHuman.id)}
                      className={`${PRIMARY_BTN} w-full`}
                    >
                      عرض ملف العضو
                    </button>
                    {selectedHuman.activeMeetingId && (
                      <button
                        type="button"
                        onClick={() => onOpenMeeting(selectedHuman.activeMeetingId)}
                        className={`${SECONDARY_BTN} w-full`}
                      >
                        فتح الاجتماع الجاري
                      </button>
                    )}
                  </div>
                </div>
              ) : selectedAgent ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-3">
                    <ActorAvatar
                      name={selectedAgent.name}
                      actorType="agent"
                      avatarConfig={selectedAgent.avatarConfig}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{selectedAgent.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{selectedAgent.job_title}</div>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs border-t border-slate-200 dark:border-slate-800 pt-3">
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">نوع الشخصية</span>
                      <span className="font-medium text-blue-700 dark:text-blue-400">وكيل ذكاء اصطناعي</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">القسم</span>
                      <span className="font-medium">{selectedAgent.department_name || 'العمليات'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">الحالة</span>
                      <StatusText status={selectedAgent.operationalStatus} />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">النموذج</span>
                      <span className="font-mono">{selectedAgent.model_identifier}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">المهام المفتوحة</span>
                      <span className="font-mono tabular-nums">{selectedAgent.open_tasks ?? 0}</span>
                    </div>
                    {selectedAgent.current_task_title && (
                      <div className="pt-1 text-slate-700 dark:text-slate-300">
                        <span className="text-slate-500 dark:text-slate-400 block">المهمة الحالية:</span>
                        <span className="font-medium">{selectedAgent.current_task_title}</span>
                      </div>
                    )}
                  </div>
                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenAgent(selectedAgent.id)}
                      className={`${PRIMARY_BTN} w-full`}
                    >
                      عرض ملف الوكيل
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePauseOrResumeAgent(selectedAgent.id, selectedAgent.status === 'paused')}
                      className={`${SECONDARY_BTN} w-full`}
                    >
                      {selectedAgent.status === 'paused' ? (
                        <>
                        <Play className="w-3.5 h-3.5" /> استئناف الوكيل
                        </>
                      ) : (
                        <>
                        <Pause className="w-3.5 h-3.5" /> إيقاف الوكيل مؤقتاً
                        </>
                      )}
                    </button>
                    {selectedAgent.activeMeetingId && (
                      <button
                        type="button"
                        onClick={() => onOpenMeeting(selectedAgent.activeMeetingId)}
                        className={`${SECONDARY_BTN} w-full`}
                      >
                        تفاصيل الاجتماع الجاري
                      </button>
                    )}
                  </div>
                </div>
              ) : selectedDept ? (
                <div className="space-y-3 text-xs">
                  <p className="text-slate-600 dark:text-slate-400">{selectedDept.description}</p>
                  <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-3">
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">مدير القسم</span>
                      <span className="font-medium">{selectedDept.manager_name || 'غير محدد'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">أعضاء الفريق</span>
                      <span className="font-mono tabular-nums">{selectedDept.employee_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">وكلاء الذكاء الاصطناعي</span>
                      <span className="font-mono tabular-nums">{selectedDept.agent_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">المهام النشطة</span>
                      <span className="font-mono tabular-nums">{selectedDept.active_tasks}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenDepartment(selectedDept.id)}
                    className={`${PRIMARY_BTN} w-full`}
                  >
                    دخول مساحة القسم
                  </button>
                </div>
              ) : selectedRoom ? (
                <div className="space-y-3 text-xs">
                  <p className="text-slate-600 dark:text-slate-400">{selectedRoom.description}</p>
                  <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-3">
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">السعة</span>
                      <span className="font-mono">{selectedRoom.capacity} مقاعد</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">حالة الغرفة</span>
                      <StatusText status={selectedRoom.activeMeeting ? 'in_meeting' : 'idle'} label={selectedRoom.activeMeeting ? 'اجتماع جارٍ' : 'متاحة'} />
                    </div>
                    {selectedRoom.activeMeeting && (
                      <div className="pt-1 font-medium text-indigo-700 dark:text-indigo-400">
                        الاجتماع الحالي: {selectedRoom.activeMeeting.title}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenMeeting(selectedRoom.activeMeeting?.id)}
                    className={`${PRIMARY_BTN} w-full`}
                  >
                    {selectedRoom.activeMeeting ? 'فتح الاجتماع الجاري' : 'بدء اجتماع في هذه الغرفة'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-400">
                  <p>اختر أحد أعضاء الفريق أو منطقة قسم أو غرفة اجتماعات لمعرفة بياناته.</p>
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1">
                    <div className="font-medium text-slate-800 dark:text-slate-200">انتقال سريع</div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <button type="button" onClick={() => setTab('orgchart')} className="text-blue-700 dark:text-blue-400 hover:underline">الهيكل الإداري</button>
                      <span>·</span>
                      <button type="button" onClick={() => onOpenMeeting()} className="text-blue-700 dark:text-blue-400 hover:underline">الاجتماعات</button>
                      <span>·</span>
                      <button type="button" onClick={() => onNavigate('content')} className="text-blue-700 dark:text-blue-400 hover:underline">استوديو المحتوى</button>
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Live Company Activity Feed */}
            <SectionCard
              title="نشاط مقر الشركة"
              description="حالة الفريق والاجتماعات المسجلة"
              noPadding
            >
              {hq.recentEvents.length === 0 ? (
                <div className="p-4 text-xs text-slate-500 dark:text-slate-400">
                  لا توجد أحداث مسجلة بعد. عند بدء اجتماع ستظهر حالة الحضور هنا.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[290px] overflow-y-auto">
                  {hq.recentEvents.slice(0, 12).map((ev) => (
                    <div key={ev.id} className="p-3 text-xs space-y-0.5">
                      <div className="text-slate-800 dark:text-slate-200 leading-snug">{ev.summary}</div>
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {ev.actor_label} · {formatDateTime(ev.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      )}

      {/* TAB 2: 2D OPERATIONAL FLOOR MAP */}
      {tab === 'floor2d' && hq && (
        <div className="space-y-5">
          <SectionCard
            title="غرف الاجتماعات"
            description="اختر غرفة لعرض الاجتماع الجاري أو بدء اجتماع داخلي وتحديد الحضور"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {hq.meetingRooms.map((room) => {
                const seated = actors3d.filter((a) => a.worldPosition.zoneId === room.id);
                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => onOpenMeeting(room.activeMeeting?.id)}
                    className="text-left p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 hover:border-blue-500 transition-colors space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{room.name}</span>
                      <StatusText
                        status={room.activeMeeting ? 'in_meeting' : 'idle'}
                        label={room.activeMeeting ? 'جارٍ' : 'متاحة'}
                      />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                      {room.activeMeeting ? `الاجتماع: ${room.activeMeeting.title}` : room.description}
                    </p>
                    {seated.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {seated.map((p) => (
                          <span key={p.id} className="text-[11px] font-mono text-indigo-700 dark:text-indigo-300">
                            {p.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            title="2D Operational Department Floor Plan"
            description="Every workstation maps to real human staff and AI agents with live backend status"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {hq.departments.map((dept) => {
                const deptHumans = hq.humans.filter((h) => h.department_id === dept.id);
                const deptAgents = hq.agents.filter((a) => a.department_id === dept.id);
                return (
                  <div
                    key={dept.id}
                    className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-white dark:bg-slate-900 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: dept.color_hex || '#2563eb' }}
                            aria-hidden="true"
                          />
                          <button
                            type="button"
                            onClick={() => onOpenDepartment(dept.id)}
                            className="font-semibold text-sm text-slate-900 dark:text-slate-100 hover:text-blue-700 dark:hover:text-blue-400 truncate"
                          >
                            {dept.name}
                          </button>
                        </div>
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400 shrink-0">
                          {dept.active_tasks} open
                        </span>
                      </div>

                      <div className="mt-3 space-y-2">
                        {deptHumans.map((h) => (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => onOpenEmployee(h.id)}
                            className="w-full flex items-center justify-between gap-2 p-2 rounded-md bg-slate-50 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <ActorAvatar name={h.full_name} actorType="human" photoUrl={h.photo_url} avatarConfig={h.avatarConfig} size="sm" />
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{h.full_name}</div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{h.job_title}</div>
                              </div>
                            </div>
                            <StatusText status={h.operationalStatus} />
                          </button>
                        ))}

                        {deptAgents.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => onOpenAgent(a.id)}
                            className="w-full flex items-center justify-between gap-2 p-2 rounded-md bg-slate-50 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-left"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <ActorAvatar name={a.name} actorType="agent" avatarConfig={a.avatarConfig} size="sm" />
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{a.name}</div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono">{a.model_identifier}</div>
                              </div>
                            </div>
                            <StatusText status={a.operationalStatus} />
                          </button>
                        ))}

                        {deptHumans.length === 0 && deptAgents.length === 0 && (
                          <div className="text-xs text-slate-400 dark:text-slate-500 py-2">
                            No members assigned to this studio zone yet.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">
                        Manager: {dept.manager_name || 'Unassigned'}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenDepartment(dept.id)}
                        className="font-medium text-blue-700 dark:text-blue-400 hover:underline"
                      >
                        Open Workspace
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      )}

      {/* TAB 3: INTERACTIVE ORGANIZATIONAL CHART */}
      {tab === 'orgchart' && hq && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="search"
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
                placeholder="Search employees, AI agents, job titles..."
                className={`${INPUT_CLASS} pl-9`}
              />
            </div>
            <select
              aria-label="Filter by member type"
              value={orgTypeFilter}
              onChange={(e) => setOrgTypeFilter(e.target.value as 'all' | 'human' | 'agent')}
              className={`${INPUT_CLASS} w-40`}
            >
              <option value="all">Humans & AI</option>
              <option value="human">Humans Only</option>
              <option value="agent">AI Agents Only</option>
            </select>
            <select
              aria-label="Filter by department"
              value={orgDeptFilter}
              onChange={(e) => setOrgDeptFilter(e.target.value)}
              className={`${INPUT_CLASS} w-52`}
            >
              <option value="">All Departments</option>
              {hq.departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Tier 1: Executive Leadership */}
          <SectionCard
            title="Executive Management"
            description="Company leadership and governance oversight"
          >
            {hq.orgChart.executives.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No executive personnel assigned yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {hq.orgChart.executives.map((exec) => (
                  <button
                    key={exec.id}
                    type="button"
                    onClick={() => onOpenEmployee(exec.id)}
                    className="flex items-center justify-between gap-3 p-3.5 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/30 hover:border-blue-500 text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ActorAvatar name={exec.name} actorType="human" size="md" />
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">{exec.name}</div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 truncate">{exec.jobTitle}</div>
                      </div>
                    </div>
                    <StatusText status={exec.operationalStatus} />
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Tier 2 & 3: Departments -> Managers -> Humans & AI Agents */}
          <div className="space-y-3">
            {hq.orgChart.departments
              .filter((b) => !orgDeptFilter || b.id === orgDeptFilter)
              .map((branch) => {
                const q = orgSearch.trim().toLowerCase();
                const visibleHumans =
                  orgTypeFilter === 'agent'
                    ? []
                    : branch.humans.filter(
                        (m) => !q || m.name.toLowerCase().includes(q) || m.jobTitle.toLowerCase().includes(q)
                      );
                const visibleAgents =
                  orgTypeFilter === 'human'
                    ? []
                    : branch.agents.filter(
                        (m) => !q || m.name.toLowerCase().includes(q) || m.jobTitle.toLowerCase().includes(q)
                      );

                if (q && visibleHumans.length === 0 && visibleAgents.length === 0 && !branch.name.toLowerCase().includes(q)) {
                  return null;
                }

                const isCollapsed = Boolean(collapsedDepts[branch.id]);

                return (
                  <div
                    key={branch.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
                  >
                    <div className="px-4 py-3 flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedDepts((prev) => ({ ...prev, [branch.id]: !prev[branch.id] }))
                          }
                          aria-label={isCollapsed ? `Expand ${branch.name}` : `Collapse ${branch.name}`}
                          className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                        >
                          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: branch.colorHex }}
                        />
                        <button
                          type="button"
                          onClick={() => onOpenDepartment(branch.id)}
                          className="font-semibold text-sm text-slate-900 dark:text-slate-100 hover:text-blue-700 dark:hover:text-blue-400 truncate"
                        >
                          {branch.name}
                        </button>
                        <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
                          · Manager: {branch.manager?.name || 'Unassigned'}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-mono text-slate-600 dark:text-slate-400 shrink-0">
                        <span>{branch.humans.length} Human</span>
                        <span>{branch.agents.length} AI</span>
                        <span>{branch.totalOpenTasks} Open Tasks</span>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {visibleHumans.map((h) => (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => onOpenEmployee(h.id)}
                            className="flex items-center justify-between gap-3 p-3 rounded-md border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-left"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <ActorAvatar name={h.name} actorType="human" size="sm" />
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{h.name}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                  Human · {h.jobTitle}
                                </div>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <StatusText status={h.operationalStatus} />
                              <div className="text-[11px] font-mono text-slate-500 mt-0.5">{h.openTasks} tasks</div>
                            </div>
                          </button>
                        ))}

                        {visibleAgents.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => onOpenAgent(a.id)}
                            className="flex items-center justify-between gap-3 p-3 rounded-md border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-left"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <ActorAvatar name={a.name} actorType="agent" size="sm" />
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{a.name}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                  AI · {a.jobTitle}
                                </div>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <StatusText status={a.operationalStatus} />
                              <div className="text-[11px] font-mono text-slate-500 mt-0.5">{a.openTasks} tasks</div>
                            </div>
                          </button>
                        ))}

                        {visibleHumans.length === 0 && visibleAgents.length === 0 && (
                          <div className="text-xs text-slate-400 dark:text-slate-500 py-1 col-span-full">
                            No members match current filter in this department.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* TAB 4: DEPARTMENT DIRECTORY */}
      {tab === 'directory' && hq && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {hq.departments.map((d) => (
            <div
              key={d.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between gap-4 hover:border-blue-500 transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: d.color_hex || '#2563eb' }}
                    />
                    <h3 className="font-semibold text-base text-slate-900 dark:text-slate-100">{d.name}</h3>
                  </div>
                  <StatusText status={d.status || 'active'} />
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{d.description}</p>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Humans</div>
                    <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{d.employee_count}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">AI Agents</div>
                    <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{d.agent_count}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Tasks (Open/Done)</div>
                    <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {d.active_tasks}/{d.completed_tasks}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    Lead: {d.manager_name || 'Unassigned'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenDepartment(d.id)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline shrink-0"
                  >
                    Workspace <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={deptModalOpen} title="Add Department" onClose={() => setDeptModalOpen(false)}>
        <form onSubmit={handleCreateDept} className="space-y-4">
          <FormField label="Department Name" htmlFor="hq-new-dept-name" required>
            <input
              id="hq-new-dept-name"
              required
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              className={INPUT_CLASS}
              placeholder="e.g., Paid Media & Growth"
            />
          </FormField>
          <FormField label="Mandate / Description" htmlFor="hq-new-dept-desc">
            <textarea
              id="hq-new-dept-desc"
              rows={3}
              value={newDeptDesc}
              onChange={(e) => setNewDeptDesc(e.target.value)}
              className={INPUT_CLASS}
              placeholder="Core responsibilities and deliverables for this department."
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => setDeptModalOpen(false)} className={SECONDARY_BTN}>
              Cancel
            </button>
            <button type="submit" className={PRIMARY_BTN}>
              Create Department
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function DepartmentWorkspaceView({
  departmentId,
  onBack,
  onOpenEmployee,
  onOpenAgent,
  onOpenMeeting,
  onNavigate,
}: {
  departmentId: string;
  onBack: () => void;
  onOpenEmployee: (id: string) => void;
  onOpenAgent: (id: string) => void;
  onOpenMeeting: (id?: string) => void;
  onNavigate: (route: string) => void;
}) {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [allEmployees, setAllEmployees] = useState<Array<Record<string, any>>>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '', leadEmployeeId: '', status: 'active', colorHex: '#2563eb' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ws, emps] = await Promise.all([
        apiRequest<Record<string, any>>(`/departments/${departmentId}/workspace`),
        apiRequest<{ employees: Array<Record<string, any>> }>('/employees'),
      ]);
      setData(ws);
      setAllEmployees(emps.employees);
      const d = ws.department;
      setEditForm({
        name: d.name || '',
        description: d.description || '',
        leadEmployeeId: d.lead_employee_id || '',
        status: d.status || 'active',
        colorHex: d.color_hex || '#2563eb',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load department workspace.');
    }
  }, [departmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest(`/departments/${departmentId}`, {
        method: 'PATCH',
        body: {
          name: editForm.name,
          description: editForm.description,
          leadEmployeeId: editForm.leadEmployeeId || null,
          status: editForm.status,
          colorHex: editForm.colorHex,
        },
      });
      setEditOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update department.');
    }
  };

  if (!data) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className={SECONDARY_BTN}>
          <ArrowLeft className="w-4 h-4" /> Back to Headquarters
        </button>
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        <div className="h-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  const dept = data.department;
  const humans = (data.humans ?? []) as Array<Record<string, any>>;
  const agents = (data.agents ?? []) as Array<Record<string, any>>;
  const tasks = (data.tasks ?? []) as Array<Record<string, any>>;
  const events = (data.events ?? []) as Array<Record<string, any>>;
  const meetings = (data.meetings ?? []) as Array<Record<string, any>>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={dept.name}
        subtitle={`${dept.description || 'Operational department workspace'} · Lead: ${dept.manager_name || 'Unassigned'}`}
        actions={
          <>
            <button type="button" onClick={onBack} className={SECONDARY_BTN}>
              <ArrowLeft className="w-4 h-4" /> Back to HQ
            </button>
            <button type="button" onClick={() => setEditOpen(true)} className={SECONDARY_BTN}>
              <Edit3 className="w-4 h-4" /> Edit Department
            </button>
            <button type="button" onClick={() => onNavigate('tasks')} className={PRIMARY_BTN}>
              Task Center
            </button>
          </>
        }
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Human Members" value={humans.length} meta="Assigned staff" />
        <StatTile label="AI Employees" value={agents.length} meta="Specialized department agents" />
        <StatTile
          label="Open Work Queue"
          value={tasks.filter((t) => !['completed', 'cancelled'].includes(t.status)).length}
          meta={`${tasks.filter((t) => t.status === 'completed').length} completed`}
        />
        <StatTile label="Department Meetings" value={meetings.length} meta="Recorded sessions" onClick={() => onOpenMeeting()} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title={`Human Team (${humans.length})`}>
          {humans.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">No human employees assigned to this department yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {humans.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => onOpenEmployee(h.id)}
                  className="w-full py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded px-2 -mx-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ActorAvatar name={h.full_name} actorType="human" photoUrl={h.photo_url} size="sm" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{h.full_name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{h.job_title}</div>
                    </div>
                  </div>
                  <StatusText status={h.employment_status} />
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title={`AI Employees (${agents.length})`}>
          {agents.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">No AI agents assigned to this department yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {agents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onOpenAgent(a.id)}
                  className="w-full py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded px-2 -mx-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ActorAvatar name={a.name} actorType="agent" size="sm" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{a.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">{a.model_identifier} · {a.open_tasks} open tasks</div>
                    </div>
                  </div>
                  <StatusText status={a.status} />
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SectionCard title={`Department Work Queue (${tasks.length})`} noPadding>
            {tasks.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No tasks assigned to this department yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {tasks.map((t) => (
                  <div key={t.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{t.title}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {t.client_name || 'Internal'} · {t.agent_name || 'Human owner'} · Due {formatShortDate(t.due_date)}
                      </div>
                    </div>
                    <StatusText status={t.status} />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Department Activity" noPadding>
          {events.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">No department events recorded yet.</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {events.map((ev) => (
                <div key={ev.id} className="p-3.5 space-y-0.5">
                  <div className="text-slate-800 dark:text-slate-200">{ev.summary}</div>
                  <div className="font-mono text-slate-400">{formatDateTime(ev.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <Modal open={editOpen} title="Edit Department" onClose={() => setEditOpen(false)}>
        <form onSubmit={handleSave} className="space-y-4">
          <FormField label="Department Name" htmlFor="ed-d-name" required>
            <input id="ed-d-name" required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={INPUT_CLASS} />
          </FormField>
          <FormField label="Description" htmlFor="ed-d-desc">
            <textarea id="ed-d-desc" rows={3} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className={INPUT_CLASS} />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Department Manager" htmlFor="ed-d-mgr">
              <select id="ed-d-mgr" value={editForm.leadEmployeeId} onChange={(e) => setEditForm({ ...editForm, leadEmployeeId: e.target.value })} className={INPUT_CLASS}>
                <option value="">Unassigned</option>
                {allEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Status" htmlFor="ed-d-st">
              <select id="ed-d-st" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className={INPUT_CLASS}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </FormField>
            <FormField label="Zone Color" htmlFor="ed-d-col">
              <input id="ed-d-col" type="color" value={editForm.colorHex} onChange={(e) => setEditForm({ ...editForm, colorHex: e.target.value })} className="h-9 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-1" />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={() => setEditOpen(false)} className={SECONDARY_BTN}>Cancel</button>
            <button type="submit" className={PRIMARY_BTN}>Save Changes</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
