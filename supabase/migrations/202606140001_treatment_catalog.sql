-- ============================================================
-- Migration : 202606140001_treatment_catalog
-- Purpose   : Phase 1 — Global treatment catalog foundation
--             supporting the Nexara clinical intelligence platform.
--
-- Tables created:
--   catalog_categories      — extensible per-specialty category registry
--   treatment_catalog       — canonical global procedure catalog
--   treatment_catalog_i18n  — multilingual names + aliases per procedure
--
-- Alters:
--   treatments.catalog_id   — nullable FK; all existing rows preserved
--
-- Design principles:
--   • Specialty-first: every entry is tagged so the same schema
--     serves dentistry, general_medicine, dermatology, etc.
--   • i18n-first: names and aliases live in a child table so
--     adding a language never requires a schema migration.
--   • Idempotent: IF NOT EXISTS + ON CONFLICT DO NOTHING throughout.
--   • Service-role only for writes; anon + authenticated can read.
--
-- DO NOT apply directly — use `supabase db push` or the dashboard.
-- ============================================================

-- ============================================================
-- Block 0: Extensions
-- pg_trgm is enabled by default in Supabase; guard anyway.
-- ============================================================
create extension if not exists pg_trgm;

-- ============================================================
-- Block 1: catalog_categories
-- Global registry of categories, grouped by specialty.
-- New specialties add rows here — no schema migration needed.
--
-- id format: '{specialty}-{category}' (e.g. 'dentistry-preventive')
-- This encodes the specialty in the PK so the FK on
-- treatment_catalog implicitly constrains category + specialty.
-- ============================================================
create table if not exists public.catalog_categories (
  id          text  primary key,
  specialty   text  not null,
  label_es    text  not null,
  label_en    text  not null
);

comment on table public.catalog_categories is
  'Extensible category registry for the global treatment catalog. '
  'One row per category per specialty. Managed via migrations only.';

-- RLS: public read, service-role write
alter table public.catalog_categories enable row level security;

do $rls_cat$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'catalog_categories'
      and policyname = 'cliniflow_catalog_categories_public_read'
  ) then
    execute $policy$
      create policy cliniflow_catalog_categories_public_read
        on public.catalog_categories
        for select to anon, authenticated
        using (true)
    $policy$;
  end if;
end;
$rls_cat$;

-- ============================================================
-- Block 2: treatment_catalog
-- One canonical row per procedure, language-neutral.
-- Names and aliases are in treatment_catalog_i18n.
--
-- specialty CHECK: grows slowly → inline constraint is appropriate.
-- category  FK   : grows per specialty → references catalog_categories.
-- ============================================================
create table if not exists public.treatment_catalog (
  id                       uuid        primary key default gen_random_uuid(),
  slug                     text        not null,
  specialty                text        not null
                             check (specialty in (
                               'dentistry',
                               'general_medicine',
                               'dermatology',
                               'pediatrics',
                               'veterinary',
                               'mental_health',
                               'nutrition'
                               -- TODO: extend as new Nexara verticals launch
                             )),
  category                 text        not null
                             references public.catalog_categories(id),
  default_duration_minutes int         not null check (default_duration_minutes > 0),
  default_price_mode       text        not null default 'consult'
                             check (default_price_mode in ('exact', 'from', 'consult')),
  active                   boolean     not null default true,
  created_at               timestamptz not null default now(),
  constraint treatment_catalog_slug_unique unique (slug)
);

comment on table public.treatment_catalog is
  'Global canonical procedure catalog for all Nexara verticals. '
  'Language-neutral: names and aliases live in treatment_catalog_i18n. '
  'Clinic-specific pricing lives in the per-tenant treatments table. '
  'Managed via migrations only — never written to by application code.';

comment on column public.treatment_catalog.specialty is
  'Top-level vertical: dentistry, general_medicine, dermatology, etc. '
  'Allows a single catalog table to serve all Nexara products.';

comment on column public.treatment_catalog.category is
  'FK to catalog_categories(id). Format: {specialty}-{category}. '
  'Implicitly enforces that category belongs to the correct specialty.';

-- TODO (Phase 3 — Clinical Knowledge Base):
--   Add table clinical_knowledge:
--     id uuid PK, catalog_id uuid FK → treatment_catalog (nullable),
--     specialty text, content_type text, slug text UNIQUE, active bool.
--   Add table clinical_knowledge_i18n:
--     knowledge_id uuid FK (PK), lang text (PK), title text, body text.
--   This will power Sofia Knowledge Mode and future Jarvis education layer.
--   clinical_knowledge entries may be standalone (no catalog_id) to cover
--   topics like "What is gingivitis?" that are not bookable procedures.

-- RLS: public read on active entries; service-role only for writes
alter table public.treatment_catalog enable row level security;

do $rls_tc$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'treatment_catalog'
      and policyname = 'cliniflow_treatment_catalog_public_read'
  ) then
    execute $policy$
      create policy cliniflow_treatment_catalog_public_read
        on public.treatment_catalog
        for select to anon, authenticated
        using (active = true)
    $policy$;
  end if;
end;
$rls_tc$;

-- ============================================================
-- Block 3: treatment_catalog_i18n
-- One row per (procedure × language).
-- Aliases are per-language so matching is always language-aware.
-- Adding a new language = new rows here, zero schema change.
-- ============================================================
create table if not exists public.treatment_catalog_i18n (
  catalog_id  uuid    not null
                references public.treatment_catalog(id)
                on delete cascade,
  lang        text    not null,  -- BCP-47 short code: 'es', 'en', 'hr', 'pt', 'ar' …
  name        text    not null,
  aliases     text[]  not null default '{}',
  primary key (catalog_id, lang)
);

comment on table public.treatment_catalog_i18n is
  'Multilingual names and patient-facing aliases for each catalog procedure. '
  'Primary key (catalog_id, lang) — one row per procedure per language. '
  'To add a language: INSERT rows for that lang code, no DDL needed.';

comment on column public.treatment_catalog_i18n.aliases is
  'Informal patient terms in this language (e.g. "sacar un diente", "muela del juicio"). '
  'Used by whatsapp-webhook for treatment detection and by Sofia for fuzzy matching.';

-- RLS: same open-read policy — i18n is not sensitive
alter table public.treatment_catalog_i18n enable row level security;

do $rls_i18n$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'treatment_catalog_i18n'
      and policyname = 'cliniflow_treatment_catalog_i18n_public_read'
  ) then
    execute $policy$
      create policy cliniflow_treatment_catalog_i18n_public_read
        on public.treatment_catalog_i18n
        for select to anon, authenticated
        using (true)
    $policy$;
  end if;
end;
$rls_i18n$;

-- ============================================================
-- Block 4: Indexes
-- ============================================================

-- treatment_catalog: filter by specialty and category
create index if not exists idx_treatment_catalog_specialty
  on public.treatment_catalog (specialty);

create index if not exists idx_treatment_catalog_category
  on public.treatment_catalog (category);

-- Partial index: active entries only (most common query filter)
create index if not exists idx_treatment_catalog_active
  on public.treatment_catalog (active)
  where active = true;

-- treatment_catalog_i18n: fast lang lookups
create index if not exists idx_treatment_catalog_i18n_lang
  on public.treatment_catalog_i18n (lang);

-- GIN index for alias array containment (@>) — used by whatsapp-webhook
create index if not exists idx_treatment_catalog_i18n_aliases
  on public.treatment_catalog_i18n using gin (aliases);

-- pg_trgm indexes for fuzzy ILIKE name search — used by Phase 2 API
create index if not exists idx_treatment_catalog_i18n_name_trgm
  on public.treatment_catalog_i18n using gin (name gin_trgm_ops);

-- ============================================================
-- Block 5: Seed — catalog_categories (dentistry only for Phase 1)
-- New specialties add rows in their own future migrations.
-- ============================================================
insert into public.catalog_categories (id, specialty, label_es, label_en)
values
  ('dentistry-preventive',   'dentistry', 'Preventiva',          'Preventive'),
  ('dentistry-restorative',  'dentistry', 'Restauradora',        'Restorative'),
  ('dentistry-endodontics',  'dentistry', 'Endodoncia',          'Endodontics'),
  ('dentistry-surgery',      'dentistry', 'Cirugia oral',        'Oral Surgery'),
  ('dentistry-orthodontics', 'dentistry', 'Ortodoncia',          'Orthodontics'),
  ('dentistry-prosthetics',  'dentistry', 'Protesis',            'Prosthetics'),
  ('dentistry-periodontics', 'dentistry', 'Periodoncia',         'Periodontics'),
  ('dentistry-diagnostic',   'dentistry', 'Diagnostico',         'Diagnostic'),
  ('dentistry-pediatric',    'dentistry', 'Odontopediatria',     'Pediatric Dentistry'),
  ('dentistry-anesthesia',   'dentistry', 'Anestesia / Sedacion','Anesthesia / Sedation'),
  ('dentistry-other',        'dentistry', 'Otros',               'Other')
on conflict (id) do nothing;

-- ============================================================
-- Block 6: Seed — treatment_catalog (30 dental procedures)
-- Language-neutral fields only. Names/aliases seeded in Block 7.
-- ============================================================
insert into public.treatment_catalog
  (slug, specialty, category, default_duration_minutes, default_price_mode)
values
  -- preventive
  ('limpieza-dental',          'dentistry', 'dentistry-preventive',   45,  'exact'),
  ('blanqueamiento-dental',    'dentistry', 'dentistry-preventive',   60,  'from'),
  ('sellado-dental',           'dentistry', 'dentistry-preventive',   30,  'exact'),
  ('fluoruro-topico',          'dentistry', 'dentistry-preventive',   20,  'exact'),
  -- restorative
  ('empaste-obturacion',       'dentistry', 'dentistry-restorative',  45,  'exact'),
  ('bonding-dental',           'dentistry', 'dentistry-restorative',  60,  'from'),
  -- endodontics
  ('endodoncia',               'dentistry', 'dentistry-endodontics',  90,  'from'),
  -- surgery
  ('extraccion-simple',        'dentistry', 'dentistry-surgery',      30,  'exact'),
  ('extraccion-muela-juicio',  'dentistry', 'dentistry-surgery',      60,  'from'),
  ('cirugia-encias',           'dentistry', 'dentistry-surgery',      90,  'from'),
  ('injerto-oseo',             'dentistry', 'dentistry-surgery',      90,  'from'),
  ('elevacion-seno',           'dentistry', 'dentistry-surgery',      90,  'from'),
  -- orthodontics
  ('ortodoncia-brackets',      'dentistry', 'dentistry-orthodontics', 60,  'from'),
  ('invisalign-alineadores',   'dentistry', 'dentistry-orthodontics', 60,  'from'),
  ('retenedor-ortodontico',    'dentistry', 'dentistry-orthodontics', 30,  'exact'),
  -- prosthetics
  ('corona-porcelana',         'dentistry', 'dentistry-prosthetics',  90,  'from'),
  ('corona-zirconio',          'dentistry', 'dentistry-prosthetics',  90,  'from'),
  ('carilla-dental',           'dentistry', 'dentistry-prosthetics',  120, 'from'),
  ('puente-dental',            'dentistry', 'dentistry-prosthetics',  90,  'from'),
  ('dentadura-removible',      'dentistry', 'dentistry-prosthetics',  60,  'from'),
  ('implante-dental',          'dentistry', 'dentistry-prosthetics',  90,  'from'),
  ('all-on-4',                 'dentistry', 'dentistry-prosthetics',  180, 'from'),
  -- periodontics
  ('tratamiento-encias',       'dentistry', 'dentistry-periodontics', 60,  'from'),
  -- diagnostic
  ('radiografia-panoramica',   'dentistry', 'dentistry-diagnostic',   15,  'exact'),
  ('tomografia-cbct',          'dentistry', 'dentistry-diagnostic',   20,  'exact'),
  ('consulta-revision',        'dentistry', 'dentistry-diagnostic',   30,  'exact'),
  -- pediatric
  ('odontopediatria',          'dentistry', 'dentistry-pediatric',    30,  'exact'),
  -- other
  ('urgencia-dental',          'dentistry', 'dentistry-other',        30,  'exact'),
  ('ferula-bruxismo',          'dentistry', 'dentistry-other',        30,  'from'),
  -- anesthesia
  ('anestesia-sedacion',       'dentistry', 'dentistry-anesthesia',   30,  'from')
on conflict (slug) do nothing;

-- ============================================================
-- Block 7: Seed — treatment_catalog_i18n
-- 30 procedures × 3 languages (es, en, hr) = 90 rows.
-- Uses a JOIN on slug so catalog_id is resolved automatically.
-- Aliases are patient-facing informal terms for each language,
-- used for WhatsApp detection (Phase 4) and Sofia fuzzy matching.
-- ============================================================
insert into public.treatment_catalog_i18n (catalog_id, lang, name, aliases)
select tc.id, i.lang, i.name, i.aliases
from public.treatment_catalog tc
join (values

  -- limpieza-dental
  ('limpieza-dental','es','Limpieza dental',
    array['limpieza','profilaxis','limpieza de dientes','limpiar dientes']),
  ('limpieza-dental','en','Dental Cleaning',
    array['cleaning','dental cleaning','teeth cleaning','prophylaxis','scale and polish']),
  ('limpieza-dental','hr','Ciscenje zuba',
    array['ciscenje','profilaksa','ciscenje zuba']),

  -- blanqueamiento-dental
  ('blanqueamiento-dental','es','Blanqueamiento dental',
    array['blanqueamiento','blanquear dientes','blanquear','teeth whitening']),
  ('blanqueamiento-dental','en','Teeth Whitening',
    array['whitening','teeth whitening','bleaching','tooth whitening']),
  ('blanqueamiento-dental','hr','Izbjeljivanje zuba',
    array['izbjeljivanje','bijeljenje zuba','izbjeljivanje zuba']),

  -- sellado-dental
  ('sellado-dental','es','Sellado dental',
    array['sellado','sellante','sealant','sellador']),
  ('sellado-dental','en','Dental Sealant',
    array['sealant','dental sealant','fissure sealant','pit and fissure sealant']),
  ('sellado-dental','hr','Pecatiranje zuba',
    array['pecatiranje','zalivanje fisura']),

  -- fluoruro-topico
  ('fluoruro-topico','es','Fluoruro topico',
    array['fluoruro','fluor','fluoracion','aplicacion fluor']),
  ('fluoruro-topico','en','Fluoride Treatment',
    array['fluoride','fluoride treatment','fluoride application','fluoride varnish']),
  ('fluoruro-topico','hr','Fluoridacija',
    array['fluoridacija','fluor','fluoridacija zuba']),

  -- empaste-obturacion
  ('empaste-obturacion','es','Empaste / Obturacion',
    array['empaste','obturacion','relleno','composite','caries','tapar caries']),
  ('empaste-obturacion','en','Dental Filling',
    array['filling','dental filling','composite filling','cavity filling','amalgam']),
  ('empaste-obturacion','hr','Plomba',
    array['plomba','ispun','plombiranje','kompozit']),

  -- bonding-dental
  ('bonding-dental','es','Bonding dental',
    array['bonding','composite bonding','resina','composite estetico']),
  ('bonding-dental','en','Dental Bonding',
    array['bonding','dental bonding','composite bonding','tooth bonding']),
  ('bonding-dental','hr','Composit bonding',
    array['composit bonding','bonding','kompozitni bonding']),

  -- endodoncia
  ('endodoncia','es','Endodoncia (conductos)',
    array['endodoncia','conductos','matar nervio','nervio','canal radicular']),
  ('endodoncia','en','Root Canal',
    array['root canal','endodontics','nerve treatment','root canal treatment']),
  ('endodoncia','hr','Lijecenje kanala',
    array['lijecenje kanala','endodoncija','kanalni tretman']),

  -- extraccion-simple
  ('extraccion-simple','es','Extraccion simple',
    array['extraccion','sacar diente','arrancar diente','quitar diente']),
  ('extraccion-simple','en','Tooth Extraction',
    array['extraction','tooth extraction','pull tooth','remove tooth']),
  ('extraccion-simple','hr','Vadenje zuba',
    array['vadenje zuba','ekstrakcija','vadenje']),

  -- extraccion-muela-juicio
  ('extraccion-muela-juicio','es','Extraccion muela juicio',
    array['muela juicio','muela del juicio','cordal','tercer molar','muelas del juicio']),
  ('extraccion-muela-juicio','en','Wisdom Tooth Removal',
    array['wisdom tooth','wisdom tooth removal','wisdom teeth','third molar']),
  ('extraccion-muela-juicio','hr','Vadenje umnjaka',
    array['umnjak','vadenje umnjaka','umnjaci']),

  -- cirugia-encias
  ('cirugia-encias','es','Cirugia de encias',
    array['cirugia encias','operacion encias','cirugia periodontal']),
  ('cirugia-encias','en','Gum Surgery',
    array['gum surgery','periodontal surgery','gingival surgery']),
  ('cirugia-encias','hr','Kirurgija desni',
    array['kirurgija desni','operacija desni']),

  -- injerto-oseo
  ('injerto-oseo','es','Injerto oseo',
    array['injerto oseo','injerto de hueso','bone graft','regeneracion osea']),
  ('injerto-oseo','en','Bone Graft',
    array['bone graft','bone grafting','osseous graft','bone regeneration']),
  ('injerto-oseo','hr','Kostani presadak',
    array['kostani presadak','kostani graft','regeneracija kosti']),

  -- elevacion-seno
  ('elevacion-seno','es','Elevacion de seno',
    array['elevacion seno','sinus lift','elevacion sinusal','levantamiento seno']),
  ('elevacion-seno','en','Sinus Lift',
    array['sinus lift','sinus augmentation','sinus elevation','sinus graft']),
  ('elevacion-seno','hr','Podizanje sinusa',
    array['podizanje sinusa','sinus lift','augmentacija sinusa']),

  -- ortodoncia-brackets
  ('ortodoncia-brackets','es','Ortodoncia brackets',
    array['ortodoncia','brackets','aparato dental','aparato fijo','frenillos']),
  ('ortodoncia-brackets','en','Braces',
    array['braces','orthodontics','fixed braces','metal braces','dental braces']),
  ('ortodoncia-brackets','hr','Fiksni aparat',
    array['fiksni aparat','bracevi','ortodoncija','nosac']),

  -- invisalign-alineadores
  ('invisalign-alineadores','es','Invisalign / Alineadores',
    array['invisalign','alineadores','alineadores invisibles','ortodoncia invisible','ferulas']),
  ('invisalign-alineadores','en','Invisalign',
    array['invisalign','clear aligners','invisible braces','aligners','clear braces']),
  ('invisalign-alineadores','hr','Nevidljiva ortodoncija',
    array['nevidljiva ortodoncija','invisalign','prozirni aparatic','aligneri']),

  -- retenedor-ortodontico
  ('retenedor-ortodontico','es','Retenedor ortodontico',
    array['retenedor','retenedor dental','contencion','placa contencion']),
  ('retenedor-ortodontico','en','Retainer',
    array['retainer','orthodontic retainer','dental retainer','fixed retainer']),
  ('retenedor-ortodontico','hr','Ortodontski retainer',
    array['ortodontski retainer','retainer','zadrzivac']),

  -- corona-porcelana
  ('corona-porcelana','es','Corona porcelana',
    array['corona porcelana','corona ceramica','funda porcelana','corona dental']),
  ('corona-porcelana','en','Porcelain Crown',
    array['porcelain crown','ceramic crown','dental crown','crown']),
  ('corona-porcelana','hr','Keramicka krunica',
    array['keramicka krunica','porculanska krunica','krunica']),

  -- corona-zirconio
  ('corona-zirconio','es','Corona de zirconio',
    array['corona zirconio','zirconio','funda zirconio','corona zircon']),
  ('corona-zirconio','en','Zirconia Crown',
    array['zirconia crown','zirconium crown','zirconia','zirconia dental crown']),
  ('corona-zirconio','hr','Cirkonska krunica',
    array['cirkonska krunica','zirkonij krunica','cirkon']),

  -- carilla-dental
  ('carilla-dental','es','Carilla dental',
    array['carilla','carillas','faceta','veneer','carilla porcelana']),
  ('carilla-dental','en','Dental Veneer',
    array['veneer','dental veneer','porcelain veneer','composite veneer','veneers']),
  ('carilla-dental','hr','Ljuskica',
    array['ljuskica','keramicka ljuskica','veneer','ljuskice']),

  -- puente-dental
  ('puente-dental','es','Puente dental fijo',
    array['puente dental','puente fijo','puente','protesis fija']),
  ('puente-dental','en','Dental Bridge',
    array['dental bridge','bridge','fixed bridge','tooth bridge']),
  ('puente-dental','hr','Fiksni mostic',
    array['fiksni mostic','mostic','most','fiksni most']),

  -- dentadura-removible
  ('dentadura-removible','es','Dentadura removible',
    array['dentadura','protesis removible','dentadura postiza','protesis dental']),
  ('dentadura-removible','en','Removable Denture',
    array['denture','removable denture','false teeth','dental plate','full denture']),
  ('dentadura-removible','hr','Pomicna proteza',
    array['pomicna proteza','zubna proteza','proteza']),

  -- implante-dental
  ('implante-dental','es','Implante dental',
    array['implante','implantes','implante dental','diente implantat']),
  ('implante-dental','en','Dental Implant',
    array['implant','dental implant','tooth implant','implants']),
  ('implante-dental','hr','Dentalni implantat',
    array['dentalni implantat','implantat','implantati']),

  -- all-on-4
  ('all-on-4','es','All-on-4 implantes',
    array['all-on-4','all on 4','implantes completos','dentadura fija','arcada completa']),
  ('all-on-4','en','All-on-4 Implants',
    array['all-on-4','all on four','full arch implants','all on 4']),
  ('all-on-4','hr','Sve na cetiri',
    array['sve na cetiri','all-on-4','potpuna proteza na implantatima']),

  -- tratamiento-encias
  ('tratamiento-encias','es','Tratamiento de encias',
    array['encias','tratamiento periodontal','periodontitis','piorrea','encias inflamadas']),
  ('tratamiento-encias','en','Gum Treatment',
    array['gum treatment','periodontal treatment','gum disease','periodontitis','gingivitis']),
  ('tratamiento-encias','hr','Lijecenje desni',
    array['lijecenje desni','paradontoza','parodontitis','upala desni']),

  -- radiografia-panoramica
  ('radiografia-panoramica','es','Radiografia panoramica',
    array['radiografia','panoramica','rx panoramica','ortopantomografia','rx dental']),
  ('radiografia-panoramica','en','Panoramic X-Ray',
    array['panoramic x-ray','panoramic','x-ray','dental x-ray','panoramic radiograph']),
  ('radiografia-panoramica','hr','Panoramski RTG',
    array['panoramski rtg','panoramska snimka','rtg','rendgen']),

  -- tomografia-cbct
  ('tomografia-cbct','es','Tomografia CBCT',
    array['tomografia','cbct','tac dental','escaner dental','cone beam']),
  ('tomografia-cbct','en','CBCT Scan',
    array['cbct','cbct scan','cone beam ct','3d scan','cone beam scan']),
  ('tomografia-cbct','hr','CBCT snimak',
    array['cbct snimak','trodimenzionalna snimka','3d snimak']),

  -- consulta-revision
  ('consulta-revision','es','Consulta / Revision',
    array['consulta','revision','chequeo dental','valoracion','primera visita']),
  ('consulta-revision','en','Dental Checkup',
    array['checkup','consultation','dental exam','evaluation','dental consultation']),
  ('consulta-revision','hr','Dentalni pregled',
    array['pregled','dentalni pregled','kontrola','sistematski pregled']),

  -- odontopediatria
  ('odontopediatria','es','Odontopediatria',
    array['odontopediatria','dentista ninos','dientes ninos','pediatria dental','ninos']),
  ('odontopediatria','en','Pediatric Dentistry',
    array['pediatric dentistry','children dentist','kids dentist','pediatric','child dental']),
  ('odontopediatria','hr','Djecja stomatologija',
    array['djecja stomatologija','djecji zubar','djeca zubi']),

  -- urgencia-dental
  ('urgencia-dental','es','Urgencia dental',
    array['urgencia','urgente','emergencia dental','dolor diente','dolor muelas']),
  ('urgencia-dental','en','Dental Emergency',
    array['emergency','dental emergency','urgent dental','tooth pain','toothache']),
  ('urgencia-dental','hr','Hitna pomoc',
    array['hitna pomoc','hitno','bol zuba','zubobolja']),

  -- ferula-bruxismo
  ('ferula-bruxismo','es','Ferula de bruxismo',
    array['ferula','bruxismo','protector nocturno','placa oclusal','rechinar dientes']),
  ('ferula-bruxismo','en','Night Guard',
    array['night guard','bruxism guard','occlusal splint','mouthguard','teeth grinding guard']),
  ('ferula-bruxismo','hr','Stinik za zube',
    array['stinik za zube','udlaga za bruksizam','stitnik','skripanje zubima']),

  -- anestesia-sedacion
  ('anestesia-sedacion','es','Anestesia / Sedacion',
    array['anestesia','sedacion','anestesia local','sedacion consciente','dormirse']),
  ('anestesia-sedacion','en','Sedation',
    array['sedation','anesthesia','conscious sedation','dental sedation','local anesthesia']),
  ('anestesia-sedacion','hr','Sedacija',
    array['sedacija','anestezija','lokalna anestezija','umirujuce sredstvo'])

) as i(slug, lang, name, aliases) on tc.slug = i.slug
on conflict (catalog_id, lang) do nothing;

-- ============================================================
-- Block 8: Add nullable catalog_id FK to per-clinic treatments
-- Nullable: all existing clinic treatment rows are preserved as-is.
-- Clinics will link their treatments to catalog entries in Phase 2+.
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

    create index idx_treatments_catalog_id
      on public.treatments (catalog_id)
      where catalog_id is not null;

    raise notice 'catalog_id column added to treatments';
  else
    raise notice 'catalog_id column already exists on treatments — skipping';
  end if;
end;
$alter$;
