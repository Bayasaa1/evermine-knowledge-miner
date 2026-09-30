-- Everyone is a creator: personal posts, 24h stories, and their own media.

create table public.user_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default '',
  author_avatar text,
  body text not null default '',
  media_path text,
  media_kind text not null default 'none',
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.user_posts to authenticated;
grant select on public.user_posts to anon;
grant all on public.user_posts to service_role;

alter table public.user_posts enable row level security;

create policy "Posts are public to read"
  on public.user_posts for select
  using (true);

create policy "Own posts insert"
  on public.user_posts for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Own posts update"
  on public.user_posts for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Own posts delete"
  on public.user_posts for delete to authenticated
  using (auth.uid() = user_id);

create index user_posts_created_idx on public.user_posts (created_at desc);


create table public.user_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default '',
  author_avatar text,
  caption text not null default '',
  media_path text not null,
  media_kind text not null default 'image',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

grant select, insert, delete on public.user_stories to authenticated;
grant select on public.user_stories to anon;
grant all on public.user_stories to service_role;

alter table public.user_stories enable row level security;

create policy "Stories are public to read"
  on public.user_stories for select
  using (expires_at > now());

create policy "Own stories insert"
  on public.user_stories for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Own stories delete"
  on public.user_stories for delete to authenticated
  using (auth.uid() = user_id);

create index user_stories_expiry_idx on public.user_stories (expires_at desc);


-- Storage: each person writes only inside their own folder; anyone signed in can read.
create policy "user media read"
  on storage.objects for select
  using (bucket_id = 'user-media');

create policy "user media insert own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'user-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "user media update own folder"
  on storage.objects for update to authenticated
  using (bucket_id = 'user-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "user media delete own folder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'user-media' and (storage.foldername(name))[1] = auth.uid()::text);
