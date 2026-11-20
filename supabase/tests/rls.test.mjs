// Applies every migration to an in-memory Postgres (PGlite) behind a minimal stand-in for Supabase's
// `auth` schema, roles and default grants, then checks who can read and write whose rows.
// Statements name their columns the way PostgREST does, so column-level grants are exercised too.
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
let db;

/** Runs one statement the way a signed-in (or anonymous) API request would. */
function as(user, sql, params = []) {
  return db.transaction(async tx => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user ?? '']);
    await tx.exec(`set local role ${user ? 'authenticated' : 'anon'}`);
    return (await tx.query(sql, params)).rows;
  });
}

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
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
