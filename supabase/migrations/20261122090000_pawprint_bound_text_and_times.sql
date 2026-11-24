-- The length limits were written as char_length(btrim(col)) between 1 and N. btrim() drops leading and
-- trailing spaces before counting, so the cap never applied to them: a post made of 2 MB of spaces and one
-- letter was accepted, shown in the region feed to every reader and, like every post, could not be deleted.
-- The app trims text before sending, so the real limits can be enforced on the stored value. NOT VALID keeps
-- any row that is already too long readable; the checks apply to every insert and update from now on.
alter table public.paw_profiles
  add constraint paw_profiles_display_name_size check (char_length(display_name) <= 24) not valid,
  add constraint paw_profiles_saved_walks_size check (cardinality(saved_walks) <= 3) not valid;
alter table public.paw_pets
  add constraint paw_pets_name_size check (char_length(name) <= 16) not valid;
alter table public.paw_records
  add constraint paw_records_value_size check (char_length(value) <= 40) not valid;
alter table public.paw_posts
  add constraint paw_posts_display_name_size check (char_length(display_name) <= 24) not valid,
  add constraint paw_posts_body_size check (char_length(body) <= 280) not valid,
  add constraint paw_posts_outcome_size check (outcome is null or char_length(outcome) <= 160) not valid,
  add constraint paw_posts_route_size check (route is null or (
    char_length(route->>'name') <= 40 and char_length(route->>'start') <= 60 and char_length(route->>'finish') <= 60
  )) not valid;
alter table public.paw_comments
  add constraint paw_comments_display_name_size check (char_length(display_name) <= 24) not valid,
  add constraint paw_comments_body_size check (char_length(body) <= 160) not valid;
alter table public.paw_care_circles
  add constraint paw_care_circles_pet_name_size check (char_length(pet_name) <= 16) not valid;
alter table public.paw_care_events
  add constraint paw_care_events_display_name_size check (char_length(display_name) <= 24) not valid,
  add constraint paw_care_events_detail_size check (char_length(detail) <= 140) not valid,
  -- happened_at only had an upper bound (the insert policy). '-infinity' and BC timestamps were accepted and
  -- cannot be parsed by the browser; one such row used to blank the journal for the whole circle.
  add constraint paw_care_events_happened_at_range check (happened_at >= '2000-01-01T00:00:00Z') not valid;
