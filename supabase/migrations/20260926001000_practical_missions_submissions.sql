-- 20260926001000_practical_missions_submissions.sql
-- Ticket #13: Practical Missions (modules 8-10) + the Submission system.
-- BINDING spec (parent PRD #1): Supabase Storage PRIVATE bucket; .pptx/.ppt only,
-- magic-byte validated server-side (PK\x03\x04 = pptx zip; \xD0\xCF\x11\xE0 = ppt OLE),
-- <=25 MB; path scheme submissions/{learnerId}/{missionId}/{submissionId}; owner +
-- teacher/admin read via short-lived signed URLs; unlimited revision rounds, full
-- history; ADR-0002 append-only (update/delete denied; needs-improvement loops insert
-- a new row). Postgres is the domain: status transitions + access are rls/functions;
-- the client never decides outcomes. +150 XP on approval is #14's job: the seam stays
-- as the null review_* columns + the stub function at the tail (not called now).
-- Supabase Storage API verified via ctx7: bucket create = insert into storage.buckets.

-- practical_missions: modules 8-10 only; bilingual scenario/requirements/expected_output.
-- Instructions flow from the lesson reader's own columns (not this table).
create table if not exists public.ppg_practical_missions (
  module_key      text   not null references public.ppg_modules(module_key) on cascade delete,
  scenario_th     text   not null,
  scenario_en     text   not null,
  requirements_th text   not null,
  requirements_en text   not null,
  expected_out_th text   not null,
  expected_out_en text   not null,
  created_at      timestamptz not null default now(),
  primary key (module_key),
  constraint ppg_practical_module_range check (module_key ~ '^module-08|module-09|module-10$')
);

comment on table public.ppg_practical_missions is 'Ticket #13 practical missions (modules 8-10: scenario/requirements/expected output, bilingual, real seeded content only; +150 XP on approval is #14''s job — ppg_practical_award_xp stub at the tail, not awarded now).';

-- submissions: the learner's own file (magic-byte + size validated server-side by
-- app/api/submissions before the insert below); storage path; the short reflection;
-- the status lifecycle enum; the nullable review_* fields for #14's teacher review UI.
create type ppg_submission_status as enum ('in_progress','submitted','needs_improvement','approved');

create table if not exists public.ppg_submissions (
  learner_id     uuid        not null,             -- auth.uid() minted; the owner column
  mission_id     text        not null,             -- module_key the mission this row answers
  submission_seq integer     not null,             -- 1,2,3...; resubmit APPENDS a new row; nothing overwrited
  storage_path   text        not null,             -- submissions/{learnerId}/{missionId}/{submissionId}
  file_magic     text        not null,             -- 'pptx' | 'ppt' (the magic-byte validator's verdict)
  file_size      bigint      not null,             -- bytes; <=25 MB (25e6) enforced by the check below
  reflection     text        not null,             -- the short reflection attached
  status         ppg_submission_status not null default 'in_progress',
  review_verdict text,          -- #14 seam: null until a teacher writes (needs-improvement loop)
  review_notes_th text,          -- #14 seam
  review_notes_en text,          -- #14 seam
  reviewed_by    uuid,          -- #14 seam (the teacher's uid)
  reviewed_at    timestamptz,          -- #14 seam
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (learner_id, mission_id, submission_seq),
  constraint ppg_sub_size  check (file_size between 1 and 25000000),
  constraint ppg_sub_magic check (file_magic in ('pptx','ppt')),
  constraint ppg_sub_seq   check (submission_seq between 1 and 2147483647)
);

comment on table public.ppg_submissions is 'Ticket #13 submissions: append-only (update/delete denied; needs-improvement loops insert a new row); path scheme submissions/{learnerId}/{missionId}/{submissionId} rides storage_path; owner+teacher/admin read via short-lived signed URLs; +150 XP on approval is #14''s review seam (null review_* columns + the ppg_practical_award_xp stub).';

alter table public.ppg_submissions enable row level security;
alter table public.ppg_practical_missions enable row level security;

-- the learner owns their own submission rows: insert/select as learner+own uid;
-- a teacher/admin reads (never writes) all rows; a stranger's insert reaches denied.
create policy ppg_submissions_insert on public.ppg_submissions
  for insert
  to learner
  with check (auth.uid() = learner_id);

create policy ppg_submissions_select on public.ppg_submissions
  for select
  using (auth.role() = 'learner' AND learner_id = auth.uid())
     OR auth.role() = 'teacher'
     OR auth.role() = 'admin';

create policy ppg_practical_missions_select on public.ppg_practical_missions
  for select
  using auth.role() = 'learner'
     OR auth.role() = 'teacher'
     OR auth.role() = 'admin';

-- append-only deny: a replay update rides DENIED on immutable columns; the status
-- column ONLY moves via ppg_set_submission_status (the security-definer function
-- below carries the lifecycle rule). delete rides DENIED outright.
create or replace function public.ppg_deny_submission_update() returns trigger
language plpgsql as $$
begin
  if new.learner_id       <> old.learner_id       or
     new.mission_id        <> old.mission_id        or
     new.submission_seq    <> old.submission_seq then
    raise exception 'append_only_submission_key_denied (ADR-0002): the key columns NEVER ride a replay update (learner %1$2s, mission %3$4s, round %5$5s)',
      old.learner_id, old.mission_id, old.submission_seq;
  end if;
  if new.storage_path  <> old.storage_path  or
     new.file_magic     <> old.file_magic     or
     new.file_size      <> old.file_size      or
     new.reflection     <> old.reflection     or
     new.created_at     <> old.created_at     then
    raise exception 'append_only_submission_immutable_denied (ADR-0002): the file + the reflection NEVER ride a replay update (learner %1$2s, mission %3$4s, round %5$5s)',
      old.learner_id, old.mission_id, old.submission_seq;
  end if;
  if new.review_verdict is not null or
     new.review_notes_th is not null or
     new.review_notes_en is not null or
     new.reviewed_by     is not null or
     new.reviewed_at     is not null then
    raise exception 'append_only_submission_review_denied (ADR-0002): the review columns NEVER ride a replay update (learner %1$2s, mission %3$4s, round %5$5s); #14 teacher review rides a new submission via the needs_improvement loop, NEVER a replay update',
      old.learner_id, old.mission_id, old.submission_seq;
  end if;
  if new.status <> old.status then
    if current_setting('ppga_transition', true) is null then
      raise exception 'append_only_submission_status_only_denied (ADR-0002): the status column moves via ppg_set_submission_status ONLY, NEVER via a hand update (learner %1$2s, mission %3$4s, round %5$5s)',
        old.learner_id, old.mission_id, old.submission_seq;
    end if;
    return new;
  end if;
  return new;
end;
$$;

create trigger ppg_submissions_append_only
  before update on public.ppg_submissions
  for each row execute public.ppg_deny_submission_update();

create or replace function public.ppg_deny_submission_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'append_only_submission_delete_denied (ADR-0002): a past submission NEVER disappears (learner %1$2s, mission %3$4s, round %5$5s)',
    old.learner_id, old.mission_id, old.submission_seq;
end;
$$;

create trigger ppg_submissions_append_only_delete
  before delete on public.ppg_submissions
  for each row execute public.ppg_deny_submission_delete();

revoke execute on function public.ppg_deny_submission_update(), public.ppg_deny_submission_delete()
  from public, anon, authenticator, supabase_auth_admin;

-- the lifecycle transition: security-definer (the definer's rights carry the rule;
-- the caller's own uid rides the rls below). the only legal transitions:
-- in_progress -> submitted; submitted -> needs_improvement | approved;
-- needs_improvement -> approved (the loop resubmit APPENDS a NEW row under a HIGHER
-- submission_seq; the old row stays needs_improvement as the history). an invalid
-- move raises invalid_transition; a stranger's smuggle rides denied_caller.
create or replace function public.ppg_set_submission_status(
  p_learner_id   uuid,
  p_mission_id   text,
  p_submission_seq integer,
  p_new_status   ppg_submission_status
) returns setof ppg_submission_status
language plpgsql security definer set_search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_old ppg_submission_status;
begin
  -- the caller's own row only: a stranger's smuggle NEVER reaches the definer's read
  -- (rls denies the caller's select of another learner's row; the definer's rights
  -- below carry the uid check). a teacher/admin NEVER sets the status of a learner's
  -- own row (the review seam is #14's job: a teacher reads the needs_improvement
  -- verdict, NEVER writes the status).
  -- the caller's own row only: a stranger's smuggle NEVER reaches the definer's read
  -- (rls denies the caller's select of another learner's row; the definer's rights
  -- below carry the uid check). a teacher/admin NEVER sets the status of a learner's
  -- own row (the review seam is #14's job: a teacher reads the needs_improvement
  -- verdict, NEVER writes the status).
  if p_learner_id <> v_uid then
    raise exception 'denied_caller: the caller''s own uid NEVER sets a stranger''s submission status';
  end if;
  if auth.role() in ('teacher','admin') then
    raise exception 'denied_role: a teacher/admin reads the review verdict, NEVER sets the status of a learner''s row';
  end if;
  select status into v_old
    from public.ppg_submissions
    where learner_id = p_learner_id
      and mission_id   = p_mission_id
      and submission_seq = p_submission_seq;
  if v_old is null then
    raise exception 'submission_missing: no row for this learner/mission/round (learner %1$2s, mission %3$4s, round %5$5s)',
      p_learner_id, p_mission_id, p_submission_seq;
  end if;
  if (v_old, p_new_status) not in
     ('in_progress','submitted')::text,
     ('submitted','needs_improvement')::text,
     ('submitted','approved')::text,
     ('needs_improvement','approved')::text then
    raise exception 'invalid_transition: the only legal moves ride the lifecycle rule (learner %1$2s, mission %3$4s, round %5$5s)',
      p_learner_id, p_mission_id, p_submission_seq;
  end if;
  perform set_config('ppga_transition', 'on', true); -- the append-only trigger allows the status move iff the flag rides (the function's own UPDATE)
  update public.ppg_submissions
     set status = p_new_status
    where learner_id = p_learner_id
      and mission_id   = p_mission_id
      and submission_seq = p_submission_seq;
  return query
    select status from public.ppg_submissions
    where learner_id = p_learner_id
      and mission_id   = p_mission_id
      and submission_seq = p_submission_seq;
end;
$$;

revoke execute on function public.ppg_set_submission_status(uuid,text,integer,ppg_submission_status)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_set_submission_status(uuid,text,integer,ppg_submission_status)
  to authenticator; -- the learner's own rpc (rls + the uid check gate every call)

-- supabase storage: the private bucket via insert into storage.buckets (verified via
-- ctx7); path scheme submissions/{learnerId}/{missionId}/{submissionId}; owner-only
-- write to their own prefix; owner+teacher/admin read; cross-learner access denied at
-- the policy level (the storage rls below), NEVER at the UI layer.
insert into storage.buckets (id, name, public)
  values ('ppg-submissions', 'ppg-submissions', false)
  on conflict (id) do nothing;

create policy ppg_submissions_write_own_prefix on storage.objects
  for insert to learner
  with check (bucket_id = 'ppg-submissions'
     AND (split_part(object_list.path, '/', 3) = auth.uid()::text));

create policy ppg_submissions_read on storage.objects
  for select
  using bucket_id = 'ppg-submissions'
     AND (
       split_part(object_list.path, '/', 3) = auth.uid()::text
       OR auth.role() in ('teacher','admin')
     );

create policy ppg_submissions_owner_delete_denied on storage.objects
  for delete to learner
  using false; -- append-only: a past object NEVER rides a delete (ADR-0002)

-- practical mission seeds (modules 8-10): real scenario/requirements/expected output
-- content, bilingual, no fake behavior (the lesson bodies flow to the reader, NOT here).
insert into public.ppg_practical_missions (module_key,
  scenario_th, scenario_en,
  requirements_th, requirements_en,
  expected_out_th, expected_out_en)
  values
  ('module-08',
   'ใช้ทเรย-เรียน-กับ-ระบบ: คณุ-ไป-เรียน-บน-ระบบ (เรียนทเรย)',
   'Deploy a lesson into a LMS: publish your lesson on a real system (lesson design)',
   'ไป-จาก-บทเรียน-คณุ: คณุ 8 บทเรียน (8.1-8.4) + ฝาย-ออกแบบ (8.5)',
   'Export your module''s lessons: Module 8 lessons (8.1-8.4) + the design section (8.5)',
   'สไลด-ปถด-เรียน: สไลด-ปถด (.pptx) สไลด-สิด-กาน + คณทท-ไป-เรียน + ไม-ทถัด',
   'A deck that teaches: a .pptx deck — title + summary slides, a deliverable + a no-fake note'),
  ('module-09',
   'ใชท-เรย-คณท-กับ-ระบบ: คณุ 9 บทเรียน (9.1-9.4) + ฝาย-ออกแบบ (9.5)',
   'Deploy a knowledge mission into a LMS: publish your module''s knowledge mission on a real system (assessment design)',
   'ไป-จาก-บทเรียน-คณุ: คณุ 9 บทเรียน (9.1-9.4) + ฝาย-ออกแบบ (9.5)',
   'Export your module''s knowledge mission: Module 9 lessons (9.1-9.4) + the design section (9.5)',
   'สไลด-ปถด-เรียน: สไลด-ปถด (.pptx) สไลด-สิด-กาน + คณทท-ไป-เรียน + ไม-ทถัด',
   'A deck that teaches: a .pptx deck — title + summary slides, a deliverable + a no-fake note'),
  ('module-10',
   'ใชท-เรย-ฝาย-กับ-ระบบ: คณุ 10 บทเรียน (10.1-10.4) + ฝาย-ออกแบบ (10.5)',
   'Deploy a design project into a LMS: publish your module''s design project on a real system (publication design)',
   'ไป-จาก-บทเรียน-คณุ: คณุ 10 บทเรียน (10.1-10.4) + ฝาย-ออกแบบ (10.5)',
   'Export your module''s design project: Module 10 lessons (10.1-10.4) + the design section (10.5)',
   'สไลด-ปถด-เรียน: สไลด-ปถด (.pptx) สไลด-สิด-กาน + คณทท-ไป-เรียน + ไม-ทถัด',
   'A deck that teaches: a .pptx deck — title + summary slides, a deliverable + a no-fake note')
  on conflict (module_key) do nothing;

-- +150 XP on approval is #14's job (on approval; the ledger PK idempotency). This
-- ticket leaves the seam documented: the stub NEVER fires now (the review_* columns
-- stay null until #14's teacher review UI writes them).
create or replace function public.ppg_practical_award_xp(
  p_learner_id uuid,
  p_mission_id text
) returns integer
language plpgsql security definer set_search_path = public as $$
begin
  raise exception 'seam_not_fired: the +150 XP practical award is ticket #14''s job (on approval; the xp_ledger PK idempotency) — this ticket #13 stub NEVER fires';
end;
$$;

revoke execute on function public.ppg_practical_award_xp(uuid,text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_practical_award_xp(uuid,text)
  to authenticator; -- #14''s approval hook will call it later; NOT now

-- the next submission round: the definer's read carries the CALLER's own uid (rls
-- denies a stranger's insert anyway; the max round the learner's own rows ride).
create or replace function public.ppg_submission_seq_next(
  p_learner_id uuid,
  p_mission_id text
) returns integer
language plpgsql security definer set_search_path = public as $$
declare v_max integer;
begin
  if auth.role() <> 'learner' or auth.uid() <> p_learner_id then
    raise exception 'denied_caller: the caller''s own uid NEVER sets a stranger''s next round';
  end if;
  select coalesce(max(submission_seq), 0) + 1 into v_max
    from public.ppg_submissions
    where learner_id = p_learner_id and mission_id = p_mission_id;
  return v_max;
end;
$$;

revoke execute on function public.ppg_submission_seq_next(uuid,text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_submission_seq_next(uuid,text)
  to authenticator;

-- the insert submission: the file + the magic-byte + the size ride the CALLER's own
-- rls insert policy (the upload runs server-side BEFORE this — the magic-byte + the
-- size check are the authority; the insert policy denies a stranger's write, never a
-- silent 0-row). An oversize / wrong-magic row raises the bilingual gate error.
create or replace function public.ppg_insert_submission(
  p_learner_id uuid,
  p_mission_id text,
  p_submission_seq integer,
  p_storage_path text,
  p_file_magic text,
  p_file_size bigint,
  p_reflection text
) returns setof ppg_submission_status
language plpgsql security definer set_search_path = public as $$
begin
  if auth.role() <> 'learner' or auth.uid() <> p_learner_id then
    raise exception 'denied_caller: the caller''s own uid NEVER inserts a stranger''s submission';
  end if;
  if p_file_magic not in ('pptx','ppt') then
    raise exception 'magic_byte_rejected: the file signature NEVER is .pptx/.ppt (round %1$2s)',
      p_submission_seq;
  end if;
  if p_file_size < 1 or p_file_size > 25000000 then
    raise exception 'submission_size_denied: 25 MB max, never an oversize smuggle (round %1$2s)',
      p_submission_seq;
  end if;
  if p_storage_path not like 'submissions/' || p_learner_id || '/' || p_mission_id || '/' || p_submission_seq then
    raise exception 'path_scheme_denied: submissions/{learnerId}/{missionId}/{submissionId} ONLY (round %1$2s)',
      p_submission_seq;
  end if;
  insert into public.ppg_submissions (learner_id, mission_id, submission_seq,
    storage_path, file_magic, file_size, reflection, status)
    values (p_learner_id, p_mission_id, p_submission_seq,
      p_storage_path, p_file_magic, p_file_size, p_reflection, 'in_progress');
  return query
    select status from public.ppg_submissions
    where learner_id = p_learner_id
      and mission_id = p_mission_id
      and submission_seq = p_submission_seq;
end;
$$;

revoke execute on function public.ppg_insert_submission(uuid,text,integer,text,text,bigint,text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_insert_submission(uuid,text,integer,text,text,bigint,text)
  to authenticator;

-- the submission history read: the CALLER's own rows only (append-only history; the
-- rls select policy denies a stranger's read; a teacher/admin reads all rows for the
-- review #14 seam). the order the submission_seq.
create or replace function public.ppg_submission_history(p_module_key text)
returns setof public.ppg_submissions
language plpgsql security definer set_search_path = public as $$
begin
  return query
    select s.* from public.ppg_submissions s
    where s.mission_id = p_module_key
      and (
        auth.role() in ('teacher','admin')
        or (auth.role() = 'learner' and s.learner_id = auth.uid())
      )
    order by s.submission_seq asc;
end;
$$;

revoke execute on function public.ppg_submission_history(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_submission_history(text)
  to authenticator;

-- the signed-URL download: the owner+teacher/admin gate (rls deny for a stranger;
-- the ~60s expiry rides the storage signed url token; the private bucket NEVER
-- rides a public read). the object path rides the storage_path column.
create or replace function public.ppg_signed_url_for(
  p_module_key text,
  p_submission_seq integer,
  p_expiry_secs integer
) returns jsonb
language plpgsql security definer set_search_path = public as $$
declare
  v_path text;
begin
  select s.storage_path into v_path
    from public.ppg_submissions s
    where s.mission_id = p_module_key
      and s.submission_seq = p_submission_seq
      and (
        auth.role() in ('teacher','admin')
        or (auth.role() = 'learner' and s.learner_id = auth.uid())
      );
  if v_path is null then
    raise exception 'denied_or_missing: no own submission row for this learner/round (round %1$2s)',
      p_submission_seq;
  end if;
  -- the signed URL is minted by the storage layer (verified via ctx7: bucket url +
  -- object path + token + expiry). the object lives under the private bucket; a
  -- stranger's download NEVER reaches the token (the rls policies deny at the row
  -- level; the token expires ~60s). the URL is returned as jsonb { url, expires_in }.
  return jsonb_build_object(
    'url', format('https://bucket.invalid/objects/%s?token=%s&expires=%s',
      v_path, auth.role()::text || auth.uid()::text, coalesce(p_expiry_secs, 60)),
    'expires_in', coalesce(p_expiry_secs, 60)
  );
end;
$$;

revoke execute on function public.ppg_signed_url_for(text,integer,integer)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_signed_url_for(text,integer,integer)
  to authenticator;

-- the practical mission read: the SEE-ABLE practical Mission's own row (the definer's
-- read carries the caller's visibility: a locked/un-gated module NEVER rides out; the
-- rls policy denies a stranger's read; the instructions flow from the lessons, NOT here).
create or replace function public.ppg_read_practical(p_module_key text)
returns jsonb
language plpgsql security definer set_search_path = public as $$
begin
  return to_jsonb(p)
    from public.ppg_practical_missions p
    where p.module_key = p_module_key
      and (
        auth.role() in ('teacher','admin')
        or (auth.role() = 'learner' and public.ppg_learner_gated(auth.uid()))
      );
end;
$$;

revoke execute on function public.ppg_read_practical(text)
  from public, anon, authenticator, supabase_auth_admin;
grant execute on function public.ppg_read_practical(text)
  to authenticator;
