-- Notifications: one feed for money, business, investing and community, with
-- a choice of what you get and how it's emailed.
-- Run once in the Supabase SQL Editor, AFTER community_migration.sql. Safe to run again.

begin;

-- 1. Each notification can link to the page it's about, and a key stops the
--    same thing being notified twice (a bill due on a date, a budget in a month).
alter table public.notifications add column if not exists link text;
alter table public.notifications add column if not exists dedupe_key text;
alter table public.notifications add column if not exists emailed boolean not null default false;
create unique index if not exists notifications_once on public.notifications(user_id, dedupe_key) where dedupe_key is not null;
create index if not exists notifications_unread on public.notifications(user_id) where not read;

-- Already-existing notifications count as emailed, so turning email on doesn't send old ones.
update public.notifications set emailed = true where not emailed and created_at < now() - interval '1 day';

-- 2. What each person wants.
alter table public.notification_prefs add column if not exists earnings_alerts boolean not null default true;
alter table public.notification_prefs add column if not exists bill_alerts boolean not null default true;
alter table public.notification_prefs add column if not exists budget_alerts boolean not null default true;
alter table public.notification_prefs add column if not exists goal_alerts boolean not null default true;
alter table public.notification_prefs add column if not exists invoice_alerts boolean not null default true;
alter table public.notification_prefs add column if not exists sync_alerts boolean not null default true;
alter table public.notification_prefs add column if not exists community_alerts boolean not null default true;
-- immediate = as they happen, daily = one morning email, off = no emails (the feed still fills).
alter table public.notification_prefs add column if not exists email_mode text not null default 'daily';
alter table public.notification_prefs drop constraint if exists notification_prefs_email_mode_check;
alter table public.notification_prefs add constraint notification_prefs_email_mode_check check (email_mode in ('immediate', 'daily', 'off'));
alter table public.notification_prefs add column if not exists weekly_summary boolean not null default false;
alter table public.notification_prefs add column if not exists digest_sent_on date;
alter table public.notification_prefs add column if not exists weekly_sent_on date;

-- 3. Replies: respect the community switch, and link to Community.
create or replace function public.post_comments_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid bigint := coalesce(new.post_id, old.post_id);
  author uuid;
begin
  update public.posts
    set comment_count = (select count(*) from public.post_comments where post_id = pid and not hidden)
    where id = pid;
  if tg_op = 'INSERT' then
    select user_id into author from public.posts where id = pid;
    if author is not null and author <> new.user_id
       and not exists (select 1 from public.user_blocks where blocker_id = author and blocked_id = new.user_id)
       and coalesce((select community_alerts from public.notification_prefs where user_id = author), true) then
      insert into public.notifications (user_id, type, ticker, title, body, link)
      values (author, 'community_reply', null, new.username || ' replied to your post', left(new.body, 140), '/app/community');
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.post_comments_after() from public, anon, authenticated;

commit;

-- Check: should list email_mode and weekly_summary, then link and dedupe_key.
select column_name from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'notification_prefs' and column_name in ('email_mode', 'weekly_summary'))
    or (table_name = 'notifications' and column_name in ('link', 'dedupe_key')));
