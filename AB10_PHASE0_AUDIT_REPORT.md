# AB10 Phase 0 Audit Report: Worker + Team Model Implementation Prep

**Date:** 2025-01-26  
**Goal:** Audit current schema and codebase for job assignment to prepare Worker + Team model implementation  
**Status:** ✅ Complete - No changes applied

---

## 1. Current Data Model

### 1.1 Jobs Table
**Location:** Referenced in migrations and code (no explicit CREATE TABLE found, but schema inferred)

**Key Columns:**
- `id` (UUID, primary key)
- `assigned_to` (UUID, nullable) - **Foreign key to `crew_members.id`**
- `company_id` (UUID) - Company scoping
- `customer_id` (UUID, FK to customers)
- `service_date` (date)
- `scheduled_end_date` (date, nullable)
- `status` (text) - Values: 'Pending', 'Completed', 'Canceled', 'In Progress'
- `job_cost` (numeric)
- `crew_pay` (numeric)
- `services_performed` (text)
- `notes` (text)
- `before_image` (text/URL)
- `after_image` (text/URL)
- `invoice_path` (text, nullable)
- `invoice_uploaded_at` (timestamptz, nullable)

**Key Finding:**
- ✅ Uses `assigned_to` (NOT `crew_id`)
- ✅ `assigned_to` references `crew_members.id` (UUID)
- ✅ Assignment is **optional** (nullable)
- ✅ Company-scoped via `company_id`

### 1.2 Crew Members Table
**Location:** Referenced throughout codebase

**Key Columns:**
- `id` (UUID, primary key)
- `full_name` (text)
- `email` (text, nullable)
- `phone` (text, nullable)
- `role` (text) - Values: 'crew', 'lead'
- `user_id` (UUID, nullable) - **Foreign key to `profiles.id`** (links to auth user)
- `company_id` (UUID) - Company scoping

**Key Finding:**
- ✅ Each crew member can optionally link to a user account via `user_id`
- ✅ Company-scoped via `company_id`
- ✅ No team/crew grouping exists (flat structure)

### 1.3 Profiles Table
**Location:** `supabase/migrations/20260126000002_profiles_setup_and_rls.sql`

**Key Columns:**
- `id` (UUID, primary key, FK to `auth.users.id`)
- `email` (text)
- `full_name` (text)
- `role` (text) - Values: 'admin', 'crew', 'customer'
- `company_id` (UUID) - Company scoping
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

**Key Finding:**
- ✅ One profile per auth user
- ✅ Company-scoped via `company_id`
- ✅ RLS policies enforce company isolation

### 1.4 Teams/Crews Table
**Status:** ❌ **DOES NOT EXIST**

**Finding:**
- No `teams` or `crews` table exists
- No team membership table exists
- Current model: Direct assignment from jobs → crew_members (1:1)

---

## 2. Code Usage Analysis

### 2.1 Assignment Dropdown Population

**Files:**
1. `src/pages/admin/JobsAdmin.jsx` (lines 123-142, 314-319)
   - Fetches: `crew_members` filtered by `company_id`
   - Populates: `<select>` with `crewMembers.map()` showing `full_name`
   - Stores: `formData.assigned_to = crew.id`

2. `src/pages/admin/ScheduleAdmin.jsx` (lines 112-121)
   - Fetches: `crew_members` filtered by `company_id`
   - Used for: Filter dropdown and assignment dropdown in `ScheduleJobRow`

3. `src/pages/admin/RecurringJobsAdmin.jsx` (lines 62-80, 344-357)
   - Fetches: `crew_members` filtered by `company_id`
   - Uses: `default_crew_id` field (inconsistent naming - should be `default_assigned_to`)

4. `src/components/schedule/ScheduleJobRow.jsx` (lines 22-23, 47-59)
   - Receives: `crewMembers` array as prop
   - Displays: Assignment dropdown with crew member names
   - Updates: `onAssignCrew(job.id, crewId)`

### 2.2 Assignment Display

**Files:**
1. `src/pages/admin/JobsAdmin.jsx`
   - Line 314-319: Fetches crew for display
   - Uses lookup: `crew.find(c => c.id === job.assigned_to)?.full_name`
   - Displays: In job cards/list views

2. `src/pages/admin/ScheduleAdmin.jsx`
   - Line 248: Enriches jobs with `__crewName` via lookup
   - Line 216: Builds `crewById` map from `crewMembers`
   - Displays: In agenda, calendar, and week views

3. `src/components/schedule/CalendarWeek.jsx`
   - Line 474: Displays `crewName` in job pills
   - Line 153-154: Sorts by `__crewName` or `assigned_to`
   - Shows: Crew name badge in week view

4. `src/components/schedule/ScheduleJobRow.jsx`
   - Line 22-23: Looks up assigned crew: `crewMembers.find(c => c.id === job.assigned_to)`
   - Line 36: Displays crew name or "Unassigned"

5. `src/pages/admin/RecurringJobsAdmin.jsx`
   - Line 144: Uses `default_crew_id` when generating jobs (inconsistent - should be `assigned_to`)

### 2.3 Worker Portal (CrewPortal.jsx)

**File:** `src/CrewPortal.jsx`

**Current Logic:**
```javascript
// Line 175-180: Find crew_members row by user_id
const { data: crew } = await supabase
  .from('crew_members')
  .select('id')
  .eq('user_id', user.id)
  .single()

// Line 183-189: Fetch jobs assigned to that crew_member.id
const { data: jobsData } = await supabase
  .from('jobs')
  .select('...')
  .eq('assigned_to', crew.id)
```

**Key Finding:**
- ✅ Worker Portal resolves "my jobs" via: `user_id → crew_members.id → jobs.assigned_to`
- ✅ Requires `crew_members.user_id` to be set (linked account)
- ✅ RLS should enforce this (but code also filters client-side)

### 2.4 Job Status Constants

**Status Values Found:**
- `'Pending'` - Default status for new jobs
- `'Completed'` - Job finished
- `'Canceled'` - Job cancelled
- `'In Progress'` - Job in progress

**Assignment Requirement:**
- ❌ **Assignment is NOT required** - jobs can have `assigned_to = null`
- ✅ Filter exists for "unassigned" jobs (quickFilter: 'unassigned')
- ✅ UI shows "Unassigned" when `assigned_to` is null

**Files Referencing Status:**
- `src/pages/admin/JobsAdmin.jsx` - Status dropdown, filters
- `src/CrewPortal.jsx` - Filters completed jobs
- `src/components/schedule/ScheduleJobRow.jsx` - Status badges
- `src/components/schedule/CalendarWeek.jsx` - Status colors

---

## 3. RLS (Row Level Security) Implications

### Current RLS Setup:
- ✅ `profiles` table has RLS with company-scoped policies
- ✅ `crew_members` likely has RLS (company-scoped)
- ✅ `jobs` likely has RLS (company-scoped)
- ✅ Helper function: `current_company_id()` returns user's company from profile

### RLS Considerations for AB10:
- Teams must be company-scoped (`teams.company_id`)
- Team members must be company-scoped (via team's company_id)
- Jobs assigned to teams must respect company boundaries
- Worker Portal must filter by team membership (not just direct assignment)

---

## 4. AB10 Design Proposal

### 4.1 Recommended Database Tables

#### Table: `teams`
```sql
CREATE TABLE teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, name) -- Prevent duplicate team names per company
);

-- RLS: Company-scoped
```

#### Table: `team_members`
```sql
CREATE TABLE team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  crew_member_id uuid NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  role text DEFAULT 'member', -- 'member', 'lead'
  created_at timestamptz DEFAULT now(),
  UNIQUE(team_id, crew_member_id) -- One crew member per team
);

-- RLS: Company-scoped via team.company_id
```

#### Optional Future Table: `job_assignments`
```sql
-- For future: multi-team assignment or assignment history
CREATE TABLE job_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid REFERENCES profiles(id),
  UNIQUE(job_id, team_id)
);
```

### 4.2 Migration Strategy

#### Phase 1: Create Teams Infrastructure (Non-Breaking)
1. Create `teams` table
2. Create `team_members` table
3. Add RLS policies (company-scoped)
4. **No changes to `jobs.assigned_to` yet**

#### Phase 2: Migrate Existing Data
1. For each `crew_member`:
   - Create a team with `name = crew_member.full_name`
   - Add that crew_member to the team as a member
   - Store mapping: `crew_member.id → team.id`

2. Update `jobs.assigned_to`:
   - **Option A (Recommended):** Keep `assigned_to` but change meaning:
     - `jobs.assigned_to` → points to `teams.id` (not `crew_members.id`)
     - Rename column: `assigned_to` → `assigned_team_id` (or keep name, change FK)
   
   - **Option B (Alternative):** Add new column:
     - Add `assigned_team_id` (nullable)
     - Migrate: `jobs.assigned_to` (crew_member) → `jobs.assigned_team_id` (team)
     - Keep `assigned_to` for backward compatibility, deprecate later

#### Phase 3: Update Code
1. Update assignment dropdowns to show teams (not crew_members)
2. Update display logic to show team names
3. Update Worker Portal to query via team membership
4. Update RLS policies for team-based access

### 4.3 UI Changes

#### Assignment Dropdown
**Current:**
```jsx
<select value={job.assigned_to}>
  <option value="">Unassigned</option>
  {crewMembers.map(c => (
    <option key={c.id} value={c.id}>{c.full_name}</option>
  ))}
</select>
```

**Proposed:**
```jsx
<select value={job.assigned_team_id}>
  <option value="">Unassigned</option>
  {teams.map(team => {
    const memberCount = teamMembersByTeam[team.id]?.length || 0;
    const displayName = memberCount === 1 
      ? teamMembersByTeam[team.id][0].full_name  // Show worker name for single-person teams
      : team.name;  // Show team name for multi-person teams
    return (
      <option key={team.id} value={team.id}>{displayName}</option>
    );
  })}
</select>
```

**Display Logic:**
- Single-person team: Show worker's name (e.g., "John Smith")
- Multi-person team: Show team name (e.g., "Crew A", "Team 1")

#### Worker Portal Resolution
**Current:**
```javascript
// Find my crew_member row
const crew = await supabase
  .from('crew_members')
  .select('id')
  .eq('user_id', user.id)
  .single();

// Fetch jobs assigned to me
const jobs = await supabase
  .from('jobs')
  .select('...')
  .eq('assigned_to', crew.id);
```

**Proposed:**
```javascript
// Find my crew_member row
const crew = await supabase
  .from('crew_members')
  .select('id')
  .eq('user_id', user.id)
  .single();

// Find teams I'm a member of
const { data: myTeams } = await supabase
  .from('team_members')
  .select('team_id')
  .eq('crew_member_id', crew.id);

const teamIds = myTeams.map(t => t.team_id);

// Fetch jobs assigned to my teams
const jobs = await supabase
  .from('jobs')
  .select('...')
  .in('assigned_team_id', teamIds);
```

### 4.4 RLS Implications

#### Teams Table RLS
```sql
-- Users can SELECT teams in their company
CREATE POLICY teams_select_same_company
ON teams FOR SELECT
TO authenticated
USING (company_id = current_company_id());
```

#### Team Members Table RLS
```sql
-- Users can SELECT team_members for teams in their company
CREATE POLICY team_members_select_same_company
ON team_members FOR SELECT
TO authenticated
USING (
  team_id IN (
    SELECT id FROM teams WHERE company_id = current_company_id()
  )
);
```

#### Jobs Table RLS (Updated)
```sql
-- Ensure jobs.assigned_team_id points to teams in same company
-- (Existing company_id check should suffice, but add FK constraint)
ALTER TABLE jobs
  ADD CONSTRAINT jobs_assigned_team_id_fkey
  FOREIGN KEY (assigned_team_id)
  REFERENCES teams(id)
  ON DELETE SET NULL;
```

---

## 5. Step-by-Step Phased Rollout

### Phase 1: Infrastructure (Non-Breaking)
**Goal:** Create teams infrastructure without changing behavior

1. ✅ Create migration: `20260127000000_ab10_teams_infrastructure.sql`
   - Create `teams` table
   - Create `team_members` table
   - Add RLS policies
   - Add indexes

2. ✅ Test: Verify tables created, RLS works

**Risk:** Low - No existing code affected

---

### Phase 2: Data Migration (Backward Compatible)
**Goal:** Migrate existing workers to teams, prepare for code changes

1. ✅ Create migration: `20260127000001_ab10_migrate_workers_to_teams.sql`
   - For each `crew_member`:
     - Create team: `name = crew_member.full_name`
     - Insert into `team_members`: `(team_id, crew_member_id)`
   - Store mapping in temp table or function

2. ✅ Add `assigned_team_id` column to `jobs` (nullable)
   - Migrate: `jobs.assigned_to` (crew_member) → `jobs.assigned_team_id` (team)
   - Keep `assigned_to` for now (backward compatibility)

3. ✅ Add foreign key: `jobs.assigned_team_id → teams.id`

4. ✅ Test: Verify all jobs have corresponding team assignments

**Risk:** Medium - Data migration must be accurate

---

### Phase 3: Code Updates (Gradual)
**Goal:** Update code to use teams, maintain backward compatibility

1. ✅ Update assignment dropdowns:
   - `JobsAdmin.jsx` - Fetch teams, show team names
   - `ScheduleAdmin.jsx` - Update assignment logic
   - `RecurringJobsAdmin.jsx` - Use `assigned_team_id`

2. ✅ Update display logic:
   - `ScheduleJobRow.jsx` - Show team name (or worker name for single-person teams)
   - `CalendarWeek.jsx` - Update crew name lookup
   - `JobsAdmin.jsx` - Update job card display

3. ✅ Update Worker Portal:
   - `CrewPortal.jsx` - Query via team membership

4. ✅ Test: Verify UI shows correct assignments

**Risk:** Medium - UI changes need thorough testing

---

### Phase 4: Cleanup (Optional)
**Goal:** Remove backward compatibility code

1. ✅ Remove `jobs.assigned_to` column (after verifying all code uses `assigned_team_id`)
2. ✅ Update any remaining references
3. ✅ Test: Full regression test

**Risk:** Low - Only after Phase 3 is stable

---

## 6. Key Files Requiring Changes

### Database Migrations
- `supabase/migrations/20260127000000_ab10_teams_infrastructure.sql` (NEW)
- `supabase/migrations/20260127000001_ab10_migrate_workers_to_teams.sql` (NEW)

### Frontend Files
1. `src/pages/admin/JobsAdmin.jsx`
   - Fetch teams instead of crew_members
   - Update assignment dropdown
   - Update display logic

2. `src/pages/admin/ScheduleAdmin.jsx`
   - Fetch teams
   - Update filter dropdown
   - Update assignment handler

3. `src/pages/admin/RecurringJobsAdmin.jsx`
   - Update default assignment field
   - Fix inconsistent `default_crew_id` → `default_team_id`

4. `src/components/schedule/ScheduleJobRow.jsx`
   - Update crew name lookup to team name

5. `src/components/schedule/CalendarWeek.jsx`
   - Update crew name display logic

6. `src/CrewPortal.jsx`
   - Update "my jobs" query to use team membership

7. `src/pages/admin/CrewAdmin.jsx`
   - (Future) Add team management UI

---

## 7. Summary

### Current State
- ✅ Jobs use `assigned_to` (UUID → `crew_members.id`)
- ✅ Assignment is optional (nullable)
- ✅ No teams exist - flat crew_members structure
- ✅ Worker Portal resolves via `crew_members.user_id → jobs.assigned_to`
- ✅ All tables are company-scoped

### Proposed State
- ✅ Jobs use `assigned_team_id` (UUID → `teams.id`)
- ✅ Each worker becomes a "team of one" initially
- ✅ Teams can have multiple members
- ✅ Worker Portal resolves via team membership
- ✅ UI shows worker name for single-person teams, team name for multi-person teams

### Migration Path
- ✅ Phase 1: Create infrastructure (non-breaking)
- ✅ Phase 2: Migrate data (backward compatible)
- ✅ Phase 3: Update code (gradual)
- ✅ Phase 4: Cleanup (optional)

### Risks
- ⚠️ Data migration accuracy (Phase 2)
- ⚠️ UI/UX changes need testing (Phase 3)
- ⚠️ Worker Portal query changes (Phase 3)

---

## 8. Next Steps

1. **Review this audit report** - Confirm findings and design proposal
2. **Create Phase 1 migration** - Teams infrastructure
3. **Test Phase 1** - Verify tables and RLS
4. **Create Phase 2 migration** - Data migration script
5. **Test Phase 2** - Verify data migration accuracy
6. **Begin Phase 3** - Update code files one by one

---

**End of Audit Report**

