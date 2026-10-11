-- ============================================================
-- 0003_charter_column.sql
-- Brand Studio — ajout de la colonne charter sur brand_profiles
--
-- La charte graphique générée par le LLM est stockée dans une
-- colonne jsonb dédiée sur la table brand_profiles, à côté du
-- profile (données déterministes + sémantiques du logo).
-- ============================================================

ALTER TABLE brand_profiles
    ADD COLUMN IF NOT EXISTS charter jsonb;
