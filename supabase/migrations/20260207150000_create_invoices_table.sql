-- supabase/migrations/20260207150000_create_invoices_table.sql

begin;

-- 1) Invoice status enum (keeps state clean + consistent)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type public.invoice_status as enum ('draft', 'sent', 'paid', 'overdue', 'void');
  end if;
end$$;

-- 2) Small utility trigger function for updated_at (safe + isolated)
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 3) Invoices table
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null default public.current_company_id(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  job_id uuid not null references public.jobs(id) on delete restrict,

  -- human invoice number (optional now, useful soon)
  invoice_number text,

  status public.invoice_status not null default 'draft',

  issued_at timestamptz not null default now(),
  sent_at timestamptz,
  due_date date,
  paid_at timestamptz,
  voided_at timestamptz,
  void_reason text,

  -- totals (keep minimal; can expand later to line-items)
  subtotal numeric,
  tax numeric,
  total numeric not null default 0,

  -- optional PDF linkage (future-proof; you currently store PDF on jobs.invoice_path)
  pdf_path text,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 1 invoice per job (enforces your lifecycle contract)
  constraint invoices_job_id_unique unique (job_id),

  -- if invoice_number used, it must be unique per company
  constraint invoices_company_invoice_number_unique unique (company_id, invoice_number)
);

-- 4) updated_at trigger
drop trigger if exists trg_invoices_set_updated_at on public.invoices;
create trigger trg_invoices_set_updated_at
before update on public.invoices
for each row
execute function public.tg_set_updated_at();

-- 5) Helpful indexes for Revenue Hub queues + AR screens
create index if not exists idx_invoices_company_status on public.invoices(company_id, status);
create index if not exists idx_invoices_company_due_date on public.invoices(company_id, due_date);
create index if not exists idx_invoices_customer on public.invoices(customer_id);

-- 6) RLS
alter table public.invoices enable row level security;

-- Admins: full CRUD within company
drop policy if exists invoices_admin_select on public.invoices;
create policy invoices_admin_select
on public.invoices
for select
to authenticated
using (
  company_id = public.current_company_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists invoices_admin_insert on public.invoices;
create policy invoices_admin_insert
on public.invoices
for insert
to authenticated
with check (
  company_id = public.current_company_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists invoices_admin_update on public.invoices;
create policy invoices_admin_update
on public.invoices
for update
to authenticated
using (
  company_id = public.current_company_id()
  and public.current_user_role() = 'admin'
)
with check (
  company_id = public.current_company_id()
  and public.current_user_role() = 'admin'
);

drop policy if exists invoices_admin_delete on public.invoices;
create policy invoices_admin_delete
on public.invoices
for delete
to authenticated
using (
  company_id = public.current_company_id()
  and public.current_user_role() = 'admin'
);

-- Customers: read-only access to their own invoices (via customers.user_id)
drop policy if exists invoices_customer_select on public.invoices;
create policy invoices_customer_select
on public.invoices
for select
to authenticated
using (
  company_id = public.current_company_id()
  and public.current_user_role() = 'customer'
  and exists (
    select 1
    from public.customers c
    where c.id = invoices.customer_id
      and c.company_id = invoices.company_id
      and c.user_id = auth.uid()
  )
);

commit;
