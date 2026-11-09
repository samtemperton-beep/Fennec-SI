-- Community: likes that save, comments, reports, blocking and hidden posts.
-- Run once in the Supabase SQL Editor. Safe to run again.

begin;

-- 1. New columns on posts.
alter table public.posts add column if not exists hidden boolean not null default false;
alter table public.posts add column if not exists comment_count int not null default 0;

-- 2. Posts are only changed by these triggers and the server. People can still
--    post and delete their own, but can't edit counts, the hidden flag or
--    someone else's name.
drop policy if exists "Users can update own posts" on public.posts;
revoke update on public.posts from anon, authenticated;

drop policy if exists "Posts are publicly readable" on public.posts;
drop policy if exists "Signed-in people read visible posts" on public.posts;
create policy "Signed-in people read visible posts" on public.posts
  for select to authenticated using (not hidden or auth.uid() = user_id);

create or replace function public.posts_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.username := (select username from public.profiles where id = new.user_id);
  if new.username is null or new.username = '' then
    raise exception 'Choose a username in Settings before posting';
  end if;
  new.body := btrim(new.body);
  if length(new.body) = 0 or length(new.body) > 1000 then
    raise exception 'Posts are 1 to 1000 characters';
  end if;
  new.likes := 0;
  new.comment_count := 0;
  new.hidden := false;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists posts_before_insert on public.posts;
create trigger posts_before_insert
  before insert on public.posts
  for each row execute function public.posts_before_insert();

-- 3. Like counts come from the likes themselves, so they save and can't drift.
create or replace function public.post_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare pid bigint := coalesce(new.post_id, old.post_id);
begin
  update public.posts set likes = (select count(*) from public.post_likes where post_id = pid) where id = pid;
  return null;
end;
$$;

drop trigger if exists post_likes_count on public.post_likes;
create trigger post_likes_count
  after insert or delete on public.post_likes
  for each row execute function public.post_likes_count();

update public.posts p set likes = (select count(*) from public.post_likes l where l.post_id = p.id);

-- 4. Comments.
create table if not exists public.post_comments (
  id bigserial primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null default '',
  body text not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments(post_id, created_at);

alter table public.post_comments enable row level security;
drop policy if exists "Signed-in people read visible comments" on public.post_comments;
create policy "Signed-in people read visible comments" on public.post_comments
  for select to authenticated using (not hidden or auth.uid() = user_id);
drop policy if exists "People add their own comments" on public.post_comments;
create policy "People add their own comments" on public.post_comments
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "People delete their own comments" on public.post_comments;
create policy "People delete their own comments" on public.post_comments
  for delete to authenticated using (auth.uid() = user_id);
revoke update on public.post_comments from anon, authenticated;

create or replace function public.post_comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.username := (select username from public.profiles where id = new.user_id);
  if new.username is null or new.username = '' then
    raise exception 'Choose a username in Settings before commenting';
  end if;
  new.body := btrim(new.body);
  if length(new.body) = 0 or length(new.body) > 500 then
    raise exception 'Comments are 1 to 500 characters';
  end if;
  if not exists (select 1 from public.posts where id = new.post_id and not hidden) then
    raise exception 'That post is no longer available';
  end if;
  new.hidden := false;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists post_comments_before_insert on public.post_comments;
create trigger post_comments_before_insert
  before insert on public.post_comments
  for each row execute function public.post_comments_before_insert();

-- Keeps the post's comment count, and tells the post's author about a reply.
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
       and not exists (select 1 from public.user_blocks where blocker_id = author and blocked_id = new.user_id) then
      insert into public.notifications (user_id, type, ticker, title, body)
      values (author, 'community_reply', null, new.username || ' replied to your post', left(new.body, 140));
    end if;
  end if;
  return null;
end;
$$;

-- 5. Blocking: you stop seeing someone's posts and comments, and their replies
--    don't notify you.
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
alter table public.user_blocks enable row level security;
drop policy if exists "People manage their own blocks" on public.user_blocks;
create policy "People manage their own blocks" on public.user_blocks
  for all to authenticated using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

drop trigger if exists post_comments_after on public.post_comments;
create trigger post_comments_after
  after insert or delete or update of hidden on public.post_comments
  for each row execute function public.post_comments_after();

-- 6. Reports. Only the server reads and writes these (no browser rules), so
--    nobody can see who reported what. Three reports hide a post until the
--    admin looks at it.
create table if not exists public.post_reports (
  id bigserial primary key,
  post_id bigint references public.posts(id) on delete cascade,
  comment_id bigint references public.post_comments(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  note text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  check (post_id is not null or comment_id is not null)
);
create unique index if not exists post_reports_once on public.post_reports(reporter_id, coalesce(post_id, 0), coalesce(comment_id, 0));
alter table public.post_reports enable row level security;
revoke all on public.post_reports from anon, authenticated;

-- 7. The trigger functions above run with full rights, so the app can't call them directly.
revoke all on function public.posts_before_insert() from public, anon, authenticated;
revoke all on function public.post_likes_count() from public, anon, authenticated;
revoke all on function public.post_comments_before_insert() from public, anon, authenticated;
revoke all on function public.post_comments_after() from public, anon, authenticated;

commit;

-- Check: should list hidden and comment_count, then three new tables.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'posts' and column_name in ('hidden', 'comment_count')
union all
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('post_comments', 'user_blocks', 'post_reports');
