-- ============================================================
-- Migration : 202606150001_treatments_role_rls
-- Purpose   : Phase 2A — Role-based RLS on the treatments table
--             + unique partial index for catalog linkage integrity
--
-- Replaces the single all-operations policy from P0 with two
-- separate policies so that clinic members (receptionists, etc.)
-- can read treatments but only owners/admins can write them.
--
-- Depends on: public.current_user_clinic_ids()
--             public.current_user_is_clinic_admin(uuid)
--   Both are defined in 202606120001_p0_tenant_isolation.sql.
--
-- Idempotent: policy guards use IF NOT EXISTS; index uses IF NOT EXISTS.
-- DO NOT apply directly — use `supabase db push` or the dashboard.
-- ============================================================

do $migration$
begin

  -- ── Guard: skip silently if required tables/functions are absent ──
  if to_regclass('public.treatments') is null
     or to_regclass('public.clinic_users') is null then
    raise notice 'treatments or clinic_users table not found — skipping';
    return;
  end if;

  -- ── 1. Remove the old catch-all policy created by P0 ─────────────
  -- P0 applied "for all" to authenticated users, giving every clinic
  -- member full CRUD on treatments. We replace it with two policies.
  drop policy if exists cliniflow_treatments_member_all on public.treatments;

  -- ── 2. SELECT — any authenticated clinic member ───────────────────
  -- Receptionists and assistants need to read the treatment list
  -- to create appointments and display prices to patients.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'treatments'
      and policyname = 'cliniflow_treatments_member_select'
  ) then
    create policy cliniflow_treatments_member_select
      on public.treatments
      for select
      to authenticated
      using (clinic_id in (select public.current_user_clinic_ids()));
  end if;

  -- ── 3. INSERT / UPDATE / DELETE — owner or admin only ────────────
  -- Treatment catalogue management (adding, editing, deactivating
  -- procedures and prices) is an admin-level operation.
  -- Uses current_user_is_clinic_admin() defined in P0 migration.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'treatments'
      and policyname = 'cliniflow_treatments_admin_write'
  ) then
    create policy cliniflow_treatments_admin_write
      on public.treatments
      for all                            -- INSERT, UPDATE, DELETE
      to authenticated
      using (
        clinic_id in (select public.current_user_clinic_ids())
        and public.current_user_is_clinic_admin(clinic_id)
      )
      with check (
        clinic_id in (select public.current_user_clinic_ids())
        and public.current_user_is_clinic_admin(clinic_id)
      );
  end if;

end;
$migration$;

-- ── 4. Unique partial index: one catalog entry per clinic ─────────
-- Prevents a clinic from activating the same global catalog procedure
-- twice under different local treatment names.
-- WHERE catalog_id IS NOT NULL: freeform treatments without a catalog
-- link are unaffected and continue to work as before.
create unique index if not exists idx_treatments_clinic_catalog_unique
  on public.treatments (clinic_id, catalog_id)
  where catalog_id is not null;
