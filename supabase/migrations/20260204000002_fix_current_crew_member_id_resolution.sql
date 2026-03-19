-- Robust crew-member resolution for team-based permissions
create or replace function public.current_crew_member_id()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_col text;
  v_sql text;
  v_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return null;
  end if;

  -- Find which column crew_members uses to link to auth users
  select c.column_name
  into v_col
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'crew_members'
    and c.column_name in ('user_id','auth_user_id','profile_id')
  order by case c.column_name
    when 'user_id' then 1
    when 'auth_user_id' then 2
    when 'profile_id' then 3
    else 99
  end
  limit 1;

  if v_col is null then
    -- Cannot resolve; schema does not have a known linking column
    return null;
  end if;

  -- Dynamic lookup to avoid hard-coding a column that might not exist
  v_sql := format('select id from public.crew_members where %I = $1 limit 1', v_col);
  execute v_sql into v_id using v_uid;

  return v_id;
end;
$$;

-- Ensure permissions: allow authenticated callers to execute (RPC usage)
grant execute on function public.current_crew_member_id() to authenticated;
