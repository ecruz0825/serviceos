BEGIN;

-- =============================================================================
-- Add Crew Color Support
-- - Add nullable color column to teams table
-- - Seed existing crews with default colors
-- - Non-breaking: color is optional
-- =============================================================================

-- 1) Add color column to teams table
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS color text;

-- 2) Seed existing teams with default colors
-- Use a palette of distinct colors that work well for dispatch boards
-- Colors are hex codes (e.g., '#3B82F6' for blue)
-- Assign colors using a CTE with row numbers
WITH numbered_teams AS (
  SELECT 
    id,
    company_id,
    ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at) - 1 AS row_num
  FROM public.teams
  WHERE color IS NULL
)
UPDATE public.teams t
SET color = CASE (nt.row_num % 8)
  WHEN 0 THEN '#3B82F6' -- blue
  WHEN 1 THEN '#10B981' -- emerald
  WHEN 2 THEN '#F59E0B' -- amber
  WHEN 3 THEN '#EF4444' -- red
  WHEN 4 THEN '#8B5CF6' -- violet
  WHEN 5 THEN '#EC4899' -- pink
  WHEN 6 THEN '#06B6D4' -- cyan
  WHEN 7 THEN '#84CC16' -- lime
  ELSE '#3B82F6' -- default to blue
END
FROM numbered_teams nt
WHERE t.id = nt.id
  AND t.color IS NULL;

-- Note: This update uses a window function to assign colors based on creation order
-- within each company, ensuring consistent color distribution

COMMIT;
