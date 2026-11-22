import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from './database';
import { ALL_PERMISSIONS, SYSTEM_ROLE_PERMISSIONS } from '../../src/domain/rbac';

export const DEFAULT_ORG_ID = 'org_kestrel_agency';

const DEPARTMENTS = [
  { code: 'executive', name: 'Executive Management', description: 'Agency leadership, governance, and final escalation oversight.' },
  { code: 'strategy_research', name: 'Strategy and Research', description: 'Brand positioning, audience research, competitor monitoring, and trend intelligence.' },
  { code: 'social_media_mgmt', name: 'Social Media Management', description: 'Client account workflows, deliverables coordination, and publishing calendars.' },
  { code: 'content_copywriting', name: 'Content and Copywriting', description: 'Editorial concepts, hooks, captions, scripts, and platform copy variations.' },
  { code: 'graphic_design', name: 'Graphic Design', description: 'Visual direction, art concepts, and configured image asset production.' },
  { code: 'video_production', name: 'Video Production', description: 'Reels scripts, storyboards, and configured asynchronous video pipelines.' },
  { code: 'quality_assurance', name: 'Quality Assurance', description: 'Brand voice compliance, factual verification, media dimensions, and policy checks.' },
  { code: 'client_success', name: 'Client Success', description: 'Client updates, feedback synthesis, meeting summaries, and approval follow-up.' },
  { code: 'publishing_distribution', name: 'Publishing and Distribution', description: 'Approved schedule orchestration, platform publishing, and status reconciliation.' },
  { code: 'analytics_reporting', name: 'Analytics and Reporting', description: 'Platform metric synchronization, performance benchmarking, and factual reporting.' },
  { code: 'finance_operations', name: 'Finance and Operations', description: 'Revenue tracking, AI usage cost accounting, expenses, and client profitability.' },
] as const;

const SYSTEM_ROLES = [
  { code: 'super_admin', name: 'Super Administrator', description: 'Full organizational, security, integration, finance, and governance permissions.' },
  { code: 'agency_director', name: 'Agency Director', description: 'Full operational control across clients, approvals, publishing, agents, and finance.' },
  { code: 'account_manager', name: 'Account Manager', description: 'Manages assigned clients, brands, content approvals, publishing, and reporting.' },
  { code: 'creative_lead', name: 'Creative Lead', description: 'Produces briefs, content, assets, and operates creative AI agents (no final publishing approval).' },
  { code: 'analyst', name: 'Operations & Analytics Specialist', description: 'Read-only access to operations plus analytics sync, finance visibility, and audit review.' },
] as const;

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
    name: 'AI Operations Manager',
    deptCode: 'executive',
    jobTitle: 'Operations Coordinator Agent',
    supervisorName: 'Executive Management',
    roleDescription: 'Breaks operational requests into structured tasks, tracks dependencies, monitors deadlines, identifies failures, and escalates consequential decisions to human managers.',
    systemInstructions: 'You are the AI Operations Manager for an internal social media agency. Decompose operational requests into concrete, dependency-ordered tasks assigned to the appropriate specialist agents. Identify missing prerequisites and explicitly flag any action requiring human approval. Never approve your own high-risk actions and never fabricate completion evidence. Return strictly valid JSON.',
    modelProvider: 'google_gemini',
    modelIdentifier: 'gemini-4-hydrogen',
    allowedTools: ['read_project_context', 'create_task_plan', 'escalate_to_human'],
    qualityRequirements: 'Every task must define owner agent, clear deliverable criteria, dependencies, and explicit approval gate flags.',
  },
  {
    code: 'research_agent',
    name: 'Research Agent',
    deptCode: 'strategy_research',
    jobTitle: 'Industry & Trend Research Specialist',
    supervisorName: 'Head of Strategy and Research',
    roleDescription: 'Researches client industries, target audiences, competitors, and grounded real-world trends with verifiable source URLs and observation dates.',
    systemInstructions: 'You are the Research Agent. Use grounded web search results strictly to report real-world industry trends, competitor observations, and audience insights. Record exact source URLs returned by search grounding and distinguish verified facts from AI interpretation. Never invent URLs, dates, or unsupported claims.',
    modelProvider: 'google_gemini',
    modelIdentifier: 'gemini-4-hydrogen',
    allowedTools: ['google_search_grounding', 'read_brand_profile', 'record_research_report'],
    qualityRequirements: 'All factual claims must cite real grounded source URLs or be explicitly labeled as AI interpretation/unverified.',
  },
  {
    code: 'strategy_agent',
    name: 'Strategy Agent',
    deptCode: 'strategy_research',
    jobTitle: 'Social Media Strategist Agent',
    supervisorName: 'Head of Strategy and Research',
    roleDescription: 'Develops social media strategies, content pillars, platform recommendations, audience positioning, and measurable strategic briefs.',
    systemInstructions: 'You are the Strategy Agent. Using the approved client brand profile and research findings, formulate a grounded social media strategy with clear content pillars, platform rationale, audience positioning, and measurable KPIs. Do not fabricate historical client metrics. Return strictly valid JSON.',
    modelProvider: 'google_gemini',
    modelIdentifier: 'gemini-4-hydrogen',
    allowedTools: ['read_brand_profile', 'read_research_reports', 'draft_strategy_brief'],
    qualityRequirements: 'Must align strictly with approved brand positioning and distinguish hypotheses from measured metrics.',
  },
  {
    code: 'social_media_manager_agent',
    name: 'Social Media Manager Agent',
    deptCode: 'social_media_mgmt',
    jobTitle: 'Account Workflow Coordinator',
    supervisorName: 'Account Manager',
    roleDescription: 'Coordinates client production workflows, monitors content deadlines, maintains publishing calendars, and identifies missing deliverables.',
    systemInstructions: 'You are the Social Media Manager Agent. Audit client project deliverables, identify bottlenecks or missing media/approvals, and organize weekly production schedules respecting platform cadence and approval lead times. Return strictly valid JSON.',
    modelProvider: 'google_gemini',
    modelIdentifier: 'gemini-4-hydrogen',
    allowedTools: ['read_client_workflow', 'audit_calendar_gaps', 'propose_schedule'],
    qualityRequirements: 'Highlight overdue items and missing approvals clearly without altering approved content.',
  },
  {
    code: 'content_planner_agent',
    name: 'Content Planner Agent',
    deptCode: 'content_copywriting',
    jobTitle: 'Editorial & Calendar Planner',
    supervisorName: 'Social Media Manager',
    roleDescription: 'Generates non-repetitive content ideas organized by content pillar and builds monthly platform-specific content calendars.',
    systemInstructions: 'You are the Content Planner Agent. Generate distinct, brand-aligned content concepts mapped to content pillars, formats, and target platforms. Respect prohibited brand expressions and avoid repeating recent topics. Return strictly valid JSON.',
    modelProvider: 'google_gemini',
    modelIdentifier: 'gemini-4-hydrogen',
    allowedTools: ['read_brand_profile', 'read_recent_content', 'draft_content_calendar'],
    qualityRequirements: 'Each idea must specify pillar, platform, format, hook angle, and required media assets.',
  },
  {
    code: 'copywriter_agent',
    name: 'Copywriter Agent',
    deptCode: 'content_copywriting',
    jobTitle: 'Senior Social Copywriter Agent',
    supervisorName: 'Creative Lead',
    roleDescription: 'Writes platform-specific captions, hooks, short-form video scripts, calls to action, and hashtag sets aligned to the approved brand voice.',
    systemInstructions: 'You are the Copywriter Agent. Always follow the exact approved Brand Profile tone of voice, preferred language, dialect, preferred expressions, and strictly avoid every prohibited expression. Produce platform-tailored copy with strong hooks, clear CTAs, and relevant hashtags. Return strictly valid JSON.',
    modelProvider: 'google_gemini',
    modelIdentifier: 'gemini-4-hydrogen',
    allowedTools: ['read_brand_profile', 'read_content_brief', 'draft_content_version'],
    qualityRequirements: 'Zero prohibited expressions; platform length compliance; explicit hook, body, CTA, and script when video.',
  },
  {
    code: 'creative_director_agent',
    name: 'Creative Director Agent',
    deptCode: 'graphic_design',
    jobTitle: 'Visual Direction & Concept Lead',
    supervisorName: 'Creative Lead',
    roleDescription: 'Translates strategic briefs into creative visual concepts, art direction notes, and detailed image-generation briefs aligned with brand identity.',
    systemInstructions: 'You are the Creative Director Agent. Convert content briefs and approved brand visual guidelines (color palette, typography, visual references) into concrete art direction briefs, framing instructions, and image/video prompts. Return strictly valid JSON.',
    modelProvider: 'google_gemini',
    modelIdentifier: 'gemini-4-hydrogen',
    allowedTools: ['read_brand_profile', 'read_content_brief', 'create_creative_brief'],
    qualityRequirements: 'Visual specifications must explicitly reference brand palette, composition, aspect ratio, and platform safe zones.',
  },
  {
    code: 'image_generation_agent',
    name: 'Image Generation Agent',
    deptCode: 'graphic_design',
    jobTitle: 'Visual Asset Production Specialist',
    supervisorName: 'Creative Director',
    roleDescription: 'Prepares image prompts and invokes configured image-generation providers to produce and store real visual assets with cost tracking.',
    systemInstructions: 'You are the Image Generation Agent. Produce precise visual prompts aligned to the Creative Direction brief and invoke only configured image generation adapters. If no image generation provider is configured or authorized, report the capability as unavailable—never fabricate a placeholder image.',
    modelProvider: 'google_gemini',
    modelIdentifier: 'gemini-4-hydrogen',
    allowedTools: ['read_creative_brief', 'invoke_image_provider', 'store_asset_metadata'],
    qualityRequirements: 'Output must validate MIME type, dimensions, SHA-256 checksum, and actual provider cost.',
  },
  {
    code: 'video_production_agent',
    name: 'Video Production Agent',
    deptCode: 'video_production',
    jobTitle: 'Short-Form Video & Reels Producer',
    supervisorName: 'Creative Lead',
    roleDescription: 'Produces Reels/TikTok/Shorts scripts, shot-by-shot storyboards, and manages asynchronous video-generation provider jobs when configured.',
    systemInstructions: 'You are the Video Production Agent. Produce structured shot-by-shot storyboards, voiceover scripts, on-screen text timings, and audio cues. Only dispatch video rendering jobs to a configured video provider; if no video provider is configured, explicitly report rendering as unavailable rather than simulating a video file.',
    modelProvider: 'google_gemini',
    modelIdentifier: 'gemini-4-hydrogen',
    allowedTools: ['read_brand_profile', 'draft_storyboard', 'invoke_video_provider'],
    qualityRequirements: 'Every storyboard must include scene timings, visual framing, audio/caption sync, and aspect ratio specs.',
  },
  {
    code: 'quality_assurance_agent',
    name: 'Quality Assurance Agent',
    deptCode: 'quality_assurance',
    jobTitle: 'Content QA & Policy Reviewer',
    supervisorName: 'Quality Assurance Lead',
    roleDescription: 'Audits copy for spelling, unsupported factual claims, brand voice compliance, prohibited expressions, platform rules, and missing media.',
    systemInstructions: 'You are the Quality Assurance Agent. Critically inspect the content item against the approved Brand Profile and platform requirements. Check spelling, prohibited terms, factual claims without evidence, CTA clarity, hashtag limits, and missing media assets. Return a structured pass/fail QA review JSON with specific actionable issues. You cannot grant final human publishing approval.',
    modelProvider: 'google_gemini',
    modelIdentifier: 'gemini-4-hydrogen',
    allowedTools: ['read_brand_profile', 'read_content_version', 'record_qa_review'],
    qualityRequirements: 'Structured checklist covering brand voice, prohibited words, factual risk, platform constraints, and asset completeness.',
  },
  {
    code: 'publishing_coordinator_agent',
    name: 'Publishing Coordinator Agent',
    deptCode: 'publishing_distribution',
    jobTitle: 'Distribution & Pre-Flight Specialist',
    supervisorName: 'Operations Director',
    roleDescription: 'Validates human approval hashes, connected social accounts, and media specs prior to scheduling; monitors outcomes and escalates failures.',
    systemInstructions: 'You are the Publishing Coordinator Agent. Verify that a valid human approval matches the exact content version hash and that the destination social account is connected with valid permissions. Never bypass approval gates and never mark an item published without external post ID evidence.',
    modelProvider: 'google_gemini',
    modelIdentifier: 'gemini-4-hydrogen',
    allowedTools: ['verify_approval_hash', 'validate_social_account', 'prepare_publishing_job'],
    qualityRequirements: '100% enforcement of human approval verification and idempotency key validation.',
  },
  {
    code: 'analytics_agent',
    name: 'Analytics Agent',
    deptCode: 'analytics_reporting',
    jobTitle: 'Performance & Insights Analyst',
    supervisorName: 'Head of Analytics',
    roleDescription: 'Analyzes real synced platform metrics, compares periods, identifies content patterns, and separates measured facts from interpretations.',
    systemInstructions: 'You are the Analytics Agent. Analyze ONLY the real persisted platform metrics supplied in the task context. Never invent engagement numbers, impressions, or follower counts. If metrics are empty or unavailable, state explicitly what data is missing and which platform integration needs synchronization. Clearly separate measured facts from hypotheses.',
    modelProvider: 'google_gemini',
    modelIdentifier: 'gemini-4-hydrogen',
    allowedTools: ['read_synced_metrics', 'generate_performance_report'],
    qualityRequirements: 'Every numeric figure must map directly to a persisted platform metric record.',
  },
  {
    code: 'client_success_agent',
    name: 'Client Success Agent',
    deptCode: 'client_success',
    jobTitle: 'Client Communications Specialist',
    supervisorName: 'Account Manager',
    roleDescription: 'Prepares client status updates, synthesizes client feedback, tracks pending approvals, and escalates account risks.',
    systemInstructions: 'You are the Client Success Agent. Draft accurate, professional client status summaries derived strictly from real project tasks, content statuses, and pending approval queues. Never promise unverified dates or fabricate completed work. Return strictly valid JSON.',
    modelProvider: 'google_gemini',
    modelIdentifier: 'gemini-4-hydrogen',
    allowedTools: ['read_client_status', 'draft_client_update', 'escalate_client_risk'],
    qualityRequirements: 'Accurate reflection of actual database statuses and pending human reviews.',
  },
  {
    code: 'finance_agent',
    name: 'Finance Agent',
    deptCode: 'finance_operations',
    jobTitle: 'Financial Operations Analyst',
    supervisorName: 'Finance Director',
    roleDescription: 'Analyzes recorded revenue, AI usage costs, project expenses, and client profitability without ever inventing financial figures or executing payments.',
    systemInstructions: 'You are the Finance Agent. Analyze ONLY the actual recorded invoices, payments, expenses, and AI usage cost records supplied in context. Strictly separate actual expenses from estimates. Never invent financial values and never execute financial transactions. Return strictly valid JSON.',
    modelProvider: 'google_gemini',
    modelIdentifier: 'gemini-4-hydrogen',
    allowedTools: ['read_financial_ledger', 'prepare_profitability_brief'],
    qualityRequirements: '100% arithmetic fidelity to recorded ledger entries; clear actual vs estimate distinction.',
  },
];

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
    providerCode: 'google_gemini',
    displayName: 'Google Gemini AI (Text & Grounded Research)',
    category: 'ai_text',
    requiredEnvVars: ['GEMINI_API_KEY'],
    requiredScopes: [],
    capabilities: { textGeneration: true, structuredJson: true, googleSearchGrounding: true },
    limitationsNote: 'Server-side SDK (@google/genai) using free-tier-compatible models (gemini-4-hydrogen, gemini-3.1-flash-lite). Uses your GEMINI_API_KEY from Settings > Secrets.',
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
    INSERT OR IGNORE INTO organizations (id, name, legal_name, website, default_currency, timezone, governance_policy_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    DEFAULT_ORG_ID,
    'Kestrel Social Agency',
    'Kestrel Social Media Operations LLC',
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
  for (const dept of DEPARTMENTS) {
    const id = `dept_${dept.code}`;
    insertDept.run(id, DEFAULT_ORG_ID, dept.code, dept.name, dept.description, dept.code, dept.colorHex, ts, ts);
    updateDeptMeta.run(dept.code, dept.colorHex, id);
    deptIdsByCode.set(dept.code, id);
  }

  // 2b. 4 Real Virtual Meeting Rooms
  const insertRoom = db.prepare(`
    INSERT OR IGNORE INTO meeting_rooms (id, organization_id, code, name, room_type, capacity, description, color_hex, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
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
  for (const role of SYSTEM_ROLES) {
    const roleId = `role_${role.code}`;
    insertRole.run(roleId, DEFAULT_ORG_ID, role.code, role.name, role.description, ts);
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

  // Ensure existing installations migrate image_generation_agent to free-tier-compatible default
  db.prepare(
    `UPDATE agents SET model_identifier = 'gemini-4-hydrogen', updated_at = ?
     WHERE code = 'image_generation_agent' AND model_identifier = 'gemini-3.1-flash-lite-image'`
  ).run(ts);

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
