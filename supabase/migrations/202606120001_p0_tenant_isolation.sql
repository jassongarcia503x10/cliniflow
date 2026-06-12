-- P0 tenant isolation for tables accessed directly by the browser.
-- Service-role API calls continue to bypass RLS after authenticating server-side.
-- Only policies owned by this migration are replaced; unknown policies are preserved.

do $migration$
declare
  table_name text;
  tenant_tables text[] := array[
    'leads', 'appointments', 'pending_bookings', 'doctors', 'treatments',
    'messages', 'patients', 'patient_notes', 'clinical_records', 'sofia_memories'
  ];
begin
  if to_regclass('public.clinic_users') is not null then
    execute $function$
      create or replace function public.current_user_clinic_ids()
      returns setof uuid
      language sql
      stable
      security definer
      set search_path = public
      as $$
        select clinic_id
        from public.clinic_users
        where user_id = auth.uid()
      $$
    $function$;
    execute $function$
      create or replace function public.current_user_is_clinic_admin(target_clinic_id uuid)
      returns boolean
      language sql
      stable
      security definer
      set search_path = public
      as $$
        select exists (
          select 1
          from public.clinic_users
          where user_id = auth.uid()
            and clinic_id = target_clinic_id
            and role in ('owner', 'admin')
        )
      $$
    $function$;
    execute 'revoke all on function public.current_user_clinic_ids() from public';
    execute 'revoke all on function public.current_user_is_clinic_admin(uuid) from public';
    execute 'grant execute on function public.current_user_clinic_ids() to authenticated';
    execute 'grant execute on function public.current_user_is_clinic_admin(uuid) to authenticated';

    alter table public.clinic_users enable row level security;
    alter table public.clinic_users force row level security;
    drop policy if exists cliniflow_clinic_users_select_self on public.clinic_users;
    create policy cliniflow_clinic_users_select_self
      on public.clinic_users for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if to_regclass('public.clinic_users') is not null and to_regclass('public.clinics') is not null then
    alter table public.clinics enable row level security;
    alter table public.clinics force row level security;
    drop policy if exists cliniflow_clinics_member_select on public.clinics;
    drop policy if exists cliniflow_clinics_admin_update on public.clinics;
    create policy cliniflow_clinics_member_select
      on public.clinics for select
      to authenticated
      using (id in (select public.current_user_clinic_ids()));
    create policy cliniflow_clinics_admin_update
      on public.clinics for update
      to authenticated
      using (public.current_user_is_clinic_admin(id))
      with check (public.current_user_is_clinic_admin(id));
  end if;

  foreach table_name in array tenant_tables loop
    if to_regclass('public.clinic_users') is not null and to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('alter table public.%I force row level security', table_name);
      execute format('drop policy if exists %I on public.%I', 'cliniflow_' || table_name || '_member_all', table_name);
      execute format(
        'create policy %I on public.%I for all to authenticated ' ||
        'using (clinic_id in (select public.current_user_clinic_ids())) ' ||
        'with check (clinic_id in (select public.current_user_clinic_ids()))',
        'cliniflow_' || table_name || '_member_all',
        table_name
      );
    end if;
  end loop;
end
$migration$;
