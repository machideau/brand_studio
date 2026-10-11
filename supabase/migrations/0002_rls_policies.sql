-- ============================================================
-- 0002_rls_policies.sql
-- Brand Studio — Row Level Security (RLS)
-- Politique : accès exclusif au service role (côté serveur Next.js).
-- Aucun accès direct depuis le client browser.
-- PostgreSQL 15+ / Supabase
-- ============================================================

-- ============================================================
-- Activation du RLS sur toutes les tables
-- ============================================================
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_assets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_jobs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_checks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_records      ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_records  ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper : renvoie true si l'appelant est le service role.
-- Utilisé dans toutes les politiques ci-dessous.
-- ============================================================
CREATE OR REPLACE FUNCTION is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT current_setting('role') = 'service_role'
        OR auth.role() = 'service_role';
$$;

-- ============================================================
-- TABLE: users
-- ============================================================
DROP POLICY IF EXISTS "service_role_all_users"   ON users;
CREATE POLICY "service_role_all_users"
    ON users
    FOR ALL
    USING (is_service_role())
    WITH CHECK (is_service_role());

-- ============================================================
-- TABLE: conversations
-- ============================================================
DROP POLICY IF EXISTS "service_role_all_conversations" ON conversations;
CREATE POLICY "service_role_all_conversations"
    ON conversations
    FOR ALL
    USING (is_service_role())
    WITH CHECK (is_service_role());

-- ============================================================
-- TABLE: projects
-- ============================================================
DROP POLICY IF EXISTS "service_role_all_projects" ON projects;
CREATE POLICY "service_role_all_projects"
    ON projects
    FOR ALL
    USING (is_service_role())
    WITH CHECK (is_service_role());

-- ============================================================
-- TABLE: project_assets
-- ============================================================
DROP POLICY IF EXISTS "service_role_all_project_assets" ON project_assets;
CREATE POLICY "service_role_all_project_assets"
    ON project_assets
    FOR ALL
    USING (is_service_role())
    WITH CHECK (is_service_role());

-- ============================================================
-- TABLE: brand_profiles
-- ============================================================
DROP POLICY IF EXISTS "service_role_all_brand_profiles" ON brand_profiles;
CREATE POLICY "service_role_all_brand_profiles"
    ON brand_profiles
    FOR ALL
    USING (is_service_role())
    WITH CHECK (is_service_role());

-- ============================================================
-- TABLE: generation_jobs
-- ============================================================
DROP POLICY IF EXISTS "service_role_all_generation_jobs" ON generation_jobs;
CREATE POLICY "service_role_all_generation_jobs"
    ON generation_jobs
    FOR ALL
    USING (is_service_role())
    WITH CHECK (is_service_role());

-- ============================================================
-- TABLE: quality_checks
-- ============================================================
DROP POLICY IF EXISTS "service_role_all_quality_checks" ON quality_checks;
CREATE POLICY "service_role_all_quality_checks"
    ON quality_checks
    FOR ALL
    USING (is_service_role())
    WITH CHECK (is_service_role());

-- ============================================================
-- TABLE: cost_records
-- ============================================================
DROP POLICY IF EXISTS "service_role_all_cost_records" ON cost_records;
CREATE POLICY "service_role_all_cost_records"
    ON cost_records
    FOR ALL
    USING (is_service_role())
    WITH CHECK (is_service_role());

-- ============================================================
-- TABLE: delivery_records
-- ============================================================
DROP POLICY IF EXISTS "service_role_all_delivery_records" ON delivery_records;
CREATE POLICY "service_role_all_delivery_records"
    ON delivery_records
    FOR ALL
    USING (is_service_role())
    WITH CHECK (is_service_role());
