-- About you: optional details people choose to give Fennec, used to suggest
-- budgets and goals and to give the fox context (frontend/lib/aboutYou.ts):
-- an age range, what they're working towards, and the budget helper's
-- household answers (adults, children, take-home pay, rent or mortgage, car).
--
-- Saved by the person's own profile update, like security_prefs.
-- Safe to run more than once.

begin;

alter table public.profiles add column if not exists about jsonb not null default '{}'::jsonb;
alter table public.profiles drop constraint if exists profiles_about_object;
alter table public.profiles add constraint profiles_about_object
  check (jsonb_typeof(about) = 'object' and pg_column_size(about) < 2000);

commit;
