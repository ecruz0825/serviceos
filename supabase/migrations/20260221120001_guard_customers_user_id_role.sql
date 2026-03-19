-- Guardrail: Ensure customers.user_id only links to customer profiles
-- Prevents accidental linking to admin/crew/user profiles

create or replace function public.guard_customer_user_id()
returns trigger
language plpgsql
as $$
declare
  v_role text;
begin
  -- If user_id is null, always allowed
  if new.user_id is null then
    return new;
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = new.user_id;

  -- If no profile row exists, block (avoids dangling link)
  if v_role is null then
    raise exception 'customers.user_id must reference an existing profiles row (user_id=%)', new.user_id
      using errcode = '23514';
  end if;

  -- Only allow linking to customer role
  if v_role <> 'customer' then
    raise exception 'customers.user_id must reference a customer profile (got role=% for user_id=%)', v_role, new.user_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_customer_user_id on public.customers;

create trigger trg_guard_customer_user_id
before insert or update of user_id on public.customers
for each row
execute function public.guard_customer_user_id();
