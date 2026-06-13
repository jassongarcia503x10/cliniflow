-- Add the normalized appointment contract without removing legacy fields.
-- This migration is intentionally defensive because older environments may
-- have different appointment and treatment schemas.

do $migration$
declare
  status_default text;
  status_check_name constant text := 'cliniflow_appointments_status_check';
  relation record;
  nullable_column text;
  appointment_type oid;
  target_type oid;
  has_orphans boolean;
begin
  if to_regclass('public.appointments') is null then
    raise notice 'appointments table does not exist; skipping compatibility changes';
    return;
  end if;

  alter table public.appointments
    add column if not exists clinic_id uuid,
    add column if not exists patient_id uuid,
    add column if not exists doctor_id uuid,
    add column if not exists treatment_id uuid,
    add column if not exists start_time timestamptz,
    add column if not exists end_time timestamptz,
    add column if not exists duration_minutes integer,
    add column if not exists price numeric(12,2),
    add column if not exists chief_complaint text,
    add column if not exists notes text,
    add column if not exists status text,
    add column if not exists source text,
    add column if not exists pending_booking_id uuid,
    add column if not exists created_by uuid,
    add column if not exists confirmed_at timestamptz;

  foreach nullable_column in array array['patient_id', 'doctor_id', 'treatment_id']
  loop
    begin
      execute format(
        'alter table public.appointments alter column %I drop not null',
        nullable_column
      );
    exception when others then
      raise notice 'Could not make appointments.% nullable: %', nullable_column, sqlerrm;
    end;
  end loop;

  select column_default
    into status_default
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'appointments'
     and column_name = 'status';

  if status_default is null then
    begin
      alter table public.appointments
        alter column status set default 'scheduled';
    exception when others then
      raise notice 'Could not set appointments.status default: %', sqlerrm;
    end;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.appointments'::regclass
       and conname = status_check_name
  ) and not exists (
    select 1
      from public.appointments
     where status is not null
       and status::text not in (
         'scheduled', 'pending', 'confirmed', 'checked_in', 'in_chair',
         'completed', 'cancelled', 'no_show'
       )
  ) then
    alter table public.appointments
      add constraint cliniflow_appointments_status_check
      check (
        status is null or status::text in (
          'scheduled', 'pending', 'confirmed', 'checked_in', 'in_chair',
          'completed', 'cancelled', 'no_show'
        )
      );
  else
    raise notice 'Skipping appointments status check because it exists or current values conflict';
  end if;

  for relation in
    select *
      from (values
        ('patient_id', 'patients', 'cliniflow_appointments_patient_id_fkey'),
        ('doctor_id', 'doctors', 'cliniflow_appointments_doctor_id_fkey'),
        ('treatment_id', 'treatments', 'cliniflow_appointments_treatment_id_fkey')
      ) as refs(column_name, target_table, constraint_name)
  loop
    if to_regclass('public.' || relation.target_table) is null then
      raise notice 'Skipping % because target table is missing', relation.constraint_name;
      continue;
    end if;

    if exists (
      select 1
        from pg_constraint c
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = any(c.conkey)
       where c.conrelid = 'public.appointments'::regclass
         and c.contype = 'f'
         and a.attname = relation.column_name
    ) then
      raise notice 'Skipping % because the column already has a foreign key', relation.constraint_name;
      continue;
    end if;

    select atttypid
      into appointment_type
      from pg_attribute
     where attrelid = 'public.appointments'::regclass
       and attname = relation.column_name
       and not attisdropped;

    target_type := null;
    execute format(
      'select atttypid from pg_attribute where attrelid = %L::regclass and attname = ''id'' and not attisdropped',
      'public.' || relation.target_table
    ) into target_type;

    if appointment_type is distinct from target_type then
      raise notice 'Skipping % because column types do not match', relation.constraint_name;
      continue;
    end if;

    execute format(
      'select exists (
         select 1
           from public.appointments a
           left join public.%I target on target.id = a.%I
          where a.%I is not null
            and target.id is null
       )',
      relation.target_table, relation.column_name, relation.column_name
    ) into has_orphans;

    if has_orphans then
      raise notice 'Skipping % because existing rows would violate it', relation.constraint_name;
      continue;
    end if;

    begin
      execute format(
        'alter table public.appointments add constraint %I foreign key (%I) references public.%I(id)',
        relation.constraint_name, relation.column_name, relation.target_table
      );
    exception when others then
      raise notice 'Could not add % safely: %', relation.constraint_name, sqlerrm;
    end;
  end loop;
end
$migration$;

-- Seed a small starter catalog only for clinics with no treatments.
do $seed$
declare
  duration_column text;
  insert_columns text := 'clinic_id, name, price';
  seed_values text;
begin
  if to_regclass('public.clinics') is null
     or to_regclass('public.treatments') is null then
    raise notice 'clinics or treatments table missing; skipping treatment seeds';
    return;
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'treatments'
       and column_name = 'clinic_id'
  ) or not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'treatments'
       and column_name = 'name'
  ) or not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'treatments'
       and column_name = 'price'
  ) then
    raise notice 'treatments table lacks clinic_id, name, or price; skipping seeds';
    return;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'treatments' and column_name = 'duration'
  ) then
    duration_column := 'duration';
  elsif exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'treatments' and column_name = 'duration_minutes'
  ) then
    duration_column := 'duration_minutes';
  else
    raise notice 'treatments table lacks duration or duration_minutes; skipping seeds';
    return;
  end if;

  insert_columns := insert_columns || ', ' || quote_ident(duration_column);
  seed_values := 'seed.name, seed.price, seed.duration_minutes';

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'treatments' and column_name = 'price_mode'
  ) then
    insert_columns := insert_columns || ', price_mode';
    seed_values := seed_values || ', ''exact''';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'treatments' and column_name = 'active'
  ) then
    insert_columns := insert_columns || ', active';
    seed_values := seed_values || ', true';
  end if;

  begin
    execute format(
      'insert into public.treatments (%s)
       select c.id, %s
         from public.clinics c
         cross join (values
           (''Consulta general'', 25::numeric, 30),
           (''Limpieza dental'', 50::numeric, 45),
           (''Evaluación dental'', 30::numeric, 30)
         ) as seed(name, price, duration_minutes)
        where not exists (
          select 1 from public.treatments existing where existing.clinic_id = c.id
        )',
      insert_columns, seed_values
    );
  exception when others then
    raise notice 'Could not seed treatments safely: %', sqlerrm;
  end;
end
$seed$;
