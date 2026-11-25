-- Schema-wide permission checks. One row per violation; an empty result is the expected state.
--
-- Catalog reads only, nothing is changed, so the same file can be pasted into the Supabase SQL editor to
-- check the live project (on a project shared with other apps, rows about their objects can show up too).
-- The checks follow Supabase's database linter (github.com/supabase/splinter, lints 0007, 0008, 0011, 0013,
-- 0028, 0029), tightened for this app: nothing here is meant to be reachable without signing in.
with app_schema(name) as (values ('public'), ('paw_private')),
app_table as (
  select c.oid, format('%I.%I', n.nspname, c.relname) as object, n.nspname, c.relname, c.relrowsecurity
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  left join pg_catalog.pg_depend d on d.objid = c.oid and d.deptype = 'e' and d.classid = 'pg_catalog.pg_class'::regclass
  where c.relkind in ('r', 'p') and n.nspname in (select name from app_schema) and d.objid is null
),
app_function as (
  select p.oid, format('%I.%I(%s)', n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)) as object,
    n.nspname, p.prosecdef, p.proconfig
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  left join pg_catalog.pg_depend d on d.objid = p.oid and d.deptype = 'e' and d.classid = 'pg_catalog.pg_proc'::regclass
  where n.nspname in (select name from app_schema) and d.objid is null
)
-- Every table is behind row level security.
select 'rls_disabled' as problem, object, 'row level security is not enabled' as detail
  from app_table where not relrowsecurity
union all
-- RLS without any policy means "nobody but the owner". That is intended for exactly one table, which is
-- only reached through the SECURITY DEFINER invite functions.
select 'rls_without_policy', object, 'row level security is enabled but no policy exists'
  from app_table t
  where relrowsecurity and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = t.oid)
    and (nspname, relname) not in (('paw_private', 'care_invites'))
union all
-- Policies are written for signed-in users only.
select 'policy_not_limited_to_authenticated', t.object, format('policy %I applies to %s', p.polname,
    (select string_agg(case when r = 0 then 'public' else r::regrole::text end, ', ') from unnest(p.polroles) r))
  from pg_catalog.pg_policy p join app_table t on t.oid = p.polrelid
  where p.polroles <> array['authenticated'::regrole::oid]
union all
-- A visitor who is not signed in has no privilege on any table or column.
select 'anon_table_privilege', t.object, format('anon holds %s', priv)
  from app_table t
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) priv
  where pg_catalog.has_table_privilege('anon', t.oid, priv)
    or (priv in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES') and pg_catalog.has_any_column_privilege('anon', t.oid, priv))
union all
select 'anon_function_privilege', object, 'anon may execute this function'
  from app_function where pg_catalog.has_function_privilege('anon', oid, 'EXECUTE')
union all
select 'anon_schema_privilege', 'paw_private', 'anon may use the private schema'
  where pg_catalog.has_schema_privilege('anon', 'paw_private', 'USAGE')
union all
-- Signed-in users never get more than row-level access: no TRUNCATE, no REFERENCES, no TRIGGER.
select 'authenticated_table_privilege', t.object, format('authenticated holds %s', priv)
  from app_table t cross join unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) priv
  where pg_catalog.has_table_privilege('authenticated', t.oid, priv)
union all
-- A function without a pinned search_path resolves unqualified names through the caller's path.
select 'function_search_path_mutable', object, 'search_path is not set on the function'
  from app_function f
  where not exists (select 1 from unnest(coalesce(f.proconfig, '{}')) c where c like 'search_path=%')
union all
-- SECURITY DEFINER bypasses RLS, so such functions stay out of the schema the API exposes.
select 'security_definer_in_api_schema', object, 'SECURITY DEFINER function in the exposed schema'
  from app_function where prosecdef and nspname = 'public'
order by 1, 2;
