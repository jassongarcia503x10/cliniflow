-- ============================================================
-- Migration: 202606140001_treatment_catalog
-- Purpose  : Global treatment catalog (read-only reference table)
--            + nullable catalog_id FK on per-clinic treatments
-- Safe to re-run: all DDL uses IF NOT EXISTS / ON CONFLICT DO NOTHING
-- DO NOT apply directly to Supabase — use Supabase CLI or dashboard
-- ============================================================

-- ============================================================
-- Block 1: Create treatment_catalog table
-- ============================================================
create table if not exists public.treatment_catalog (
  id                  uuid        primary key default gen_random_uuid(),
  slug                text        not null,
  name_es             text        not null,
  name_en             text        not null,
  name_hr             text        not null,
  aliases             text[]      not null default '{}',
  category            text        not null
                        check (category in (
                          'preventive',
                          'restorative',
                          'endodontics',
                          'surgery',
                          'orthodontics',
                          'prosthetics',
                          'periodontics',
                          'diagnostic',
                          'pediatric',
                          'anesthesia',
                          'other'
                        )),
  default_duration    int         not null check (default_duration > 0),
  default_price_mode  text        not null default 'consult'
                        check (default_price_mode in ('exact', 'from', 'consult')),
  active              boolean     not null default true,
  created_at          timestamptz not null default now(),
  constraint treatment_catalog_slug_unique unique (slug)
);

comment on table public.treatment_catalog is
  'Global canonical dental procedure catalog. Managed via migrations only. '
  'Clinics link their per-clinic treatments to entries here via catalog_id.';

-- ============================================================
-- Block 2: Indexes
-- ============================================================

-- GIN index for fast alias array containment queries (@>)
create index if not exists idx_treatment_catalog_aliases
  on public.treatment_catalog using gin (aliases);

-- pg_trgm trigram index for fuzzy ILIKE search on Spanish names
-- (requires pg_trgm extension — enabled by default in Supabase)
create extension if not exists pg_trgm;

create index if not exists idx_treatment_catalog_name_es_trgm
  on public.treatment_catalog using gin (name_es gin_trgm_ops);

create index if not exists idx_treatment_catalog_name_en_trgm
  on public.treatment_catalog using gin (name_en gin_trgm_ops);

-- Partial index: only active entries (typical query filter)
create index if not exists idx_treatment_catalog_active
  on public.treatment_catalog (active)
  where active = true;

-- ============================================================
-- Block 3: Row Level Security
-- Catalog is a global reference table — all authenticated users
-- and anon can read. Only service-role can write (via migrations).
-- ============================================================
alter table public.treatment_catalog enable row level security;

-- Drop and recreate policy idempotently
do $rls$
begin
  -- SELECT: open to anon and authenticated (catalog is public knowledge)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'treatment_catalog'
      and policyname = 'cliniflow_treatment_catalog_public_read'
  ) then
    execute $policy$
      create policy cliniflow_treatment_catalog_public_read
        on public.treatment_catalog
        for select
        to anon, authenticated
        using (active = true)
    $policy$;
  end if;
end;
$rls$;

-- ============================================================
-- Block 4: Seed — 30 procedures from the CATALOG constant
--           in index.html (n/e/h/d/m fields mapped to columns)
-- ON CONFLICT DO NOTHING makes this idempotent.
-- ============================================================
insert into public.treatment_catalog
  (slug, name_es, name_en, name_hr, aliases, category, default_duration, default_price_mode)
values
  -- preventive
  ('limpieza-dental',
   'Limpieza dental', 'Dental Cleaning', 'Ciscenje zuba',
   array['limpieza','cleaning','ciscenje','profilaxis'],
   'preventive', 45, 'exact'),

  ('sellado-dental',
   'Sellado dental', 'Dental Sealant', 'Pecatiranje zuba',
   array['sellado','sealant','pecatiranje'],
   'preventive', 30, 'exact'),

  ('fluoruro-topico',
   'Fluoruro topico', 'Fluoride Treatment', 'Fluoridacija',
   array['fluoruro','fluoride','fluoridacija'],
   'preventive', 20, 'exact'),

  -- restorative
  ('empaste-obturacion',
   'Empaste / Obturacion', 'Dental Filling', 'Plomba',
   array['empaste','obturacion','filling','plomba','composite'],
   'restorative', 45, 'exact'),

  ('bonding-dental',
   'Bonding dental', 'Dental Bonding', 'Composit bonding',
   array['bonding','composite bonding'],
   'restorative', 60, 'from'),

  -- endodontics
  ('endodoncia',
   'Endodoncia (conductos)', 'Root Canal', 'Lijecenje kanala',
   array['endodoncia','conductos','root canal','lijecenje kanala'],
   'endodontics', 90, 'from'),

  -- surgery
  ('extraccion-simple',
   'Extraccion simple', 'Tooth Extraction', 'Vadenje zuba',
   array['extraccion','extraction','vadenje zuba'],
   'surgery', 30, 'exact'),

  ('extraccion-muela-juicio',
   'Extraccion muela juicio', 'Wisdom Tooth Removal', 'Vadenje umnjaka',
   array['muela juicio','wisdom tooth','umnjak','cordal'],
   'surgery', 60, 'from'),

  ('cirugia-encias',
   'Cirugia de encias', 'Gum Surgery', 'Kirurgija desni',
   array['cirugia encias','gum surgery','kirurgija desni'],
   'surgery', 90, 'from'),

  ('injerto-oseo',
   'Injerto oseo', 'Bone Graft', 'Kostani presadak',
   array['injerto oseo','bone graft','kostani presadak'],
   'surgery', 90, 'from'),

  ('elevacion-seno',
   'Elevacion de seno', 'Sinus Lift', 'Podizanje sinusa',
   array['elevacion seno','sinus lift','podizanje sinusa'],
   'surgery', 90, 'from'),

  -- orthodontics
  ('ortodoncia-brackets',
   'Ortodoncia brackets', 'Braces', 'Fiksni aparat',
   array['ortodoncia','brackets','braces','fiksni aparat'],
   'orthodontics', 60, 'from'),

  ('invisalign-alineadores',
   'Invisalign / Alineadores', 'Invisalign', 'Nevidljiva ortodoncija',
   array['invisalign','alineadores','nevidljiva ortodoncija','clear aligners'],
   'orthodontics', 60, 'from'),

  ('retenedor-ortodontico',
   'Retenedor ortodontico', 'Retainer', 'Ortodontski retainer',
   array['retenedor','retainer','ortodontski retainer'],
   'orthodontics', 30, 'exact'),

  -- prosthetics
  ('corona-porcelana',
   'Corona porcelana', 'Porcelain Crown', 'Keramicka krunica',
   array['corona porcelana','porcelain crown','keramicka krunica'],
   'prosthetics', 90, 'from'),

  ('corona-zirconio',
   'Corona de zirconio', 'Zirconia Crown', 'Cirkonska krunica',
   array['corona zirconio','zirconia crown','cirkonska krunica','zirconio'],
   'prosthetics', 90, 'from'),

  ('carilla-dental',
   'Carilla dental', 'Dental Veneer', 'Ljuskica',
   array['carilla','veneer','ljuskica','faceta'],
   'prosthetics', 120, 'from'),

  ('puente-dental',
   'Puente dental fijo', 'Dental Bridge', 'Fiksni mostic',
   array['puente dental','dental bridge','fiksni mostic','puente fijo'],
   'prosthetics', 90, 'from'),

  ('dentadura-removible',
   'Dentadura removible', 'Removable Denture', 'Pomicna proteza',
   array['dentadura','denture','pomicna proteza','protesis removible'],
   'prosthetics', 60, 'from'),

  ('implante-dental',
   'Implante dental', 'Dental Implant', 'Dentalni implantat',
   array['implante','implant','dentalni implantat','implantes'],
   'prosthetics', 90, 'from'),

  ('all-on-4',
   'All-on-4 implantes', 'All-on-4 Implants', 'Sve na cetiri',
   array['all-on-4','all on 4','all on four','sve na cetiri'],
   'prosthetics', 180, 'from'),

  -- periodontics
  ('tratamiento-encias',
   'Tratamiento de encias', 'Gum Treatment', 'Lijecenje desni',
   array['tratamiento encias','gum treatment','lijecenje desni','periodontitis'],
   'periodontics', 60, 'from'),

  -- blanqueamiento
  ('blanqueamiento-dental',
   'Blanqueamiento dental', 'Teeth Whitening', 'Izbjeljivanje zuba',
   array['blanqueamiento','whitening','izbjeljivanje','blanquear'],
   'preventive', 60, 'from'),

  -- diagnostic
  ('radiografia-panoramica',
   'Radiografia panoramica', 'Panoramic X-Ray', 'Panoramski RTG',
   array['radiografia','panoramica','panoramic','rtg','panoramski'],
   'diagnostic', 15, 'exact'),

  ('tomografia-cbct',
   'Tomografia CBCT', 'CBCT Scan', 'CBCT snimak',
   array['tomografia','cbct','cone beam','cbct snimak'],
   'diagnostic', 20, 'exact'),

  ('consulta-revision',
   'Consulta / Revision', 'Dental Checkup', 'Dentalni pregled',
   array['consulta','revision','checkup','pregled','dentalni pregled'],
   'diagnostic', 30, 'exact'),

  -- pediatric
  ('odontopediatria',
   'Odontopediatria', 'Pediatric Dentistry', 'Djecja stomatologija',
   array['odontopediatria','pediatric','djecja stomatologija','ninos'],
   'pediatric', 30, 'exact'),

  -- other
  ('urgencia-dental',
   'Urgencia dental', 'Dental Emergency', 'Hitna pomoc',
   array['urgencia','emergency','hitna pomoc','urgente'],
   'other', 30, 'exact'),

  ('ferula-bruxismo',
   'Ferula de bruxismo', 'Night Guard', 'Stinik za zube',
   array['ferula','bruxismo','night guard','stinik','placa oclusal'],
   'other', 30, 'from'),

  ('anestesia-sedacion',
   'Anestesia / Sedacion', 'Sedation', 'Sedacija',
   array['anestesia','sedacion','sedation','sedacija'],
   'anesthesia', 30, 'from')

on conflict (slug) do nothing;

-- ============================================================
-- Block 5: Add nullable catalog_id FK to treatments table
-- Nullable so all existing clinic treatment rows are preserved as-is.
-- ============================================================
do $alter$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'treatments'
      and column_name  = 'catalog_id'
  ) then
    alter table public.treatments
      add column catalog_id uuid
        references public.treatment_catalog(id)
        on delete set null;

    -- Index for FK join performance
    create index idx_treatments_catalog_id
      on public.treatments (catalog_id)
      where catalog_id is not null;

    raise notice 'catalog_id column added to treatments';
  else
    raise notice 'catalog_id column already exists on treatments — skipping';
  end if;
end;
$alter$;
