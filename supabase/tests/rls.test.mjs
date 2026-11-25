// Applies every migration to an in-memory Postgres (PGlite) behind a minimal stand-in for Supabase's
// `auth` schema, roles and default grants, then checks who can read and write whose rows.
// Statements name their columns the way PostgREST does, so column-level grants are exercised too.
// invariants.sql holds the schema-wide checks (one row per violation); it is run here after the migrations
// and again after deliberately breaking the schema, to show each check can fail.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migrations = new URL('../migrations/', import.meta.url);
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [ann, ben, cat] = [uuid(1), uuid(2), uuid(3)];
const [annPet, benPet] = [uuid(11), uuid(12)];
const code = 'ab'.repeat(32);
const denied = /permission denied|row-level security/;
const invariants = await readFile(new URL('invariants.sql', import.meta.url), 'utf8');
let db;

/** Runs one statement the way a signed-in (or anonymous) API request would: PostgREST switches to the
 *  role and puts the verified token's claims into `request.jwt.claims` for the transaction. */
function as(user, sql, params = []) {
  return db.transaction(async tx => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [user ? JSON.stringify({ sub: user, role: 'authenticated' }) : '']);
    await tx.exec(`set local role ${user ? 'authenticated' : 'anon'}`);
    return (await tx.query(sql, params)).rows;
  });
}

/** Applies `ddl`, lists the invariant violations it causes, and rolls everything back. */
function violationsAfter(ddl) {
  return db.transaction(async tx => {
    await tx.exec(ddl);
    const { rows } = await tx.query(invariants);
    await tx.rollback();
    return [...new Set(rows.map(row => `${row.problem} ${row.object}`))];
  });
}

before(async () => {
  db = new PGlite();
  // Roles, auth.uid() and default privileges as a Supabase project has them: supabase/postgres
  // (migrations/db/init-scripts/00000000000000-initial-schema.sql) and supabase/auth
  // (migrations/20220224000811_update_auth_functions.up.sql).
  await db.exec(`
    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    create role service_role nologin noinherit bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      )::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    create publication supabase_realtime;
  `);
  for (const file of (await readdir(migrations)).sort()) {
    await db.exec(await readFile(new URL(file, migrations), 'utf8'));
  }
  await db.query('insert into auth.users (id) values ($1), ($2), ($3)', [ann, ben, cat]);
  for (const [id, name, region] of [[ann, 'Ann', '港岛'], [ben, 'Ben', '港岛'], [cat, 'Cat', '九龙']]) {
    await as(id, 'insert into paw_profiles (id, display_name, region) values ($1, $2, $3)', [id, name, region]);
  }
  await as(ann, `insert into paw_pets (id, name, kind, breed) values ($1, '布丁', 'dog', '')`, [annPet]);
  await as(ben, `insert into paw_pets (id, name, kind, breed) values ($1, '年糕', 'cat', '')`, [benPet]);
  await as(ann, `insert into paw_records (id, pet_id, type, value, note, record_date)
    values ($1, $2, 'weight', '9.1', '', '2026-11-01')`, [uuid(21), annPet]);
});

test('anonymous visitors cannot read tables or call functions', async () => {
  for (const table of ['paw_profiles', 'paw_pets', 'paw_records', 'paw_posts', 'paw_comments', 'paw_likes',
    'paw_bookmarks', 'paw_care_circles', 'paw_care_members', 'paw_care_events']) {
    await assert.rejects(as(null, `select * from ${table}`), denied, table);
  }
  await assert.rejects(as(null, 'select paw_accept_care_invite($1)', [code]), denied);
});

test('profiles, pets and records are private to their owner', async () => {
  assert.equal((await as(ben, 'select * from paw_profiles')).length, 1);
  assert.deepEqual(await as(ben, 'select id from paw_pets'), [{ id: benPet }]);
  assert.equal((await as(ben, 'select * from paw_records')).length, 0);
  assert.equal((await as(ann, 'select * from paw_records')).length, 1);

  await assert.rejects(as(ben, `insert into paw_records (id, pet_id, type, value, note, record_date)
    values ($1, $2, 'moment', 'x', '', '2026-11-02')`, [uuid(22), annPet]), /foreign key|row-level security/);
  assert.equal((await as(ben, `update paw_records set note = 'x' where id = $1 returning id`, [uuid(21)])).length, 0);
  assert.equal((await as(ben, 'delete from paw_records where id = $1 returning id', [uuid(21)])).length, 0);
  assert.equal((await as(ben, `update paw_pets set name = 'x' where id = $1 returning id`, [annPet])).length, 0);
  assert.equal((await as(ben, `update paw_profiles set display_name = 'x' where id = $1 returning id`, [ann])).length, 0);
});

test('clients cannot set authorship or timestamps themselves', async () => {
  await assert.rejects(as(ann, `insert into paw_posts (id, display_name, region, topic, body, created_at)
    values ($1, 'Ann', '港岛', 'daily', 'pinned', '2099-01-01')`, [uuid(30)]), denied);
  await assert.rejects(as(ann, `insert into paw_posts (id, author_id, display_name, region, topic, body)
    values ($1, $2, 'Ben', '港岛', 'daily', 'spoof')`, [uuid(30), ben]), denied);
  await assert.rejects(as(ann, `insert into paw_comments (id, post_id, author_id, display_name, body)
    values ($1, $1, $2, 'Ben', 'spoof')`, [uuid(30), ben]), denied);
  await assert.rejects(as(ann, `insert into paw_records (id, owner_id, pet_id, type, value, record_date)
    values ($1, $2, $3, 'moment', 'x', '2026-11-02')`, [uuid(30), ben, benPet]), denied);
  await assert.rejects(as(ann, `insert into paw_pets (id, owner_id, name, kind) values ($1, $2, 'x', 'dog')`,
    [uuid(30), ben]), denied);
});

test('community posts are scoped to the reader\'s region and written under the author\'s own profile', async () => {
  const post = uuid(31);
  await as(ann, `insert into paw_posts (id, display_name, region, topic, body, route)
    values ($1, 'Ann', '港岛', 'help', '下雨去哪走？', null) on conflict (id) do nothing`, [post]);
  const [row] = await as(ben, 'select author_id, created_at from paw_posts where id = $1', [post]);
  assert.equal(row.author_id, ann);
  assert.ok(Math.abs(Date.now() - new Date(row.created_at)) < 60_000);
  assert.equal((await as(cat, 'select id from paw_posts')).length, 0);

  await assert.rejects(as(ben, `insert into paw_posts (id, display_name, region, topic, body)
    values ($1, 'Ann', '港岛', 'daily', 'as someone else')`, [uuid(32)]), denied);
  await assert.rejects(as(ben, `insert into paw_posts (id, display_name, region, topic, body)
    values ($1, 'Ben', '九龙', 'daily', 'other region')`, [uuid(32)]), denied);

  await as(ben, `insert into paw_comments (id, post_id, display_name, body) values ($1, $2, 'Ben', '试试有盖步道')`,
    [uuid(33), post]);
  await assert.rejects(as(cat, `insert into paw_comments (id, post_id, display_name, body)
    values ($1, $2, 'Cat', 'out of region')`, [uuid(34), post]), denied);
  await assert.rejects(as(cat, 'insert into paw_likes (post_id) values ($1)', [post]), denied);
  assert.equal((await as(cat, 'select id from paw_comments')).length, 0);

  await assert.rejects(as(ben, 'select paw_save_outcome($1, $2, $3)', [post, uuid(33), 'not mine']), /unavailable/);
  await as(ann, 'select paw_save_outcome($1, $2, $3)', [post, uuid(33), '有盖步道可行']);
  assert.equal((await as(ben, 'select outcome_reply from paw_posts where id = $1', [post]))[0].outcome_reply, uuid(33));
});

test('logging a walk writes the caller\'s private record and their own comment', async () => {
  const route = { name: '海滨短走', start: '入口', finish: '休息亭', minutes: 20, slot: 'morning', tag: 'quiet', date: '2026-11-01' };
  await as(ann, `insert into paw_posts (id, display_name, region, topic, body, route)
    values ($1, 'Ann', '港岛', 'walk', '慢慢走', $2)`, [uuid(41), JSON.stringify(route)]);
  const walk = [uuid(42), uuid(41), benPet, '2026-11-02', 'morning', 25, '早上人少'];
  await as(ben, 'select paw_log_walk($1, $2, $3, $4, $5, $6, $7)', walk);
  const [record] = await as(ben, 'select owner_id, value, note from paw_records where id = $1', [uuid(42)]);
  assert.deepEqual(record, { owner_id: ben, value: '海滨短走', note: '25 分钟' });
  assert.equal((await as(ann, 'select author_id from paw_comments where id = $1', [uuid(42)]))[0].author_id, ben);
  assert.equal((await as(ann, 'select id from paw_records where id = $1', [uuid(42)])).length, 0);

  await assert.rejects(as(ben, 'select paw_log_walk($1, $2, $3, $4, $5, $6, $7)',
    [uuid(43), uuid(41), annPet, '2026-11-02', 'morning', 25, null]), /foreign key|row-level security/);
  await assert.rejects(as(cat, 'select paw_log_walk($1, $2, $3, $4, $5, $6, $7)',
    [uuid(44), uuid(41), annPet, '2026-11-02', 'morning', 25, null]), /Invalid walk details/);
});

test('family care is visible only to the owner and members who accepted a one-time invite', async () => {
  const event = (id, name) => [`insert into paw_care_events (id, circle_id, display_name, kind, detail, happened_at)
    values ($1, $2, $3, 'meal', '晚餐 45 克', now() - interval '1 hour')`, [id, annPet, name]];

  await assert.rejects(as(ben, 'insert into paw_care_circles (id, pet_name) values ($1, $2)', [annPet, '布丁']), denied);
  await as(ann, 'insert into paw_care_circles (id, pet_name) values ($1, $2)', [annPet, '布丁']);
  await as(ann, ...event(uuid(51), 'Ann'));

  assert.equal((await as(ben, 'select id from paw_care_circles')).length, 0);
  assert.equal((await as(ben, 'select id from paw_care_events')).length, 0);
  await assert.rejects(as(ben, ...event(uuid(52), 'Ben')), denied);
  await assert.rejects(as(ben, 'select * from paw_private.care_invites'), denied);
  await assert.rejects(as(ben, 'select paw_issue_care_invite($1, $2)', [annPet, code]), /Cannot issue/);

  await as(ann, 'select paw_issue_care_invite($1, $2)', [annPet, code]);
  await assert.rejects(as(ann, 'select paw_accept_care_invite($1)', [code]), /own this circle/);
  await assert.rejects(as(ben, 'select paw_accept_care_invite($1)', ['cd'.repeat(32)]), /invalid or expired/);
  assert.equal((await as(ben, 'select paw_accept_care_invite($1) as id', [code]))[0].id, annPet);
  await assert.rejects(as(cat, 'select paw_accept_care_invite($1)', [code]), /already used/);

  assert.equal((await as(ben, 'select pet_name from paw_care_circles'))[0].pet_name, '布丁');
  assert.equal((await as(ben, 'select id from paw_care_events')).length, 1);
  await as(ben, ...event(uuid(52), 'Ben'));
  assert.equal((await as(ann, 'select author_id from paw_care_events where id = $1', [uuid(52)]))[0].author_id, ben);
  await assert.rejects(as(ben, ...event(uuid(53), 'Ann')), denied);
  await assert.rejects(as(ben, `insert into paw_care_events (id, circle_id, author_id, display_name, kind, detail, happened_at)
    values ($1, $2, $3, 'Ben', 'meal', 'x', now())`, [uuid(53), annPet, ann]), denied);
  await assert.rejects(as(ben, `insert into paw_care_events (id, circle_id, display_name, kind, detail, happened_at)
    values ($1, $2, 'Ben', 'meal', 'x', now() + interval '1 day')`, [uuid(53), annPet]), denied);
  assert.equal((await as(ben, 'select id from paw_pets where id = $1', [annPet])).length, 0);
  assert.equal((await as(ben, 'select id from paw_records where pet_id = $1', [annPet])).length, 0);
  assert.equal((await as(cat, 'select id from paw_care_events')).length, 0);
  assert.equal((await as(cat, 'select user_id from paw_care_members')).length, 0);

  await as(ann, `update paw_pets set name = '布丁二世' where id = $1`, [annPet]);
  assert.equal((await as(ben, 'select pet_name from paw_care_circles'))[0].pet_name, '布丁二世');

  assert.equal((await as(ben, `update paw_care_members set active = false where circle_id = $1 returning user_id`,
    [annPet])).length, 0);
  await as(ann, 'update paw_care_members set active = false where circle_id = $1 and user_id = $2', [annPet, ben]);
  assert.equal((await as(ben, 'select id from paw_care_circles')).length, 0);
  assert.equal((await as(ben, 'select id from paw_care_events')).length, 0);
  await assert.rejects(as(ben, ...event(uuid(54), 'Ben')), denied);
  await assert.rejects(as(ben, 'select paw_accept_care_invite($1)', [code]), /already used/);
  await assert.rejects(as(ann, `update paw_care_members set active = true where circle_id = $1 and user_id = $2`,
    [annPet, ben]), denied);
  assert.equal((await as(ann, 'select id from paw_care_events')).length, 2);
});

test('length limits count padding, and care times must be real dates', async () => {
  const pad = ' '.repeat(5000);
  const sizeLimit = /_size"|violates check constraint/;
  await assert.rejects(as(ben, `insert into paw_posts (id, display_name, region, topic, body)
    values ($1, 'Ben', '港岛', 'daily', $2)`, [uuid(60), pad + 'a']), sizeLimit);
  await assert.rejects(as(ben, `insert into paw_comments (id, post_id, display_name, body)
    values ($1, $2, 'Ben', $3)`, [uuid(60), uuid(31), 'a' + pad]), sizeLimit);
  await assert.rejects(as(ben, `insert into paw_posts (id, display_name, region, topic, body, route)
    values ($1, 'Ben', '港岛', 'walk', 'w', $2)`, [uuid(60), JSON.stringify({ name: 'n', start: 's' + pad, finish: 'f',
    minutes: 20, slot: 'morning', tag: 'quiet', date: '2026-11-01' })]), sizeLimit);
  await assert.rejects(as(ben, `update paw_profiles set display_name = $2 where id = $1`, [ben, pad + 'Ben']), sizeLimit);
  await assert.rejects(as(ben, `update paw_profiles set saved_walks = array_fill('港岛'::text, array[100]) where id = $1`,
    [ben]), sizeLimit);
  await assert.rejects(as(ben, `update paw_pets set name = $2 where id = $1`, [benPet, pad + 'x']), sizeLimit);
  await assert.rejects(as(ann, `insert into paw_records (id, pet_id, type, value, note, record_date)
    values ($1, $2, 'moment', $3, '', '2026-11-02')`, [uuid(60), annPet, 'x' + pad]), sizeLimit);

  const event = `insert into paw_care_events (id, circle_id, display_name, kind, detail, happened_at)
    values ($1, $2, 'Ann', 'meal', $3, $4)`;
  await assert.rejects(as(ann, event, [uuid(61), annPet, 'x' + pad, new Date().toISOString()]), sizeLimit);
  await assert.rejects(as(ann, event, [uuid(61), annPet, 'x', '-infinity']), /happened_at_range/);
  await assert.rejects(as(ann, event, [uuid(61), annPet, 'x', '4000-01-01 BC']), /happened_at_range/);
  await as(ann, event, [uuid(61), annPet, '晚餐 45 克', new Date(Date.now() - 86_400_000).toISOString()]);
});

test('upserts in the shape the app sends them only ever touch the caller\'s own row', async () => {
  // cloud.js saves a pet and a new profile with a plain upsert, which PostgREST turns into
  // INSERT ... ON CONFLICT (id) DO UPDATE SET <every sent column> = EXCLUDED.<column>.
  const savePet = `insert into paw_pets (id, name, kind, breed) values ($1, $2, 'cat', '')
    on conflict (id) do update set id = excluded.id, name = excluded.name, kind = excluded.kind, breed = excluded.breed
    returning owner_id, name`;
  const saveProfile = `insert into paw_profiles (id, display_name, region) values ($1, $2, '九龙')
    on conflict (id) do update set id = excluded.id, display_name = excluded.display_name, region = excluded.region
    returning id, display_name`;
  const annsPet = await as(ann, 'select name, kind from paw_pets where id = $1', [annPet]);

  assert.deepEqual(await as(ben, savePet, [benPet, '年糕糕']), [{ owner_id: ben, name: '年糕糕' }]);
  await assert.rejects(as(ben, savePet, [annPet, 'taken']), denied);
  assert.deepEqual(await as(ann, 'select name, kind from paw_pets where id = $1', [annPet]), annsPet);

  assert.deepEqual(await as(cat, saveProfile, [cat, 'Cat 2']), [{ id: cat, display_name: 'Cat 2' }]);
  await assert.rejects(as(cat, saveProfile, [ann, 'taken']), denied);
  assert.equal((await as(ann, 'select display_name from paw_profiles'))[0].display_name, 'Ann');
});

test('schema-wide invariants hold after all migrations', async () => {
  assert.deepEqual((await db.query(invariants)).rows, []);
});

test('each invariant reports the schema change it is there to catch', async () => {
  const broken = [
    ['alter table public.paw_likes disable row level security', ['rls_disabled public.paw_likes']],
    [`drop policy "Read own bookmarks" on public.paw_bookmarks;
      drop policy "Bookmark visible routes" on public.paw_bookmarks;
      drop policy "Delete own bookmarks" on public.paw_bookmarks`, ['rls_without_policy public.paw_bookmarks']],
    // A new table that forgets `enable row level security` and `revoke all` keeps Supabase's default grants.
    ['create table public.paw_new (id int)', ['anon_table_privilege public.paw_new',
      'authenticated_table_privilege public.paw_new', 'rls_disabled public.paw_new']],
    ['create policy "Everyone" on public.paw_posts for select using (true)',
      ['policy_not_limited_to_authenticated public.paw_posts']],
    ['grant select (id) on public.paw_posts to anon', ['anon_table_privilege public.paw_posts']],
    ['grant usage on schema paw_private to anon', ['anon_schema_privilege paw_private']],
    ['grant truncate on public.paw_posts to authenticated', ['authenticated_table_privilege public.paw_posts']],
    // A new function that forgets `set search_path` and `revoke ... from public, anon`.
    ['create function public.paw_new() returns int language sql as $$ select 1 $$',
      ['anon_function_privilege public.paw_new()', 'function_search_path_mutable public.paw_new()']],
    [`create function public.paw_new() returns int language sql security definer set search_path = '' as $$ select 1 $$;
      revoke all on function public.paw_new() from public, anon`, ['security_definer_in_api_schema public.paw_new()']],
  ];
  for (const [ddl, expected] of broken) assert.deepEqual(await violationsAfter(ddl), expected, ddl);
  assert.deepEqual((await db.query(invariants)).rows, [], 'the changes above were rolled back');
});

test('signed-in users hold exactly the privileges the app needs', async () => {
  // The whole grant surface in one place. A migration that widens or narrows a grant has to change this
  // list too. Row-level limits on top of these grants are what the tests above exercise.
  const { rows: tables } = await db.query(`
    select c.relname as "table", a.privilege_type as privilege, null as columns
      from pg_class c, aclexplode(c.relacl) a
      where a.grantee = 'authenticated'::regrole and c.relkind = 'r'
        and c.relnamespace in ('public'::regnamespace, 'paw_private'::regnamespace)
    union all
    select c.relname, a.privilege_type, string_agg(col.attname, ', ' order by col.attnum)
      from pg_class c join pg_attribute col on col.attrelid = c.oid, aclexplode(col.attacl) a
      where a.grantee = 'authenticated'::regrole
        and c.relnamespace in ('public'::regnamespace, 'paw_private'::regnamespace)
      group by 1, 2
    order by 1, 2`);
  assert.deepEqual(tables.map(row => `${row.table}: ${row.privilege}${row.columns ? ` (${row.columns})` : ''}`), [
    'paw_bookmarks: DELETE',
    'paw_bookmarks: INSERT',
    'paw_bookmarks: SELECT',
    'paw_care_circles: INSERT (id, pet_name)',
    'paw_care_circles: SELECT',
    'paw_care_events: INSERT (id, circle_id, display_name, kind, detail, happened_at)',
    'paw_care_events: SELECT',
    'paw_care_members: SELECT',
    'paw_care_members: UPDATE (active)',
    'paw_comments: INSERT (id, post_id, display_name, body, walk_date, walk_slot)',
    'paw_comments: SELECT',
    'paw_likes: DELETE',
    'paw_likes: INSERT',
    'paw_likes: SELECT',
    'paw_pets: INSERT (id, name, kind, breed)',
    'paw_pets: SELECT',
    'paw_pets: UPDATE',
    'paw_posts: INSERT (id, display_name, region, topic, body, route)',
    'paw_posts: SELECT',
    'paw_posts: UPDATE (outcome, outcome_reply)',
    'paw_profiles: INSERT',
    'paw_profiles: SELECT',
    'paw_profiles: UPDATE',
    'paw_records: DELETE',
    'paw_records: INSERT (id, pet_id, type, value, note, record_date, next_date)',
    'paw_records: SELECT',
    'paw_records: UPDATE (value, note, record_date, next_date)',
  ]);

  const { rows: functions } = await db.query(`
    select p.oid::regprocedure::text as name, p.prosecdef as definer from pg_proc p
      where p.pronamespace in ('public'::regnamespace, 'paw_private'::regnamespace)
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      order by 1`);
  assert.deepEqual(functions.map(row => `${row.name}${row.definer ? ' [security definer]' : ''}`), [
    'paw_accept_care_invite(text)',
    'paw_cancel_care_invite(uuid)',
    'paw_issue_care_invite(uuid,text)',
    'paw_log_walk(uuid,uuid,uuid,date,text,integer,text)',
    'paw_private.accept_care_invite(text) [security definer]',
    'paw_private.cancel_care_invite(uuid) [security definer]',
    'paw_private.issue_care_invite(uuid,text) [security definer]',
    'paw_save_outcome(uuid,uuid,text)',
    'paw_validate_outcome_reply()',
  ]);
});
