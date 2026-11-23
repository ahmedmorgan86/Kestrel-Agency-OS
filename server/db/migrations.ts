import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from './database';

export interface Migration {
  version: string;
  name: string;
  sql: string;
  postRun?: (db: DatabaseSync) => void;
}

export const MIGRATIONS: Migration[] = [
  {
    version: '001',
    name: 'initial_agency_os_schema',
    sql: `
      -- Organizations & Identity
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        legal_name TEXT NOT NULL DEFAULT '',
        website TEXT NOT NULL DEFAULT '',
        default_currency TEXT NOT NULL DEFAULT 'USD',
        timezone TEXT NOT NULL DEFAULT 'UTC',
        governance_policy_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
        last_login_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        ip_address TEXT NOT NULL DEFAULT '',
        user_agent TEXT NOT NULL DEFAULT '',
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

      CREATE TABLE IF NOT EXISTS departments (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        lead_employee_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        is_system INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS permissions (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      );

      CREATE TABLE IF NOT EXISTS user_roles (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        assigned_at TEXT NOT NULL,
        PRIMARY KEY (user_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
        department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        job_title TEXT NOT NULL,
        manager_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
        employment_status TEXT NOT NULL DEFAULT 'active' CHECK (employment_status IN ('active','on_leave','offboarded')),
        monthly_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_cost_cents >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- AI Agent Workforce
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
        job_title TEXT NOT NULL,
        role_description TEXT NOT NULL,
        supervisor_name TEXT NOT NULL DEFAULT 'Executive Management',
        system_instructions TEXT NOT NULL,
        prompt_version INTEGER NOT NULL DEFAULT 1,
        model_provider TEXT NOT NULL DEFAULT 'ollama',
        model_identifier TEXT NOT NULL DEFAULT 'qwen3.5:4b',
        allowed_tools_json TEXT NOT NULL DEFAULT '[]',
        permission_policies_json TEXT NOT NULL DEFAULT '{}',
        monthly_budget_usd REAL NOT NULL DEFAULT 50.0 CHECK (monthly_budget_usd >= 0),
        max_tokens INTEGER NOT NULL DEFAULT 4096 CHECK (max_tokens > 0),
        timeout_seconds INTEGER NOT NULL DEFAULT 60 CHECK (timeout_seconds > 0),
        max_retries INTEGER NOT NULL DEFAULT 2 CHECK (max_retries >= 0),
        input_schema_json TEXT NOT NULL DEFAULT '{}',
        output_schema_json TEXT NOT NULL DEFAULT '{}',
        quality_requirements TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_versions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        system_instructions TEXT NOT NULL,
        model_provider TEXT NOT NULL,
        model_identifier TEXT NOT NULL,
        allowed_tools_json TEXT NOT NULL,
        changed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        change_note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        UNIQUE (agent_id, version_number)
      );

      CREATE TABLE IF NOT EXISTS agent_tools (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        tool_name TEXT NOT NULL,
        requires_human_approval INTEGER NOT NULL DEFAULT 0,
        rate_limit_per_hour INTEGER NOT NULL DEFAULT 60,
        UNIQUE (agent_id, tool_name)
      );

      CREATE TABLE IF NOT EXISTS agent_policies (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        policy_key TEXT NOT NULL,
        policy_value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (agent_id, policy_key)
      );

      -- Client CRM & Versioned Brand Profiles
      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        legal_name TEXT NOT NULL DEFAULT '',
        industry TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('onboarding','active','paused','offboarded')),
        account_manager_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
        assigned_agent_ids_json TEXT NOT NULL DEFAULT '[]',
        service_package TEXT NOT NULL DEFAULT '',
        monthly_retainer_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_retainer_cents >= 0),
        billing_email TEXT NOT NULL DEFAULT '',
        contract_start_date TEXT,
        contract_renewal_date TEXT,
        notes TEXT NOT NULL DEFAULT '',
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_clients_org_status ON clients(organization_id, status);

      CREATE TABLE IF NOT EXISTS client_contacts (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        full_name TEXT NOT NULL,
        role_title TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        is_primary INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS client_brands (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        industry TEXT NOT NULL DEFAULT '',
        current_version_number INTEGER NOT NULL DEFAULT 1,
        approved_version_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_brands_client ON client_brands(client_id);

      CREATE TABLE IF NOT EXISTS client_brand_versions (
        id TEXT PRIMARY KEY,
        brand_id TEXT NOT NULL REFERENCES client_brands(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        target_audience TEXT NOT NULL DEFAULT '',
        audience_segments_json TEXT NOT NULL DEFAULT '[]',
        positioning TEXT NOT NULL DEFAULT '',
        personality TEXT NOT NULL DEFAULT '',
        tone_of_voice TEXT NOT NULL DEFAULT '',
        preferred_language TEXT NOT NULL DEFAULT 'English',
        dialect TEXT NOT NULL DEFAULT '',
        writing_style TEXT NOT NULL DEFAULT '',
        preferred_expressions_json TEXT NOT NULL DEFAULT '[]',
        prohibited_expressions_json TEXT NOT NULL DEFAULT '[]',
        hashtag_preferences_json TEXT NOT NULL DEFAULT '[]',
        cta_preferences_json TEXT NOT NULL DEFAULT '[]',
        color_palette_json TEXT NOT NULL DEFAULT '[]',
        typography_json TEXT NOT NULL DEFAULT '{}',
        visual_references_json TEXT NOT NULL DEFAULT '[]',
        approved_examples_json TEXT NOT NULL DEFAULT '[]',
        competitor_references_json TEXT NOT NULL DEFAULT '[]',
        platform_guidelines_json TEXT NOT NULL DEFAULT '{}',
        created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        change_summary TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        UNIQUE (brand_id, version_number)
      );

      -- Integrations & Social Accounts
      CREATE TABLE IF NOT EXISTS integrations (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        provider_code TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('ai_text','ai_image','ai_video','social','analytics','storage')),
        status TEXT NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured','configuration_incomplete','connected','authentication_expired','permission_denied','temporarily_unavailable','error','disconnected')),
        required_env_vars_json TEXT NOT NULL DEFAULT '[]',
        required_scopes_json TEXT NOT NULL DEFAULT '[]',
        capabilities_json TEXT NOT NULL DEFAULT '{}',
        limitations_note TEXT NOT NULL DEFAULT '',
        last_verified_at TEXT,
        last_error TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS client_social_accounts (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        brand_id TEXT REFERENCES client_brands(id) ON DELETE SET NULL,
        platform TEXT NOT NULL CHECK (platform IN ('instagram','facebook','tiktok','youtube','linkedin')),
        account_handle TEXT NOT NULL,
        external_account_id TEXT NOT NULL DEFAULT '',
        connection_status TEXT NOT NULL DEFAULT 'not_configured' CHECK (connection_status IN ('not_configured','configuration_incomplete','connected','authentication_expired','permission_denied','temporarily_unavailable','error','disconnected')),
        granted_scopes_json TEXT NOT NULL DEFAULT '[]',
        encrypted_credentials_ref TEXT,
        token_expires_at TEXT,
        last_synced_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Projects & Campaigns
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        brand_id TEXT REFERENCES client_brands(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        objectives TEXT NOT NULL DEFAULT '',
        scope TEXT NOT NULL DEFAULT '',
        deliverables_json TEXT NOT NULL DEFAULT '[]',
        budget_cents INTEGER NOT NULL DEFAULT 0 CHECK (budget_cents >= 0),
        start_date TEXT,
        target_end_date TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planning','active','on_hold','completed','archived')),
        assigned_employee_ids_json TEXT NOT NULL DEFAULT '[]',
        assigned_agent_ids_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);

      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        brand_id TEXT REFERENCES client_brands(id) ON DELETE SET NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        objective TEXT NOT NULL DEFAULT '',
        target_audience TEXT NOT NULL DEFAULT '',
        platforms_json TEXT NOT NULL DEFAULT '[]',
        start_date TEXT,
        end_date TEXT,
        budget_cents INTEGER NOT NULL DEFAULT 0 CHECK (budget_cents >= 0),
        creative_direction TEXT NOT NULL DEFAULT '',
        kpis_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','paused','completed','archived')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Assets & Storage Metadata (never storing binary blobs in SQL)
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
        brand_id TEXT REFERENCES client_brands(id) ON DELETE SET NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        asset_type TEXT NOT NULL CHECK (asset_type IN ('image','video','document','logo','report','other')),
        mime_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
        storage_key TEXT NOT NULL UNIQUE,
        sha256_checksum TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'upload' CHECK (source_type IN ('upload','ai_generated','export')),
        provider_metadata_json TEXT NOT NULL DEFAULT '{}',
        uploaded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS asset_versions (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        storage_key TEXT NOT NULL,
        sha256_checksum TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (asset_id, version_number)
      );

      -- Content Management & Versioning
      CREATE TABLE IF NOT EXISTS content_calendars (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        brand_id TEXT REFERENCES client_brands(id) ON DELETE SET NULL,
        month_key TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS content_items (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        brand_id TEXT NOT NULL REFERENCES client_brands(id) ON DELETE CASCADE,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
        platform TEXT NOT NULL CHECK (platform IN ('instagram','facebook','tiktok','youtube','linkedin')),
        content_format TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'idea' CHECK (status IN (
          'idea','brief','strategy_review','draft','creative_production',
          'quality_assurance','human_review','changes_requested','approved',
          'scheduled','publishing','published','analytics_collection','archived'
        )),
        current_version_id TEXT,
        current_version_number INTEGER NOT NULL DEFAULT 1,
        assigned_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
        owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        scheduled_for TEXT,
        published_at TEXT,
        qa_report_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_content_client_status ON content_items(client_id, status);

      CREATE TABLE IF NOT EXISTS content_versions (
        id TEXT PRIMARY KEY,
        content_item_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        version_hash TEXT NOT NULL,
        title TEXT NOT NULL,
        brief TEXT NOT NULL DEFAULT '',
        caption TEXT NOT NULL DEFAULT '',
        script TEXT NOT NULL DEFAULT '',
        hashtags_json TEXT NOT NULL DEFAULT '[]',
        cta TEXT NOT NULL DEFAULT '',
        media_asset_ids_json TEXT NOT NULL DEFAULT '[]',
        created_by_actor_type TEXT NOT NULL CHECK (created_by_actor_type IN ('human','agent')),
        created_by_actor_id TEXT NOT NULL,
        change_note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        UNIQUE (content_item_id, version_number)
      );

      -- Immutable Human Governance & Approvals
      CREATE TABLE IF NOT EXISTS approval_requests (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        gate_type TEXT NOT NULL CHECK (gate_type IN ('content_publish','strategy','calendar','brand_profile','financial_spend','agent_permission','integration_auth','data_deletion')),
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        content_version_id TEXT REFERENCES content_versions(id) ON DELETE SET NULL,
        version_hash TEXT NOT NULL DEFAULT '',
        requested_by_actor_type TEXT NOT NULL CHECK (requested_by_actor_type IN ('human','agent')),
        requested_by_actor_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','changes_requested','invalidated')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_approvals_status ON approval_requests(status);

      CREATE TABLE IF NOT EXISTS approval_decisions (
        id TEXT PRIMARY KEY,
        approval_request_id TEXT NOT NULL REFERENCES approval_requests(id) ON DELETE RESTRICT,
        content_item_id TEXT,
        content_version_id TEXT,
        version_hash TEXT NOT NULL DEFAULT '',
        reviewer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        decision TEXT NOT NULL CHECK (decision IN ('approved','rejected','changes_requested')),
        comments TEXT NOT NULL DEFAULT '',
        decided_at TEXT NOT NULL
      );

      -- Durable Background Jobs, Tasks, and Agent Executions
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        task_type TEXT NOT NULL DEFAULT 'general',
        client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
        content_item_id TEXT REFERENCES content_items(id) ON DELETE SET NULL,
        department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
        assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        assigned_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
        priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
        due_date TEXT,
        inputs_json TEXT NOT NULL DEFAULT '{}',
        required_tools_json TEXT NOT NULL DEFAULT '[]',
        expected_output_schema_json TEXT NOT NULL DEFAULT '{}',
        requires_approval INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
          'queued','assigned','running','validating','waiting_for_input',
          'waiting_for_approval','in_review','completed','failed',
          'retrying','rejected','cancelled'
        )),
        created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

      CREATE TABLE IF NOT EXISTS task_dependencies (
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        depends_on_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        PRIMARY KEY (task_id, depends_on_task_id),
        CHECK (task_id != depends_on_task_id)
      );

      CREATE TABLE IF NOT EXISTS background_jobs (
        id TEXT PRIMARY KEY,
        job_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','retrying','dead_letter','cancelled')),
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        run_after TEXT NOT NULL,
        lease_owner TEXT,
        lease_expires_at TEXT,
        idempotency_key TEXT UNIQUE,
        correlation_id TEXT NOT NULL,
        result_json TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_status_run_after ON background_jobs(status, run_after);

      CREATE TABLE IF NOT EXISTS task_runs (
        id TEXT PRIMARY KEY,
        task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        background_job_id TEXT REFERENCES background_jobs(id) ON DELETE SET NULL,
        correlation_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued','running','validating','completed','failed','cancelled')),
        model_provider TEXT NOT NULL,
        model_identifier TEXT NOT NULL,
        prompt_summary TEXT NOT NULL DEFAULT '',
        tool_calls_json TEXT NOT NULL DEFAULT '[]',
        structured_output_json TEXT,
        validation_errors_json TEXT NOT NULL DEFAULT '[]',
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        latency_ms INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        error_message TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_task_runs_agent ON task_runs(agent_id, started_at);

      -- Publishing Engine
      CREATE TABLE IF NOT EXISTS publishing_jobs (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        content_item_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
        content_version_id TEXT NOT NULL REFERENCES content_versions(id) ON DELETE RESTRICT,
        version_hash TEXT NOT NULL,
        social_account_id TEXT NOT NULL REFERENCES client_social_accounts(id) ON DELETE RESTRICT,
        platform TEXT NOT NULL,
        approval_decision_id TEXT NOT NULL REFERENCES approval_decisions(id) ON DELETE RESTRICT,
        idempotency_key TEXT NOT NULL UNIQUE,
        scheduled_for TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'scheduled' CHECK (state IN (
          'waiting_for_approval','approved','scheduled','queued','publishing',
          'published','failed','retry_scheduled','cancelled','unknown_outcome_reconciliation_required'
        )),
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        external_post_id TEXT,
        external_post_url TEXT,
        published_at TEXT,
        api_response_json TEXT,
        created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS publishing_attempts (
        id TEXT PRIMARY KEY,
        publishing_job_id TEXT NOT NULL REFERENCES publishing_jobs(id) ON DELETE CASCADE,
        attempt_number INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        http_status INTEGER,
        outcome TEXT NOT NULL,
        error_classification TEXT,
        error_message TEXT,
        response_metadata_json TEXT
      );

      -- Trend Intelligence & Competitor Research
      CREATE TABLE IF NOT EXISTS trends (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        source_name TEXT NOT NULL,
        source_url TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        original_published_at TEXT,
        platform TEXT NOT NULL DEFAULT 'multi',
        geographic_relevance TEXT NOT NULL DEFAULT 'Global',
        language TEXT NOT NULL DEFAULT 'English',
        industry TEXT NOT NULL DEFAULT 'General',
        epistemic_status TEXT NOT NULL CHECK (epistemic_status IN ('verified','source_reported','ai_interpretation','unverified')),
        supporting_evidence TEXT NOT NULL DEFAULT '',
        confidence_level TEXT NOT NULL DEFAULT 'medium' CHECK (confidence_level IN ('low','medium','high')),
        relevance_score INTEGER CHECK (relevance_score >= 0 AND relevance_score <= 100),
        risk_assessment TEXT NOT NULL DEFAULT '',
        content_opportunities TEXT NOT NULL DEFAULT '',
        related_client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
        research_execution_id TEXT REFERENCES task_runs(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS competitors (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
        brand_id TEXT REFERENCES client_brands(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        website_url TEXT NOT NULL DEFAULT '',
        platforms_json TEXT NOT NULL DEFAULT '[]',
        positioning_summary TEXT NOT NULL DEFAULT '',
        observed_strengths TEXT NOT NULL DEFAULT '',
        observed_gaps TEXT NOT NULL DEFAULT '',
        source_urls_json TEXT NOT NULL DEFAULT '[]',
        research_execution_id TEXT REFERENCES task_runs(id) ON DELETE SET NULL,
        observed_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      -- Real Analytics & Provenance
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        social_account_id TEXT NOT NULL REFERENCES client_social_accounts(id) ON DELETE CASCADE,
        content_item_id TEXT REFERENCES content_items(id) ON DELETE SET NULL,
        campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
        platform TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        metric_value REAL,
        is_unavailable INTEGER NOT NULL DEFAULT 0,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        external_source_ref TEXT NOT NULL DEFAULT '',
        calculation_method TEXT NOT NULL DEFAULT 'platform_reported'
      );

      CREATE TABLE IF NOT EXISTS analytics_sync_runs (
        id TEXT PRIMARY KEY,
        social_account_id TEXT NOT NULL REFERENCES client_social_accounts(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed')),
        metrics_collected INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );

      -- Finance & Cost Tracking
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        invoice_number TEXT NOT NULL UNIQUE,
        amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
        currency TEXT NOT NULL DEFAULT 'USD',
        status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('draft','issued','paid','overdue','void')),
        issued_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
        reference_code TEXT NOT NULL DEFAULT '',
        paid_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
        category TEXT NOT NULL CHECK (category IN ('ai_model','image_generation','video_generation','storage','integration','employee','campaign_media','operations')),
        description TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
        is_estimate INTEGER NOT NULL DEFAULT 0,
        incurred_date TEXT NOT NULL,
        recorded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS usage_records (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
        task_run_id TEXT REFERENCES task_runs(id) ON DELETE SET NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        modality TEXT NOT NULL CHECK (modality IN ('text','image','video','embedding')),
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        rate_card_found INTEGER NOT NULL DEFAULT 1,
        recorded_at TEXT NOT NULL
      );

      -- Comments, Notifications, Immutable Audit Logs, System Events
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error')),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        read_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        correlation_id TEXT NOT NULL,
        actor_type TEXT NOT NULL CHECK (actor_type IN ('human','agent','system')),
        actor_id TEXT NOT NULL,
        actor_label TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

      CREATE TABLE IF NOT EXISTS system_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('info','warning','error','critical')),
        message TEXT NOT NULL,
        correlation_id TEXT NOT NULL DEFAULT '',
        details_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
    `,
  },
  {
    version: '002',
    name: 'company_hq_identity_avatars_meetings',
    sql: `
      -- Virtual Meeting Rooms & Multi-Agent Conference Sessions
      CREATE TABLE IF NOT EXISTS meeting_rooms (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        room_type TEXT NOT NULL DEFAULT 'department',
        capacity INTEGER NOT NULL DEFAULT 8,
        description TEXT NOT NULL DEFAULT '',
        color_hex TEXT NOT NULL DEFAULT '#1e3a8a',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        room_id TEXT REFERENCES meeting_rooms(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        meeting_type TEXT NOT NULL DEFAULT 'human_ai_collaboration',
        agenda TEXT NOT NULL DEFAULT '',
        client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','active','completed','cancelled')),
        scheduled_for TEXT,
        started_at TEXT,
        ended_at TEXT,
        summary_text TEXT NOT NULL DEFAULT '',
        created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status, created_at DESC);

      CREATE TABLE IF NOT EXISTS meeting_participants (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        participant_type TEXT NOT NULL CHECK (participant_type IN ('human','agent')),
        participant_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role_title TEXT NOT NULL DEFAULT '',
        seat_index INTEGER NOT NULL DEFAULT 0,
        joined_at TEXT NOT NULL,
        UNIQUE(meeting_id, participant_type, participant_id)
      );

      CREATE TABLE IF NOT EXISTS meeting_contributions (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        participant_type TEXT NOT NULL CHECK (participant_type IN ('human','agent','coordinator')),
        participant_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        contribution_kind TEXT NOT NULL DEFAULT 'message',
        content TEXT NOT NULL,
        structured_json TEXT NOT NULL DEFAULT '{}',
        model_identifier TEXT NOT NULL DEFAULT '',
        cost_usd REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_meeting_contrib ON meeting_contributions(meeting_id, created_at ASC);

      CREATE TABLE IF NOT EXISTS meeting_decisions (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        rationale TEXT NOT NULL DEFAULT '',
        owner_label TEXT NOT NULL DEFAULT '',
        recorded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS meeting_action_items (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        assignee_type TEXT NOT NULL DEFAULT 'agent' CHECK (assignee_type IN ('human','agent')),
        assignee_id TEXT,
        assignee_label TEXT NOT NULL DEFAULT 'Unassigned',
        due_date TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','converted','completed','cancelled')),
        linked_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      );

      -- Real-Time Company Operational Event Feed (backs SSE /api/events/stream)
      CREATE TABLE IF NOT EXISTS company_events (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        actor_type TEXT NOT NULL CHECK (actor_type IN ('human','agent','system')),
        actor_id TEXT NOT NULL,
        actor_label TEXT NOT NULL,
        department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
        entity_type TEXT,
        entity_id TEXT,
        summary TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_company_events_created ON company_events(created_at DESC);
    `,
  },
  {
    version: '003',
    name: 'morgan_academy',
    sql: `
      CREATE TABLE IF NOT EXISTS academy_courses (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        curriculum_json TEXT NOT NULL DEFAULT '[]',
        sort_order INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS academy_enrollments (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        course_id TEXT NOT NULL REFERENCES academy_courses(id) ON DELETE CASCADE,
        employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
        status TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled','in_progress','completed')),
        enrolled_at TEXT NOT NULL,
        completed_at TEXT,
        updated_at TEXT NOT NULL,
        UNIQUE(course_id, employee_id)
      );
      CREATE INDEX IF NOT EXISTS idx_academy_enrollments_employee ON academy_enrollments(employee_id, updated_at DESC);
    `,
  },
  {
    version: '004',
    name: 'morgan_group_identity',
    sql: `
      UPDATE organizations
      SET name = CASE WHEN name IN ('Kestrel Social Agency', 'Kestrel Agency OS') THEN 'MORGAN GROUP' ELSE name END,
          legal_name = CASE WHEN legal_name IN ('Kestrel Social Media Operations LLC', 'Kestrel Agency OS') THEN 'MORGAN GROUP' ELSE legal_name END,
          tagline = CASE WHEN tagline = 'AI-First Social Media Operations' THEN 'Technology, built together' ELSE tagline END,
          brand_primary_color = CASE WHEN brand_primary_color = '#1d4ed8' THEN '#0e7490' ELSE brand_primary_color END,
          brand_secondary_color = CASE WHEN brand_secondary_color = '#0f172a' THEN '#0b1726' ELSE brand_secondary_color END,
          brand_symbol = CASE WHEN brand_symbol = 'kestrel' THEN 'prism' ELSE brand_symbol END,
          updated_at = ?
      WHERE id = 'org_kestrel_agency';
    `,
  },
  {
    version: '005',
    name: 'morgan_technology_company_departments',
    sql: `
      UPDATE departments SET name = CASE code
        WHEN 'executive' THEN 'Executive Leadership'
        WHEN 'strategy_research' THEN 'Research and Intelligence'
        WHEN 'social_media_mgmt' THEN 'Digital Products and Platforms'
        WHEN 'content_planning' THEN 'Product Management'
        WHEN 'content_copywriting' THEN 'Product Writing and Documentation'
        WHEN 'creative_direction' THEN 'Experience Design'
        WHEN 'graphic_design' THEN 'Visual and Brand Design'
        WHEN 'video_production' THEN 'Media and Prototyping Lab'
        WHEN 'quality_assurance' THEN 'Quality Engineering'
        WHEN 'client_success' THEN 'Customer Success'
        WHEN 'publishing_distribution' THEN 'Launch and Communications'
        WHEN 'analytics_reporting' THEN 'Data and Analytics'
        WHEN 'finance_operations' THEN 'Finance and Business Operations'
        ELSE name END,
        description = CASE code
        WHEN 'executive' THEN 'Company leadership, governance, and decision oversight.'
        WHEN 'strategy_research' THEN 'Technology research, market intelligence, and strategic planning.'
        WHEN 'social_media_mgmt' THEN 'Digital product delivery, platform engineering, and service operations.'
        WHEN 'content_planning' THEN 'Product strategy, roadmaps, discovery, and delivery.'
        WHEN 'content_copywriting' THEN 'Product language, technical documentation, and knowledge systems.'
        WHEN 'creative_direction' THEN 'Human centered product design and interaction systems.'
        WHEN 'graphic_design' THEN 'Visual systems, product interfaces, and company identity.'
        WHEN 'video_production' THEN 'Interactive prototypes, demos, and product storytelling.'
        WHEN 'quality_assurance' THEN 'Software quality, validation, reliability, and release readiness.'
        WHEN 'client_success' THEN 'Customer outcomes, product enablement, and support operations.'
        WHEN 'publishing_distribution' THEN 'Product launches, company communications, and distribution.'
        WHEN 'analytics_reporting' THEN 'Data products, business intelligence, and measurement.'
        WHEN 'finance_operations' THEN 'Financial planning, business operations, and governance.'
        ELSE description END,
        updated_at = ?
      WHERE organization_id = 'org_kestrel_agency'
        AND code IN ('executive','strategy_research','social_media_mgmt','content_planning','content_copywriting','creative_direction','graphic_design','video_production','quality_assurance','client_success','publishing_distribution','analytics_reporting','finance_operations')
        AND name IN ('Executive Management','Strategy and Research','Social Media Management','Content Planning','Content and Copywriting','Creative Direction','Graphic Design','Video Production','Quality Assurance','Client Success','Publishing and Distribution','Analytics and Reporting','Finance and Operations');
    `,
  },
  {
    version: '006',
    name: 'free_local_ai_defaults',
    sql: `
      UPDATE agents SET model_provider = 'ollama', model_identifier = 'qwen3.5:4b', updated_at = datetime('now')
      WHERE code IN ('ai_operations_manager','research_agent','strategy_agent','social_media_manager_agent','content_planner_agent','copywriter_agent','creative_director_agent','image_generation_agent','video_production_agent','quality_assurance_agent','publishing_coordinator_agent','analytics_agent','client_success_agent','finance_agent')
        AND model_provider = 'google_gemini' AND model_identifier IN ('gemini-4-hydrogen','gemini-3.1-flash-lite-image');
      UPDATE agent_versions SET model_provider = 'ollama', model_identifier = 'qwen3.5:4b'
      WHERE model_provider = 'google_gemini' AND model_identifier IN ('gemini-4-hydrogen','gemini-3.1-flash-lite-image')
        AND agent_id IN (SELECT id FROM agents WHERE code IN ('ai_operations_manager','research_agent','strategy_agent','social_media_manager_agent','content_planner_agent','copywriter_agent','creative_director_agent','image_generation_agent','video_production_agent','quality_assurance_agent','publishing_coordinator_agent','analytics_agent','client_success_agent','finance_agent'));
    `,
  },
  {
    version: '007',
    name: 'morgan_virtual_staff_profiles',
    sql: `
      ALTER TABLE employees ADD COLUMN profile_json TEXT NOT NULL DEFAULT '{}';
    `,
  },
  {
    version: '008',
    name: 'morgan_private_content_pipeline',
    sql: `
      CREATE TABLE IF NOT EXISTS morgan_production_runs (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        niche TEXT NOT NULL,
        audience TEXT NOT NULL DEFAULT '',
        platform TEXT NOT NULL,
        format TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued','researching','producing','owner_review','accepted','changes_requested','failed')),
        source_items_json TEXT NOT NULL DEFAULT '[]',
        deliverable_json TEXT NOT NULL DEFAULT '{}',
        task_ids_json TEXT NOT NULL DEFAULT '[]',
        parent_run_id TEXT REFERENCES morgan_production_runs(id) ON DELETE SET NULL,
        review_note TEXT NOT NULL DEFAULT '',
        iteration INTEGER NOT NULL DEFAULT 1,
        error_message TEXT NOT NULL DEFAULT '',
        created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_morgan_runs_status ON morgan_production_runs(status, updated_at DESC);
      ALTER TABLE morgan_production_runs ADD COLUMN version_hash TEXT NOT NULL DEFAULT '';
      CREATE TABLE IF NOT EXISTS morgan_production_decisions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES morgan_production_runs(id) ON DELETE CASCADE,
        version_hash TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('accepted','changes_requested')),
        comments TEXT NOT NULL DEFAULT '',
        decided_by_user_id TEXT NOT NULL REFERENCES users(id),
        decided_at TEXT NOT NULL
      );
      ALTER TABLE tasks ADD COLUMN assigned_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL;
    `,
  },
  {
    version: '009',
    name: 'morgan_group_owner_identity',
    sql: `
      ALTER TABLE organizations ADD COLUMN owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
      UPDATE organizations
      SET owner_user_id = (
        SELECT id FROM users WHERE users.organization_id = organizations.id ORDER BY created_at ASC LIMIT 1
      )
      WHERE owner_user_id IS NULL;
    `,
  },
];

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function applyAdditiveColumnsFor002(db: DatabaseSync): void {
  // Organizations: configurable company brand identity
  ensureColumn(db, 'organizations', 'tagline', `TEXT NOT NULL DEFAULT 'AI-First Social Media Operations'`);
  ensureColumn(db, 'organizations', 'brand_primary_color', `TEXT NOT NULL DEFAULT '#1d4ed8'`);
  ensureColumn(db, 'organizations', 'brand_secondary_color', `TEXT NOT NULL DEFAULT '#0f172a'`);
  ensureColumn(db, 'organizations', 'brand_symbol', `TEXT NOT NULL DEFAULT 'kestrel'`);
  ensureColumn(db, 'organizations', 'logo_style', `TEXT NOT NULL DEFAULT 'lockup'`);

  // Departments: operational status, spatial HQ zone code, and visual accent color
  ensureColumn(db, 'departments', 'status', `TEXT NOT NULL DEFAULT 'active'`);
  ensureColumn(db, 'departments', 'zone_code', `TEXT NOT NULL DEFAULT ''`);
  ensureColumn(db, 'departments', 'color_hex', `TEXT NOT NULL DEFAULT '#2563eb'`);

  // Human Employees: full profile & 3D avatar configuration
  ensureColumn(db, 'employees', 'phone', `TEXT NOT NULL DEFAULT ''`);
  ensureColumn(db, 'employees', 'photo_url', `TEXT NOT NULL DEFAULT ''`);
  ensureColumn(db, 'employees', 'joining_date', `TEXT NOT NULL DEFAULT ''`);
  ensureColumn(db, 'employees', 'avatar_config_json', `TEXT NOT NULL DEFAULT '{}'`);
  ensureColumn(db, 'employees', 'workstation_code', `TEXT NOT NULL DEFAULT ''`);

  // AI Agents: human manager linkage & 3D avatar configuration
  ensureColumn(db, 'agents', 'manager_employee_id', `TEXT REFERENCES employees(id) ON DELETE SET NULL`);
  ensureColumn(db, 'agents', 'avatar_config_json', `TEXT NOT NULL DEFAULT '{}'`);
  ensureColumn(db, 'agents', 'workstation_code', `TEXT NOT NULL DEFAULT ''`);
}

export function runMigrations(db: DatabaseSync): { applied: string[] } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all() as { version: string }[];
  const appliedSet = new Set(appliedRows.map((r) => r.version));
  const newlyApplied: string[] = [];

  for (const migration of MIGRATIONS) {
    if (appliedSet.has(migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      if (migration.version === '004' || migration.version === '005') {
        db.prepare(migration.sql).run(nowIso());
      } else if (migration.version === '006') {
        db.exec(migration.sql);
      } else {
        db.exec(migration.sql);
      }
      if (migration.version === '002') {
        applyAdditiveColumnsFor002(db);
      }
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        nowIso()
      );
      db.exec('COMMIT');
      newlyApplied.push(`${migration.version}_${migration.name}`);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  return { applied: newlyApplied };
}
