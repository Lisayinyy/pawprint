create schema if not exists paw_private;
revoke all on schema paw_private from public, anon, authenticated;
grant usage on schema paw_private to authenticated;

create table public.paw_care_circles (
  id uuid primary key,
  owner_id uuid not null default auth.uid(),
  pet_name text not null check (char_length(btrim(pet_name)) between 1 and 16),
  unique (owner_id, id),
  foreign key (owner_id, id) references public.paw_pets(owner_id, id) on delete cascade
);

create table public.paw_care_members (
  circle_id uuid not null,
  owner_id uuid not null,
  user_id uuid not null references public.paw_profiles(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 24),
  active boolean not null default true,
  primary key (circle_id, user_id),
  foreign key (owner_id, circle_id) references public.paw_care_circles(owner_id, id) on delete cascade,
  check (user_id <> owner_id)
);
create index paw_care_members_user_idx on public.paw_care_members(user_id, active);
create index paw_care_members_owner_idx on public.paw_care_members(owner_id);

create table public.paw_care_events (
  id uuid primary key,
  circle_id uuid not null references public.paw_care_circles(id) on delete cascade,
  author_id uuid default auth.uid() references public.paw_profiles(id) on delete set null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 24),
  kind text not null check (kind in ('meal', 'medication', 'walk')),
  detail text not null check (char_length(btrim(detail)) between 1 and 140),
  happened_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index paw_care_events_circle_idx on public.paw_care_events(circle_id, happened_at desc, created_at desc, id);
create index paw_care_events_author_idx on public.paw_care_events(author_id);

create table paw_private.care_invites (
  circle_id uuid primary key references public.paw_care_circles(id) on delete cascade,
  code_hash bytea not null unique,
  expires_at timestamptz not null,
  accepted_by uuid references public.paw_profiles(id) on delete cascade
);
alter table paw_private.care_invites enable row level security;

alter table public.paw_care_circles enable row level security;
alter table public.paw_care_members enable row level security;
alter table public.paw_care_events enable row level security;
revoke all on public.paw_care_circles, public.paw_care_members, public.paw_care_events from public, anon, authenticated;
grant select, insert (id, pet_name) on public.paw_care_circles to authenticated;
grant select, update (active) on public.paw_care_members to authenticated;
grant select, insert (id, circle_id, display_name, kind, detail, happened_at) on public.paw_care_events to authenticated;

create policy "Read family circles" on public.paw_care_circles for select to authenticated using (
  owner_id = (select auth.uid()) or id in (
    select circle_id from public.paw_care_members where user_id = (select auth.uid()) and active
  )
);
create policy "Share own pet" on public.paw_care_circles for insert to authenticated with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.paw_pets where id = paw_care_circles.id and owner_id = (select auth.uid())
  )
);
create policy "Read own or managed membership" on public.paw_care_members for select to authenticated using (
  user_id = (select auth.uid()) or owner_id = (select auth.uid())
);
create policy "Owner can revoke members" on public.paw_care_members for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and not active);
create policy "Read shared care history" on public.paw_care_events for select to authenticated using (
  circle_id in (select id from public.paw_care_circles)
);
create policy "Record own care for a visible pet" on public.paw_care_events for insert to authenticated with check (
  author_id = (select auth.uid()) and circle_id in (select id from public.paw_care_circles)
  and display_name = (select display_name from public.paw_profiles where id = (select auth.uid()))
  and happened_at <= now() + interval '1 minute'
);

create function paw_private.issue_care_invite(p_circle uuid, p_code text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  deadline timestamptz := now() + interval '48 hours';
begin
  if not exists (select 1 from public.paw_care_circles where id = p_circle and owner_id = (select auth.uid()))
    or p_code is null or p_code !~ '^[a-f0-9]{64}$' then
    raise exception 'Cannot issue an invitation';
  end if;
  insert into paw_private.care_invites (circle_id, code_hash, expires_at)
    values (p_circle, sha256(convert_to(p_code, 'UTF8')), deadline)
    on conflict (circle_id) do update
    set code_hash = excluded.code_hash, expires_at = excluded.expires_at, accepted_by = null;
  return deadline;
end;
$$;

create function paw_private.cancel_care_invite(p_circle uuid)
returns void language sql security definer set search_path = '' as $$
  delete from paw_private.care_invites
  where circle_id = p_circle and exists (
    select 1 from public.paw_care_circles where id = p_circle and owner_id = (select auth.uid())
  );
$$;

create function paw_private.accept_care_invite(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  member_id uuid := auth.uid();
  member_name text;
  invite paw_private.care_invites%rowtype;
  circle_owner uuid;
begin
  if member_id is null or p_code is null or p_code !~ '^[a-f0-9]{64}$' then
    raise exception 'Invitation is invalid or expired';
  end if;
  select display_name into member_name from public.paw_profiles where id = member_id;
  if member_name is null then raise exception 'Profile is required'; end if;

  select * into invite from paw_private.care_invites
    where code_hash = sha256(convert_to(p_code, 'UTF8')) and expires_at > now() for update;
  if not found then raise exception 'Invitation is invalid or expired'; end if;
  select owner_id into circle_owner from public.paw_care_circles where id = invite.circle_id;
  if circle_owner = member_id then raise exception 'You own this circle'; end if;
  if invite.accepted_by is not null then
    if invite.accepted_by = member_id and exists (
      select 1 from public.paw_care_members where circle_id = invite.circle_id and user_id = member_id and active
    ) then return invite.circle_id; end if;
    raise exception 'Invitation is already used';
  end if;

  insert into public.paw_care_members (circle_id, owner_id, user_id, display_name)
    values (invite.circle_id, circle_owner, member_id, member_name)
    on conflict (circle_id, user_id) do update set active = true, display_name = excluded.display_name;
  update paw_private.care_invites set accepted_by = member_id where circle_id = invite.circle_id;
  return invite.circle_id;
end;
$$;

create function public.paw_issue_care_invite(p_circle uuid, p_code text)
returns timestamptz language sql security invoker set search_path = '' as $$
  select paw_private.issue_care_invite(p_circle, p_code);
$$;
create function public.paw_cancel_care_invite(p_circle uuid)
returns void language sql security invoker set search_path = '' as $$
  select paw_private.cancel_care_invite(p_circle);
$$;
create function public.paw_accept_care_invite(p_code text)
returns uuid language sql security invoker set search_path = '' as $$
  select paw_private.accept_care_invite(p_code);
$$;

revoke all on function paw_private.issue_care_invite(uuid, text), paw_private.cancel_care_invite(uuid),
  paw_private.accept_care_invite(text), public.paw_issue_care_invite(uuid, text),
  public.paw_cancel_care_invite(uuid), public.paw_accept_care_invite(text) from public, anon;
grant execute on function paw_private.issue_care_invite(uuid, text), paw_private.cancel_care_invite(uuid),
  paw_private.accept_care_invite(text), public.paw_issue_care_invite(uuid, text),
  public.paw_cancel_care_invite(uuid), public.paw_accept_care_invite(text) to authenticated;

alter publication supabase_realtime add table public.paw_care_events, public.paw_care_members;
