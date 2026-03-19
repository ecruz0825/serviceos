# Database Schema Report
**ServiceOps / Lawn Care App**  
**Date:** January 2025  
**Type:** READ-ONLY Schema Analysis

---

## Database Tables by Domain

### IDENTITY

#### `auth.users` (Supabase Auth)
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK, FK to profiles.id)
  - `email` (text)
  - `created_at` (timestamptz)
- **Foreign Keys:**
  - None (base Supabase table)
- **Relationships:**
  - One-to-one with `profiles`
  - Trigger: `on_auth_user_created` auto-creates profile

---

### COMPANIES

#### `companies`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `name` (text)
  - `display_name` (text)
  - `support_email` (text)
  - `support_phone` (text)
  - `address` (text)
  - `logo_path` (text)
  - `email_footer` (text)
  - `timezone` (text, default: 'UTC')
  - `crew_label` (text, default: 'Crew')
  - `customer_label` (text, default: 'Customer')
  - `primary_color` (text, default: '#22c55e')
  - `auto_generate_recurring_jobs` (boolean, default: false)
  - `onboarding_step` (text)
  - `setup_completed_at` (timestamptz)
  - `subscription_status` (text: 'inactive', 'trialing', 'active', 'past_due', 'canceled', 'unpaid')
  - `plan` (text: 'starter', 'pro')
  - `trial_ends_at` (timestamptz)
  - `billing_grace_until` (timestamptz)
  - `billing_updated_at` (timestamptz)
  - `stripe_customer_id` (text)
  - `stripe_subscription_id` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
- **Foreign Keys:**
  - None (root entity)
- **Relationships:**
  - One-to-many: `profiles`, `customers`, `crew_members`, `jobs`, `quotes`, `invoices`, `payments`, `expenses`, `teams`, `recurring_jobs`, `job_schedule_requests`, `customer_activity_log`, `customer_files`, `audit_log`, `collections_cases`, `collections_followups`, `collections_actions_log`, `collections_comms_log`, `collections_comm_templates`, `collections_escalations`, `support_sessions`, `quote_counters`, `invoice_counters`, `stripe_event_ledger`, `billing_subscription_history`

---

### USERS / PROFILES

#### `profiles`
- **Primary Key:** `id` (uuid, FK to auth.users.id)
- **Important Columns:**
  - `id` (uuid, PK, FK to auth.users.id ON DELETE CASCADE)
  - `email` (text)
  - `full_name` (text)
  - `role` (text: 'admin', 'crew', 'customer', 'manager', 'dispatcher', 'platform_admin')
  - `company_id` (uuid, FK to companies.id)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
- **Foreign Keys:**
  - `id` → `auth.users(id)` ON DELETE CASCADE
  - `company_id` → `companies(id)`
- **Relationships:**
  - One-to-one with `auth.users`
  - Many-to-one with `companies`
  - One-to-many: `crew_members` (via user_id), `customers` (via user_id), `payments` (via received_by, created_by), `quotes` (via created_by), `job_schedule_requests` (via approved_by), `collections_cases` (via assigned_to, created_by), `support_sessions` (via platform_admin_id), `audit_log` (via actor_user_id), `customer_activity_log` (via created_by), `job_notes` (via author_user_id), `job_flags` (via created_by, resolved_by), `payment_receipts` (via created_by), `quote_messages` (via created_by), `collections_followups` (via created_by), `collections_actions_log` (via created_by), `collections_comms_log` (via created_by), `billing_subscription_history` (via changed_by)

---

### CUSTOMERS

#### `customers`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, FK to companies.id, NOT NULL)
  - `user_id` (uuid, FK to profiles.id, nullable - links to auth user for customer portal)
  - `full_name` (text)
  - `email` (text)
  - `phone` (text)
  - `address` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
- **Foreign Keys:**
  - `company_id` → `companies(id)`
  - `user_id` → `profiles(id)` (nullable, for customer portal access)
- **Relationships:**
  - Many-to-one with `companies`
  - One-to-one with `profiles` (via user_id, optional)
  - One-to-many: `jobs`, `quotes`, `invoices`, `job_schedule_requests`, `customer_activity_log`, `customer_files`, `collections_cases`, `collections_followups`, `collections_actions_log`, `collections_comms_log`

#### `customer_activity_log`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, FK to companies.id, NOT NULL)
  - `customer_id` (uuid, FK to customers.id, NOT NULL)
  - `event_type` (text)
  - `event_title` (text)
  - `event_description` (text)
  - `event_category` (text, nullable)
  - `related_type` (text, nullable)
  - `related_id` (uuid, nullable)
  - `severity` (text, default: 'info')
  - `event_data` (jsonb, default: '{}')
  - `created_by` (uuid, FK to profiles.id)
  - `created_at` (timestamptz)
- **Foreign Keys:**
  - `company_id` → `companies(id)`
  - `customer_id` → `customers(id)`
  - `created_by` → `profiles(id)`
- **Relationships:**
  - Many-to-one with `companies`, `customers`, `profiles`

#### `customer_files`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, NOT NULL)
  - `customer_id` (uuid, FK to customers.id ON DELETE CASCADE)
  - `file_name` (text, NOT NULL)
  - `file_path` (text, NOT NULL)
  - `mime_type` (text)
  - `size_bytes` (bigint)
  - `created_at` (timestamptz)
  - `created_by` (uuid, FK to auth.users.id)
- **Foreign Keys:**
  - `customer_id` → `customers(id)` ON DELETE CASCADE
  - `created_by` → `auth.users(id)` ON DELETE SET NULL
- **Relationships:**
  - Many-to-one with `customers`
  - One-to-many: `payment_receipts` (via customer_file_id)

#### `customer_feedback`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid)
  - `customer_id` (uuid, FK to customers.id)
  - `job_id` (uuid, FK to jobs.id)
  - `rating` (integer)
  - `comment` (text)
  - `created_at` (timestamptz)
- **Foreign Keys:**
  - `customer_id` → `customers(id)`
  - `job_id` → `jobs(id)`
- **Relationships:**
  - Many-to-one with `customers`, `jobs`

---

### CREWS

#### `crew_members`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, FK to companies.id, NOT NULL)
  - `user_id` (uuid, FK to profiles.id, nullable - links to auth user)
  - `full_name` (text)
  - `email` (text)
  - `phone` (text)
  - `color` (text, nullable - crew color for UI)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
- **Foreign Keys:**
  - `company_id` → `companies(id)`
  - `user_id` → `profiles(id)` (nullable)
- **Relationships:**
  - Many-to-one with `companies`, `profiles`
  - Many-to-many with `teams` (via `team_members`)
  - One-to-many: `team_members` (via crew_member_id), `overpayments_log` (via crew_id)

#### `teams`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, NOT NULL)
  - `name` (text, NOT NULL)
  - `color` (text, nullable - team color for UI)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  - **Constraint:** UNIQUE(company_id, name)
- **Foreign Keys:**
  - None (company_id not FK, but references companies)
- **Relationships:**
  - Many-to-one with `companies` (via company_id)
  - Many-to-many with `crew_members` (via `team_members`)
  - One-to-many: `team_members` (via team_id), `jobs` (via assigned_team_id), `recurring_jobs` (via default_team_id)

#### `team_members`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `team_id` (uuid, FK to teams.id ON DELETE CASCADE)
  - `crew_member_id` (uuid, FK to crew_members.id ON DELETE CASCADE)
  - `role` (text, default: 'member' - 'member' or 'lead')
  - `created_at` (timestamptz)
  - **Constraint:** UNIQUE(team_id, crew_member_id)
- **Foreign Keys:**
  - `team_id` → `teams(id)` ON DELETE CASCADE
  - `crew_member_id` → `crew_members(id)` ON DELETE CASCADE
- **Relationships:**
  - Many-to-one with `teams`, `crew_members`
  - Junction table for many-to-many: `teams` ↔ `crew_members`

---

### JOBS

#### `jobs`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, FK to companies.id, NOT NULL)
  - `customer_id` (uuid, FK to customers.id, NOT NULL)
  - `assigned_team_id` (uuid, FK to teams.id, nullable - team-based assignment)
  - `status` (text: 'Pending', 'In Progress', 'Completed', 'Canceled')
  - `services_performed` (text)
  - `job_cost` (numeric)
  - `crew_pay` (numeric)
  - `notes` (text)
  - `service_date` (date, nullable)
  - `scheduled_end_date` (date, nullable)
  - `started_at` (timestamptz, nullable)
  - `completed_at` (timestamptz, nullable)
  - `before_image` (text, nullable - storage path)
  - `after_image` (text, nullable - storage path)
  - `invoice_path` (text, nullable - legacy invoice storage)
  - `invoice_uploaded_at` (timestamptz, nullable)
  - `route_order` (integer, nullable - for route optimization)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
- **Foreign Keys:**
  - `company_id` → `companies(id)`
  - `customer_id` → `customers(id)`
  - `assigned_team_id` → `teams(id)` (nullable)
- **Relationships:**
  - Many-to-one with `companies`, `customers`, `teams`
  - One-to-one with `invoices` (via job_id unique constraint)
  - One-to-many: `payments` (via job_id), `job_schedule_requests` (via job_id), `job_notes` (via job_id), `job_flags` (via job_id), `customer_feedback` (via job_id)

#### `recurring_jobs`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, FK to companies.id, NOT NULL)
  - `customer_id` (uuid, FK to customers.id, NOT NULL)
  - `default_team_id` (uuid, FK to teams.id, nullable)
  - `start_date` (date, NOT NULL)
  - `recurrence_type` (text: 'weekly', 'biweekly', 'monthly')
  - `services_performed` (text)
  - `job_cost` (numeric)
  - `crew_pay` (numeric)
  - `is_paused` (boolean, default: false)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
- **Foreign Keys:**
  - `company_id` → `companies(id)`
  - `customer_id` → `customers(id)`
  - `default_team_id` → `teams(id)` (nullable)
- **Relationships:**
  - Many-to-one with `companies`, `customers`, `teams`
  - Template for generating `jobs` (via edge function)

#### `job_notes`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, NOT NULL)
  - `job_id` (uuid, FK to jobs.id ON DELETE CASCADE)
  - `author_user_id` (uuid, FK to auth.users.id, NOT NULL)
  - `note` (text, NOT NULL)
  - `metadata` (jsonb, default: '{}')
  - `created_at` (timestamptz)
- **Foreign Keys:**
  - `job_id` → `jobs(id)` ON DELETE CASCADE
  - `author_user_id` → `auth.users(id)`
- **Relationships:**
  - Many-to-one with `jobs`, `auth.users`

#### `job_flags`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, NOT NULL)
  - `job_id` (uuid, FK to jobs.id ON DELETE CASCADE)
  - `created_by` (uuid, FK to auth.users.id, NOT NULL)
  - `status` (text, default: 'open' - 'open' | 'resolved')
  - `severity` (text, default: 'medium' - 'low' | 'medium' | 'high')
  - `category` (text, default: 'other' - 'access' | 'equipment' | 'scope' | 'safety' | 'customer' | 'other')
  - `message` (text, NOT NULL)
  - `resolved_at` (timestamptz, nullable)
  - `resolved_by` (uuid, FK to auth.users.id, nullable)
  - `created_at` (timestamptz)
- **Foreign Keys:**
  - `job_id` → `jobs(id)` ON DELETE CASCADE
  - `created_by` → `auth.users(id)`
  - `resolved_by` → `auth.users(id)`
- **Relationships:**
  - Many-to-one with `jobs`, `auth.users` (via created_by, resolved_by)

---

### DISPATCH / SCHEDULES

#### `job_schedule_requests`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, FK to companies.id ON DELETE CASCADE)
  - `job_id` (uuid, FK to jobs.id ON DELETE CASCADE)
  - `quote_id` (uuid, FK to quotes.id ON DELETE SET NULL, nullable)
  - `public_token` (uuid, NOT NULL)
  - `requested_date` (date, NOT NULL)
  - `customer_note` (text, nullable)
  - `status` (text, default: 'requested' - 'requested' | 'approved' | 'declined' | 'canceled')
  - `created_at` (timestamptz)
  - `approved_at` (timestamptz, nullable)
  - `approved_by` (uuid, FK to profiles.id, nullable)
  - `decline_reason` (text, nullable)
- **Foreign Keys:**
  - `company_id` → `companies(id)` ON DELETE CASCADE
  - `job_id` → `jobs(id)` ON DELETE CASCADE
  - `quote_id` → `quotes(id)` ON DELETE SET NULL
  - `approved_by` → `profiles(id)` ON DELETE SET NULL
- **Relationships:**
  - Many-to-one with `companies`, `jobs`, `quotes`, `profiles`

---

### PAYMENTS

#### `payments`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, FK to companies.id, NOT NULL)
  - `job_id` (uuid, FK to jobs.id, NOT NULL)
  - `invoice_id` (uuid, FK to invoices.id, nullable)
  - `amount` (numeric, NOT NULL, CHECK: amount > 0)
  - `payment_method` (text: 'Cash', 'Check', 'Card', 'Stripe', etc.)
  - `notes` (text, nullable)
  - `paid` (boolean, default: true - legacy flag)
  - `date_paid` (date, default: CURRENT_DATE)
  - `paid_at` (timestamptz, default: now(), NOT NULL)
  - `status` (text, default: 'posted' - 'posted' | 'voided', CHECK constraint)
  - `created_by` (uuid, default: auth.uid())
  - `received_by` (uuid, FK to profiles.id, nullable)
  - `receipt_number` (text, unique - auto-generated: 'RCPT-YYYYMMDD-XXXXXX')
  - `external_ref` (text, nullable - external payment reference)
  - `voided_at` (timestamptz, nullable)
  - `void_reason` (text, nullable)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
- **Foreign Keys:**
  - `company_id` → `companies(id)`
  - `job_id` → `jobs(id)`
  - `invoice_id` → `invoices(id)` (nullable)
  - `received_by` → `profiles(id)` ON DELETE SET NULL
- **Relationships:**
  - Many-to-one with `companies`, `jobs`, `invoices`, `profiles`
  - One-to-many: `payment_receipts` (via payment_id)
  - **Note:** Append-only ledger system (void capability, no deletion)

#### `payment_receipts`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, NOT NULL)
  - `payment_id` (uuid, FK to payments.id ON DELETE CASCADE)
  - `customer_file_id` (uuid, FK to customer_files.id ON DELETE CASCADE)
  - `created_at` (timestamptz)
  - `created_by` (uuid, FK to profiles.id)
- **Foreign Keys:**
  - `payment_id` → `payments(id)` ON DELETE CASCADE
  - `customer_file_id` → `customer_files(id)` ON DELETE CASCADE
  - `created_by` → `profiles(id)` ON DELETE SET NULL
- **Relationships:**
  - Many-to-one with `payments`, `customer_files`, `profiles`
  - Links payment records to uploaded receipt files

#### `overpayments_log`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, NOT NULL)
  - `job_id` (uuid, FK to jobs.id)
  - `crew_id` (uuid, FK to crew_members.id, nullable)
  - `entered_amount` (numeric)
  - `allowed_amount` (numeric)
  - `created_at` (timestamptz)
- **Foreign Keys:**
  - `job_id` → `jobs(id)`
  - `crew_id` → `crew_members(id)` (nullable)
- **Relationships:**
  - Many-to-one with `jobs`, `crew_members`
  - Audit log for overpayment attempts (prevented by RPC)

---

### EXPENSES

#### `expenses`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, FK to companies.id, NOT NULL)
  - `amount` (numeric)
  - `category` (text)
  - `description` (text)
  - `date` (date, NOT NULL, default: CURRENT_DATE)
  - `receipt_path` (text, nullable - storage path)
  - `receipt_uploaded_at` (timestamptz, nullable)
  - `created_at` (timestamptz, NOT NULL, default: now())
  - `updated_at` (timestamptz)
- **Foreign Keys:**
  - `company_id` → `companies(id)`
- **Relationships:**
  - Many-to-one with `companies`
  - One-to-many: `expense_items` (via expense_id)

#### `expense_items`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, NOT NULL)
  - `expense_id` (uuid, FK to expenses.id ON DELETE CASCADE)
  - `description` (text, NOT NULL)
  - `quantity` (numeric, nullable)
  - `unit_price` (numeric, nullable)
  - `line_total` (numeric, nullable)
  - `category` (text, nullable)
  - `created_at` (timestamptz)
- **Foreign Keys:**
  - `expense_id` → `expenses(id)` ON DELETE CASCADE
- **Relationships:**
  - Many-to-one with `expenses`
  - Line items for expense records

---

### QUOTES

#### `quotes`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, FK to companies.id ON DELETE CASCADE, NOT NULL)
  - `customer_id` (uuid, FK to customers.id ON DELETE RESTRICT, NOT NULL)
  - `quote_number` (text, NOT NULL - auto-generated: 'Q-XXXX')
  - `services` (jsonb, NOT NULL, default: '[]')
  - `subtotal` (numeric(12,2), NOT NULL, default: 0, CHECK: >= 0)
  - `tax` (numeric(12,2), NOT NULL, default: 0, CHECK: >= 0)
  - `total` (numeric(12,2), NOT NULL, default: 0, CHECK: >= 0)
  - `status` (quote_status enum: 'draft', 'sent', 'accepted', 'rejected', 'expired')
  - `valid_until` (date, nullable)
  - `expires_at` (timestamptz, nullable)
  - `last_viewed_at` (timestamptz, nullable)
  - `notes` (text, nullable)
  - `created_by` (uuid, FK to profiles.id, nullable)
  - `sent_at` (timestamptz, nullable)
  - `accepted_at` (timestamptz, nullable)
  - `rejected_at` (timestamptz, nullable)
  - `public_token` (uuid, nullable - for public quote acceptance)
  - `converted_job_id` (uuid, FK to jobs.id, nullable - job created from quote)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  - **Constraint:** UNIQUE(company_id, quote_number)
- **Foreign Keys:**
  - `company_id` → `companies(id)` ON DELETE CASCADE
  - `customer_id` → `customers(id)` ON DELETE RESTRICT
  - `created_by` → `profiles(id)` ON DELETE SET NULL
  - `converted_job_id` → `jobs(id)` (nullable)
- **Relationships:**
  - Many-to-one with `companies`, `customers`, `profiles`, `jobs` (via converted_job_id)
  - One-to-many: `quote_messages` (via quote_id), `job_schedule_requests` (via quote_id)

#### `quote_counters`
- **Primary Key:** `company_id` (uuid)
- **Important Columns:**
  - `company_id` (uuid, PK, FK to companies.id ON DELETE CASCADE)
  - `next_number` (bigint, NOT NULL, default: 1)
  - `updated_at` (timestamptz, NOT NULL)
- **Foreign Keys:**
  - `company_id` → `companies(id)` ON DELETE CASCADE
- **Relationships:**
  - One-to-one with `companies`
  - Per-company quote number sequence (concurrency-safe)

#### `quote_messages`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, FK to companies.id ON DELETE CASCADE)
  - `quote_id` (uuid, FK to quotes.id ON DELETE CASCADE)
  - `to_email` (text, NOT NULL)
  - `subject` (text, NOT NULL)
  - `body` (text, nullable)
  - `status` (text, default: 'queued' - 'queued' | 'sent' | 'failed')
  - `error` (text, nullable)
  - `created_by` (uuid, FK to profiles.id, nullable)
  - `created_at` (timestamptz)
- **Foreign Keys:**
  - `company_id` → `companies(id)` ON DELETE CASCADE
  - `quote_id` → `quotes(id)` ON DELETE CASCADE
  - `created_by` → `profiles(id)` ON DELETE SET NULL
- **Relationships:**
  - Many-to-one with `companies`, `quotes`, `profiles`
  - Email send audit trail for quotes

---

### INVOICES

#### `invoices`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, NOT NULL, default: current_company_id())
  - `customer_id` (uuid, FK to customers(id) ON DELETE RESTRICT, NOT NULL)
  - `job_id` (uuid, FK to jobs(id) ON DELETE RESTRICT, NOT NULL)
  - `invoice_number` (text, nullable - human-readable number)
  - `status` (invoice_status enum: 'draft', 'sent', 'paid', 'overdue', 'void')
  - `issued_at` (timestamptz, NOT NULL, default: now())
  - `sent_at` (timestamptz, nullable)
  - `due_date` (date, nullable)
  - `paid_at` (timestamptz, nullable)
  - `voided_at` (timestamptz, nullable)
  - `void_reason` (text, nullable)
  - `subtotal` (numeric, nullable)
  - `tax` (numeric, nullable)
  - `total` (numeric, NOT NULL, default: 0)
  - `balance_due` (numeric, nullable - computed from total - payments)
  - `pdf_path` (text, nullable - storage path)
  - `metadata` (jsonb, NOT NULL, default: '{}')
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  - **Constraint:** UNIQUE(job_id) - one invoice per job
  - **Constraint:** UNIQUE(company_id, invoice_number) - if invoice_number used
- **Foreign Keys:**
  - `company_id` → `companies(id)` (not FK, but references)
  - `customer_id` → `customers(id)` ON DELETE RESTRICT
  - `job_id` → `jobs(id)` ON DELETE RESTRICT
- **Relationships:**
  - Many-to-one with `companies`, `customers`, `jobs`
  - One-to-many: `payments` (via invoice_id), `collections_actions_log` (via invoice_id), `collections_comms_log` (via invoice_id)

#### `invoice_counters`
- **Primary Key:** `company_id` (uuid)
- **Important Columns:**
  - `company_id` (uuid, PK, FK to companies.id)
  - `next_number` (bigint, NOT NULL, default: 1)
  - `updated_at` (timestamptz, NOT NULL)
- **Foreign Keys:**
  - `company_id` → `companies(id)`
- **Relationships:**
  - One-to-one with `companies`
  - Per-company invoice number sequence

---

### NOTIFICATIONS

#### `customer_activity_log`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, NOT NULL)
  - `customer_id` (uuid, FK to customers.id, NOT NULL)
  - `event_type` (text, NOT NULL)
  - `event_title` (text, NOT NULL)
  - `event_description` (text, nullable)
  - `event_category` (text, nullable)
  - `related_type` (text, nullable)
  - `related_id` (uuid, nullable)
  - `severity` (text, default: 'info')
  - `event_data` (jsonb, default: '{}')
  - `created_by` (uuid, FK to profiles.id)
  - `created_at` (timestamptz)
- **Foreign Keys:**
  - `customer_id` → `customers(id)`
  - `created_by` → `profiles(id)`
- **Relationships:**
  - Many-to-one with `customers`, `profiles`
  - Activity timeline for customers

---

### OTHER

#### `audit_log`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, FK to companies.id ON DELETE CASCADE, NOT NULL)
  - `actor_user_id` (uuid, FK to profiles.id ON DELETE SET NULL, nullable)
  - `actor_role` (text, nullable)
  - `entity_type` (text, NOT NULL - 'quote', 'job', 'invoice', 'payment', etc.)
  - `entity_id` (uuid, NOT NULL)
  - `action` (text, NOT NULL - 'quote_sent', 'quote_converted', 'job_scheduled', 'invoice_voided', 'payment_recorded', etc.)
  - `metadata` (jsonb, NOT NULL, default: '{}')
  - `created_at` (timestamptz)
- **Foreign Keys:**
  - `company_id` → `companies(id)` ON DELETE CASCADE
  - `actor_user_id` → `profiles(id)` ON DELETE SET NULL
- **Relationships:**
  - Many-to-one with `companies`, `profiles`
  - Immutable audit trail for critical actions

#### `rate_limit_events`
- **Primary Key:** `id` (bigserial)
- **Important Columns:**
  - `id` (bigserial, PK)
  - `key` (text, NOT NULL - rate limit key)
  - `event` (text, NOT NULL - event type)
  - `created_at` (timestamptz, NOT NULL)
- **Foreign Keys:**
  - None
- **Relationships:**
  - None (rate limiting tracking)

#### `collections_cases`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, NOT NULL, default: current_company_id())
  - `customer_id` (uuid, FK to customers.id ON DELETE CASCADE, NOT NULL)
  - `status` (text, NOT NULL, default: 'open' - 'open' | 'in_progress' | 'closed', CHECK)
  - `priority` (text, NOT NULL, default: 'normal' - 'low' | 'normal' | 'high' | 'critical', CHECK)
  - `assigned_to` (uuid, FK to profiles.id ON DELETE SET NULL, nullable)
  - `due_at` (timestamptz, nullable)
  - `next_action` (text, nullable)
  - `notes` (text, nullable)
  - `created_by` (uuid, NOT NULL, default: auth.uid(), FK to profiles.id ON DELETE SET NULL)
  - `created_at` (timestamptz, NOT NULL)
  - `updated_at` (timestamptz, NOT NULL)
  - `closed_at` (timestamptz, nullable)
  - **Constraint:** UNIQUE(company_id, customer_id) WHERE status IN ('open', 'in_progress') - one active case per customer
- **Foreign Keys:**
  - `customer_id` → `customers(id)` ON DELETE CASCADE
  - `assigned_to` → `profiles(id)` ON DELETE SET NULL
  - `created_by` → `profiles(id)` ON DELETE SET NULL
- **Relationships:**
  - Many-to-one with `companies`, `customers`, `profiles` (via assigned_to, created_by)
  - Collections case management

#### `collections_followups`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, NOT NULL)
  - `customer_id` (uuid, NOT NULL)
  - `next_followup_at` (timestamptz, NOT NULL)
  - `status` (text, NOT NULL, default: 'scheduled' - 'scheduled' | 'done' | 'canceled', CHECK)
  - `created_by` (uuid, NOT NULL)
  - `created_at` (timestamptz, NOT NULL)
- **Foreign Keys:**
  - None (customer_id references customers, but no FK constraint)
- **Relationships:**
  - Many-to-one with `companies`, `customers` (via customer_id)
  - Follow-up scheduling for collections

#### `collections_actions_log`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, NOT NULL)
  - `customer_id` (uuid, NOT NULL)
  - `invoice_id` (uuid, nullable)
  - `action_type` (text, NOT NULL - 'contacted', 'promise_to_pay', 'payment_plan', 'dispute', 'resolved', 'note', CHECK)
  - `action_note` (text, nullable)
  - `promise_date` (date, nullable)
  - `promise_amount` (numeric, nullable)
  - `created_by` (uuid, NOT NULL)
  - `created_at` (timestamptz, NOT NULL)
- **Foreign Keys:**
  - None (references customers, invoices, profiles, but no FK constraints)
- **Relationships:**
  - Many-to-one with `companies`, `customers`, `invoices`, `profiles` (via created_by)
  - Collections action audit trail

#### `collections_comms_log`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, NOT NULL)
  - `customer_id` (uuid, FK to customers.id ON DELETE CASCADE, NOT NULL)
  - `invoice_id` (uuid, FK to invoices.id ON DELETE SET NULL, nullable)
  - `channel` (text, NOT NULL - 'email' | 'sms' | 'call' | 'other', CHECK)
  - `template_key` (text, nullable)
  - `subject` (text, nullable)
  - `body` (text, nullable)
  - `to_address` (text, nullable)
  - `created_by` (uuid, FK to auth.users.id, NOT NULL)
  - `created_at` (timestamptz, NOT NULL)
- **Foreign Keys:**
  - `customer_id` → `customers(id)` ON DELETE CASCADE
  - `invoice_id` → `invoices(id)` ON DELETE SET NULL
  - `created_by` → `auth.users(id)`
- **Relationships:**
  - Many-to-one with `companies`, `customers`, `invoices`, `auth.users`
  - Collections communication audit trail

#### `collections_comm_templates`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, nullable - NULL = global defaults)
  - `template_key` (text, NOT NULL)
  - `name` (text, NOT NULL)
  - `subject_template` (text, NOT NULL)
  - `body_template` (text, NOT NULL)
  - `is_active` (boolean, NOT NULL, default: true)
  - `created_at` (timestamptz, NOT NULL)
  - **Constraint:** UNIQUE(company_id, template_key)
- **Foreign Keys:**
  - None (company_id references companies, but nullable for global templates)
- **Relationships:**
  - Many-to-one with `companies` (optional - global templates have NULL company_id)
  - Communication templates for collections

#### `support_sessions`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `platform_admin_id` (uuid, FK to profiles.id ON DELETE CASCADE, NOT NULL)
  - `target_company_id` (uuid, FK to companies.id ON DELETE CASCADE, NOT NULL)
  - `started_at` (timestamptz, NOT NULL, default: now())
  - `ended_at` (timestamptz, nullable)
  - `reason` (text, nullable)
  - `metadata` (jsonb, NOT NULL, default: '{}')
  - `created_at` (timestamptz, NOT NULL)
- **Foreign Keys:**
  - `platform_admin_id` → `profiles(id)` ON DELETE CASCADE
  - `target_company_id` → `companies(id)` ON DELETE CASCADE
- **Relationships:**
  - Many-to-one with `profiles` (via platform_admin_id), `companies` (via target_company_id)
  - Platform admin tenant impersonation sessions

#### `stripe_event_ledger`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `event_id` (text, NOT NULL, UNIQUE - Stripe event ID: evt_xxx)
  - `event_type` (text, NOT NULL)
  - `company_id` (uuid, FK to companies.id ON DELETE SET NULL, nullable)
  - `payload` (jsonb, NOT NULL)
  - `processing_state` (text, NOT NULL, default: 'pending' - 'pending' | 'processing' | 'success' | 'error' | 'ignored', CHECK)
  - `processing_attempts` (integer, NOT NULL, default: 0)
  - `processing_error` (text, nullable)
  - `processed_at` (timestamptz, nullable)
  - `created_at` (timestamptz, NOT NULL)
- **Foreign Keys:**
  - `company_id` → `companies(id)` ON DELETE SET NULL
- **Relationships:**
  - Many-to-one with `companies` (optional)
  - Idempotent Stripe webhook event processing

#### `billing_subscription_history`
- **Primary Key:** `id` (uuid)
- **Important Columns:**
  - `id` (uuid, PK)
  - `company_id` (uuid, FK to companies.id ON DELETE CASCADE, NOT NULL)
  - `changed_at` (timestamptz, NOT NULL, default: now())
  - `changed_by` (uuid, FK to profiles.id ON DELETE SET NULL, nullable - NULL for webhook/system changes)
  - `source` (text, NOT NULL - 'webhook' | 'checkout' | 'portal' | 'admin' | 'reconciliation' | 'system', CHECK)
  - `field_name` (text, NOT NULL - 'plan' | 'subscription_status' | 'stripe_subscription_id' | 'stripe_customer_id' | 'trial_ends_at' | 'billing_grace_until')
  - `old_value` (text, nullable)
  - `new_value` (text, nullable)
  - `stripe_event_id` (text, FK to stripe_event_ledger.event_id ON DELETE SET NULL, nullable)
  - `metadata` (jsonb, NOT NULL, default: '{}')
- **Foreign Keys:**
  - `company_id` → `companies(id)` ON DELETE CASCADE
  - `changed_by` → `profiles(id)` ON DELETE SET NULL
  - `stripe_event_id` → `stripe_event_ledger(event_id)` ON DELETE SET NULL
- **Relationships:**
  - Many-to-one with `companies`, `profiles`, `stripe_event_ledger`
  - Audit trail of billing/subscription changes

#### `plan_limits`
- **Primary Key:** `plan_code` (text)
- **Important Columns:**
  - `plan_code` (text, PK - 'starter', 'pro', etc.)
  - `max_crew` (integer, nullable - NULL = unlimited, CHECK: >= 0 if not NULL)
  - `max_customers` (integer, nullable - NULL = unlimited, CHECK: >= 0 if not NULL)
  - `max_jobs_per_month` (integer, nullable - NULL = unlimited, CHECK: >= 0 if not NULL)
  - `created_at` (timestamptz, NOT NULL)
- **Foreign Keys:**
  - None
- **Relationships:**
  - Referenced by `companies.plan` (not FK, but logical relationship)
  - Plan limit definitions

#### `plan_catalog`
- **Primary Key:** `plan_code` (text)
- **Important Columns:**
  - `plan_code` (text, PK - 'starter', 'pro', etc.)
  - `monthly_price` (numeric, NOT NULL, CHECK: >= 0)
  - `created_at` (timestamptz, NOT NULL)
- **Foreign Keys:**
  - None
- **Relationships:**
  - Referenced by `companies.plan` (not FK, but logical relationship)
  - Plan pricing catalog for MRR calculations

---

## Domain Map

```
Company
 ├── Profiles (Users)
 │   ├── Crew Members (via user_id)
 │   └── Customers (via user_id)
 │
 ├── Customers
 │   ├── Jobs
 │   │   ├── Payments
 │   │   │   └── Payment Receipts
 │   │   ├── Invoices
 │   │   ├── Job Notes
 │   │   ├── Job Flags
 │   │   └── Job Schedule Requests
 │   │
 │   ├── Quotes
 │   │   ├── Quote Messages
 │   │   └── Job Schedule Requests
 │   │
 │   ├── Customer Activity Log
 │   ├── Customer Files
 │   ├── Customer Feedback (via jobs)
 │   └── Collections Cases
 │       ├── Collections Followups
 │       ├── Collections Actions Log
 │       └── Collections Comms Log
 │
 ├── Crew Members
 │   ├── Team Members (via crew_member_id)
 │   └── Overpayments Log (via crew_id)
 │
 ├── Teams
 │   ├── Team Members (via team_id)
 │   ├── Jobs (via assigned_team_id)
 │   └── Recurring Jobs (via default_team_id)
 │
 ├── Jobs
 │   ├── Payments
 │   ├── Invoices (one-to-one)
 │   ├── Job Schedule Requests
 │   ├── Job Notes
 │   ├── Job Flags
 │   └── Customer Feedback
 │
 ├── Recurring Jobs
 │   └── (Generates Jobs via edge function)
 │
 ├── Quotes
 │   ├── Quote Messages
 │   ├── Job Schedule Requests
 │   └── Jobs (via converted_job_id)
 │
 ├── Invoices
 │   ├── Payments (via invoice_id)
 │   ├── Collections Actions Log
 │   └── Collections Comms Log
 │
 ├── Expenses
 │   └── Expense Items
 │
 ├── Collections Cases
 │   ├── Collections Followups
 │   ├── Collections Actions Log
 │   └── Collections Comms Log
 │
 ├── Collections Comm Templates
 │   └── (Referenced by Collections Comms Log)
 │
 ├── Support Sessions
 │   └── (Platform admin tenant impersonation)
 │
 ├── Stripe Event Ledger
 │   └── Billing Subscription History
 │
 ├── Plan Limits
 │   └── (Referenced by companies.plan)
 │
 ├── Plan Catalog
 │   └── (Referenced by companies.plan)
 │
 ├── Quote Counters
 │   └── (Per-company quote numbering)
 │
 ├── Invoice Counters
 │   └── (Per-company invoice numbering)
 │
 ├── Audit Log
 │   └── (Immutable action log)
 │
 └── Rate Limit Events
     └── (Rate limiting tracking)
```

---

## Summary Statistics

**Total Tables:** 40+

**By Domain:**
- **Identity:** 1 table (auth.users - Supabase managed)
- **Companies:** 1 table
- **Users/Profiles:** 1 table
- **Customers:** 4 tables (customers, customer_activity_log, customer_files, customer_feedback)
- **Crews:** 3 tables (crew_members, teams, team_members)
- **Jobs:** 4 tables (jobs, recurring_jobs, job_notes, job_flags)
- **Dispatch/Schedules:** 1 table (job_schedule_requests)
- **Payments:** 3 tables (payments, payment_receipts, overpayments_log)
- **Expenses:** 2 tables (expenses, expense_items)
- **Quotes:** 3 tables (quotes, quote_counters, quote_messages)
- **Invoices:** 2 tables (invoices, invoice_counters)
- **Collections:** 5 tables (collections_cases, collections_followups, collections_actions_log, collections_comms_log, collections_comm_templates)
- **Billing:** 3 tables (stripe_event_ledger, billing_subscription_history, plan_limits, plan_catalog)
- **Platform:** 1 table (support_sessions)
- **Other:** 2 tables (audit_log, rate_limit_events)

**Key Design Patterns:**
- **Multi-tenant:** All tables include `company_id` for tenant isolation
- **RLS:** All tables have Row Level Security enabled
- **Audit Trail:** Immutable audit logs (audit_log, collections_actions_log, billing_subscription_history)
- **Append-only:** Payments ledger (void capability, no deletion)
- **Counters:** Per-company sequences (quote_counters, invoice_counters)
- **Junction Tables:** team_members (teams ↔ crew_members)
- **Status Enums:** quote_status, invoice_status
- **Soft Deletes:** Support sessions (ended_at), job flags (resolved_at)
