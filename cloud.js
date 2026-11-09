'use strict';

const config = window.pawprintConfig;
const client = location.protocol !== 'file:' && config?.url && config.key && window.supabase
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

window.pawCloud = {
  ready: Boolean(client),
  providers: config?.providers ?? [],
  getSession: async () => (await checked(client.auth.getSession())).session,
  onAuthChange: callback => client.auth.onAuthStateChange((event, session) => {
    setTimeout(() => callback(event, session), 0);
  }),
  signIn: provider => checked(client.auth.signInWithOAuth({provider, options: {redirectTo: config.redirectTo}})),
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
  addPost: post => checked(client.from('paw_posts').upsert(post, {onConflict: 'id', ignoreDuplicates: true})),
  replies: postId => checked(client.from('paw_comments').select('id,author_id,display_name,body,created_at').eq('post_id', postId)
    .order('created_at', {ascending: false}).order('id', {ascending: false}).limit(80)),
  addReply: reply => checked(client.from('paw_comments').upsert(reply, {onConflict: 'id', ignoreDuplicates: true})),
  addLike: postId => checked(client.from('paw_likes').upsert({post_id: postId}, {onConflict: 'post_id,user_id', ignoreDuplicates: true})),
  removeLike: (postId, userId) => checked(client.from('paw_likes').delete().eq('post_id', postId).eq('user_id', userId)),
};
