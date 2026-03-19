-- Fix customers that were incorrectly linked to the creating admin/crew user.
-- Only null out when:
--  - customers.user_id is not null
--  - the linked profile role is NOT 'customer'
--  - and emails do not match (clearly not the same person)

update public.customers c
set user_id = null
from public.profiles p
where c.user_id = p.id
  and c.user_id is not null
  and coalesce(p.role, 'user') <> 'customer'
  and lower(coalesce(c.email,'')) <> lower(coalesce(p.email,''));
