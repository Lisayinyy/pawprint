'use strict';

const config = window.pawprintConfig;
const query = new URLSearchParams(location.search);
const fragment = new URLSearchParams(location.hash.slice(1));
const authReturn = {
  failed: [query, fragment].some(params => params.has('error') || params.has('error_code')),
  callback: query.has('code'),
};
const client = !window.pawCloud?.demo && location.protocol !== 'file:' && config?.url && config.key && window.supabase
  ? window.supabase.createClient(config.url, config.key, {auth: {flowType: 'pkce'}})
  : null;

async function checked(request) {
  const {data, error} = await request;
  if (error) throw error;
  return data;
}

async function allRows(query) {
  const result = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const page = await checked(query().range(offset, offset + pageSize - 1));
    result.push(...page);
    if (page.length < pageSize) return result;
  }
}

async function insertMessage(table, message) {
  const columns = Object.hasOwn(message, 'topic') ? 'body,topic' : 'body';
  const [inserted] = await checked(client.from(table)
    .upsert(message, {onConflict: 'id', ignoreDuplicates: true}).select(columns));
  const receipt = inserted ?? await checked(client.from(table).select(columns).eq('id', message.id).single());
  if (receipt.body !== message.body || receipt.topic !== message.topic) {
    throw Object.assign(new Error('An earlier draft was already sent'), {code: 'EARLIER_DRAFT_SENT'});
  }
}

window.pawCloud ??= {
  ready: Boolean(client),
  authReturn,
  providers: config?.providers ?? [],
  getSession: async () => (await checked(client.auth.getSession())).session,
  onAuthChange: callback => client.auth.onAuthStateChange((event, session) => {
    setTimeout(() => callback(event, session), 0);
  }),
  signIn: async provider => {
    const data = await checked(client.auth.signInWithOAuth({
      provider, options: {redirectTo: config.redirectTo, skipBrowserRedirect: true},
    }));
    return data.url;
  },
  signOut: () => checked(client.auth.signOut({scope: 'local'})),
  profile: () => checked(client.from('paw_profiles').select('id,display_name,region,saved_walks').maybeSingle()),
  saveProfile: (id, fields, creating) => {
    const table = client.from('paw_profiles');
    const query = creating ? table.upsert({id, ...fields}) : table.update(fields).eq('id', id);
    return checked(query.select('id,display_name,region,saved_walks').single());
  },
  pets: () => allRows(() => client.from('paw_pets').select('id,name,kind,breed').order('created_at').order('id')),
  records: () => allRows(() => client.from('paw_records').select('id,pet_id,type,value,note,record_date,next_date')
    .order('record_date', {ascending: false}).order('created_at', {ascending: false}).order('id')),
  savePet: pet => checked(client.from('paw_pets').upsert(pet).select('id,name,kind,breed').single()),
  addRecord: record => checked(client.from('paw_records').upsert(record, {onConflict: 'id', ignoreDuplicates: true})),
  importPets: pets => checked(client.from('paw_pets').upsert(pets, {onConflict: 'id', ignoreDuplicates: true})),
  importRecords: records => checked(client.from('paw_records').upsert(records, {onConflict: 'id', ignoreDuplicates: true})),
  posts: async (region, topic, cursor, userId) => {
    let query = client.from('paw_posts')
      .select('id,author_id,display_name,region,topic,body,created_at,paw_comments(count),paw_likes(count)')
      .eq('region', region).order('created_at', {ascending: false}).order('id', {ascending: false}).limit(30);
    if (topic !== 'all') query = query.eq('topic', topic);
    if (cursor) query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
    const posts = await checked(query);
    if (!posts.length) return {posts, likes: []};
    const likes = await checked(client.from('paw_likes').select('post_id').in('post_id', posts.map(post => post.id)).eq('user_id', userId));
    return {posts, likes: likes.map(like => like.post_id)};
  },
  addPost: post => insertMessage('paw_posts', post),
  replies: postId => checked(client.from('paw_comments').select('id,author_id,display_name,body,created_at').eq('post_id', postId)
    .order('created_at', {ascending: false}).order('id', {ascending: false}).limit(80)),
  addReply: reply => insertMessage('paw_comments', reply),
  addLike: postId => checked(client.from('paw_likes').upsert({post_id: postId}, {onConflict: 'post_id,user_id', ignoreDuplicates: true})),
  removeLike: (postId, userId) => checked(client.from('paw_likes').delete().eq('post_id', postId).eq('user_id', userId)),
};
