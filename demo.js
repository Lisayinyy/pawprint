'use strict';

if (new URLSearchParams(location.search).get('demo') === '1') {
  const storageKey = 'pawprint.preview.v1';
  const user = {id: 'preview-visitor'};
  const petId = 'preview-pet-mochi';
  const ago = days => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
  };
  const day = days => {
    const date = new Date(ago(days));
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const sampleRecord = (id, type, value, date, note = '', next_date = null) =>
    ({id, pet_id: petId, type, value, record_date: date, note, next_date});
  const samplePost = (id, display_name, region, topic, body, days, likes) =>
    ({id, author_id: id + '-author', display_name, region, topic, body, created_at: ago(days), likes});
  const withRoute = (post, name, start, finish, minutes, slot, tag) => ({
    ...post, route: {name, start, finish, minutes, slot, tag, date: day(1)},
  });
  const initial = {
    profile: {id: user.id, display_name: '体验访客', region: '港岛', saved_walks: []},
    pets: [{id: petId, name: '麻糬', kind: 'dog', breed: '柴犬'}],
    records: [
      sampleRecord('preview-moment', 'moment', '第一次在海边看日落', day(0), '走到最后一段，麻糬停下来吹了好一会儿海风。'),
      sampleRecord('preview-weight-3', 'weight', '8.4', day(2), '在早餐前称的。'),
      sampleRecord('preview-care', 'care', '体外护理', day(6), '已记录护理安排。', day(-6)),
      sampleRecord('preview-weight-2', 'weight', '8.1', day(11)),
      sampleRecord('preview-vaccine', 'vaccine', '年度疫苗记录', day(20), '已存档接种记录。'),
      sampleRecord('preview-weight-1', 'weight', '7.8', day(27)),
    ],
    posts: [
      samplePost('preview-post-1', '米粒的周末', '港岛', 'daily', '今天把散步时间提早了一点，米粒在海边和一只同龄柴犬玩了好久。大家的狗狗也更喜欢早上的海风吗？', 0, 3),
      withRoute(samplePost('preview-post-2', '阿桃与椰子', '港岛', 'walk', '我们走得很慢，选了海边一段短路，中途留了时间闻风。', 1, 5),
        '海滨短走', '海滨长廊入口', '海旁休息亭', 20, 'morning', 'stepfree'),
      withRoute(samplePost('preview-post-5', '小麦周记', '港岛', 'walk', '喜欢傍晚走这段，折返也方便。', 2, 2),
        '公园小环线', '公园正门', '林荫休息区', 15, 'evening', 'shade'),
      {...samplePost('preview-post-help', '体验访客', '港岛', 'help', '下雨时，怕生的小狗可以去哪走一小圈？', 0, 1), author_id: user.id},
      samplePost('preview-post-3', '豆沙包', '九龙', 'help', '最近想给豆沙做一份成长时间线。除了体重，你们最常记的是哪些小事？', 1, 2),
      withRoute(samplePost('preview-post-4', '栗子散步中', '新界', 'walk', '栗子喜欢走有树荫的路线。我们通常边走边停，给它留够探索的时间。', 2, 4),
        '树荫散步线', '公园指示牌', '树荫长椅', 25, 'afternoon', 'shade'),
    ],
    replies: [
      {id: 'preview-help-reply', post_id: 'preview-post-help', author_id: 'preview-post-2-author', display_name: '阿桃与椰子', body: '可以先找一段有盖的公共步道，选人少的时候短走试试。', created_at: ago(0)},
      {id: 'preview-walk-reply', post_id: 'preview-post-2', author_id: 'preview-post-5-author', display_name: '小麦周记', body: '下午人会多一点，想安静的话可以试试早上。', created_at: ago(0), walk_date: day(0), walk_slot: 'afternoon'},
      {id: 'preview-reply-1', post_id: 'preview-post-1', author_id: 'preview-post-2-author', display_name: '阿桃与椰子', body: '椰子也是！人少的时候它会慢下来闻草地。', created_at: ago(0)},
    ],
    likes: [],
    bookmarks: [],
    careCircles: [{id: petId, owner_id: user.id, pet_name: '麻糬'}],
    careEvents: [
      {id: 'preview-care-walk', circle_id: petId, author_id: 'preview-family', display_name: '家人小林', kind: 'walk', detail: '出门散步 20 分钟', happened_at: ago(0)},
      {id: 'preview-care-meal', circle_id: petId, author_id: user.id, display_name: '体验访客', kind: 'meal', detail: '晚餐 45 克', happened_at: ago(1)},
    ],
  };

  let data = initial;
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (saved?.profile?.id === user.id && ['pets', 'records', 'posts', 'replies', 'likes'].every(key => Array.isArray(saved[key]))) {
      data = {...initial, ...saved, bookmarks: saved.bookmarks ?? []};
      for (const post of initial.posts) {
        const previous = data.posts.find(item => item.id === post.id);
        if (!previous) data.posts.push(post);
        else if (!previous.route && post.route) previous.route = post.route;
      }
      for (const reply of initial.replies) {
        if (!data.replies.some(item => item.id === reply.id)) data.replies.push(reply);
      }
    }
  } catch {
    // The preview can run in memory when tab storage is unavailable.
  }
  function persist() {
    try { sessionStorage.setItem(storageKey, JSON.stringify(data)); } catch { /* keep in memory */ }
  }
  function upsert(list, row) {
    const index = list.findIndex(item => item.id === row.id);
    if (index === -1) list.unshift(row);
    else list[index] = row;
    persist();
    return row;
  }

  window.pawCloud = {
    demo: true,
    ready: true,
    providers: [],
    getSession: async () => ({user}),
    onAuthChange: () => {},
    profile: async () => data.profile,
    saveProfile: async (_, fields) => {
      data.profile = {...data.profile, ...fields};
      persist();
      return data.profile;
    },
    pets: async () => data.pets.slice(),
    records: async () => data.records.slice().sort((a, b) => b.record_date.localeCompare(a.record_date)),
    savePet: async pet => upsert(data.pets, pet),
    addRecord: async record => upsert(data.records, record),
    editRecord: async (id, fields) => upsert(data.records, {...data.records.find(item => item.id === id), ...fields}),
    deleteRecord: async id => {
      data.records = data.records.filter(item => item.id !== id);
      persist();
    },
    saveBookmark: async (postId, _, saved) => {
      data.bookmarks = data.bookmarks.filter(id => id !== postId);
      if (saved) data.bookmarks.push(postId);
      persist();
    },
    logWalk: async ({p_id, p_post, p_pet, p_date, p_slot, p_minutes, p_feedback}) => {
      const route = data.posts.find(item => item.id === p_post).route;
      upsert(data.records, {id: p_id, pet_id: p_pet, type: 'walk', value: route.name,
        record_date: p_date, note: `${p_minutes} 分钟`, next_date: null});
      if (p_feedback) upsert(data.replies, {id: p_id, post_id: p_post, author_id: user.id,
        display_name: data.profile.display_name, body: p_feedback, created_at: ago(0), walk_date: p_date, walk_slot: p_slot});
    },
    saveOutcome: async (postId, replyId, outcome) => {
      const post = data.posts.find(item => item.id === postId);
      upsert(data.posts, {...post, outcome, outcome_reply: replyId});
    },
    careCircles: async () => data.careCircles.slice(),
    createCare: async pet => upsert(data.careCircles, {id: pet.id, owner_id: user.id, pet_name: pet.name}),
    careMembers: async id => id === petId && !data.previewFamilyRemoved ? [{user_id: 'preview-family', display_name: '家人小林'}] : [],
    careEvents: async id => data.careEvents.filter(item => item.circle_id === id)
      .sort((a, b) => b.happened_at.localeCompare(a.happened_at)).slice(0, 50),
    addCareEvent: async item => upsert(data.careEvents, {...item, author_id: user.id}),
    issueCareInvite: async () => {},
    cancelCareInvite: async () => {},
    removeCareMember: async () => { data.previewFamilyRemoved = true; persist(); },
    watchCare: () => () => {},
    posts: async (region, topic, cursor, _userId, tag) => {
      const matching = data.posts.filter(post => post.region === region &&
        (tag === 'all' || post.route?.tag === tag) &&
        (topic === 'all' || post.topic === topic || (topic === 'saved' && data.bookmarks.includes(post.id))))
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
      const start = cursor ? matching.findIndex(post => post.id === cursor.id) + 1 : 0;
      return {
        likes: data.likes.slice(),
        posts: matching.slice(start, start + 30).map(post => ({
          ...post,
          paw_bookmarks: data.bookmarks.includes(post.id) ? [{post_id: post.id}] : [],
          paw_comments: [{count: data.replies.filter(reply => reply.post_id === post.id).length}],
          paw_likes: [{count: (post.likes ?? 0) + Number(data.likes.includes(post.id))}],
        })),
      };
    },
    replies: async postId => data.replies.filter(reply => reply.post_id === postId).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    addPost: async post => upsert(data.posts, {...post, author_id: user.id, created_at: ago(0)}),
    addReply: async reply => upsert(data.replies, {...reply, author_id: user.id, created_at: ago(0)}),
    addLike: async postId => {
      if (!data.likes.includes(postId)) data.likes.push(postId);
      persist();
    },
    removeLike: async postId => {
      data.likes = data.likes.filter(id => id !== postId);
      persist();
    },
  };
}
