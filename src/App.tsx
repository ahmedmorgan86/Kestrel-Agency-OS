import React, { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  Briefcase,
  Building2,
  Calendar,
  CheckSquare,
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
  Palette,
  PenTool,
  Send,
  Settings,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import { apiRequest, setStoredToken } from './lib/api';
import { AuthScreen, type AuthUser } from './views/AuthScreen';
import { DashboardView, NotificationsView, TaskCenterView } from './views/DashboardAndCommand';
import {
  BrandProfilesView,
  ClientsCrmView,
  ProjectsAndCampaignsView,
  ResearchIntelligenceView,
} from './views/ClientsAndStrategy';
import {
  ApprovalCenterView,
  AssetLibraryView,
  ContentStudioView,
  PublishingCenterView,
} from './views/StudioAndGovernance';
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

interface NavGroup {
  label: string;
  items: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }> }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Command',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'tasks', label: 'Task Center', icon: CheckSquare },
      { id: 'notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    label: 'Clients & Strategy',
    items: [
      { id: 'clients', label: 'Client CRM', icon: Briefcase },
      { id: 'brands', label: 'Brand Profiles', icon: Palette },
      { id: 'projects', label: 'Projects', icon: FolderKanban },
      { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
      { id: 'trends', label: 'Trend Intelligence', icon: Compass },
      { id: 'competitors', label: 'Competitor Research', icon: Layers },
    ],
  },
  {
    label: 'Production & Governance',
    items: [
      { id: 'content', label: 'Content Studio', icon: PenTool },
      { id: 'calendar', label: 'Content Calendar', icon: Calendar },
      { id: 'approvals', label: 'Approval Center', icon: FileCheck2 },
      { id: 'assets', label: 'Asset Library', icon: HardDrive },
      { id: 'publishing', label: 'Publishing Center', icon: Send },
    ],
  },
  {
    label: 'AI Workforce',
    items: [
      { id: 'agents', label: 'AI Agent Center', icon: Bot },
      { id: 'executions', label: 'Execution History', icon: History },
    ],
  },
  {
    label: 'Analytics & Finance',
    items: [
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
      { id: 'finance', label: 'Financial Management', icon: DollarSign },
    ],
  },
  {
    label: 'Organization & System',
    items: [
      { id: 'company', label: 'Company Overview', icon: Building2 },
      { id: 'departments', label: 'Departments', icon: Layers },
      { id: 'employees', label: 'Employees', icon: Users },
      { id: 'roles', label: 'Roles & Permissions', icon: KeyRound },
      { id: 'integrations', label: 'Integrations', icon: Link2 },
      { id: 'audit', label: 'Audit Logs', icon: ShieldAlert },
      { id: 'health', label: 'System Health', icon: Activity },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [route, setRoute] = useState('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const checkAuth = useCallback(async () => {
    setAuthLoading(true);
    try {
      const res = await apiRequest<{ initialized: boolean; authenticated: boolean; user: AuthUser | null }>(
        '/auth/status'
      );
      setInitialized(res.initialized);
      setUser(res.authenticated ? res.user : null);
    } catch {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  const handleLogout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // ignore logout error
    }
    setStoredToken(null);
    setUser(null);
    setInitialized(true);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">
        Loading Kestrel Agency OS...
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        initialized={initialized}
        onAuthenticated={(u) => {
          setUser(u);
          setInitialized(true);
          setRoute('dashboard');
        }}
      />
    );
  }

  const activeNav = ALL_ITEMS.find((i) => i.id === route) ?? ALL_ITEMS[0];

  const navigate = (nextRoute: string) => {
    setRoute(nextRoute);
    setMobileMenuOpen(false);
  };

  const renderView = () => {
    switch (route) {
      case 'dashboard':
        return <DashboardView onNavigate={navigate} />;
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
        return <AgentWorkforceView />;
      case 'executions':
        return <ExecutionHistoryView />;
      case 'analytics':
        return <AnalyticsView />;
      case 'finance':
        return <FinancialManagementView />;
      case 'company':
        return <CompanyAndDepartmentsView mode="company" />;
      case 'departments':
        return <CompanyAndDepartmentsView mode="departments" />;
      case 'employees':
        return <EmployeesAndRolesView mode="employees" />;
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
        return <DashboardView onNavigate={navigate} />;
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between shrink-0">
        <span className="text-base font-bold tracking-tight text-slate-900 font-[var(--font-display)] whitespace-nowrap">
          Kestrel Agency OS
        </span>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation menu"
          className="lg:hidden p-1 text-slate-500 hover:text-slate-900"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav aria-label="Primary workspace navigation" className="flex-1 overflow-y-auto py-3 px-2.5 space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-2.5 pb-1.5 text-[11px] font-semibold text-slate-400">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = route === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-blue-50 text-blue-800'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
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

      <div className="p-3 border-t border-slate-200 shrink-0">
        <div className="text-xs font-medium text-slate-900 truncate">{user.fullName}</div>
        <div className="text-[11px] text-slate-500 truncate">{user.email}</div>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
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
            aria-label="Dismiss navigation backdrop"
            className="flex-1 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-md"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm text-slate-500 truncate">
              <span className="hidden sm:inline">Agency OS</span>
              <span className="hidden sm:inline mx-2 text-slate-300">/</span>
              <span className="font-medium text-slate-900">{activeNav.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => navigate('approvals')}
              className="hidden sm:inline-flex text-xs font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap shrink-0"
            >
              Approvals
            </button>
            <button
              type="button"
              onClick={() => navigate('content')}
              className="rounded-md bg-blue-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
            >
              Content Studio
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {renderView()}
        </main>
      </div>
    </div>
  );
}
