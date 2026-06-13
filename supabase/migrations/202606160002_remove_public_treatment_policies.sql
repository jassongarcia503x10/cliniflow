-- ============================================================
-- Migration : 202606160002_remove_public_treatment_policies
-- Purpose   : Remove three unsafe RLS policies on public.treatments
--             that were created outside the migration system
--             (via Supabase dashboard "Get Started Quickly" templates).
--
-- Unsafe policies confirmed in production:
--   public_insert_treatments  — roles={public}, with_check=true
--   public_read_treatments    — roles={public}, qual=true
--   public_update_treatments  — roles={public}, qual=true, with_check=true
--
-- All three are PERMISSIVE with no row filter. Because PostgreSQL
-- evaluates PERMISSIVE policies with OR logic, any one of these
-- policies alone is sufficient to bypass the cliniflow_* policies
-- entirely:
--   - public_read_treatments  → cross-tenant SELECT (anon sees all clinics)
--   - public_insert_treatments → unauthenticated INSERT into any clinic
--   - public_update_treatments → unauthenticated UPDATE across all clinics
--
-- After this migration the only active policies on treatments are:
--   cliniflow_treatments_member_select  (Phase 2A)
--   cliniflow_treatments_admin_insert   (202606160001)
--   cliniflow_treatments_admin_update   (202606160001)
--
-- Scope    : DROP three named policies only. Nothing else is touched.
-- Safe     : All three DROPs use IF EXISTS — safe to re-run.
-- Depends  : No dependencies. Standalone cleanup.
-- DO NOT apply directly — use `supabase db push` or the dashboard.
-- ============================================================

-- ── 1. Block cross-tenant reads by anonymous users ────────────
-- public_read_treatments allowed any unauthenticated request to
-- SELECT all treatment rows across every clinic.
drop policy if exists public_read_treatments on public.treatments;

-- ── 2. Block unauthenticated inserts ─────────────────────────
-- public_insert_treatments allowed any anonymous user to INSERT
-- a treatment row into any clinic_id, bypassing admin-only checks.
drop policy if exists public_insert_treatments on public.treatments;

-- ── 3. Block unauthenticated updates ─────────────────────────
-- public_update_treatments allowed any anonymous user to UPDATE
-- any treatment row in any clinic — including changing prices or
-- setting active=false on another clinic's treatments.
drop policy if exists public_update_treatments on public.treatments;

-- No other policies are modified.
-- cliniflow_treatments_member_select, cliniflow_treatments_admin_insert,
-- and cliniflow_treatments_admin_update remain active and unchanged.
