import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { MORGAN_VIRTUAL_ROSTER } from '../../shared/virtualRoster.js';
import { getDefaultDepartmentColor } from '../../src/domain/hq';
import { nowIso } from './database';
import { ALL_PERMISSIONS, SYSTEM_ROLE_PERMISSIONS } from '../../src/domain/rbac';

export const DEFAULT_ORG_ID = 'org_kestrel_agency';

const DEPARTMENTS = [
  { code: 'executive', name: 'الإدارة العليا', description: 'قيادة الشركة وتنسيق العمل واتخاذ القرارات.' },
  { code: 'strategy_research', name: 'الاستراتيجية والتحرير', description: 'تخطيط المنصات والجمهور والاتجاهات وجدول المحتوى.' },
  { code: 'social_media_mgmt', name: 'فريق الذكاء الاصطناعي', description: 'إعداد الوكلاء والموجّهات وأتمتة سير العمل.' },
  { code: 'content_planning', name: 'الأكاديمية الداخلية', description: 'التدريب وتوثيق المعرفة وتطوير مهارات الفريق.' },
  { code: 'content_copywriting', name: 'الكتابة والتحرير', description: 'كتابة النصوص والسيناريوهات والتدقيق اللغوي.' },
  { code: 'creative_direction', name: 'الإبداع والتوجيه الفني', description: 'تطوير الأفكار الإبداعية وتوجيه الإنتاج البصري.' },
  { code: 'graphic_design', name: 'التصميم والأصول البصرية', description: 'تصميم المواد وإدارة الصور والهوية البصرية.' },
  { code: 'video_production', name: 'الإنتاج المرئي والصوتي', description: 'إخراج الفيديو والتحريك والمونتاج والصوت.' },
  { code: 'quality_assurance', name: 'الجودة والموافقات', description: 'مراجعة المحتوى والسياسات وتوثيق قرارات الموافقة.' },
  { code: 'client_success', name: 'المجتمع والتفاعل', description: 'متابعة تفاعل الجمهور وتجميع الملاحظات.' },
  { code: 'publishing_distribution', name: 'جاهزية النشر', description: 'تجهيز النسخ والقنوات للنشر بعد موافقة المالك.' },
  { code: 'analytics_reporting', name: 'تحليل أداء المحتوى', description: 'قراءة نتائج المحتوى الفعلية وتلخيص ما تثبته البيانات.' },
  { code: 'finance_operations', name: 'مكتبة الأصول والتشغيل', description: 'تنظيم ملفات الإنتاج وحفظها ومتابعة جاهزيتها.' },
] as const;

const LEGACY_DEPARTMENT_LABELS: Record<string, string[]> = {
  executive: ['Executive Leadership', 'Executive Management'],
  strategy_research: ['Research and Intelligence', 'Strategy and Research'],
  social_media_mgmt: ['Digital Products and Platforms', 'Social Media Management'],
  content_planning: ['Product Management', 'Content Planning'],
  content_copywriting: ['Product Writing and Documentation', 'Content and Copywriting'],
  creative_direction: ['Experience Design', 'Creative Direction'],
  graphic_design: ['Visual and Brand Design', 'Graphic Design'],
  video_production: ['Media and Prototyping Lab', 'Video Production'],
  quality_assurance: ['Quality Engineering', 'Quality Assurance'],
  client_success: ['Customer Success', 'Client Success'],
  publishing_distribution: ['Launch and Communications', 'Publishing and Distribution'],
  analytics_reporting: ['Data and Analytics', 'Analytics and Reporting'],
  finance_operations: ['Finance and Business Operations', 'Finance and Operations'],
};

// These are intentionally fictional, login-free employees for the virtual company simulation.
// Reserved .example addresses and zero cost values prevent contact or payroll data from being implied.
interface VirtualEmployeeSeed {
  name: string;
  department: string;
  title: string;
  managerOrdinal: number;
  responsibilities: string[];
  appearance: { skin: string; hair: string; clothing: string; build: string; distinction: string };
}

const VIRTUAL_EMPLOYEES: VirtualEmployeeSeed[] = MORGAN_VIRTUAL_ROSTER;

const ACADEMY_COURSES = [
  { code: 'company-foundations', title: 'أساسيات MORGAN GROUP', description: 'هدف الشركة ومبادئ العمل والصلاحيات وكيفية التعاون بين الفرق.', lessons: ['هدف الشركة ومبادئها', 'تعاون الأقسام', 'صلاحيات القرار والتصعيد'] },
  { code: 'ai-collaboration', title: 'التعاون مع وكلاء الذكاء الاصطناعي', description: 'دليل عملي لقدرات الوكلاء وتفويض المهام بأمان ومراجعة المخرجات.', lessons: ['ما يستطيع الوكيل فعله وما لا يستطيع', 'صياغة تكليف واضح', 'مراجعة مخرجات الذكاء الاصطناعي'] },
  { code: 'security-and-trust', title: 'الأمان والخصوصية والثقة', description: 'ممارسات يومية لحماية بيانات الشركة ووسائل الدخول والملفات.', lessons: ['التعرف على البيانات الحساسة', 'إدارة الوصول والأسرار', 'الإبلاغ عن الحوادث'] },
  { code: 'leadership-and-craft', title: 'القيادة وإتقان العمل', description: 'تواصل واضح وملاحظات بناءة وعادات عمل تساعد الفريق على التطور.', lessons: ['الكتابة والتواصل بوضوح', 'تقديم الملاحظات وتلقيها', 'التعلم والتحسين المستمر'] },
];

const MEETING_ROOMS = [
  {
    id: 'room_executive_boardroom', code: 'exec_boardroom', name: 'اجتماع التخطيط الأسبوعي',
    roomType: 'executive', capacity: 8, description: 'تخطيط أولويات الأسبوع وتوزيع العمل على الأقسام.', colorHex: '#334155',
  },
  {
    id: 'room_strategy_war_room', code: 'strategy_war_room', name: 'الاجتماع التحريري اليومي',
    roomType: 'department', capacity: 8, description: 'مراجعة أفكار اليوم والاتجاهات والتقويم التحريري.', colorHex: '#1e3a8a',
  },
  {
    id: 'room_creative_studio', code: 'creative_studio', name: 'المراجعة الإبداعية',
    roomType: 'department', capacity: 6, description: 'مراجعة التصاميم ومراحل الإنتاج المرئي.', colorHex: '#0f766e',
  },
  {
    id: 'room_client_briefing', code: 'client_briefing', name: 'اجتماع مراجعة الجودة',
    roomType: 'department', capacity: 6, description: 'مراجعة النسخ والسياسات قبل رفعها إلى المالك.', colorHex: '#4338ca',
  },
] as const;

const SYSTEM_ROLES = [
  { code: 'super_admin', name: 'مالك الشركة', description: 'إدارة مساحة الشركة والقرار النهائي للموافقة على المحتوى.' },
  { code: 'agency_director', name: 'مدير التشغيل', description: 'تنسيق الأقسام والمهام والمراجعات دون تجاوز قرار المالك.' },
  { code: 'account_manager', name: 'منسق المحتوى', description: 'تنظيم خطة الإنتاج والمهام ومتابعة جاهزية المواد.' },
  { code: 'creative_lead', name: 'مدير الإبداع', description: 'توجيه الأفكار والتصميم والفيديو دون صلاحية الموافقة النهائية للنشر.' },
  { code: 'analyst', name: 'محلل الشركة', description: 'قراءة بيانات التشغيل والنتائج الفعلية وسجل النشاط.' },
] as const;

const LEGACY_ROLE_NAMES: Record<string, string> = {
  super_admin: 'Super Administrator',
  agency_director: 'Agency Director',
  account_manager: 'Account Manager',
  creative_lead: 'Creative Lead',
  analyst: 'Operations & Analytics Specialist',
};

const LEGACY_COURSE_TITLES: Record<string, string> = {
  'company-foundations': 'MORGAN GROUP Foundations',
  'ai-collaboration': 'Working with AI Colleagues',
  'security-and-trust': 'Security, Privacy & Trust',
  'leadership-and-craft': 'Leadership & Professional Craft',
};

const LEGACY_MEETING_ROOM_NAMES: Record<string, string> = {
  room_executive_boardroom: 'Executive Boardroom',
  room_strategy_war_room: 'Strategy War Room',
  room_creative_studio: 'Creative Studio',
  room_client_briefing: 'Client Briefing Room',
};

interface AgentSeed {
  code: string;
  name: string;
  deptCode: string;
  jobTitle: string;
  supervisorName: string;
  roleDescription: string;
  systemInstructions: string;
  modelProvider: string;
  modelIdentifier: string;
  allowedTools: string[];
  qualityRequirements: string;
}

const AGENT_SEEDS: AgentSeed[] = [
  {
    code: 'ai_operations_manager',
    name: 'مدير العمليات الذكي',
    deptCode: 'executive',
    jobTitle: 'وكيل تنسيق العمليات',
    supervisorName: 'Executive Management',
    roleDescription: 'Breaks operational requests into structured tasks, tracks dependencies, monitors deadlines, identifies failures, and escalates consequential decisions to human managers.',
    systemInstructions: 'You are the AI Operations Manager for an internal social media agency. Decompose operational requests into concrete, dependency-ordered tasks assigned to the appropriate specialist agents. Identify missing prerequisites and explicitly flag any action requiring human approval. Never approve your own high-risk actions and never fabricate completion evidence. Return strictly valid JSON.',
    modelProvider: 'ollama',
    modelIdentifier: 'qwen3.5:4b',
    allowedTools: ['read_project_context', 'create_task_plan', 'escalate_to_human'],
    qualityRequirements: 'Every task must define owner agent, clear deliverable criteria, dependencies, and explicit approval gate flags.',
  },
  {
    code: 'research_agent',
    name: 'وكيل البحث',
    deptCode: 'strategy_research',
    jobTitle: 'باحث المنصات والاتجاهات',
    supervisorName: 'Head of Strategy and Research',
    roleDescription: 'Researches client industries, target audiences, competitors, and grounded real-world trends with verifiable source URLs and observation dates.',
    systemInstructions: 'You are the Research Agent. Use grounded web search results strictly to report real-world industry trends, competitor observations, and audience insights. Record exact source URLs returned by search grounding and distinguish verified facts from AI interpretation. Never invent URLs, dates, or unsupported claims.',
    modelProvider: 'ollama',
    modelIdentifier: 'qwen3.5:4b',
    allowedTools: ['google_search_grounding', 'read_brand_profile', 'record_research_report'],
    qualityRequirements: 'All factual claims must cite real grounded source URLs or be explicitly labeled as AI interpretation/unverified.',
  },
  {
    code: 'strategy_agent',
    name: 'وكيل الاستراتيجية',
    deptCode: 'strategy_research',
    jobTitle: 'استراتيجي منصات التواصل',
    supervisorName: 'Head of Strategy and Research',
    roleDescription: 'Develops social media strategies, content pillars, platform recommendations, audience positioning, and measurable strategic briefs.',
    systemInstructions: 'You are the Strategy Agent. Using the approved client brand profile and research findings, formulate a grounded social media strategy with clear content pillars, platform rationale, audience positioning, and measurable KPIs. Do not fabricate historical client metrics. Return strictly valid JSON.',
    modelProvider: 'ollama',
    modelIdentifier: 'qwen3.5:4b',
    allowedTools: ['read_brand_profile', 'read_research_reports', 'draft_strategy_brief'],
    qualityRequirements: 'Must align strictly with approved brand positioning and distinguish hypotheses from measured metrics.',
  },
  {
    code: 'social_media_manager_agent',
    name: 'منسق المنصات',
    deptCode: 'social_media_mgmt',
    jobTitle: 'منسق سير المحتوى',
    supervisorName: 'Account Manager',
    roleDescription: 'Coordinates client production workflows, monitors content deadlines, maintains publishing calendars, and identifies missing deliverables.',
    systemInstructions: 'You are the Social Media Manager Agent. Audit client project deliverables, identify bottlenecks or missing media/approvals, and organize weekly production schedules respecting platform cadence and approval lead times. Return strictly valid JSON.',
    modelProvider: 'ollama',
    modelIdentifier: 'qwen3.5:4b',
    allowedTools: ['read_client_workflow', 'audit_calendar_gaps', 'propose_schedule'],
    qualityRequirements: 'Highlight overdue items and missing approvals clearly without altering approved content.',
  },
  {
    code: 'content_planner_agent',
    name: 'مخطط المحتوى',
    deptCode: 'content_copywriting',
    jobTitle: 'مخطط التحرير والتقويم',
    supervisorName: 'Social Media Manager',
    roleDescription: 'Generates non-repetitive content ideas organized by content pillar and builds monthly platform-specific content calendars.',
    systemInstructions: 'You are the Content Planner Agent. Generate distinct, brand-aligned content concepts mapped to content pillars, formats, and target platforms. Respect prohibited brand expressions and avoid repeating recent topics. Return strictly valid JSON.',
    modelProvider: 'ollama',
    modelIdentifier: 'qwen3.5:4b',
    allowedTools: ['read_brand_profile', 'read_recent_content', 'draft_content_calendar'],
    qualityRequirements: 'Each idea must specify pillar, platform, format, hook angle, and required media assets.',
  },
  {
    code: 'copywriter_agent',
    name: 'كاتب المحتوى',
    deptCode: 'content_copywriting',
    jobTitle: 'كاتب المنصات الاجتماعية',
    supervisorName: 'Creative Lead',
    roleDescription: 'Writes platform-specific captions, hooks, short-form video scripts, calls to action, and hashtag sets aligned to the approved brand voice.',
    systemInstructions: 'You are the Copywriter Agent. Always follow the exact approved Brand Profile tone of voice, preferred language, dialect, preferred expressions, and strictly avoid every prohibited expression. Produce platform-tailored copy with strong hooks, clear CTAs, and relevant hashtags. Return strictly valid JSON.',
    modelProvider: 'ollama',
    modelIdentifier: 'qwen3.5:4b',
    allowedTools: ['read_brand_profile', 'read_content_brief', 'draft_content_version'],
    qualityRequirements: 'Zero prohibited expressions; platform length compliance; explicit hook, body, CTA, and script when video.',
  },
  {
    code: 'creative_director_agent',
    name: 'المدير الإبداعي',
    deptCode: 'graphic_design',
    jobTitle: 'قائد التوجيه البصري',
    supervisorName: 'Creative Lead',
    roleDescription: 'Translates strategic briefs into creative visual concepts, art direction notes, and detailed image-generation briefs aligned with brand identity.',
    systemInstructions: 'You are the Creative Director Agent. Convert content briefs and approved brand visual guidelines (color palette, typography, visual references) into concrete art direction briefs, framing instructions, and image/video prompts. Return strictly valid JSON.',
    modelProvider: 'ollama',
    modelIdentifier: 'qwen3.5:4b',
    allowedTools: ['read_brand_profile', 'read_content_brief', 'create_creative_brief'],
    qualityRequirements: 'Visual specifications must explicitly reference brand palette, composition, aspect ratio, and platform safe zones.',
  },
  {
    code: 'image_generation_agent',
    name: 'وكيل إنتاج الصور',
    deptCode: 'graphic_design',
    jobTitle: 'أخصائي إنتاج الأصول البصرية',
    supervisorName: 'Creative Director',
    roleDescription: 'Prepares image prompts and invokes configured image-generation providers to produce and store real visual assets with cost tracking.',
    systemInstructions: 'You are the Image Generation Agent. Produce precise visual prompts aligned to the Creative Direction brief and invoke only configured image generation adapters. If no image generation provider is configured or authorized, report the capability as unavailable—never fabricate a placeholder image.',
    modelProvider: 'ollama',
    modelIdentifier: 'qwen3.5:4b',
    allowedTools: ['read_creative_brief', 'invoke_image_provider', 'store_asset_metadata'],
    qualityRequirements: 'Output must validate MIME type, dimensions, SHA-256 checksum, and actual provider cost.',
  },
  {
    code: 'video_production_agent',
    name: 'وكيل إنتاج الفيديو',
    deptCode: 'video_production',
    jobTitle: 'منتج الفيديو القصير والريلز',
    supervisorName: 'Creative Lead',
    roleDescription: 'Produces Reels/TikTok/Shorts scripts, shot-by-shot storyboards, and manages asynchronous video-generation provider jobs when configured.',
    systemInstructions: 'You are the Video Production Agent. Produce structured shot-by-shot storyboards, voiceover scripts, on-screen text timings, and audio cues. Only dispatch video rendering jobs to a configured video provider; if no video provider is configured, explicitly report rendering as unavailable rather than simulating a video file.',
    modelProvider: 'ollama',
    modelIdentifier: 'qwen3.5:4b',
    allowedTools: ['read_brand_profile', 'draft_storyboard', 'invoke_video_provider'],
    qualityRequirements: 'Every storyboard must include scene timings, visual framing, audio/caption sync, and aspect ratio specs.',
  },
  {
    code: 'quality_assurance_agent',
    name: 'وكيل مراجعة الجودة',
    deptCode: 'quality_assurance',
    jobTitle: 'مراجع جودة المحتوى والسياسات',
    supervisorName: 'Quality Assurance Lead',
    roleDescription: 'Audits copy for spelling, unsupported factual claims, brand voice compliance, prohibited expressions, platform rules, and missing media.',
    systemInstructions: 'You are the Quality Assurance Agent. Critically inspect the content item against the approved Brand Profile and platform requirements. Check spelling, prohibited terms, factual claims without evidence, CTA clarity, hashtag limits, and missing media assets. Return a structured pass/fail QA review JSON with specific actionable issues. You cannot grant final human publishing approval.',
    modelProvider: 'ollama',
    modelIdentifier: 'qwen3.5:4b',
    allowedTools: ['read_brand_profile', 'read_content_version', 'record_qa_review'],
    qualityRequirements: 'Structured checklist covering brand voice, prohibited words, factual risk, platform constraints, and asset completeness.',
  },
  {
    code: 'publishing_coordinator_agent',
    name: 'وكيل جاهزية النشر',
    deptCode: 'publishing_distribution',
    jobTitle: 'أخصائي تجهيز ما قبل النشر',
    supervisorName: 'Operations Director',
    roleDescription: 'Validates human approval hashes, connected social accounts, and media specs prior to scheduling; monitors outcomes and escalates failures.',
    systemInstructions: 'You are the Publishing Coordinator Agent. Verify that a valid human approval matches the exact content version hash and that the destination social account is connected with valid permissions. Never bypass approval gates and never mark an item published without external post ID evidence.',
    modelProvider: 'ollama',
    modelIdentifier: 'qwen3.5:4b',
    allowedTools: ['verify_approval_hash', 'validate_social_account', 'prepare_publishing_job'],
    qualityRequirements: '100% enforcement of human approval verification and idempotency key validation.',
  },
  {
    code: 'analytics_agent',
    name: 'وكيل تحليل الأداء',
    deptCode: 'analytics_reporting',
    jobTitle: 'محلل الأداء والرؤى',
    supervisorName: 'Head of Analytics',
    roleDescription: 'Analyzes real synced platform metrics, compares periods, identifies content patterns, and separates measured facts from interpretations.',
    systemInstructions: 'You are the Analytics Agent. Analyze ONLY the real persisted platform metrics supplied in the task context. Never invent engagement numbers, impressions, or follower counts. If metrics are empty or unavailable, state explicitly what data is missing and which platform integration needs synchronization. Clearly separate measured facts from hypotheses.',
    modelProvider: 'ollama',
    modelIdentifier: 'qwen3.5:4b',
    allowedTools: ['read_synced_metrics', 'generate_performance_report'],
    qualityRequirements: 'Every numeric figure must map directly to a persisted platform metric record.',
  },
  {
    code: 'client_success_agent',
    name: 'وكيل تفاعل الجمهور',
    deptCode: 'client_success',
    jobTitle: 'مسؤول التفاعل المجتمعي',
    supervisorName: 'Account Manager',
    roleDescription: 'Prepares client status updates, synthesizes client feedback, tracks pending approvals, and escalates account risks.',
    systemInstructions: 'You are the Client Success Agent. Draft accurate, professional client status summaries derived strictly from real project tasks, content statuses, and pending approval queues. Never promise unverified dates or fabricate completed work. Return strictly valid JSON.',
    modelProvider: 'ollama',
    modelIdentifier: 'qwen3.5:4b',
    allowedTools: ['read_client_status', 'draft_client_update', 'escalate_client_risk'],
    qualityRequirements: 'Accurate reflection of actual database statuses and pending human reviews.',
  },
  {
    code: 'finance_agent',
    name: 'وكيل تحليل التكاليف',
    deptCode: 'finance_operations',
    jobTitle: 'محلل التكاليف التشغيلية',
    supervisorName: 'Finance Director',
    roleDescription: 'Analyzes recorded revenue, AI usage costs, project expenses, and client profitability without ever inventing financial figures or executing payments.',
    systemInstructions: 'You are the Finance Agent. Analyze ONLY the actual recorded invoices, payments, expenses, and AI usage cost records supplied in context. Strictly separate actual expenses from estimates. Never invent financial values and never execute financial transactions. Return strictly valid JSON.',
    modelProvider: 'ollama',
    modelIdentifier: 'qwen3.5:4b',
    allowedTools: ['read_financial_ledger', 'prepare_profitability_brief'],
    qualityRequirements: '100% arithmetic fidelity to recorded ledger entries; clear actual vs estimate distinction.',
  },
];

const LEGACY_AGENT_LABELS: Record<string, { name: string; jobTitle: string }> = {
  ai_operations_manager: { name: 'AI Operations Manager', jobTitle: 'Operations Coordinator Agent' },
  research_agent: { name: 'Research Agent', jobTitle: 'Industry & Trend Research Specialist' },
  strategy_agent: { name: 'Strategy Agent', jobTitle: 'Social Media Strategist Agent' },
  social_media_manager_agent: { name: 'Social Media Manager Agent', jobTitle: 'Account Workflow Coordinator' },
  content_planner_agent: { name: 'Content Planner Agent', jobTitle: 'Editorial & Calendar Planner' },
  copywriter_agent: { name: 'Copywriter Agent', jobTitle: 'Senior Social Copywriter Agent' },
  creative_director_agent: { name: 'Creative Director Agent', jobTitle: 'Visual Direction & Concept Lead' },
  image_generation_agent: { name: 'Image Generation Agent', jobTitle: 'Visual Asset Production Specialist' },
  video_production_agent: { name: 'Video Production Agent', jobTitle: 'Short-Form Video & Reels Producer' },
  quality_assurance_agent: { name: 'Quality Assurance Agent', jobTitle: 'Content QA & Policy Reviewer' },
  publishing_coordinator_agent: { name: 'Publishing Coordinator Agent', jobTitle: 'Distribution & Pre-Flight Specialist' },
  analytics_agent: { name: 'Analytics Agent', jobTitle: 'Performance & Insights Analyst' },
  client_success_agent: { name: 'Client Success Agent', jobTitle: 'Client Communications Specialist' },
  finance_agent: { name: 'Finance Agent', jobTitle: 'Financial Operations Analyst' },
};

interface IntegrationSeed {
  providerCode: string;
  displayName: string;
  category: 'ai_text' | 'ai_image' | 'ai_video' | 'social' | 'analytics' | 'storage';
  requiredEnvVars: string[];
  requiredScopes: string[];
  capabilities: Record<string, boolean>;
  limitationsNote: string;
}

const INTEGRATION_SEEDS: IntegrationSeed[] = [
  {
    providerCode: 'ollama',
    displayName: 'Ollama Local AI (Free)',
    category: 'ai_text',
    requiredEnvVars: [],
    requiredScopes: [],
    capabilities: { textGeneration: true, structuredJson: true, localInference: true },
    limitationsNote: 'Runs a downloaded open model on your own computer or server with no API usage fees. Install Ollama and the configured model; results are ungrounded unless separate search is added.',
  },
  {
    providerCode: 'google_gemini',
    displayName: 'Google Gemini AI (Text & Grounded Research)',
    category: 'ai_text',
    requiredEnvVars: ['GEMINI_API_KEY'],
    requiredScopes: [],
    capabilities: { textGeneration: true, structuredJson: true, googleSearchGrounding: true },
    limitationsNote: 'Optional Google AI Studio API free tier, subject to account/model quotas and terms. A Gemini API key is required; the company default uses local Ollama instead.',
  },
  {
    providerCode: 'gemini_image',
    displayName: 'Google Gemini Image Generation',
    category: 'ai_image',
    requiredEnvVars: ['GEMINI_API_KEY'],
    requiredScopes: [],
    capabilities: { imageGeneration: true, aspectRatios: true },
    limitationsNote: 'Uses gemini-3.1-flash-lite-image or gemini-nano-banana-2.1. Requires a billing-enabled Gemini API key.',
  },
  {
    providerCode: 'video_generation',
    displayName: 'Video Generation Provider (Runway / Omni)',
    category: 'ai_video',
    requiredEnvVars: ['RUNWAY_API_KEY'],
    requiredScopes: [],
    capabilities: { asyncVideoRender: true, storyboardToVideo: true },
    limitationsNote: 'Requires configured RUNWAY_API_KEY or paid Gemini Omni key. Unconfigured requests fail honestly without generating placeholder videos.',
  },
  {
    providerCode: 'instagram',
    displayName: 'Instagram Graph API (Meta)',
    category: 'social',
    requiredEnvVars: ['META_APP_ID', 'META_APP_SECRET'],
    requiredScopes: ['instagram_basic', 'instagram_content_publish', 'instagram_manage_insights', 'pages_show_list'],
    capabilities: { staticPost: true, carousel: true, reels: true, stories: false, analyticsSync: true },
    limitationsNote: 'Requires Meta Business / Creator Instagram account linked to a Facebook Page and Meta App Review approval for live publishing.',
  },
  {
    providerCode: 'facebook',
    displayName: 'Facebook Pages API (Meta)',
    category: 'social',
    requiredEnvVars: ['META_APP_ID', 'META_APP_SECRET'],
    requiredScopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'],
    capabilities: { staticPost: true, textPost: true, video: true, analyticsSync: true },
    limitationsNote: 'Requires Facebook Page admin OAuth grant and Meta App Review for production publishing.',
  },
  {
    providerCode: 'tiktok',
    displayName: 'TikTok Content Posting API',
    category: 'social',
    requiredEnvVars: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
    requiredScopes: ['user.info.basic', 'video.publish', 'video.upload'],
    capabilities: { shortFormVideo: true, photoCarousel: true, analyticsSync: false },
    limitationsNote: 'Direct public posting requires TikTok app audit approval; unaudited apps are restricted to private/draft inbox uploads.',
  },
  {
    providerCode: 'youtube',
    displayName: 'YouTube Data API v3',
    category: 'social',
    requiredEnvVars: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
    requiredScopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/yt-analytics.readonly'],
    capabilities: { shortFormVideo: true, longFormVideo: true, analyticsSync: true },
    limitationsNote: 'Unverified Google OAuth apps upload videos locked as private until YouTube API compliance audit completes.',
  },
  {
    providerCode: 'linkedin',
    displayName: 'LinkedIn Marketing & Posts API',
    category: 'social',
    requiredEnvVars: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
    requiredScopes: ['openid', 'profile', 'w_member_social', 'w_organization_social', 'r_organization_social'],
    capabilities: { textPost: true, staticPost: true, documentCarousel: true, analyticsSync: true },
    limitationsNote: 'Organization page publishing & analytics require LinkedIn Community Management API approval.',
  },
  {
    providerCode: 'supabase',
    displayName: 'Supabase (PostgreSQL & Object Storage)',
    category: 'storage',
    requiredEnvVars: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    requiredScopes: [],
    capabilities: { postgresSync: true, objectStorage: true, signedUrls: true },
    limitationsNote: 'Connect your Supabase project via SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Settings > Secrets, and run docs/migrations/001_supabase_schema.sql in Supabase SQL Editor.',
  },
];

export function computeHonestIntegrationStatus(requiredEnvVars: string[]): {
  status: 'not_configured' | 'configuration_incomplete' | 'disconnected';
  missingVars: string[];
} {
  const missingVars = requiredEnvVars.filter((name) => {
    const val = process.env[name];
    return !val || val.trim() === '' || val.startsWith('MY_');
  });
  if (missingVars.length === requiredEnvVars.length) {
    return { status: 'not_configured', missingVars };
  }
  if (missingVars.length > 0) {
    return { status: 'configuration_incomplete', missingVars };
  }
  return { status: 'disconnected', missingVars: [] };
}

export function seedSystemConfiguration(db: DatabaseSync): void {
  const ts = nowIso();

  // 1. Default Organization
  db.prepare(`
    INSERT OR IGNORE INTO organizations (
      id, name, legal_name, website, default_currency, timezone, governance_policy_json,
      tagline, brand_primary_color, brand_secondary_color, brand_symbol, logo_style, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    DEFAULT_ORG_ID,
    'MORGAN GROUP',
    'MORGAN GROUP',
    '',
    'USD',
    'UTC',
    JSON.stringify({
      requireHumanApprovalForPublishing: true,
      requireHumanApprovalForStrategy: true,
      requireHumanApprovalForBrandChanges: true,
      invalidateApprovalOnContentEdit: true,
      prohibitAgentSelfApproval: true,
    }),
    'Technology, built together',
    '#0e7490',
    '#0b1726',
    'prism',
    'lockup',
    ts,
    ts
  );

  // 2. 13 Core Departments
  const deptIdsByCode = new Map<string, string>();
  const insertDept = db.prepare(`
    INSERT OR IGNORE INTO departments (id, organization_id, code, name, description, status, zone_code, color_hex, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
  `);
  const updateDeptMeta = db.prepare(`
    UPDATE departments SET zone_code = CASE WHEN zone_code = '' THEN ? ELSE zone_code END,
                           color_hex = CASE WHEN color_hex = '#2563eb' OR color_hex = '' THEN ? ELSE color_hex END
    WHERE id = ?
  `);
  const updateSeededDeptName = db.prepare(
    'UPDATE departments SET name = ?, description = ? WHERE id = ? AND name = ?'
  );
  for (const dept of DEPARTMENTS) {
    const id = `dept_${dept.code}`;
    const colorHex = getDefaultDepartmentColor(dept.code);
    insertDept.run(id, DEFAULT_ORG_ID, dept.code, dept.name, dept.description, dept.code, colorHex, ts, ts);
    updateDeptMeta.run(dept.code, colorHex, id);
    for (const legacyName of LEGACY_DEPARTMENT_LABELS[dept.code] ?? []) {
      updateSeededDeptName.run(dept.name, dept.description, id, legacyName);
    }
    deptIdsByCode.set(dept.code, id);
  }

  // Refresh only the fictional seeded roster; never overwrite real employee records.
  const updateVirtualEmployee = db.prepare(`
    UPDATE employees SET department_id = ?, job_title = ?, manager_employee_id = ?,
                         profile_json = ?, updated_at = ?
    WHERE id = ? AND email LIKE '%@morgangroup.example' AND user_id IS NULL
  `);

  // 2a. Thirty fictional staff members for the interactive company simulation.
  const insertVirtualEmployee = db.prepare(`
    INSERT OR IGNORE INTO employees (
      id, organization_id, user_id, department_id, full_name, email, job_title,
      manager_employee_id, employment_status, monthly_cost_cents, joining_date,
      avatar_config_json, workstation_code, profile_json, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'active', 0, ?, '{}', ?, ?, ?, ?)
  `);
  const ownerEmployeeId = (db.prepare(
    `SELECT e.id FROM employees e
     INNER JOIN user_roles ur ON ur.user_id = e.user_id
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE e.organization_id = ? AND r.code = 'super_admin'
     ORDER BY e.created_at ASC LIMIT 1`
  ).get(DEFAULT_ORG_ID) as { id: string } | undefined)?.id ?? null;
  VIRTUAL_EMPLOYEES.forEach((employee, index) => {
    const ordinal = String(index + 1).padStart(2, '0');
    const employeeId = `employee_virtual_${ordinal}`;
    const departmentId = deptIdsByCode.get(employee.department) ?? null;
    const managerId = employee.managerOrdinal === 0
      ? ownerEmployeeId
      : `employee_virtual_${String(employee.managerOrdinal).padStart(2, '0')}`;
    const profileJson = JSON.stringify({
      profileType: 'ai_agent',
      specialty: employee.title,
      responsibilities: employee.responsibilities,
      appearance: employee.appearance,
      workStyle: 'حركة المشهد مرتبطة بالمهام والاجتماعات المسجلة؛ لا تمثل نشاطاً حقيقياً لشخص.'
    });
    insertVirtualEmployee.run(
      employeeId,
      DEFAULT_ORG_ID,
      departmentId,
      employee.name,
      `team-${ordinal}@morgangroup.example`,
      employee.title,
      managerId,
      '2026-01-05',
      `desk-${ordinal}`,
      profileJson,
      ts,
      ts
    );
    updateVirtualEmployee.run(departmentId, employee.title, managerId, profileJson, ts, employeeId);
    if (index === 0 || VIRTUAL_EMPLOYEES[index - 1]?.department !== employee.department) {
      db.prepare(`UPDATE departments SET lead_employee_id = ? WHERE id = ?
                  AND (lead_employee_id IS NULL OR lead_employee_id LIKE 'employee_virtual_%')`)
        .run(employeeId, departmentId);
    }
  });

  // 2b. Learning catalog starts with curriculum content only; no completions are invented.
  const insertAcademyCourse = db.prepare(`
    INSERT OR IGNORE INTO academy_courses (
      id, organization_id, code, title, description, curriculum_json,
      sort_order, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `);
  const updateLegacyAcademyCourse = db.prepare(
    'UPDATE academy_courses SET title = ?, description = ?, curriculum_json = ?, updated_at = ? WHERE code = ? AND title = ?'
  );
  ACADEMY_COURSES.forEach((course, index) => {
    insertAcademyCourse.run(
      `course_${course.code}`,
      DEFAULT_ORG_ID,
      course.code,
      course.title,
      course.description,
      JSON.stringify(course.lessons),
      index + 1,
      ts,
      ts
    );
    updateLegacyAcademyCourse.run(
      course.title,
      course.description,
      JSON.stringify(course.lessons),
      ts,
      course.code,
      LEGACY_COURSE_TITLES[course.code]
    );
  });

  // 2c. 4 Real Virtual Meeting Rooms
  const insertRoom = db.prepare(`
    INSERT OR IGNORE INTO meeting_rooms (id, organization_id, code, name, room_type, capacity, description, color_hex, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateLegacyMeetingRoom = db.prepare(
    'UPDATE meeting_rooms SET name = ?, description = ? WHERE id = ? AND name = ?'
  );
  for (const room of MEETING_ROOMS) {
    insertRoom.run(
      room.id,
      DEFAULT_ORG_ID,
      room.code,
      room.name,
      room.roomType,
      room.capacity,
      room.description,
      room.colorHex,
      ts
    );
    updateLegacyMeetingRoom.run(room.name, room.description, room.id, LEGACY_MEETING_ROOM_NAMES[room.id]);
  }

  // 3. Permissions & Roles
  const insertPerm = db.prepare(`
    INSERT OR IGNORE INTO permissions (id, code, category, description)
    VALUES (?, ?, ?, ?)
  `);
  for (const code of ALL_PERMISSIONS) {
    const [category, action] = code.split(':');
    insertPerm.run(`perm_${code.replace(':', '_')}`, code, category, `Allows ${action} on ${category}`);
  }

  const insertRole = db.prepare(`
    INSERT OR IGNORE INTO roles (id, organization_id, code, name, description, is_system, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `);
  const insertRolePerm = db.prepare(`
    INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
    VALUES (?, ?)
  `);
  const updateLegacyRole = db.prepare('UPDATE roles SET name = ?, description = ? WHERE id = ? AND name = ?');
  for (const role of SYSTEM_ROLES) {
    const roleId = `role_${role.code}`;
    insertRole.run(roleId, DEFAULT_ORG_ID, role.code, role.name, role.description, ts);
    updateLegacyRole.run(role.name, role.description, roleId, LEGACY_ROLE_NAMES[role.code]);
    const perms = SYSTEM_ROLE_PERMISSIONS[role.code] ?? [];
    for (const permCode of perms) {
      insertRolePerm.run(roleId, `perm_${permCode.replace(':', '_')}`);
    }
  }

  // 4. All 14 Configurable AI Agents (system configuration only — zero fake runs!)
  const insertAgent = db.prepare(`
    INSERT OR IGNORE INTO agents (
      id, organization_id, code, name, department_id, job_title, role_description,
      supervisor_name, system_instructions, prompt_version, model_provider, model_identifier,
      allowed_tools_json, permission_policies_json, monthly_budget_usd, max_tokens,
      timeout_seconds, max_retries, input_schema_json, output_schema_json, quality_requirements,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `);
  const insertAgentVersion = db.prepare(`
    INSERT OR IGNORE INTO agent_versions (
      id, agent_id, version_number, system_instructions, model_provider, model_identifier,
      allowed_tools_json, change_note, created_at
    ) VALUES (?, ?, 1, ?, ?, ?, ?, 'Initial system agent configuration', ?)
  `);
  const insertAgentTool = db.prepare(`
    INSERT OR IGNORE INTO agent_tools (id, agent_id, tool_name, requires_human_approval, rate_limit_per_hour)
    VALUES (?, ?, ?, ?, ?)
  `);
  const updateLegacyAgentLabel = db.prepare(
    'UPDATE agents SET name = ?, job_title = ? WHERE id = ? AND name = ? AND job_title = ?'
  );

  for (const agent of AGENT_SEEDS) {
    const agentId = `agent_${agent.code}`;
    const deptId = deptIdsByCode.get(agent.deptCode) ?? null;
    insertAgent.run(
      agentId,
      DEFAULT_ORG_ID,
      agent.code,
      agent.name,
      deptId,
      agent.jobTitle,
      agent.roleDescription,
      agent.supervisorName,
      agent.systemInstructions,
      agent.modelProvider,
      agent.modelIdentifier,
      JSON.stringify(agent.allowedTools),
      JSON.stringify({
        canSelfApprove: false,
        canPublishWithoutHumanApproval: false,
        canExecuteFinancialTransactions: false,
        treatExternalDataAsUntrusted: true,
      }),
      50.0,
      4096,
      60,
      2,
      JSON.stringify({ type: 'object', required: ['prompt'] }),
      JSON.stringify({ type: 'object', required: ['summary', 'deliverable'] }),
      agent.qualityRequirements,
      ts,
      ts
    );
    const legacyLabel = LEGACY_AGENT_LABELS[agent.code];
    if (legacyLabel) {
      updateLegacyAgentLabel.run(agent.name, agent.jobTitle, agentId, legacyLabel.name, legacyLabel.jobTitle);
    }
    insertAgentVersion.run(
      `agentver_${agent.code}_1`,
      agentId,
      agent.systemInstructions,
      agent.modelProvider,
      agent.modelIdentifier,
      JSON.stringify(agent.allowedTools),
      ts
    );
    for (const toolName of agent.allowedTools) {
      insertAgentTool.run(
        `atool_${crypto.createHash('sha1').update(`${agentId}:${toolName}`).digest('hex').slice(0, 12)}`,
        agentId,
        toolName,
        toolName.includes('publish') || toolName.includes('provider') ? 1 : 0,
        60
      );
    }
  }

  // 5. Integrations — honest environment-derived status
  const upsertIntegration = db.prepare(`
    INSERT INTO integrations (
      id, organization_id, provider_code, display_name, category, status,
      required_env_vars_json, required_scopes_json, capabilities_json,
      limitations_note, last_error, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider_code) DO UPDATE SET
      display_name = excluded.display_name,
      required_env_vars_json = excluded.required_env_vars_json,
      required_scopes_json = excluded.required_scopes_json,
      capabilities_json = excluded.capabilities_json,
      limitations_note = excluded.limitations_note,
      status = CASE
        WHEN integrations.status = 'connected' AND excluded.status = 'disconnected' THEN 'connected'
        ELSE excluded.status
      END,
      updated_at = excluded.updated_at
  `);

  for (const integ of INTEGRATION_SEEDS) {
    const check = computeHonestIntegrationStatus(integ.requiredEnvVars);
    const errMsg =
      check.missingVars.length > 0
        ? `Missing environment credential(s): ${check.missingVars.join(', ')}`
        : null;
    upsertIntegration.run(
      `integ_${integ.providerCode}`,
      DEFAULT_ORG_ID,
      integ.providerCode,
      integ.displayName,
      integ.category,
      check.status,
      JSON.stringify(integ.requiredEnvVars),
      JSON.stringify(integ.requiredScopes),
      JSON.stringify(integ.capabilities),
      integ.limitationsNote,
      errMsg,
      ts
    );
  }
}
