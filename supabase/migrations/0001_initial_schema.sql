-- ============================================================
-- 0001_initial_schema.sql
-- Brand Studio — schéma initial
-- PostgreSQL 15+ / Supabase
-- ============================================================

-- Extension nécessaire pour gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id    bigint      NOT NULL UNIQUE,
    username       text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    last_active_at timestamptz NOT NULL DEFAULT now()
);

-- Index sur telegram_id (lookups fréquents à chaque mise à jour Telegram)
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users (telegram_id);

-- ============================================================
-- TABLE: conversations
-- Persiste l'état de la conversation /newbrand (étape courante,
-- données collectées, projet actif).
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    step              text,
    collected_data    jsonb       NOT NULL DEFAULT '{}',
    active_project_id uuid,       -- FK ajoutée après la table projects
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations (user_id);

-- ============================================================
-- TABLE: projects
-- Un projet correspond à une demande /newbrand complète.
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    state             text        NOT NULL DEFAULT 'RECEIVED',
    brand_name        text,
    sector            text,
    target_audience   text,
    positioning       text,
    art_directions    text[]      NOT NULL DEFAULT '{}',
    selected_supports text[]      NOT NULL DEFAULT '{}',
    retry_count       int         NOT NULL DEFAULT 0,
    max_retries       int         NOT NULL DEFAULT 3,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id   ON projects (user_id);
CREATE INDEX IF NOT EXISTS idx_projects_state      ON projects (state);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects (created_at);

-- Contrainte FK différée : conversations.active_project_id → projects.id
-- (les deux tables sont maintenant créées)
ALTER TABLE conversations
    ADD CONSTRAINT fk_conversations_active_project
    FOREIGN KEY (active_project_id) REFERENCES projects (id) ON DELETE SET NULL;

-- ============================================================
-- TABLE: project_assets
-- Un asset = un fichier image produit pour un support donné.
-- ============================================================
CREATE TABLE IF NOT EXISTS project_assets (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    support_type     text,
    idempotency_key  text        UNIQUE,
    status           text        NOT NULL DEFAULT 'PENDING',
    storage_path     text,
    charter_version  int         NOT NULL DEFAULT 1,
    qc_result        jsonb,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_assets_project_id      ON project_assets (project_id);
CREATE INDEX IF NOT EXISTS idx_project_assets_idempotency_key ON project_assets (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_project_assets_status          ON project_assets (status);

-- ============================================================
-- TABLE: brand_profiles
-- Un seul profil par projet (UNIQUE sur project_id).
-- Contient les données déterministes + sémantiques du logo.
-- ============================================================
CREATE TABLE IF NOT EXISTS brand_profiles (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid        NOT NULL UNIQUE REFERENCES projects (id) ON DELETE CASCADE,
    profile     jsonb       NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_profiles_project_id ON brand_profiles (project_id);

-- ============================================================
-- TABLE: generation_jobs
-- Trace chaque étape Inngest (nom, statut, erreur éventuelle).
-- ============================================================
CREATE TABLE IF NOT EXISTS generation_jobs (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    inngest_run_id text,
    step_name      text,
    status         text        NOT NULL DEFAULT 'PENDING',
    error          text,
    attempts       int         NOT NULL DEFAULT 0,
    started_at     timestamptz,
    finished_at    timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_project_id ON generation_jobs (project_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status     ON generation_jobs (status);

-- ============================================================
-- TABLE: quality_checks
-- Résultats de contrôle qualité pour chaque asset.
-- ============================================================
CREATE TABLE IF NOT EXISTS quality_checks (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    asset_id   uuid        NOT NULL REFERENCES project_assets (id) ON DELETE CASCADE,
    check_type text,
    passed     boolean,
    severity   text,
    result     jsonb       NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_checks_project_id ON quality_checks (project_id);
CREATE INDEX IF NOT EXISTS idx_quality_checks_asset_id   ON quality_checks (asset_id);

-- ============================================================
-- TABLE: cost_records
-- Suivi granulaire des dépenses par projet et par opération.
-- ============================================================
CREATE TABLE IF NOT EXISTS cost_records (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    provider       text,
    model          text,
    operation      text,
    declared_cost  numeric,
    estimated_cost numeric,
    is_estimate    boolean     NOT NULL DEFAULT true,
    attempts       int         NOT NULL DEFAULT 1,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_records_project_id  ON cost_records (project_id);
CREATE INDEX IF NOT EXISTS idx_cost_records_created_at  ON cost_records (created_at);

-- ============================================================
-- TABLE: delivery_records
-- Trace la livraison finale (sendDocument ou lien signé).
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_records (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    method       text,
    storage_path text,
    signed_url   text,
    expires_at   timestamptz,
    delivered_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_delivery_records_project_id ON delivery_records (project_id);
