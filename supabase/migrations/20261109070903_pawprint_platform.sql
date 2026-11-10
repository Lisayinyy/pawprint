create table public.paw_profiles (
  id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 24),
  region text not null check (region in ('港岛', '九龙', '新界')),
  saved_walks text[] not null default '{}' check (saved_walks <@ array['港岛', '九龙', '新界'])
);

create table public.paw_pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.paw_profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 16),
  kind text not null check (kind in ('dog', 'cat', 'other')),
  breed text not null default '' check (char_length(breed) <= 24),
  created_at timestamptz not null default now(),
  unique (owner_id, id)
);

create table public.paw_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  pet_id uuid not null,
  type text not null check (type in ('weight', 'vaccine', 'care', 'visit', 'moment')),
  value text not null check (char_length(btrim(value)) between 1 and 40),
  note text not null default '' check (char_length(note) <= 160),
  record_date date not null,
  next_date date,
  created_at timestamptz not null default now(),
  foreign key (owner_id, pet_id) references public.paw_pets(owner_id, id) on delete cascade,
  check (next_date is null or (type in ('vaccine', 'care', 'visit') and next_date >= record_date)),
  check (case when type <> 'weight' then true
    when value ~ '^[0-9]{1,3}(\.[0-9]{1,2})?$' then value::numeric between 0.01 and 250
    else false end)
);

create index paw_records_pet_date_idx
  on public.paw_records(owner_id, pet_id, record_date desc, created_at desc);

create table public.paw_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.paw_profiles(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 24),
  region text not null check (region in ('港岛', '九龙', '新界')),
  topic text not null check (topic in ('daily', 'help', 'walk')),
  body text not null check (char_length(btrim(body)) between 1 and 280),
  created_at timestamptz not null default now()
);

create index paw_posts_region_created_idx on public.paw_posts(region, created_at desc, id desc);
create index paw_posts_author_idx on public.paw_posts(author_id);

create table public.paw_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.paw_posts(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.paw_profiles(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 24),
  body text not null check (char_length(btrim(body)) between 1 and 160),
  created_at timestamptz not null default now()
);

create index paw_comments_post_created_idx on public.paw_comments(post_id, created_at desc, id desc);
create index paw_comments_author_idx on public.paw_comments(author_id);

create table public.paw_likes (
  post_id uuid not null references public.paw_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.paw_profiles(id) on delete cascade,
  primary key (post_id, user_id)
);

create index paw_likes_user_idx on public.paw_likes(user_id);

alter table public.paw_profiles enable row level security;
alter table public.paw_pets enable row level security;
alter table public.paw_records enable row level security;
alter table public.paw_posts enable row level security;
alter table public.paw_comments enable row level security;
alter table public.paw_likes enable row level security;

revoke all on public.paw_profiles, public.paw_pets, public.paw_records, public.paw_posts,
  public.paw_comments, public.paw_likes from public, anon, authenticated;

grant select, insert, update on public.paw_profiles, public.paw_pets to authenticated;
grant select, insert on public.paw_records, public.paw_posts, public.paw_comments to authenticated;
grant select, insert, delete on public.paw_likes to authenticated;

create policy "Read own profile" on public.paw_profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Create own profile" on public.paw_profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "Update own profile" on public.paw_profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Read own pets" on public.paw_pets
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "Create own pets" on public.paw_pets
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Update own pets" on public.paw_pets
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "Read own records" on public.paw_records
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "Create own records" on public.paw_records
  for insert to authenticated with check (owner_id = (select auth.uid()));

create policy "Read posts in current region" on public.paw_posts
  for select to authenticated using (
    region = (select p.region from public.paw_profiles p where p.id = (select auth.uid()))
  );
create policy "Publish under own name and region" on public.paw_posts
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and (region, display_name) = (
      select p.region, p.display_name from public.paw_profiles p where p.id = (select auth.uid())
    )
  );

create policy "Read comments on visible posts" on public.paw_comments
  for select to authenticated using (
    exists (select 1 from public.paw_posts p where p.id = post_id)
  );
create policy "Comment as self on visible posts" on public.paw_comments
  for insert to authenticated with check (
    author_id = (select auth.uid())
    and display_name = (select p.display_name from public.paw_profiles p where p.id = (select auth.uid()))
    and exists (select 1 from public.paw_posts p where p.id = post_id)
  );

create policy "Read likes on visible posts" on public.paw_likes
  for select to authenticated using (
    exists (select 1 from public.paw_posts p where p.id = post_id)
  );
create policy "Like visible posts as self" on public.paw_likes
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.paw_posts p where p.id = post_id)
  );
create policy "Remove own likes" on public.paw_likes
  for delete to authenticated using (
    user_id = (select auth.uid())
    and exists (select 1 from public.paw_posts p where p.id = post_id)
  );
