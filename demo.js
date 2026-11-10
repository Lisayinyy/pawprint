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
      samplePost('preview-post-2', '阿桃与椰子', '港岛', 'walk', '分享一条周末散步思路：从海旁出发，遇到人多就转进安静的小路。最后找个阴凉处坐十分钟，让椰子自己闻一会儿。', 1, 5),
      samplePost('preview-post-3', '豆沙包', '九龙', 'help', '最近想给豆沙做一份成长时间线。除了体重，你们最常记的是哪些小事？', 1, 2),
      samplePost('preview-post-4', '栗子散步中', '新界', 'walk', '栗子喜欢走有树荫的路线。我们通常边走边停，给它留够探索的时间。', 2, 4),
    ],
    replies: [
      {id: 'preview-reply-1', post_id: 'preview-post-1', author_id: 'preview-post-2-author', display_name: '阿桃与椰子', body: '椰子也是！人少的时候它会慢下来闻草地。', created_at: ago(0)},
    ],
    likes: [],
  };

  let data = initial;
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (saved?.profile?.id === user.id && ['pets', 'records', 'posts', 'replies', 'likes'].every(key => Array.isArray(saved[key]))) {
      data = saved;
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
    posts: async (region, topic, cursor) => {
      const matching = data.posts.filter(post => post.region === region && (topic === 'all' || post.topic === topic));
      const start = cursor ? matching.findIndex(post => post.id === cursor.id) + 1 : 0;
      return {
        likes: data.likes.slice(),
        posts: matching.slice(start, start + 30).map(post => ({
          ...post,
          paw_comments: [{count: data.replies.filter(reply => reply.post_id === post.id).length}],
          paw_likes: [{count: (post.likes ?? 0) + Number(data.likes.includes(post.id))}],
        })),
      };
    },
    replies: async postId => data.replies.filter(reply => reply.post_id === postId),
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
