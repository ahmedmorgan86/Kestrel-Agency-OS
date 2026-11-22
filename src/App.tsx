import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  BookOpenCheck,
  Bot,
  Briefcase,
  Building2,
  Calendar,
  CheckSquare,
  ChevronDown,
  Compass,
  DollarSign,
  FileCheck2,
  FolderKanban,
  HardDrive,
  History,
  KeyRound,
  Layers,
  LayoutDashboard,
  Link2,
  LogOut,
  Megaphone,
  Menu,
  Moon,
  Network,
  Palette,
  PenTool,
  Plus,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Sun,
  UserCheck,
  Users,
  Video,
  X,
} from 'lucide-react';
import { apiRequest, setStoredToken } from './lib/api';
import { ApiError } from './lib/api';
import { useThemeAndBrand } from './context/ThemeAndBrandContext';
import { BrandLockup } from './components/BrandMark';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { AuthScreen, type AuthUser } from './views/AuthScreen';
import { DashboardView, NotificationsView, TaskCenterView } from './views/DashboardAndCommand';
import { AcademyView } from './views/AcademyView';
import { FounderCommandView } from './views/FounderCommandView';
import {
  BrandProfilesView,
  ClientsCrmView,
  ProjectsAndCampaignsView,
  ResearchIntelligenceView,
} from './views/ClientsAndStrategy';
import {
  AssetLibraryView,
  PublishingCenterView,
} from './views/StudioAndGovernance';
import { ApprovalCenterView, ContentStudioView } from './views/ContentAndApproval';
import {
  AgentWorkforceView,
  AnalyticsView,
  ExecutionHistoryView,
  FinancialManagementView,
} from './views/AgentsAndOps';
import {
  AuditAndHealthView,
  CompanyAndDepartmentsView,
  EmployeesAndRolesView,
  IntegrationsView,
} from './views/OrgAndSystem';
import { DepartmentWorkspaceView, VirtualHqView } from './views/VirtualHqView';
import { MeetingsView } from './views/MeetingsView';
import { AiAgentProfileView, MyWorkspaceView } from './views/ProfilesAndWorkspace';
import { EmployeeSummaryView as HumanEmployeeProfileView } from './views/EmployeeSummaryView';

interface NavGroup {
  label: string;
  items: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }> }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'الشركة والقيادة',
    items: [
      { id: 'hq', label: 'مقر الشركة ثلاثي الأبعاد', icon: Building2 },
      { id: 'chairman', label: 'لوحة المالك', icon: ShieldAlert },
      { id: 'meetings', label: 'الاجتماعات', icon: Video },
      { id: 'employees', label: 'فريق العمل', icon: Users },
      { id: 'orgchart', label: 'الهيكل الإداري', icon: Network },
    ],
  },
  {
    label: 'إنتاج المحتوى',
    items: [
      { id: 'content', label: 'استوديو المحتوى', icon: PenTool },
      { id: 'calendar', label: 'تقويم المحتوى', icon: Calendar },
      { id: 'approvals', label: 'موافقتي قبل النشر', icon: FileCheck2 },
    ],
  },
  {
    label: 'التدريب والتطوير',
    items: [
      { id: 'academy', label: 'أكاديمية مورغان', icon: BookOpenCheck },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

type ActiveDetail =
  | { kind: 'employee'; id: string; returnRoute: string }
  | { kind: 'agent'; id: string; returnRoute: string }
  | { kind: 'department'; id: string; returnRoute: string };

export default function App() {
  const { theme, toggleTheme, brand, updateBrandFromOrg } = useThemeAndBrand();
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [route, setRoute] = useState('hq');
  const [activeDetail, setActiveDetail] = useState<ActiveDetail | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const quickCreateRef = useRef<HTMLDivElement | null>(null);

  const loadOrganizationBrand = useCallback(async () => {
    try {
      const res = await apiRequest<{ organization?: Record<string, unknown> }>('/organization');
      if (res.organization) {
        updateBrandFromOrg(res.organization);
      }
    } catch {
      // ignore brand hydration errors before auth
    }
  }, [updateBrandFromOrg]);

  const checkAuth = useCallback(async () => {
    setAuthLoading(true);
    try {
      const res = await apiRequest<{ initialized: boolean; authenticated: boolean; user: AuthUser | null }>(
        '/auth/status'
      );
      setInitialized(res.initialized);
      setUser(res.authenticated ? res.user : null);
      if (res.authenticated) {
        void loadOrganizationBrand();
      }
    } catch {
      setUser(null);
      setAuthError('بيانات الشركة غير متاحة في هذا النشر حتى يتم ربط قاعدة بيانات تشغيلية.');
    } finally {
      setAuthLoading(false);
    }
  }, [loadOrganizationBrand]);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!quickCreateOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (quickCreateRef.current && !quickCreateRef.current.contains(e.target as Node)) {
        setQuickCreateOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [quickCreateOpen]);

  const handleLogout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // ignore logout error
    }
    setStoredToken(null);
    setUser(null);
    setActiveDetail(null);
    setSelectedMeetingId(null);
    setInitialized(true);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-sm text-slate-600 dark:text-slate-400">
        Loading {brand.name}...
      </div>
    );
  }

  if (!user) {
    if (authError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 flex items-center justify-center">
          <div className="w-full max-w-lg rounded-xl border border-amber-200 bg-white p-8 shadow-sm dark:border-amber-900 dark:bg-slate-900">
            <BrandLockup name={brand.name} tagline={brand.tagline} symbol={brand.symbol} primaryColor={brand.primaryColor} variant="lockup" />
            <h1 className="mt-6 text-2xl font-semibold text-slate-900 dark:text-white">الموقع معروض، لكن النظام غير متصل بعد</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{authError}</p>
            <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">هذه نسخة واجهة منشورة للفحص. سجلات الموظفين والعمليات وتسجيل الدخول لن تعمل حتى ربط قاعدة بيانات مستقلة وآمنة.</p>
          </div>
        </div>
      );
    }
    return (
      <AuthScreen
        initialized={initialized}
        onAuthenticated={(u) => {
          setUser(u);
          setInitialized(true);
          setRoute('hq');
          void loadOrganizationBrand();
        }}
      />
    );
  }

  const navigate = (nextRoute: string) => {
    setRoute(nextRoute);
    setActiveDetail(null);
    if (nextRoute !== 'meetings') {
      setSelectedMeetingId(null);
    }
    setMobileMenuOpen(false);
    setQuickCreateOpen(false);
  };

  const openEmployee = (employeeId: string) => {
    setActiveDetail({ kind: 'employee', id: employeeId, returnRoute: route });
    setMobileMenuOpen(false);
  };

  const openAgent = (agentId: string) => {
    setActiveDetail({ kind: 'agent', id: agentId, returnRoute: route });
    setMobileMenuOpen(false);
  };

  const openDepartment = (departmentId: string) => {
    setActiveDetail({ kind: 'department', id: departmentId, returnRoute: route });
    setMobileMenuOpen(false);
  };

  const openMeeting = (meetingId?: string) => {
    setActiveDetail(null);
    setSelectedMeetingId(meetingId ?? null);
    setRoute('meetings');
    setMobileMenuOpen(false);
  };

  const activeNav = ALL_ITEMS.find((i) => i.id === route) ?? ALL_ITEMS[0];

  const detailBreadcrumb = activeDetail
    ? activeDetail.kind === 'employee'
      ? 'ملف الموظف'
      : activeDetail.kind === 'agent'
      ? 'ملف وكيل الذكاء الاصطناعي'
      : 'مساحة القسم'
    : null;

  const renderView = () => {
    if (activeDetail) {
      if (activeDetail.kind === 'employee') {
        return (
          <HumanEmployeeProfileView
            employeeId={activeDetail.id}
            onBack={() => setActiveDetail(null)}
          />
        );
      }
      if (activeDetail.kind === 'agent') {
        return (
          <AiAgentProfileView
            agentId={activeDetail.id}
            onBack={() => setActiveDetail(null)}
            onOpenDepartment={openDepartment}
            onOpenEmployee={openEmployee}
          />
        );
      }
      if (activeDetail.kind === 'department') {
        return (
          <DepartmentWorkspaceView
            departmentId={activeDetail.id}
            onBack={() => setActiveDetail(null)}
            onOpenEmployee={openEmployee}
            onOpenAgent={openAgent}
            onOpenMeeting={openMeeting}
            onNavigate={navigate}
          />
        );
      }
    }

    switch (route) {
      case 'chairman':
        return <FounderCommandView onNavigate={navigate} />;
      case 'academy':
        return <AcademyView />;
      case 'hq':
        return (
          <VirtualHqView
            key="hq-3d"
            initialTab="hq3d"
            onOpenEmployee={openEmployee}
            onOpenAgent={openAgent}
            onOpenDepartment={openDepartment}
            onOpenMeeting={openMeeting}
            onNavigate={navigate}
          />
        );
      case 'orgchart':
        return (
          <VirtualHqView
            key="hq-orgchart"
            initialTab="orgchart"
            onOpenEmployee={openEmployee}
            onOpenAgent={openAgent}
            onOpenDepartment={openDepartment}
            onOpenMeeting={openMeeting}
            onNavigate={navigate}
          />
        );
      case 'workspace':
        return (
          <MyWorkspaceView
            onNavigate={navigate}
            onOpenMeeting={openMeeting}
            onOpenEmployee={openEmployee}
          />
        );
      case 'meetings':
        return (
          <MeetingsView
            key={selectedMeetingId || 'meetings-list'}
            initialMeetingId={selectedMeetingId}
            onNavigate={navigate}
          />
        );
      case 'dashboard':
        return (
          <DashboardView
            onNavigate={navigate}
            onOpenAgent={openAgent}
            onOpenMeeting={openMeeting}
          />
        );
      case 'tasks':
        return <TaskCenterView />;
      case 'notifications':
        return <NotificationsView />;
      case 'clients':
        return <ClientsCrmView />;
      case 'brands':
        return <BrandProfilesView />;
      case 'projects':
        return <ProjectsAndCampaignsView mode="projects" />;
      case 'campaigns':
        return <ProjectsAndCampaignsView mode="campaigns" />;
      case 'trends':
        return <ResearchIntelligenceView mode="trends" />;
      case 'competitors':
        return <ResearchIntelligenceView mode="competitors" />;
      case 'content':
        return <ContentStudioView />;
      case 'calendar':
        return <ContentStudioView calendarOnly />;
      case 'approvals':
        return <ApprovalCenterView />;
      case 'assets':
        return <AssetLibraryView />;
      case 'publishing':
        return <PublishingCenterView />;
      case 'agents':
        return <AgentWorkforceView onOpenAgent={openAgent} />;
      case 'executions':
        return <ExecutionHistoryView />;
      case 'analytics':
        return <AnalyticsView />;
      case 'finance':
        return <FinancialManagementView />;
      case 'company':
        return (
          <CompanyAndDepartmentsView
            mode="company"
            onOpenDepartment={openDepartment}
          />
        );
      case 'departments':
        return (
          <CompanyAndDepartmentsView
            mode="departments"
            onOpenDepartment={openDepartment}
          />
        );
      case 'employees':
        return <VirtualHqView key="hq-directory" initialTab="directory" onOpenEmployee={openEmployee} onOpenAgent={openAgent} onOpenDepartment={openDepartment} onOpenMeeting={openMeeting} onNavigate={navigate} />;
      case 'roles':
        return <EmployeesAndRolesView mode="roles" />;
      case 'integrations':
        return <IntegrationsView />;
      case 'audit':
        return <AuditAndHealthView mode="audit" />;
      case 'health':
        return <AuditAndHealthView mode="health" />;
      case 'settings':
        return <CompanyAndDepartmentsView mode="settings" />;
      default:
        return (
          <VirtualHqView
            initialTab="hq3d"
            onOpenEmployee={openEmployee}
            onOpenAgent={openAgent}
            onOpenDepartment={openDepartment}
            onOpenMeeting={openMeeting}
            onNavigate={navigate}
          />
        );
    }
  };

  const initials = user.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const sidebarContent = (
      <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
      <div className="h-14 px-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={() => navigate('hq')}
          className="text-left min-w-0 focus:outline-none"
        >
          <BrandLockup
            name={brand.name}
            tagline={brand.tagline}
            symbol={brand.symbol}
            primaryColor={brand.primaryColor}
            variant="compact"
          />
        </button>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="إغلاق قائمة التنقل"
          className="lg:hidden p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav aria-label="التنقل الرئيسي" className="flex-1 overflow-y-auto py-3 px-2.5 space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = !activeDetail && route === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-200 dark:border-slate-800 shrink-0 space-y-2.5">
        <button
          type="button"
          onClick={() => navigate('workspace')}
          className="w-full flex items-center gap-2.5 rounded-md p-1.5 -m-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
        >
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-semibold text-white shrink-0"
            style={{ backgroundColor: brand.primaryColor }}
          >
            {initials || 'OP'}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
              {user.fullName}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {user.email}
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
          تسجيل الخروج
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-60 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="w-64 max-w-[85vw] h-full">{sidebarContent}</div>
          <button
            type="button"
              aria-label="إغلاق خلفية القائمة"
            className="flex-1 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="فتح قائمة التنقل"
              className="lg:hidden p-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-md"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => navigate('hq')}
                className="hidden sm:inline hover:text-slate-900 dark:hover:text-slate-100 truncate"
              >
                {brand.name}
              </button>
              <span className="hidden sm:inline text-slate-300 dark:text-slate-600">/</span>
              <button
                type="button"
                onClick={() => setActiveDetail(null)}
                className={`truncate ${
                  detailBreadcrumb
                    ? 'hover:text-slate-900 dark:hover:text-slate-100'
                    : 'font-medium text-slate-900 dark:text-slate-100'
                }`}
              >
                {activeNav.label}
              </button>
              {detailBreadcrumb && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">/</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                    {detailBreadcrumb}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="البحث في مساحة العمل"
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Search className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden md:inline">ابحث في مساحة العمل...</span>
              <kbd className="hidden md:inline-block rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-1 py-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                ⌘K
              </kbd>
            </button>

            <div className="relative" ref={quickCreateRef}>
              <button
                type="button"
                onClick={() => setQuickCreateOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">إنشاء سريع</span>
                <ChevronDown className="w-3 h-3" aria-hidden="true" />
              </button>
              {quickCreateOpen && (
                <div className="absolute right-0 mt-1.5 w-52 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 z-50">
                  {[
                    { label: 'اجتماع جديد', route: 'meetings', icon: Video },
                    { label: 'مسودة محتوى جديدة', route: 'content', icon: PenTool },
                  ].map((act) => {
                    const ActIcon = act.icon;
                    return (
                      <button
                        key={act.route}
                        type="button"
                        onClick={() => navigate(act.route)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
                      >
                        <ActIcon className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                        {act.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => navigate('approvals')}
              className="hidden xl:inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
              موافقتي للنشر
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'التبديل إلى المظهر الفاتح' : 'التبديل إلى المظهر الداكن'}
              title={theme === 'dark' ? 'المظهر الفاتح' : 'المظهر الداكن'}
              className="inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1480px] w-full mx-auto">
          {renderView()}
        </main>
      </div>

      <GlobalSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectResult={(result) => {
          setSearchOpen(false);
          if (result.type === 'employee' && result.entityId) {
            openEmployee(result.entityId);
          } else if (result.type === 'agent' && result.entityId) {
            openAgent(result.entityId);
          } else if (result.type === 'department' && result.entityId) {
            openDepartment(result.entityId);
          } else if (result.type === 'meeting' && result.entityId) {
            openMeeting(result.entityId);
          } else {
            navigate(result.route || 'dashboard');
          }
        }}
      />
    </div>
  );
}
