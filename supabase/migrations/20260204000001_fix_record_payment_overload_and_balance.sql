-- 1) Drop the legacy overload that forces assigned_to logic
drop function if exists public.record_payment(uuid, numeric, text, text);

-- 2) Update jobs_with_remaining_balance to be team-based (recommended)
create or replace function public.jobs_with_remaining_balance(p_crew_id uuid)
returns table(
  id uuid,
  service_date date,
  services_performed text,
  status text,
  crew_pay numeric,
  job_cost numeric,
  remaining numeric
)
language sql
as $$
  select
    j.id,
    j.service_date,
    j.services_performed,
    j.status,
    j.crew_pay,
    j.job_cost,
    (j.job_cost - coalesce(sum(p.amount),0)) as remaining
  from public.jobs j
  join public.team_members tm
    on tm.team_id = j.assigned_team_id
   and tm.crew_member_id = p_crew_id
  left join public.payments p
    on p.job_id = j.id
   and p.status = 'posted'
  group by j.id, j.service_date, j.services_performed, j.status, j.crew_pay, j.job_cost
  order by j.service_date desc nulls last;
$$;
