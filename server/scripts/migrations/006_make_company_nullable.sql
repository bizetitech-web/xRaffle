-- Migration 006: Allow game_templates.company_id to be NULL
-- This allows archive logic to null the company_id for legacy/orphaned templates

ALTER TABLE game_templates
  MODIFY COLUMN company_id CHAR(36) DEFAULT NULL;
