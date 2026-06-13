-- ============================================================
-- Migration : 202606160001_treatments_no_hard_delete
-- Purpose   : Block hard deletes on treatments for all
--             authenticated users.
--
-- Historical appointments and financial reporting depend on
-- treatment rows existing permanently. Deactivation via
-- UPDATE active=false is the correct soft-delete pattern.
--
-- Replaces : cliniflow_treatments_admin_write  (FOR ALL —
--            unintentionally permitted DELETE)
-- Creates  : cliniflow_treatments_admin_insert  (INSERT only)
--            cliniflow_treatments_admin_update  (UPDATE only)
-- Untouched: cliniflow_treatments_member_select
--            idx_treatments_clinic_catalog_unique
--
-- Effect   : No DELETE policy exists for the authenticated role.
--            PostgreSQL RLS denies any unmatched operation, so
--            hard deletes from the browser or PostgREST return 403.
--            Service-role API calls bypass RLS and are unaffected.
--
-- Depends on: public.current_user_clinic_ids()
--             public.current_user_is_clinic_admin(uuid)
--   Both defined in 202606120001_p0_tenant_isolation.sql.
--
-- Idempotent: DROP uses IF EXISTS; CREATE policies check pg_policies.
-- DO NOT apply directly — use `supabase db push` or the dashboard.
-- ============================================================

do $migration$
begin

  -- Guard: skip silently if treatments table is absent
  if to_regclass('public.treatments') is null then
    raise notice 'treatments table not found — skipping';
    return;
  end if;

  -- ── 1. Drop the FOR ALL policy that permitted hard deletes ────
  -- Phase 2A created cliniflow_treatments_admin_write FOR ALL,
  -- which covers SELECT, INSERT, UPDATE, and DELETE. We replace it
  -- with two narrower policies that exclude DELETE entirely.
  drop policy if exists cliniflow_treatments_admin_write on public.treatments;

  -- ── 2. INSERT — clinic owner or admin only ────────────────────
  -- Allows admins to add new procedures to the clinic's treatment
  -- list, including catalog-linked activations (catalog_id set).
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'treatments'
      and policyname = 'cliniflow_treatments_admin_insert'
  ) then
    create policy cliniflow_treatments_admin_insert
      on public.treatments
      for insert
      to authenticated
      with check (
        clinic_id in (select public.current_user_clinic_ids())
        and public.current_user_is_clinic_admin(clinic_id)
      );
  end if;

  -- ── 3. UPDATE — clinic owner or admin only ────────────────────
  -- Covers price changes, duration edits, and soft deletes
  -- (UPDATE active = false). USING restricts which rows can be
  -- targeted; WITH CHECK ensures the row stays within the clinic
  -- after the update.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'treatments'
      and policyname = 'cliniflow_treatments_admin_update'
  ) then
    create policy cliniflow_treatments_admin_update
      on public.treatments
      for update
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

  -- No DELETE policy is created intentionally.
  -- Hard deletes on public.treatments are permanently blocked
  -- for the authenticated role. Use UPDATE active=false instead.

end;
$migration$;
