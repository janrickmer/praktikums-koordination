-- =====================================================================
--  Praktikumsportal – Georg-Christoph-Lichtenberg-Schule Kassel
--  Datenbankschema für Supabase (PostgreSQL)
--
--  Ausführen: Supabase-Dashboard → SQL Editor → diesen kompletten
--  Inhalt einfügen → "Run". Das Skript kann bei Updates erneut
--  ausgeführt werden (Tabellen bleiben erhalten, Funktionen werden
--  aktualisiert).
--
--  Sicherheitskonzept:
--   * Alle Tabellen liegen im Schema "app", das über die öffentliche
--     Schnittstelle (Data API) NICHT erreichbar ist.
--   * Der Browser ruft ausschließlich die Funktionen im Schema "public"
--     auf. Jede Funktion prüft selbst, wer angemeldet ist und was
--     diese Person sehen bzw. ändern darf.
--   * Passwörter, Seitenpasswort, Lehrkräfte-Code und Einmal-Codes
--     werden nur als bcrypt-Hash gespeichert (nicht entschlüsselbar).
--
--  Seitenpasswort und Lehrkräfte-Code werden NICHT in dieser Datei
--  festgelegt (das Repository ist öffentlich). Nach dem Ausführen
--  einmalig im SQL Editor aufrufen:
--
--      select app.set_access_codes('SEITENPASSWORT', 'LEHRKRAEFTE-CODE');
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
revoke all on schema app from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema app from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema app from authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------
--  Tabellen
-- ---------------------------------------------------------------------

create table if not exists app.settings (
  key   text primary key,
  value text not null
);

create table if not exists app.teachers (
  id             uuid primary key default gen_random_uuid(),
  first_name     text not null,
  last_name      text not null,
  email          text not null unique,
  password_hash  text not null,
  contact_name   text not null,
  contact_email  text not null,
  contact_phone  text,
  failed_logins  int  not null default 0,
  locked_until   timestamptz,
  created_at     timestamptz not null default now()
);

create table if not exists app.classes (
  id             uuid primary key default gen_random_uuid(),
  teacher_id     uuid not null references app.teachers(id) on delete cascade,
  grade          text not null check (grade in ('9', '11')),
  name           text not null,
  join_code      text not null unique,
  visit_message  text,   -- Sammelnachricht "Praktikumsbesuche durch mich"
  video_message  text,   -- Sammelnachricht "Praktikumsgespräche mit Videocall"
  created_at     timestamptz not null default now()
);
create index if not exists classes_teacher_idx on app.classes(teacher_id);

create table if not exists app.students (
  id                   uuid primary key default gen_random_uuid(),
  first_name           text not null,
  last_name            text not null,
  email                text not null unique,
  password_hash        text not null,
  class_id             uuid references app.classes(id) on delete set null,
  must_change_password boolean not null default false,
  failed_logins        int not null default 0,
  locked_until         timestamptz,
  -- Betriebssteckbrief
  company_name         text,
  company_street       text,
  company_zip          text,
  company_city         text,
  distance_km          numeric(7,1),
  job_title            text,
  supervisor_name      text,
  supervisor_email     text,
  supervisor_phone     text,
  -- Unterkunft während des Praktikums
  lodging_away         boolean,
  lodging_name         text,
  lodging_relation     text,
  lodging_contact      text,
  -- Klassenteam (Kürzel als Freitext)
  class_team           text,
  -- freiwillige private Handynummer
  mobile_phone         text,
  -- Praktikumsbesuch / Praktikumsgespräch (von der Lehrkraft gesetzt)
  visit_format         text check (visit_format in ('praesenz', 'video')),
  visit_by_me          boolean not null default false,
  visit_teacher_name   text,
  info_message         text,  -- individuelle Nachricht (überschreibt Sammelnachricht)
  appt_start           timestamptz,
  appt_end             timestamptz,
  appt_location        text,
  appt_note            text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists students_class_idx on app.students(class_id);

create table if not exists app.sessions (
  token_hash  text primary key,
  role        text not null check (role in ('teacher', 'student')),
  user_id     uuid not null,
  restricted  boolean not null default false,  -- nur Passwort setzen erlaubt
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists sessions_user_idx on app.sessions(user_id);

create table if not exists app.reset_requests (
  student_id       uuid primary key references app.students(id) on delete cascade,
  class_id         uuid not null references app.classes(id) on delete cascade,
  created_at       timestamptz not null default now(),
  code_hash        text,
  code_issued_at   timestamptz,
  code_expires_at  timestamptz
);

-- Fehlversuche beim Lehrkräfte-Code (Schutz gegen systematisches Ausprobieren)
create table if not exists app.attempts (
  kind        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists attempts_kind_idx on app.attempts(kind, created_at);

alter table app.settings       enable row level security;
alter table app.attempts       enable row level security;
alter table app.teachers       enable row level security;
alter table app.classes        enable row level security;
alter table app.students       enable row level security;
alter table app.sessions       enable row level security;
alter table app.reset_requests enable row level security;

-- ---------------------------------------------------------------------
--  Interne Hilfsfunktionen (Schema app, nicht öffentlich aufrufbar)
-- ---------------------------------------------------------------------

-- Text säubern: trimmen, kürzen, leere Werte -> NULL
create or replace function app.clean(p text, p_max int default 200)
returns text language sql immutable as $$
  select nullif(left(btrim(coalesce(p, ''), E' \t\r\n'), p_max), '')
$$;

create or replace function app.required(p text, p_label text, p_max int default 100)
returns text language plpgsql immutable as $$
declare v text := app.clean(p, p_max);
begin
  if v is null then
    raise exception 'Bitte gib % an.', p_label;
  end if;
  return v;
end $$;

create or replace function app.norm_email(p text)
returns text language plpgsql immutable as $$
declare v text := lower(btrim(coalesce(p, '')));
begin
  if v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v) > 200 then
    raise exception 'Bitte gib eine gültige E-Mail-Adresse an.';
  end if;
  return v;
end $$;

create or replace function app.optional_email(p text)
returns text language plpgsql immutable as $$
declare v text := app.clean(p, 200);
begin
  if v is null then return null; end if;
  if v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Die E-Mail-Adresse "%" ist ungültig.', v;
  end if;
  return v;
end $$;

create or replace function app.check_password(p text)
returns void language plpgsql immutable as $$
begin
  if p is null or length(p) < 8 then
    raise exception 'Das Passwort muss mindestens 8 Zeichen lang sein.';
  end if;
  if octet_length(p) > 72 then
    raise exception 'Das Passwort ist zu lang (höchstens 72 Zeichen).';
  end if;
end $$;

create or replace function app.hash_secret(p text)
returns text language sql volatile as $$
  select extensions.crypt(p, extensions.gen_salt('bf', 10))
$$;

create or replace function app.secret_matches(p text, p_hash text)
returns boolean language sql stable as $$
  select p is not null and p_hash is not null
     and extensions.crypt(p, p_hash) = p_hash
$$;

-- Seitenpasswort / Lehrkräfte-Code: Groß-/Kleinschreibung egal
create or replace function app.norm_access(p text)
returns text language sql immutable as $$
  select lower(btrim(coalesce(p, '')))
$$;

create or replace function app.check_access(p_key text, p_value text)
returns boolean language sql stable as $$
  select coalesce(
    (select app.secret_matches(app.norm_access(p_value), s.value)
       from app.settings s where s.key = p_key),
    false)
$$;

-- Zufallscode aus gut unterscheidbaren Zeichen (ohne 0/O, 1/I/L)
create or replace function app.random_code(p_len int)
returns text language plpgsql volatile as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(p_len);
  r text := '';
begin
  for i in 0 .. p_len - 1 loop
    r := r || substr(alphabet, (get_byte(b, i) % length(alphabet)) + 1, 1);
  end loop;
  return r;
end $$;

create or replace function app.norm_code(p text)
returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

create or replace function app.token_hash(p_token text)
returns text language sql immutable as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

create or replace function app.new_session(p_role text, p_user uuid, p_restricted boolean default false)
returns text language plpgsql volatile as $$
declare v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  delete from app.sessions where expires_at < now();
  insert into app.sessions (token_hash, role, user_id, restricted, expires_at)
  values (app.token_hash(v_token), p_role, p_user, p_restricted,
          now() + case when p_restricted then interval '30 minutes' else interval '14 days' end);
  return v_token;
end $$;

-- Sitzung prüfen, liefert die Benutzer-ID
create or replace function app.auth(p_token text, p_role text, p_allow_restricted boolean default false)
returns uuid language plpgsql volatile as $$
declare s app.sessions;
begin
  select * into s from app.sessions where token_hash = app.token_hash(p_token);
  if not found or s.expires_at < now() or s.role <> p_role then
    raise exception 'Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.'
      using hint = 'session';
  end if;
  if s.restricted and not p_allow_restricted then
    raise exception 'Bitte lege zuerst ein neues Passwort fest.' using hint = 'must_change';
  end if;
  if not s.restricted and s.expires_at < now() + interval '13 days' then
    update app.sessions set expires_at = now() + interval '14 days'
     where token_hash = s.token_hash;
  end if;
  return s.user_id;
end $$;

-- Art des Praktikumsbesuchs: none | me | other | video
create or replace function app.visit_kind(p_format text, p_by_me boolean)
returns text language sql immutable as $$
  select case
    when p_format = 'video' then 'video'
    when p_format = 'praesenz' and coalesce(p_by_me, false) then 'me'
    when p_format = 'praesenz' then 'other'
    else 'none' end
$$;

create or replace function app.own_class(p_teacher uuid, p_class uuid)
returns app.classes language plpgsql stable as $$
declare c app.classes;
begin
  select * into c from app.classes where id = p_class and teacher_id = p_teacher;
  if not found then
    raise exception 'Diese Klasse wurde nicht gefunden.';
  end if;
  return c;
end $$;

create or replace function app.own_student(p_teacher uuid, p_student uuid)
returns app.students language plpgsql stable as $$
declare s app.students;
begin
  select st.* into s
    from app.students st join app.classes c on c.id = st.class_id
   where st.id = p_student and c.teacher_id = p_teacher;
  if not found then
    raise exception 'Diese Schülerin bzw. dieser Schüler wurde nicht gefunden.';
  end if;
  return s;
end $$;

-- Alle Daten eines Schülers für die Lehrkraft (ohne Passwort-Hash)
create or replace function app.student_json(s app.students)
returns jsonb language sql stable as $$
  select to_jsonb(s) - 'password_hash' - 'failed_logins' - 'locked_until' - 'must_change_password'
         || jsonb_build_object(
              'visit_kind', app.visit_kind(s.visit_format, s.visit_by_me),
              'reset_requested', exists (select 1 from app.reset_requests r where r.student_id = s.id))
$$;

-- Fehlversuch zählen (nach 10 Fehlversuchen 10 Minuten Sperre)
create or replace function app.register_failed_login(p_table text, p_id uuid)
returns void language plpgsql volatile as $$
begin
  if p_table = 'teachers' then
    update app.teachers
       set failed_logins = case when failed_logins + 1 >= 10 then 0 else failed_logins + 1 end,
           locked_until  = case when failed_logins + 1 >= 10 then now() + interval '10 minutes' else locked_until end
     where id = p_id;
  else
    update app.students
       set failed_logins = case when failed_logins + 1 >= 10 then 0 else failed_logins + 1 end,
           locked_until  = case when failed_logins + 1 >= 10 then now() + interval '10 minutes' else locked_until end
     where id = p_id;
  end if;
end $$;

-- ---------------------------------------------------------------------
--  Verwaltungsfunktionen (nur im Supabase SQL Editor aufrufbar)
-- ---------------------------------------------------------------------

-- Seitenpasswort und Lehrkräfte-Code festlegen bzw. ändern
create or replace function app.set_access_codes(p_site_password text, p_teacher_code text)
returns text language plpgsql volatile as $$
begin
  if app.clean(p_site_password) is null or app.clean(p_teacher_code) is null then
    raise exception 'Seitenpasswort und Lehrkräfte-Code dürfen nicht leer sein.';
  end if;
  insert into app.settings (key, value) values ('site_password', app.hash_secret(app.norm_access(p_site_password)))
    on conflict (key) do update set value = excluded.value;
  insert into app.settings (key, value) values ('teacher_code', app.hash_secret(app.norm_access(p_teacher_code)))
    on conflict (key) do update set value = excluded.value;
  return 'Seitenpasswort und Lehrkräfte-Code wurden gespeichert.';
end $$;

-- Passwort einer Lehrkraft zurücksetzen (z. B. bei "Passwort vergessen")
create or replace function app.admin_reset_teacher_password(p_email text, p_new_password text)
returns text language plpgsql volatile as $$
declare v_id uuid;
begin
  perform app.check_password(p_new_password);
  update app.teachers set password_hash = app.hash_secret(p_new_password),
         failed_logins = 0, locked_until = null
   where email = lower(btrim(p_email)) returning id into v_id;
  if v_id is null then
    raise exception 'Keine Lehrkraft mit dieser E-Mail-Adresse gefunden.';
  end if;
  delete from app.sessions where user_id = v_id;
  return 'Passwort wurde zurückgesetzt.';
end $$;

-- ---------------------------------------------------------------------
--  Öffentliche API – allgemein
-- ---------------------------------------------------------------------

create or replace function public.check_site_password(p_password text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
begin
  if not exists (select 1 from app.settings where key = 'site_password') then
    return jsonb_build_object('error', 'Das Portal ist noch nicht eingerichtet (Seitenpasswort fehlt).');
  end if;
  return jsonb_build_object('ok', app.check_access('site_password', p_password));
end $$;

create or replace function public.logout(p_token text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
begin
  delete from app.sessions where token_hash = app.token_hash(p_token);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
--  Öffentliche API – Lehrkräfte: Konto
-- ---------------------------------------------------------------------

create or replace function public.teacher_register(
  p_site_password text, p_teacher_code text,
  p_first_name text, p_last_name text, p_email text, p_password text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare
  v_first text; v_last text; v_email text; v_id uuid;
begin
  if not app.check_access('site_password', p_site_password) then
    raise exception 'Das Seitenpasswort ist nicht korrekt. Bitte gib es erneut ein.' using hint = 'site';
  end if;
  delete from app.attempts where created_at < now() - interval '1 day';
  if (select count(*) from app.attempts
       where kind = 'teacher_code' and created_at > now() - interval '15 minutes') >= 30 then
    return jsonb_build_object('error',
      'Zu viele Fehlversuche beim Lehrkräfte-Code. Die Registrierung ist für einige Minuten gesperrt.');
  end if;
  if not app.check_access('teacher_code', p_teacher_code) then
    insert into app.attempts (kind) values ('teacher_code');
    return jsonb_build_object('error', 'Der Lehrkräfte-Code ist nicht korrekt.');
  end if;
  v_first := app.required(p_first_name, 'deinen Vornamen', 80);
  v_last  := app.required(p_last_name, 'deinen Nachnamen', 80);
  v_email := app.norm_email(p_email);
  perform app.check_password(p_password);
  if exists (select 1 from app.teachers where email = v_email) then
    raise exception 'Mit dieser E-Mail-Adresse ist bereits ein Lehrkräfte-Konto registriert.';
  end if;
  insert into app.teachers (first_name, last_name, email, password_hash, contact_name, contact_email)
  values (v_first, v_last, v_email, app.hash_secret(p_password), v_first || ' ' || v_last, v_email)
  returning id into v_id;
  return jsonb_build_object('token', app.new_session('teacher', v_id));
end $$;

create or replace function public.teacher_login(p_email text, p_password text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare t app.teachers;
begin
  select * into t from app.teachers where email = lower(btrim(coalesce(p_email, '')));
  if not found then
    perform app.hash_secret('timing');
    return jsonb_build_object('error', 'E-Mail-Adresse oder Passwort ist falsch.');
  end if;
  if t.locked_until is not null and t.locked_until > now() then
    return jsonb_build_object('error', 'Zu viele Fehlversuche. Bitte versuche es in einigen Minuten erneut.');
  end if;
  if not app.secret_matches(p_password, t.password_hash) then
    perform app.register_failed_login('teachers', t.id);
    return jsonb_build_object('error', 'E-Mail-Adresse oder Passwort ist falsch.');
  end if;
  update app.teachers set failed_logins = 0, locked_until = null where id = t.id;
  return jsonb_build_object('token', app.new_session('teacher', t.id));
end $$;

create or replace function public.teacher_change_password(p_token text, p_old_password text, p_new_password text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare v_t uuid := app.auth(p_token, 'teacher'); t app.teachers;
begin
  select * into t from app.teachers where id = v_t;
  if not app.secret_matches(p_old_password, t.password_hash) then
    raise exception 'Das bisherige Passwort ist nicht korrekt.';
  end if;
  perform app.check_password(p_new_password);
  update app.teachers set password_hash = app.hash_secret(p_new_password) where id = v_t;
  delete from app.sessions where user_id = v_t and token_hash <> app.token_hash(p_token);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.teacher_update_profile(
  p_token text, p_contact_name text, p_contact_email text, p_contact_phone text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare v_t uuid := app.auth(p_token, 'teacher');
begin
  update app.teachers
     set contact_name  = app.required(p_contact_name, 'einen Namen', 120),
         contact_email = app.norm_email(p_contact_email),
         contact_phone = app.clean(p_contact_phone, 60)
   where id = v_t;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
--  Öffentliche API – Lehrkräfte: Übersicht, Klassen
-- ---------------------------------------------------------------------

create or replace function public.teacher_get_state(p_token text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare v_t uuid := app.auth(p_token, 'teacher'); v jsonb;
begin
  select jsonb_build_object(
    'teacher', jsonb_build_object(
        'id', t.id, 'first_name', t.first_name, 'last_name', t.last_name, 'email', t.email,
        'contact_name', t.contact_name, 'contact_email', t.contact_email, 'contact_phone', t.contact_phone),
    'classes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', c.id, 'grade', c.grade, 'name', c.name, 'join_code', c.join_code,
                 'created_at', c.created_at,
                 'student_count', (select count(*) from app.students s where s.class_id = c.id),
                 'lodging_count', (select count(*) from app.students s where s.class_id = c.id and s.lodging_away),
                 'missing_info_count', (
                    select count(*) from app.students s where s.class_id = c.id and s.info_message is null and (
                      (app.visit_kind(s.visit_format, s.visit_by_me) = 'me' and c.visit_message is null) or
                      (app.visit_kind(s.visit_format, s.visit_by_me) = 'video' and c.video_message is null))),
                 'appointment_count', (select count(*) from app.students s where s.class_id = c.id and s.appt_start is not null)
               ) order by c.grade, c.name)
          from app.classes c where c.teacher_id = t.id), '[]'::jsonb),
    'reset_requests', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'student_id', s.id, 'first_name', s.first_name, 'last_name', s.last_name,
                 'email', s.email, 'class_id', c.id, 'class_name', c.name,
                 'in_class', coalesce(s.class_id = c.id, false),
                 'created_at', r.created_at, 'code_issued_at', r.code_issued_at,
                 'code_expires_at', r.code_expires_at)
               order by r.created_at)
          from app.reset_requests r
          join app.students s on s.id = r.student_id
          join app.classes c on c.id = r.class_id
         where c.teacher_id = t.id), '[]'::jsonb)
  ) into v
  from app.teachers t where t.id = v_t;
  if v is null then
    raise exception 'Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.' using hint = 'session';
  end if;
  return v;
end $$;

create or replace function public.teacher_create_class(p_token text, p_grade text, p_name text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare v_t uuid := app.auth(p_token, 'teacher'); v_code text; v_id uuid; v_name text;
begin
  if p_grade not in ('9', '11') then
    raise exception 'Bitte wähle den Jahrgang (Jg. 9 oder Jg. 11).';
  end if;
  v_name := app.required(p_name, 'einen Namen für die Klasse', 60);
  if exists (select 1 from app.classes where teacher_id = v_t and lower(name) = lower(v_name)) then
    raise exception 'Du hast bereits eine Klasse mit dem Namen "%".', v_name;
  end if;
  loop
    v_code := app.random_code(6);
    exit when not exists (select 1 from app.classes where join_code = v_code);
  end loop;
  insert into app.classes (teacher_id, grade, name, join_code)
  values (v_t, p_grade, v_name, v_code) returning id into v_id;
  return jsonb_build_object('id', v_id, 'join_code', v_code, 'name', v_name, 'grade', p_grade);
end $$;

create or replace function public.teacher_delete_class(p_token text, p_class_id uuid, p_confirm_name text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare v_t uuid := app.auth(p_token, 'teacher'); c app.classes;
begin
  c := app.own_class(v_t, p_class_id);
  if btrim(coalesce(p_confirm_name, '')) <> c.name then
    raise exception 'Zur Bestätigung bitte den Klassennamen exakt eingeben.';
  end if;
  delete from app.sessions where user_id in (select id from app.students where class_id = c.id);
  delete from app.students where class_id = c.id;
  delete from app.classes where id = c.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.teacher_get_class(p_token text, p_class_id uuid)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare v_t uuid := app.auth(p_token, 'teacher'); c app.classes;
begin
  c := app.own_class(v_t, p_class_id);
  return jsonb_build_object(
    'class', to_jsonb(c) - 'teacher_id',
    'teacher', (select jsonb_build_object('contact_name', contact_name) from app.teachers where id = v_t),
    'students', coalesce((
        select jsonb_agg(app.student_json(s) order by lower(s.last_name), lower(s.first_name))
          from app.students s where s.class_id = c.id), '[]'::jsonb));
end $$;

create or replace function public.teacher_set_class_message(p_token text, p_class_id uuid, p_kind text, p_message text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare v_t uuid := app.auth(p_token, 'teacher'); c app.classes;
begin
  c := app.own_class(v_t, p_class_id);
  if p_kind = 'me' then
    update app.classes set visit_message = app.clean(p_message, 5000) where id = c.id;
  elsif p_kind = 'video' then
    update app.classes set video_message = app.clean(p_message, 5000) where id = c.id;
  else
    raise exception 'Unbekannte Nachrichtenart.';
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
--  Öffentliche API – Lehrkräfte: einzelne Schüler
-- ---------------------------------------------------------------------

create or replace function public.teacher_get_student(p_token text, p_student_id uuid)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare v_t uuid := app.auth(p_token, 'teacher'); s app.students; c app.classes;
begin
  s := app.own_student(v_t, p_student_id);
  select * into c from app.classes where id = s.class_id;
  return jsonb_build_object(
    'student', app.student_json(s),
    'class', to_jsonb(c) - 'teacher_id',
    'teacher', (select jsonb_build_object('contact_name', contact_name, 'contact_email', contact_email)
                  from app.teachers where id = v_t));
end $$;

create or replace function public.teacher_set_visit(
  p_token text, p_student_id uuid, p_format text, p_by_me boolean, p_teacher_name text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare
  v_t uuid := app.auth(p_token, 'teacher'); s app.students;
  v_format text := nullif(p_format, ''); v_by_me boolean; v_name text;
  v_old text; v_new text;
begin
  s := app.own_student(v_t, p_student_id);
  if v_format is not null and v_format not in ('praesenz', 'video') then
    raise exception 'Unbekanntes Format.';
  end if;
  v_by_me := v_format = 'praesenz' and coalesce(p_by_me, false);
  v_by_me := coalesce(v_by_me, false);
  v_name  := case when v_format = 'praesenz' and not v_by_me then app.clean(p_teacher_name, 120) end;
  v_old := app.visit_kind(s.visit_format, s.visit_by_me);
  v_new := app.visit_kind(v_format, v_by_me);
  update app.students set
    visit_format       = v_format,
    visit_by_me        = v_by_me,
    visit_teacher_name = v_name,
    info_message       = case when v_old = v_new then info_message end,
    appt_start         = case when v_new in ('me', 'video') then appt_start end,
    appt_end           = case when v_new in ('me', 'video') then appt_end end,
    appt_location      = case when v_new in ('me', 'video') then appt_location end,
    appt_note          = case when v_new in ('me', 'video') then appt_note end,
    updated_at         = now()
  where id = s.id;
  return jsonb_build_object('ok', true, 'kind', v_new);
end $$;

create or replace function public.teacher_set_student_message(p_token text, p_student_id uuid, p_message text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare v_t uuid := app.auth(p_token, 'teacher'); s app.students;
begin
  s := app.own_student(v_t, p_student_id);
  if app.visit_kind(s.visit_format, s.visit_by_me) not in ('me', 'video') then
    raise exception 'Individuelle Nachrichten gibt es nur bei "Praktikumsbesuch durch mich" oder "Videocall".';
  end if;
  update app.students set info_message = app.clean(p_message, 5000), updated_at = now() where id = s.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.teacher_set_appointment(
  p_token text, p_student_id uuid, p_start timestamptz, p_end timestamptz,
  p_location text, p_note text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare v_t uuid := app.auth(p_token, 'teacher'); s app.students;
begin
  s := app.own_student(v_t, p_student_id);
  if p_start is null then
    update app.students set appt_start = null, appt_end = null, appt_location = null,
           appt_note = null, updated_at = now() where id = s.id;
    return jsonb_build_object('ok', true);
  end if;
  if app.visit_kind(s.visit_format, s.visit_by_me) not in ('me', 'video') then
    raise exception 'Termine können nur für "Praktikumsbesuch durch mich" oder "Videocall" festgelegt werden.';
  end if;
  if p_end is not null and p_end <= p_start then
    raise exception 'Das Ende des Termins muss nach dem Beginn liegen.';
  end if;
  update app.students set appt_start = p_start, appt_end = p_end,
         appt_location = app.clean(p_location, 500), appt_note = app.clean(p_note, 2000),
         updated_at = now()
   where id = s.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.teacher_remove_student(p_token text, p_student_id uuid)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare v_t uuid := app.auth(p_token, 'teacher'); s app.students;
begin
  s := app.own_student(v_t, p_student_id);
  delete from app.reset_requests where student_id = s.id;
  update app.students set class_id = null, visit_format = null, visit_by_me = false,
         visit_teacher_name = null, info_message = null, appt_start = null, appt_end = null,
         appt_location = null, appt_note = null, updated_at = now()
   where id = s.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.teacher_get_appointments(p_token text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare v_t uuid := app.auth(p_token, 'teacher');
begin
  return jsonb_build_object(
    'teacher', (select jsonb_build_object('contact_name', contact_name) from app.teachers where id = v_t),
    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'student_id', s.id, 'first_name', s.first_name, 'last_name', s.last_name,
               'email', s.email, 'class_id', c.id, 'class_name', c.name, 'grade', c.grade,
               'kind', app.visit_kind(s.visit_format, s.visit_by_me),
               'start', s.appt_start, 'end', s.appt_end,
               'location', s.appt_location, 'note', s.appt_note,
               'company_name', s.company_name, 'company_street', s.company_street,
               'company_zip', s.company_zip, 'company_city', s.company_city,
               'supervisor_name', s.supervisor_name, 'supervisor_phone', s.supervisor_phone,
               'mobile_phone', s.mobile_phone)
             order by s.appt_start)
        from app.students s join app.classes c on c.id = s.class_id
       where c.teacher_id = v_t and s.appt_start is not null
         and app.visit_kind(s.visit_format, s.visit_by_me) in ('me', 'video')), '[]'::jsonb),
    'unscheduled', coalesce((
      select jsonb_agg(jsonb_build_object(
               'student_id', s.id, 'first_name', s.first_name, 'last_name', s.last_name,
               'class_id', c.id, 'class_name', c.name,
               'kind', app.visit_kind(s.visit_format, s.visit_by_me))
             order by c.name, lower(s.last_name))
        from app.students s join app.classes c on c.id = s.class_id
       where c.teacher_id = v_t and s.appt_start is null
         and app.visit_kind(s.visit_format, s.visit_by_me) in ('me', 'video')), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
--  Öffentliche API – Lehrkräfte: Passwort-Anfragen von Schülern
-- ---------------------------------------------------------------------

create or replace function public.teacher_issue_reset_code(p_token text, p_student_id uuid)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare
  v_t uuid := app.auth(p_token, 'teacher'); v_class uuid; v_code text; v_exp timestamptz;
begin
  -- entweder Schüler der eigenen Klasse oder offene Anfrage an eine eigene Klasse
  select st.class_id into v_class from app.students st join app.classes c on c.id = st.class_id
   where st.id = p_student_id and c.teacher_id = v_t;
  if v_class is null then
    select r.class_id into v_class from app.reset_requests r join app.classes c on c.id = r.class_id
     where r.student_id = p_student_id and c.teacher_id = v_t;
  end if;
  if v_class is null then
    raise exception 'Diese Schülerin bzw. dieser Schüler wurde nicht gefunden.';
  end if;
  v_code := app.random_code(8);
  v_exp  := now() + interval '2 hours';
  insert into app.reset_requests (student_id, class_id, code_hash, code_issued_at, code_expires_at)
  values (p_student_id, v_class, app.hash_secret(v_code), now(), v_exp)
  on conflict (student_id) do update
    set class_id = excluded.class_id, code_hash = excluded.code_hash,
        code_issued_at = excluded.code_issued_at, code_expires_at = excluded.code_expires_at;
  return jsonb_build_object('code', substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4), 'expires_at', v_exp);
end $$;

create or replace function public.teacher_dismiss_reset(p_token text, p_student_id uuid)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare v_t uuid := app.auth(p_token, 'teacher');
begin
  delete from app.reset_requests r using app.classes c
   where r.student_id = p_student_id and c.id = r.class_id and c.teacher_id = v_t;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
--  Öffentliche API – Schüler: Konto
-- ---------------------------------------------------------------------

create or replace function public.student_register(
  p_site_password text, p_first_name text, p_last_name text, p_email text, p_password text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare v_first text; v_last text; v_email text; v_id uuid;
begin
  if not app.check_access('site_password', p_site_password) then
    raise exception 'Das Seitenpasswort ist nicht korrekt. Bitte gib es erneut ein.' using hint = 'site';
  end if;
  v_first := app.required(p_first_name, 'deinen Vornamen', 80);
  v_last  := app.required(p_last_name, 'deinen Nachnamen', 80);
  v_email := app.norm_email(p_email);
  perform app.check_password(p_password);
  if exists (select 1 from app.students where email = v_email) then
    raise exception 'Mit dieser E-Mail-Adresse ist bereits ein Konto registriert. Melde dich an oder nutze "Passwort vergessen".';
  end if;
  insert into app.students (first_name, last_name, email, password_hash)
  values (v_first, v_last, v_email, app.hash_secret(p_password))
  returning id into v_id;
  return jsonb_build_object('token', app.new_session('student', v_id));
end $$;

create or replace function public.student_login(p_email text, p_password text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare s app.students;
begin
  select * into s from app.students where email = lower(btrim(coalesce(p_email, '')));
  if not found then
    perform app.hash_secret('timing');
    return jsonb_build_object('error', 'E-Mail-Adresse oder Passwort ist falsch.');
  end if;
  if s.locked_until is not null and s.locked_until > now() then
    return jsonb_build_object('error', 'Zu viele Fehlversuche. Bitte versuche es in einigen Minuten erneut.');
  end if;
  if not app.secret_matches(p_password, s.password_hash) then
    perform app.register_failed_login('students', s.id);
    return jsonb_build_object('error', 'E-Mail-Adresse oder Passwort ist falsch.');
  end if;
  update app.students set failed_logins = 0, locked_until = null
   where id = s.id;
  return jsonb_build_object('token', app.new_session('student', s.id));
end $$;

-- "Passwort vergessen": Anfrage an die Lehrkraft der eigenen Klasse
create or replace function public.student_request_reset(p_site_password text, p_email text, p_class_code text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare s app.students; v_class uuid;
begin
  if not app.check_access('site_password', p_site_password) then
    raise exception 'Das Seitenpasswort ist nicht korrekt. Bitte gib es erneut ein.' using hint = 'site';
  end if;
  select * into s from app.students where email = lower(btrim(coalesce(p_email, '')));
  if found then
    v_class := s.class_id;
    if v_class is null and app.norm_code(p_class_code) <> '' then
      select id into v_class from app.classes where join_code = app.norm_code(p_class_code);
    end if;
    if v_class is not null then
      insert into app.reset_requests (student_id, class_id) values (s.id, v_class)
      on conflict (student_id) do update
        set class_id = excluded.class_id, created_at = now(),
            code_hash = null, code_issued_at = null, code_expires_at = null;
    end if;
  end if;
  -- bewusst immer dieselbe Antwort (keine Auskunft, ob ein Konto existiert)
  return jsonb_build_object('ok', true);
end $$;

-- Anmeldung mit Einmal-Code (gültig 2 Stunden, nur einmal verwendbar)
create or replace function public.student_login_with_code(p_email text, p_code text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare s app.students; r app.reset_requests;
begin
  select * into s from app.students where email = lower(btrim(coalesce(p_email, '')));
  if not found then
    perform app.hash_secret('timing');
    return jsonb_build_object('error', 'E-Mail-Adresse oder Code ist falsch.');
  end if;
  if s.locked_until is not null and s.locked_until > now() then
    return jsonb_build_object('error', 'Zu viele Fehlversuche. Bitte versuche es in einigen Minuten erneut.');
  end if;
  select * into r from app.reset_requests where student_id = s.id;
  if not found or r.code_hash is null
     or not app.secret_matches(app.norm_code(p_code), r.code_hash) then
    perform app.register_failed_login('students', s.id);
    return jsonb_build_object('error', 'E-Mail-Adresse oder Code ist falsch.');
  end if;
  if r.code_expires_at < now() then
    return jsonb_build_object('error', 'Dieser Code ist abgelaufen (gültig 2 Stunden). Bitte deine Lehrkraft um einen neuen Code.');
  end if;
  delete from app.reset_requests where student_id = s.id;   -- Code ist damit verbraucht
  update app.students set must_change_password = true, failed_logins = 0, locked_until = null
   where id = s.id;
  return jsonb_build_object('token', app.new_session('student', s.id, true), 'must_change_password', true);
end $$;

-- Neues Passwort nach Anmeldung mit Einmal-Code
create or replace function public.student_set_new_password(p_token text, p_new_password text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare v_s uuid := app.auth(p_token, 'student', true); v_must boolean;
begin
  select must_change_password into v_must from app.students where id = v_s;
  if not coalesce(v_must, false) then
    raise exception 'Bitte nutze "Passwort ändern" in deinem Konto.';
  end if;
  perform app.check_password(p_new_password);
  update app.students set password_hash = app.hash_secret(p_new_password),
         must_change_password = false where id = v_s;
  delete from app.sessions where user_id = v_s;
  return jsonb_build_object('token', app.new_session('student', v_s));
end $$;

create or replace function public.student_change_password(p_token text, p_old_password text, p_new_password text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare v_s uuid := app.auth(p_token, 'student'); s app.students;
begin
  select * into s from app.students where id = v_s;
  if not app.secret_matches(p_old_password, s.password_hash) then
    raise exception 'Das bisherige Passwort ist nicht korrekt.';
  end if;
  perform app.check_password(p_new_password);
  update app.students set password_hash = app.hash_secret(p_new_password) where id = v_s;
  delete from app.sessions where user_id = v_s and token_hash <> app.token_hash(p_token);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
--  Öffentliche API – Schüler: Klasse, Daten, Dashboard
-- ---------------------------------------------------------------------

create or replace function public.student_get_state(p_token text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare
  v_s uuid := app.auth(p_token, 'student', true);
  s app.students; c app.classes; t app.teachers; v_kind text;
begin
  select * into s from app.students where id = v_s;
  if not found then
    raise exception 'Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.' using hint = 'session';
  end if;
  if s.must_change_password then
    return jsonb_build_object('must_change_password', true,
                              'student', jsonb_build_object('first_name', s.first_name));
  end if;
  select * into c from app.classes where id = s.class_id;
  if found then
    select * into t from app.teachers where id = c.teacher_id;
  end if;
  v_kind := app.visit_kind(s.visit_format, s.visit_by_me);
  return jsonb_build_object(
    'must_change_password', false,
    'student', jsonb_build_object(
      'id', s.id, 'first_name', s.first_name, 'last_name', s.last_name, 'email', s.email,
      'company_name', s.company_name, 'company_street', s.company_street,
      'company_zip', s.company_zip, 'company_city', s.company_city,
      'distance_km', s.distance_km, 'job_title', s.job_title,
      'supervisor_name', s.supervisor_name, 'supervisor_email', s.supervisor_email,
      'supervisor_phone', s.supervisor_phone,
      'lodging_away', s.lodging_away, 'lodging_name', s.lodging_name,
      'lodging_relation', s.lodging_relation, 'lodging_contact', s.lodging_contact,
      'class_team', s.class_team, 'mobile_phone', s.mobile_phone),
    'class', case when c.id is null then null else
      jsonb_build_object('name', c.name, 'grade', c.grade) end,
    'teacher', case when t.id is null then null else
      jsonb_build_object('contact_name', t.contact_name, 'contact_email', t.contact_email,
                         'contact_phone', t.contact_phone) end,
    'visit', case when c.id is null then null else jsonb_build_object(
      'kind', v_kind,
      'teacher_name', case
          when v_kind in ('me', 'video') then t.contact_name
          when v_kind = 'other' then s.visit_teacher_name end,
      'teacher_email', case when v_kind in ('me', 'video') then t.contact_email end,
      'message', case
          when v_kind = 'me' then coalesce(s.info_message, c.visit_message)
          when v_kind = 'video' then coalesce(s.info_message, c.video_message) end,
      'appointment', case when v_kind in ('me', 'video') and s.appt_start is not null then
          jsonb_build_object('start', s.appt_start, 'end', s.appt_end,
                             'location', s.appt_location, 'note', s.appt_note) end)
    end);
end $$;

create or replace function public.student_join_class(p_token text, p_code text)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare v_s uuid := app.auth(p_token, 'student'); s app.students; c app.classes;
begin
  select * into s from app.students where id = v_s;
  if s.class_id is not null then
    raise exception 'Du bist bereits einer Klasse zugeordnet.';
  end if;
  if s.locked_until is not null and s.locked_until > now() then
    return jsonb_build_object('error', 'Zu viele Fehlversuche. Bitte versuche es in einigen Minuten erneut.');
  end if;
  select * into c from app.classes where join_code = app.norm_code(p_code);
  if not found then
    perform app.register_failed_login('students', v_s);
    return jsonb_build_object('error', 'Dieser Code ist nicht bekannt. Bitte prüfe die Eingabe.');
  end if;
  update app.students set class_id = c.id, failed_logins = 0, updated_at = now() where id = v_s;
  return jsonb_build_object('ok', true, 'class', jsonb_build_object('name', c.name, 'grade', c.grade));
end $$;

-- Speichert nur die im JSON-Objekt enthaltenen Felder
create or replace function public.student_save_profile(p_token text, p_data jsonb)
returns jsonb language plpgsql security definer
set search_path = app, extensions, public, pg_temp as $$
declare
  v_s uuid := app.auth(p_token, 'student');
  s app.students;
  d jsonb := coalesce(p_data, '{}'::jsonb);
  v_km numeric; v_km_text text; v_lodging boolean; v_lodging_text text;
begin
  select * into s from app.students where id = v_s;
  if s.class_id is null then
    raise exception 'Bitte tritt zuerst deiner Klasse bei.';
  end if;

  if d ? 'distance_km' then
    v_km_text := replace(btrim(coalesce(d->>'distance_km', '')), ',', '.');
    if v_km_text = '' then
      v_km := null;
    elsif v_km_text ~ '^[0-9]{1,5}(\.[0-9]+)?$' then
      v_km := round(v_km_text::numeric, 1);
    else
      raise exception 'Bitte gib die Entfernung als Zahl in Kilometern an (z. B. 12,5).';
    end if;
  else
    v_km := s.distance_km;
  end if;

  if d ? 'lodging_away' then
    v_lodging_text := lower(coalesce(d->>'lodging_away', ''));
    v_lodging := case when v_lodging_text in ('true', 'ja') then true
                      when v_lodging_text in ('false', 'nein') then false end;
  else
    v_lodging := s.lodging_away;
  end if;

  update app.students set
    company_name     = case when d ? 'company_name'     then app.clean(d->>'company_name', 200)     else company_name end,
    company_street   = case when d ? 'company_street'   then app.clean(d->>'company_street', 200)   else company_street end,
    company_zip      = case when d ? 'company_zip'      then app.clean(d->>'company_zip', 10)       else company_zip end,
    company_city     = case when d ? 'company_city'     then app.clean(d->>'company_city', 120)     else company_city end,
    distance_km      = v_km,
    job_title        = case when d ? 'job_title'        then app.clean(d->>'job_title', 150)        else job_title end,
    supervisor_name  = case when d ? 'supervisor_name'  then app.clean(d->>'supervisor_name', 150)  else supervisor_name end,
    supervisor_email = case when d ? 'supervisor_email' then app.optional_email(d->>'supervisor_email') else supervisor_email end,
    supervisor_phone = case when d ? 'supervisor_phone' then app.clean(d->>'supervisor_phone', 60)  else supervisor_phone end,
    lodging_away     = v_lodging,
    lodging_name     = case when v_lodging is not true then null
                            when d ? 'lodging_name'     then app.clean(d->>'lodging_name', 150)     else lodging_name end,
    lodging_relation = case when v_lodging is not true then null
                            when d ? 'lodging_relation' then app.clean(d->>'lodging_relation', 150) else lodging_relation end,
    lodging_contact  = case when v_lodging is not true then null
                            when d ? 'lodging_contact'  then app.clean(d->>'lodging_contact', 300)  else lodging_contact end,
    class_team       = case when d ? 'class_team'       then app.clean(d->>'class_team', 1000)      else class_team end,
    mobile_phone     = case when d ? 'mobile_phone'     then app.clean(d->>'mobile_phone', 40)      else mobile_phone end,
    updated_at       = now()
  where id = v_s;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
--  Rechte: interne Funktionen sperren, API-Funktionen freigeben
-- ---------------------------------------------------------------------

revoke all on all functions in schema app from public;
revoke all on all tables in schema app from public;

do $$
declare
  f record;
  api text[] := array[
    'check_site_password', 'logout',
    'teacher_register', 'teacher_login', 'teacher_change_password', 'teacher_update_profile',
    'teacher_get_state', 'teacher_create_class', 'teacher_delete_class', 'teacher_get_class',
    'teacher_set_class_message', 'teacher_get_student', 'teacher_set_visit',
    'teacher_set_student_message', 'teacher_set_appointment', 'teacher_remove_student',
    'teacher_get_appointments', 'teacher_issue_reset_code', 'teacher_dismiss_reset',
    'student_register', 'student_login', 'student_request_reset', 'student_login_with_code',
    'student_set_new_password', 'student_change_password', 'student_get_state',
    'student_join_class', 'student_save_profile'];
  r text;
begin
  -- Zugriff auf das Schema public ausdrücklich erlauben (unabhängig von Supabase-Standardeinstellungen)
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant usage on schema public to %I', r);
    end if;
  end loop;
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any(api)
  loop
    execute format('revoke all on function %s from public', f.sig);
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('grant execute on function %s to %I', f.sig, r);
      end if;
    end loop;
  end loop;
end $$;

-- Schnittstelle (PostgREST) über neue Funktionen informieren
notify pgrst, 'reload schema';
