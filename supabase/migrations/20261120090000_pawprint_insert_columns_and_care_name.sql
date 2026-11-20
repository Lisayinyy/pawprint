-- Feeds are ordered by created_at and rows are attributed by author_id / owner_id. Table-level INSERT let a
-- signed-in client supply those columns itself: a post inserted with a future created_at stays above every
-- later post in its region, and nobody can delete it. Inserts are narrowed to the columns the app writes;
-- everything else falls back to its default (auth.uid(), now()).
revoke insert on public.paw_pets, public.paw_records, public.paw_posts, public.paw_comments from authenticated;
grant insert (id, name, kind, breed) on public.paw_pets to authenticated;
grant insert (id, pet_id, type, value, note, record_date, next_date) on public.paw_records to authenticated;
grant insert (id, display_name, region, topic, body, route) on public.paw_posts to authenticated;
grant insert (id, post_id, display_name, body, walk_date, walk_slot) on public.paw_comments to authenticated;

-- A care circle keeps its own copy of the pet's name so invited family can read it without access to the
-- owner's private pet row. Clients cannot update circles, so the copy went stale when the owner renamed
-- the pet. Keep it in step from the pet row.
create function paw_private.sync_care_pet_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.paw_care_circles set pet_name = new.name
    where id = new.id and owner_id = new.owner_id;
  return null;
end;
$$;
revoke all on function paw_private.sync_care_pet_name() from public, anon, authenticated;
create trigger paw_sync_care_pet_name
  after update of name on public.paw_pets
  for each row when (old.name is distinct from new.name)
  execute function paw_private.sync_care_pet_name();

update public.paw_care_circles c set pet_name = p.name
  from public.paw_pets p
  where p.id = c.id and p.owner_id = c.owner_id and c.pet_name <> p.name;
