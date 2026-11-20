-- ============================================================================
-- PPGA #141: two owner-approved gamification features.
--
-- A. Lesson read reward. A learner who finishes reading a lesson may claim a
--    fixed +20 XP ONCE per lesson. The claim is a ledger row
--    (learner_id, 'lesson_read', lesson_key, 20) — the existing primary key
--    (learner_id, event_type, event_ref) is the idempotency authority, so a
--    double-click or a replay reaches `on conflict do nothing`, never a second
--    +20. The RPC re-checks the SAME visibility rule the lesson read uses
--    (published lesson + published parent module + the #8 gate + the module
--    unlocked), so a learner who cannot see the lesson is denied server-side.
--    Nothing is auto-awarded: the learner presses the claim button on the
--    summary step. Research instruments still award nothing (ADR-0001).
--
-- B. Teacher attendance & behaviour. A session is one dated class for one
--    chapter. A record is one learner's present / early-bird / behaviour
--    points state, edited by a teacher or admin. Saving a session also writes
--    APPEND-ONLY ledger awards, once per learner per session per event:
--      attendance_present  +10  (present)
--      attendance_early     +5  (present AND early-bird)
--      behavior_award   +points (behaviour 5 or 10; nothing at 0)
--    A later edit updates the attendance RECORD but never duplicates or
--    revokes an already-granted ledger row: the ledger is the award history,
--    the record is the current state. Every save writes exactly one audit
--    event.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend the ledger's event-type check with the four new awardable events.
--    Existing rows and types are untouched; no badge event is added.
-- ----------------------------------------------------------------------------
alter table public.ppg_xp_ledger
  drop constraint ppg_xp_event_type_check;

alter table public.ppg_xp_ledger
  add constraint ppg_xp_event_type_check check (
    event_type in (
      'self_check_pass',
      'knowledge_mission_pass',
      'practical_approval',
      'final_project',
      'chapter_posttest_pass',
      'final_test_pass',
      'lesson_read',
      'attendance_present',
      'attendance_early',
      'behavior_award'
    )
  );

comment on column public.ppg_xp_ledger.event_type is
  'PPGA #10/#76/#141: the awardable events — self_check_pass (+50, legacy content), knowledge_mission_pass (+100), practical_approval (+150, legacy), final_project (+300, legacy), chapter_posttest_pass (+200), final_test_pass (+400), lesson_read (+20 once per lesson), attendance_present (+10 per attended session), attendance_early (+5 when present and early), behavior_award (+5/+10 per session). Research instruments award nothing.';

-- ----------------------------------------------------------------------------
-- 2. Attendance sessions: one dated class for one module/chapter.
-- ----------------------------------------------------------------------------
create table public.ppg_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  module_key text not null references public.ppg_modules (module_key) on delete cascade,
  session_date date not null,
  label_th text,
  label_en text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ppg_attendance_sessions_unique_day unique (module_key, session_date)
);

comment on table public.ppg_attendance_sessions is
  'PPGA #141: one dated attendance session per module/chapter. Created and read only through the staff RPCs; a client never writes here.';

-- ----------------------------------------------------------------------------
-- 3. Attendance records: one learner state per session.
-- ----------------------------------------------------------------------------
create table public.ppg_attendance_records (
  session_id uuid not null references public.ppg_attendance_sessions (id) on delete cascade,
  learner_id uuid not null references auth.users (id) on delete cascade,
  present boolean not null default false,
  early_bird boolean not null default false,
  behavior_points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, learner_id),
  constraint ppg_attendance_behavior_check check (behavior_points in (0, 5, 10)),
  constraint ppg_attendance_early_requires_present check (not early_bird or present)
);

comment on table public.ppg_attendance_records is
  'PPGA #141: a learner''s current present/early/behaviour state in one session. This row is EDITABLE current state; the XP awards live append-only in ppg_xp_ledger and are never revoked by an edit.';

-- ----------------------------------------------------------------------------
-- 4. RLS: staff read every session/record (through the staff RPCs as well as
--    direct reads), a learner reads only their own records and the sessions
--    those records belong to. No INSERT/UPDATE/DELETE policy exists, so a
--    client JWT can never write; the security-definer RPCs are the only
--    write path.
-- ----------------------------------------------------------------------------
alter table public.ppg_attendance_sessions enable row level security;
alter table public.ppg_attendance_records enable row level security;

create policy ppg_attendance_sessions_select on public.ppg_attendance_sessions
  for select
  using (
    auth.role() in ('teacher', 'admin')
    or (
      auth.role() = 'learner'
      and exists (
        select 1
          from public.ppg_attendance_records r
         where r.session_id = ppg_attendance_sessions.id
           and r.learner_id = auth.uid()
      )
    )
  );

create policy ppg_attendance_records_select on public.ppg_attendance_records
  for select
  using (
    auth.role() in ('teacher', 'admin')
    or (auth.role() = 'learner' and learner_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 5. Lesson read claim: +20 once per lesson, visibility enforced.
-- ----------------------------------------------------------------------------
create or replace function public.ppg_mark_lesson_read(p_lesson_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_rows integer;
  v_total integer;
begin
  if auth.role() <> 'learner' then
    raise exception 'permission_denied: ppg_mark_lesson_read is learner-only';
  end if;

  if v_uid is null then
    raise exception 'permission_denied: a learner session is required';
  end if;

  if p_lesson_key is null or p_lesson_key !~ '^(module|chapter)-[0-9]{2}-lesson-[0-9]{2}$' then
    raise exception 'lesson_denied: p_lesson_key must look like module-NN-lesson-NN or chapter-NN-lesson-NN';
  end if;

  if not public.ppg_learner_gated(v_uid) then
    raise exception 'gate_closed: the #8 gate must pass before a lesson read is claimed';
  end if;

  if not exists (
    select 1
      from public.ppg_lessons l
     where l.lesson_key = p_lesson_key
       and l.publication_state = 'published'
       and public.ppg_module_published(l.module_key)
       and public.ppg_module_unlocked(v_uid, l.module_key)
  ) then
    raise exception 'lesson_not_visible: the Lesson is locked/draft/archived server-side — no read credit is claimable';
  end if;

  insert into public.ppg_xp_ledger (learner_id, event_type, event_ref, amount)
  values (v_uid, 'lesson_read', p_lesson_key, 20)
  on conflict (learner_id, event_type, event_ref) do nothing;

  get diagnostics v_rows = row_count;

  select coalesce(sum(x.amount)::int, 0::int)
    into v_total
    from public.ppg_xp_ledger x
   where x.learner_id = v_uid;

  if v_rows > 0 then
    return jsonb_build_object(
      'ok', true,
      'awarded', true,
      'already', false,
      'amount', 20,
      'total', v_total
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'awarded', false,
    'already', true,
    'amount', 0,
    'total', v_total
  );
end;
$$;

revoke execute on function public.ppg_mark_lesson_read(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_mark_lesson_read(text)
  to service_role, authenticated;

comment on function public.ppg_mark_lesson_read(text) is
  'PPGA #141: the +20 once-per-lesson read reward. Learner-only, gate + published lesson/module + module unlocked (the same visibility the lesson read uses). The ledger PK is the idempotency: a replay returns already=true and never a second +20.';

-- ----------------------------------------------------------------------------
-- 6. Create an attendance session (idempotent on module_key + session_date).
-- ----------------------------------------------------------------------------
create or replace function public.ppg_create_attendance_session(
  p_session_date date,
  p_module_key text,
  p_label_th text,
  p_label_en text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
begin
  if auth.role() not in ('teacher', 'admin') then
    raise exception 'permission_denied: ppg_create_attendance_session is teacher/admin-only';
  end if;

  if not exists (
    select 1 from public.ppg_profiles p
     where p.id = auth.uid()
       and p.role in ('teacher', 'admin')
  ) then
    raise exception 'permission_denied: the caller profile is not staff';
  end if;

  if p_session_date is null then
    raise exception 'session_date_required: a session needs a date';
  end if;

  if p_module_key is null or btrim(p_module_key) = '' then
    raise exception 'module_required: a session needs a module';
  end if;

  if not exists (
    select 1 from public.ppg_modules m where m.module_key = p_module_key
  ) then
    raise exception 'module_missing: no module row for %', p_module_key;
  end if;

  insert into public.ppg_attendance_sessions (
    module_key, session_date, label_th, label_en, created_by
  )
  values (
    p_module_key,
    p_session_date,
    nullif(btrim(coalesce(p_label_th, '')), ''),
    nullif(btrim(coalesce(p_label_en, '')), ''),
    auth.uid()
  )
  on conflict (module_key, session_date) do update
    set label_th = coalesce(excluded.label_th, public.ppg_attendance_sessions.label_th),
        label_en = coalesce(excluded.label_en, public.ppg_attendance_sessions.label_en)
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_id,
    'module_key', p_module_key,
    'session_date', p_session_date
  );
end;
$$;

revoke execute on function public.ppg_create_attendance_session(date, text, text, text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_create_attendance_session(date, text, text, text)
  to service_role, authenticated;

comment on function public.ppg_create_attendance_session(date, text, text, text) is
  'PPGA #141: create (or re-open, idempotently) the one session for a module on a date. Teacher/admin only, checked against both the JWT role and the caller profile row.';

-- ----------------------------------------------------------------------------
-- 7. Save attendance rows, write append-only XP awards, one audit event.
-- ----------------------------------------------------------------------------
create or replace function public.ppg_save_attendance(
  p_session_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_session public.ppg_attendance_sessions%rowtype;
  v_row jsonb;
  v_learner uuid;
  v_present boolean;
  v_early boolean;
  v_points integer;
  v_saved integer := 0;
  v_present_count integer := 0;
  v_early_count integer := 0;
  v_behavior_total integer := 0;
  v_awarded_present integer := 0;
  v_awarded_early integer := 0;
  v_awarded_behavior integer := 0;
  v_rows integer;
  v_xp_total integer;
begin
  if auth.role() not in ('teacher', 'admin') then
    raise exception 'permission_denied: ppg_save_attendance is teacher/admin-only';
  end if;

  if not exists (
    select 1 from public.ppg_profiles p
     where p.id = auth.uid()
       and p.role in ('teacher', 'admin')
  ) then
    raise exception 'permission_denied: the caller profile is not staff';
  end if;

  if p_session_id is null then
    raise exception 'session_required: a save needs a session id';
  end if;

  select * into v_session
    from public.ppg_attendance_sessions s
   where s.id = p_session_id;
  if not found then
    raise exception 'session_missing: no attendance session for %', p_session_id;
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows_required: p_rows must be a JSON array';
  end if;

  if jsonb_array_length(p_rows) > 500 then
    raise exception 'rows_denied: at most 500 rows per save';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) <> 'object' then
      raise exception 'row_denied: every row must be a JSON object';
    end if;

    if coalesce(v_row ->> 'learner_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'learner_required: every row needs a learner uuid';
    end if;
    v_learner := (v_row ->> 'learner_id')::uuid;

    if not exists (
      select 1 from public.ppg_profiles p
       where p.id = v_learner
         and p.role = 'learner'
    ) then
      raise exception 'forbidden_target: % is not a learner', v_learner;
    end if;

    v_present := coalesce((v_row ->> 'present')::boolean, false);
    v_early := v_present and coalesce((v_row ->> 'early_bird')::boolean, false);
    v_points := coalesce((v_row ->> 'behavior_points')::integer, 0);

    if v_points not in (0, 5, 10) then
      raise exception 'behavior_denied: behavior_points must be 0, 5 or 10';
    end if;

    insert into public.ppg_attendance_records (
      session_id, learner_id, present, early_bird, behavior_points, updated_at
    )
    values (
      p_session_id, v_learner, v_present, v_early, v_points, now()
    )
    on conflict (session_id, learner_id) do update
      set present = excluded.present,
          early_bird = excluded.early_bird,
          behavior_points = excluded.behavior_points,
          updated_at = now();

    v_saved := v_saved + 1;
    if v_present then v_present_count := v_present_count + 1; end if;
    if v_early then v_early_count := v_early_count + 1; end if;
    v_behavior_total := v_behavior_total + v_points;

    if v_present then
      insert into public.ppg_xp_ledger (learner_id, event_type, event_ref, amount)
      values (v_learner, 'attendance_present', p_session_id::text, 10)
      on conflict (learner_id, event_type, event_ref) do nothing;
      get diagnostics v_rows = row_count;
      v_awarded_present := v_awarded_present + v_rows;
    end if;

    if v_present and v_early then
      insert into public.ppg_xp_ledger (learner_id, event_type, event_ref, amount)
      values (v_learner, 'attendance_early', p_session_id::text, 5)
      on conflict (learner_id, event_type, event_ref) do nothing;
      get diagnostics v_rows = row_count;
      v_awarded_early := v_awarded_early + v_rows;
    end if;

    if v_points > 0 then
      insert into public.ppg_xp_ledger (learner_id, event_type, event_ref, amount)
      values (v_learner, 'behavior_award', p_session_id::text, v_points)
      on conflict (learner_id, event_type, event_ref) do nothing;
      get diagnostics v_rows = row_count;
      v_awarded_behavior := v_awarded_behavior + v_rows;
    end if;
  end loop;

  select coalesce(sum(x.amount)::int, 0::int)
    into v_xp_total
    from public.ppg_xp_ledger x
   where x.event_ref = p_session_id::text
     and x.event_type in ('attendance_present', 'attendance_early', 'behavior_award');

  insert into public.ppg_audit_events (actor_id, action, target_type, target_id, details)
  values (
    auth.uid(),
    'attendance_save',
    'session',
    p_session_id::text,
    jsonb_build_object(
      'module_key', v_session.module_key,
      'session_date', v_session.session_date,
      'rows', v_saved,
      'present', v_present_count,
      'early', v_early_count,
      'behavior_points', v_behavior_total
    )
  );

  return jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'saved', v_saved,
    'present', v_present_count,
    'early', v_early_count,
    'behavior_points', v_behavior_total,
    'xp_total', v_xp_total,
    'awarded', jsonb_build_object(
      'present', v_awarded_present,
      'early', v_awarded_early,
      'behavior', v_awarded_behavior
    )
  );
end;
$$;

revoke execute on function public.ppg_save_attendance(uuid, jsonb)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_save_attendance(uuid, jsonb)
  to service_role, authenticated;

comment on function public.ppg_save_attendance(uuid, jsonb) is
  'PPGA #141: teacher/admin save of one session roster. Upserts the editable records, then writes append-only ledger awards (present +10, present+early +5, behaviour +5/+10) with ON CONFLICT DO NOTHING. An edit never duplicates or revokes an already-awarded row. Exactly one audit event per save.';

-- ----------------------------------------------------------------------------
-- 8. Staff overview read: sessions + counts + nested records + XP totals.
-- ----------------------------------------------------------------------------
create or replace function public.ppg_attendance_overview()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_sessions jsonb;
begin
  if auth.role() not in ('teacher', 'admin') then
    raise exception 'permission_denied: ppg_attendance_overview is teacher/admin-only';
  end if;

  if not exists (
    select 1 from public.ppg_profiles p
     where p.id = auth.uid()
       and p.role in ('teacher', 'admin')
  ) then
    raise exception 'permission_denied: the caller profile is not staff';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'module_key', s.module_key,
        'session_date', s.session_date,
        'label_th', s.label_th,
        'label_en', s.label_en,
        'present_count', (
          select count(*) from public.ppg_attendance_records r
           where r.session_id = s.id and r.present
        ),
        'early_count', (
          select count(*) from public.ppg_attendance_records r
           where r.session_id = s.id and r.early_bird
        ),
        'behavior_total', (
          select coalesce(sum(r.behavior_points)::int, 0)
            from public.ppg_attendance_records r
           where r.session_id = s.id
        ),
        'xp_total', (
          select coalesce(sum(x.amount)::int, 0)
            from public.ppg_xp_ledger x
           where x.event_ref = s.id::text
             and x.event_type in ('attendance_present', 'attendance_early', 'behavior_award')
        ),
        'records', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'learner_id', r.learner_id,
                'present', r.present,
                'early_bird', r.early_bird,
                'behavior_points', r.behavior_points
              )
              order by r.learner_id
            ),
            '[]'::jsonb
          )
            from public.ppg_attendance_records r
           where r.session_id = s.id
        )
      )
      order by s.session_date desc, s.created_at desc
    ),
    '[]'::jsonb
  )
  into v_sessions
  from (
    select * from public.ppg_attendance_sessions
     order by session_date desc, created_at desc
     limit 100
  ) s;

  return jsonb_build_object('sessions', v_sessions);
end;
$$;

revoke execute on function public.ppg_attendance_overview()
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_attendance_overview()
  to service_role, authenticated;

comment on function public.ppg_attendance_overview() is
  'PPGA #141: teacher/admin overview — the latest 100 sessions with present/early counts, behaviour and ledger XP totals, and each session''s saved records. The RPC gate is staff only; learners read their own rows through the table policies instead.';
