-- PPGA local-stack seed (applied by `supabase db reset` after the migrations):
-- the PRIVATE submissions bucket. Bucket creation does not ride a versioned
-- migration (`insert into storage.buckets` is not a supported provisioning
-- path there and would break re-runs); the storage RLS policies live in
-- 20260926001000_practical_missions_submissions.sql. Hosted environments
-- create this bucket once in the dashboard with the same id + private flag.
insert into storage.buckets (id, name, public)
values ('ppg-submissions', 'ppg-submissions', false)
on conflict (id) do nothing;
