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
  const columns = Object.hasOwn(message, 'topic') ? 'body,topic,route' : 'body';
  const [inserted] = await checked(client.from(table)
    .upsert(message, {onConflict: 'id', ignoreDuplicates: true}).select(columns));
  const receipt = inserted ?? await checked(client.from(table).select(columns).eq('id', message.id).single());
  const sameRoute = message.route
    ? receipt.route && Object.entries(message.route).every(([key, value]) => receipt.route[key] === value)
    : !receipt.route;
  if (receipt.body !== message.body || receipt.topic !== message.topic || !sameRoute) {
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
  editRecord: (id, fields) => checked(client.from('paw_records').update(fields).eq('id', id).select('id').single()),
  deleteRecord: id => checked(client.from('paw_records').delete().eq('id', id)),
  saveBookmark: (postId, userId, saved) => {
    const table = client.from('paw_bookmarks');
    return checked(saved ? table.upsert({post_id: postId}, {onConflict: 'user_id,post_id', ignoreDuplicates: true})
      : table.delete().eq('post_id', postId).eq('user_id', userId));
  },
  logWalk: fields => checked(client.rpc('paw_log_walk', fields)),
  saveOutcome: (postId, replyId, outcome) => checked(client.rpc('paw_save_outcome', {
    p_post: postId, p_reply: replyId, p_outcome: outcome,
  })),
  careCircles: () => checked(client.from('paw_care_circles').select('id,owner_id,pet_name').order('pet_name').order('id')),
  createCare: pet => checked(client.from('paw_care_circles')
    .upsert({id: pet.id, pet_name: pet.name}, {onConflict: 'id', ignoreDuplicates: true})),
  careMembers: circleId => checked(client.from('paw_care_members').select('user_id,display_name')
    .eq('circle_id', circleId).eq('active', true).order('display_name')),
  careEvents: circleId => checked(client.from('paw_care_events').select('id,author_id,display_name,kind,detail,happened_at')
    .eq('circle_id', circleId).order('happened_at', {ascending: false}).order('created_at', {ascending: false}).order('id').limit(50)),
  addCareEvent: async event => {
    const table = client.from('paw_care_events');
    const [inserted] = await checked(table.upsert(event, {onConflict: 'id', ignoreDuplicates: true}).select('id'));
    if (inserted) return;
    const saved = await checked(table.select('circle_id,kind,detail,happened_at').eq('id', event.id).single());
    if (saved.circle_id !== event.circle_id || saved.kind !== event.kind || saved.detail !== event.detail ||
        new Date(saved.happened_at).valueOf() !== new Date(event.happened_at).valueOf()) {
      throw new Error('A different version of the care record was already saved');
    }
  },
  issueCareInvite: (circleId, code) => checked(client.rpc('paw_issue_care_invite', {p_circle: circleId, p_code: code})),
  cancelCareInvite: circleId => checked(client.rpc('paw_cancel_care_invite', {p_circle: circleId})),
  acceptCareInvite: code => checked(client.rpc('paw_accept_care_invite', {p_code: code})),
  removeCareMember: (circleId, memberId) => checked(client.from('paw_care_members').update({active: false})
    .eq('circle_id', circleId).eq('user_id', memberId).select('user_id').single()),
  watchCare: (userId, circleId, refresh) => {
    const channel = client.channel(`family:${crypto.randomUUID()}`);
    const watch = (table, filter, event = '*') =>
      channel.on('postgres_changes', {event, schema: 'public', table, filter}, refresh);
    watch('paw_care_members', `user_id=eq.${userId}`);
    if (circleId) {
      watch('paw_care_members', `circle_id=eq.${circleId}`);
      watch('paw_care_events', `circle_id=eq.${circleId}`, 'INSERT');
    }
    channel.subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
    return () => void client.removeChannel(channel);
  },
  importPets: pets => checked(client.from('paw_pets').upsert(pets, {onConflict: 'id', ignoreDuplicates: true})),
  importRecords: records => checked(client.from('paw_records').upsert(records, {onConflict: 'id', ignoreDuplicates: true})),
  posts: async (region, topic, cursor, userId, tag) => {
    const bookmark = topic === 'saved' ? 'paw_bookmarks!inner(post_id)' : 'paw_bookmarks(post_id)';
    let query = client.from('paw_posts')
      .select(`id,author_id,display_name,region,topic,body,created_at,route,outcome,outcome_reply,paw_comments!paw_comments_post_id_fkey(count),paw_likes(count),${bookmark}`)
      .eq('region', region).order('created_at', {ascending: false}).order('id', {ascending: false}).limit(30);
    if (!['all', 'saved'].includes(topic)) query = query.eq('topic', topic);
    if (tag !== 'all') query = query.eq('route->>tag', tag);
    if (cursor) query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
    const posts = await checked(query);
    if (!posts.length) return {posts, likes: []};
    const likes = await checked(client.from('paw_likes').select('post_id').in('post_id', posts.map(post => post.id)).eq('user_id', userId));
    return {posts, likes: likes.map(like => like.post_id)};
  },
  addPost: post => insertMessage('paw_posts', post),
  replies: postId => checked(client.from('paw_comments').select('id,author_id,display_name,body,created_at,walk_date,walk_slot').eq('post_id', postId)
    .order('created_at', {ascending: false}).order('id', {ascending: false}).limit(80)),
  addReply: reply => insertMessage('paw_comments', reply),
  addLike: postId => checked(client.from('paw_likes').upsert({post_id: postId}, {onConflict: 'post_id,user_id', ignoreDuplicates: true})),
  removeLike: (postId, userId) => checked(client.from('paw_likes').delete().eq('post_id', postId).eq('user_id', userId)),
};
