
alter table public.paw_records drop constraint paw_records_type_check;
alter table public.paw_records add constraint paw_records_type_check
  check (type in ('weight','vaccine','care','visit','moment','walk','meal','medication','symptom','hygiene'));
alter table public.paw_records drop constraint paw_records_check;
alter table public.paw_records add constraint paw_records_next_date_check
  check (next_date is null or (type in ('vaccine','care','visit','medication','hygiene') and next_date >= record_date));
grant update (value, note, record_date, next_date), delete on public.paw_records to authenticated;
create policy "Edit own record" on public.paw_records for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Delete own record" on public.paw_records for delete to authenticated
  using (owner_id = (select auth.uid()));

alter table public.paw_posts add column route jsonb,
  add column outcome text, add column outcome_reply uuid;
alter table public.paw_posts add constraint paw_route_fields check (route is null or (
  topic = 'walk' and jsonb_typeof(route) = 'object'
  and route ?& array['name','start','finish','minutes','slot','tag','date']
  and route - array['name','start','finish','minutes','slot','tag','date'] = '{}'::jsonb
  and coalesce(char_length(btrim(route->>'name')) between 1 and 40, false)
  and coalesce(char_length(btrim(route->>'start')) between 1 and 60, false)
  and coalesce(char_length(btrim(route->>'finish')) between 1 and 60, false)
  and coalesce(route->>'minutes' ~ '^[1-9][0-9]{0,2}$', false)
  and coalesce(route->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$', false)
  and coalesce(route->>'slot' in ('morning','afternoon','evening'), false)
  and coalesce(route->>'tag' in ('quiet','shade','stepfree','other'), false)
));
alter table public.paw_posts add constraint paw_help_outcome check (
  (outcome is null and outcome_reply is null)
  or (topic = 'help' and outcome is not null and char_length(btrim(outcome)) between 1 and 160)
);
alter table public.paw_comments add column walk_date date, add column walk_slot text;
create function public.paw_validate_outcome_reply()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.outcome_reply is not null and not exists (
    select 1 from public.paw_comments where post_id = new.id and id = new.outcome_reply
  ) then raise exception 'Selected comment is unavailable'; end if;
  return new;
end;
$$;
revoke all on function public.paw_validate_outcome_reply() from public, anon;
grant execute on function public.paw_validate_outcome_reply() to authenticated;
create trigger paw_validate_outcome_reply
  before insert or update of outcome_reply on public.paw_posts
  for each row execute function public.paw_validate_outcome_reply();
alter table public.paw_comments add constraint paw_walk_observation check (
  (walk_date is null and walk_slot is null) or
  (walk_date is not null and walk_slot is not null and walk_slot in ('morning','afternoon','evening'))
);
grant update (outcome, outcome_reply) on public.paw_posts to authenticated;
create policy "Record own help outcome" on public.paw_posts for update to authenticated
  using (author_id = (select auth.uid()) and topic = 'help')
  with check (author_id = (select auth.uid()) and topic = 'help');

create table public.paw_bookmarks (
  user_id uuid not null default auth.uid() references public.paw_profiles(id) on delete cascade,
  post_id uuid not null references public.paw_posts(id) on delete cascade,
  primary key (user_id, post_id)
);
create index paw_bookmarks_post_idx on public.paw_bookmarks(post_id);
alter table public.paw_bookmarks enable row level security;
revoke all on public.paw_bookmarks from public, anon, authenticated;
grant select, insert, delete on public.paw_bookmarks to authenticated;
create policy "Read own bookmarks" on public.paw_bookmarks for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Bookmark visible routes" on public.paw_bookmarks for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.paw_posts p where p.id = post_id and p.route is not null
  ));
create policy "Delete own bookmarks" on public.paw_bookmarks for delete to authenticated
  using (user_id = (select auth.uid()));

create function public.paw_save_outcome(p_post uuid, p_reply uuid, p_outcome text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.paw_posts set outcome = p_outcome, outcome_reply = p_reply where id = p_post;
  if not found then raise exception 'Post is unavailable'; end if;
end;
$$;
revoke all on function public.paw_save_outcome(uuid, uuid, text) from public, anon;
grant execute on function public.paw_save_outcome(uuid, uuid, text) to authenticated;

create function public.paw_log_walk(
  p_id uuid, p_post uuid, p_pet uuid, p_date date, p_slot text,
  p_minutes integer, p_feedback text
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  route_name text;
  nickname text;
begin
  select route->>'name' into route_name from public.paw_posts where id = p_post;
  if route_name is null or p_minutes is null or p_minutes not between 1 and 999
    or p_date is null or p_date > (now() at time zone 'Asia/Hong_Kong')::date
    or p_slot is null or p_slot not in ('morning','afternoon','evening') then
    raise exception 'Invalid walk details';
  end if;
  insert into public.paw_records (id, pet_id, type, value, note, record_date)
    values (p_id, p_pet, 'walk', route_name, p_minutes || ' 分钟', p_date)
    on conflict (id) do nothing;
  if not exists (
    select 1 from public.paw_records
    where id = p_id and pet_id = p_pet and type = 'walk' and record_date = p_date
      and value = route_name and note = p_minutes || ' 分钟'
  ) then raise exception 'An earlier walk was already saved'; end if;
  if p_feedback is not null then
    select display_name into nickname from public.paw_profiles where id = (select auth.uid());
    insert into public.paw_comments (id, post_id, display_name, body, walk_date, walk_slot)
      values (p_id, p_post, nickname, p_feedback, p_date, p_slot)
      on conflict (id) do nothing;
    if not exists (
      select 1 from public.paw_comments
      where id = p_id and post_id = p_post and author_id = (select auth.uid())
        and body = p_feedback and walk_date = p_date and walk_slot = p_slot
    ) then raise exception 'Earlier feedback was already shared'; end if;
  end if;
end;
$$;
revoke all on function public.paw_log_walk(uuid, uuid, uuid, date, text, integer, text) from public, anon;
grant execute on function public.paw_log_walk(uuid, uuid, uuid, date, text, integer, text) to authenticated;

