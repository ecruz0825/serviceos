-- =============================================================================
-- AB10 Phase 1 Verification Queries
-- Run these in Supabase SQL Editor after applying migration
-- =============================================================================

-- 1) Verify tables exist
SELECT 
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('teams', 'team_members')
ORDER BY table_name;

-- Expected: 2 rows (teams, team_members)

-- 2) Verify teams table structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'teams'
ORDER BY ordinal_position;

-- Expected columns:
-- id (uuid, NOT NULL, gen_random_uuid())
-- company_id (uuid, NOT NULL)
-- name (text, NOT NULL)
-- created_at (timestamp with time zone, nullable, now())
-- updated_at (timestamp with time zone, nullable, now())

-- 3) Verify team_members table structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'team_members'
ORDER BY ordinal_position;

-- Expected columns:
-- id (uuid, NOT NULL, gen_random_uuid())
-- team_id (uuid, NOT NULL)
-- crew_member_id (uuid, NOT NULL)
-- role (text, nullable, 'member')
-- created_at (timestamp with time zone, nullable, now())

-- 4) Verify indexes exist
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('teams', 'team_members')
ORDER BY tablename, indexname;

-- Expected indexes:
-- idx_teams_company_id on teams(company_id)
-- idx_team_members_team_id on team_members(team_id)
-- idx_team_members_crew_member_id on team_members(crew_member_id)
-- Plus primary key indexes and unique constraint indexes

-- 5) Verify foreign key constraints
SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('teams', 'team_members')
ORDER BY tc.table_name, tc.constraint_name;

-- Expected:
-- team_members.team_id -> teams.id
-- team_members.crew_member_id -> crew_members.id

-- 6) Verify unique constraints
SELECT
  tc.table_name,
  tc.constraint_name,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'UNIQUE'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('teams', 'team_members')
GROUP BY tc.table_name, tc.constraint_name
ORDER BY tc.table_name, tc.constraint_name;

-- Expected:
-- teams: teams_company_name_unique (company_id, name)
-- team_members: team_members_team_crew_unique (team_id, crew_member_id)

-- 7) Verify RLS is enabled
SELECT 
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('teams', 'team_members')
ORDER BY tablename;

-- Expected: rowsecurity = true for both tables

-- 8) Verify RLS policies exist
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('teams', 'team_members')
ORDER BY tablename, policyname;

-- Expected policies:
-- teams:
--   - teams_select_same_company (SELECT)
--   - teams_insert_admin (INSERT)
--   - teams_update_admin (UPDATE)
--   - teams_delete_admin (DELETE)
-- team_members:
--   - team_members_select_same_company (SELECT)
--   - team_members_insert_admin (INSERT)
--   - team_members_update_admin (UPDATE)
--   - team_members_delete_admin (DELETE)

-- 9) Test RLS: Try to SELECT (should work for authenticated users in same company)
-- Replace 'YOUR_COMPANY_ID' with an actual company_id from your database
SELECT COUNT(*) as team_count
FROM public.teams
WHERE company_id = 'YOUR_COMPANY_ID';

-- Expected: Should return count (0 if no teams yet, or count if teams exist)

-- 10) Test RLS: Try to INSERT as admin (should work)
-- This will fail if not admin, which is expected
-- Replace with actual values
/*
INSERT INTO public.teams (company_id, name)
VALUES ('YOUR_COMPANY_ID', 'Test Team')
RETURNING id, name;
*/

-- 11) Verify no changes to jobs table
SELECT 
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'jobs'
  AND column_name = 'assigned_to';

-- Expected: Should return 1 row (assigned_to column still exists, unchanged)

-- 12) Summary check: All tables, indexes, and policies
SELECT 
  'Tables' as type,
  COUNT(*) as count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('teams', 'team_members')
UNION ALL
SELECT 
  'Indexes' as type,
  COUNT(*) as count
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('teams', 'team_members')
UNION ALL
SELECT 
  'RLS Policies' as type,
  COUNT(*) as count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('teams', 'team_members');

-- Expected:
-- Tables: 2
-- Indexes: 5+ (primary keys, unique constraints, plus our 3 custom indexes)
-- RLS Policies: 8 (4 per table)

