# 爪印日记

[正式版](https://lisayinyy.github.io/pawprint/) · [免登录体验](https://lisayinyy.github.io/pawprint/?demo=1)

- 宠物档案、成长时间线、护理待办、日历提醒、看诊摘要与照护交接单。
- 港岛、九龙及新界的宠物共享公园可按名址检索，资料来自[香港康乐及文化事务署](https://www.lcsd.gov.hk/clpss/tc/webApp/Facility/Details.do?ftid=165)。
- 同区动态、试走卡、路线收藏、分时段复走反馈和互助后续。
- 正式版用 GitHub 登录，记录同步到 Supabase。免登录体验用标签页数据。

## 发布

前端由 GitHub Pages 从 `main` 根目录发布。数据库变更先在 Supabase 应用，再发布依赖新结构的前端。保持 `cloud-config.js` 的登录回跳地址与 Pages 地址一致。

本地可用 `python3 -m http.server 8765` 启动，再打开 `/?demo=1` 测试。免登录流程支持发帖、评论和复走，操作仅保存在当前标签页。

家庭照护使用独立的共享记录。主人从「家庭照护」为宠物开启共管，复制一次性邀请链接给家人。家人登录后接受邀请。每条记录显示记录人和照护时间，已有的私人档案仍仅主人可见。

## 结构

```text
index.html / style.css        页面骨架、图标与样式（无构建步骤）
cloud-config.js               Supabase 项目地址、可公开的 publishable key、登录回跳地址
cloud.js                      正式版数据层（Supabase Auth + PostgREST + Realtime）
demo.js                       免登录体验的数据层，接口与 cloud.js 相同，数据只存在 sessionStorage
app.js                        档案、时间线、社区与对话框
features.js / family.js       路线卡、看诊摘要、日历提醒 / 家庭照护
parks.js                      康文署宠物共享公园名录
supabase/migrations/          表结构、行级安全策略与 RPC，按文件名顺序应用
supabase/tests/               权限回归测试
```

## 谁能读写什么

`cloud-config.js` 里的 key 是公开的，数据边界完全由数据库里的行级安全策略决定：

- 个人资料、宠物档案和成长记录：只有本人可读写。
- 社区动态、评论、点赞：只对资料里所选地区相同的登录用户可见；发帖和评论的昵称、地区必须与本人资料一致，作者和发布时间由数据库填写。
- 家庭照护：主人和已接受邀请的在册成员可读、可新增记录；邀请码只存哈希、48 小时有效、仅供一人使用；主人移除成员后对方立即失去访问。成员看不到主人的私人档案。
- 未登录访客不能读取任何表。

改动 `supabase/migrations/` 后先跑权限测试，再到 Supabase 应用：

```bash
cd supabase/tests
npm ci
npm test    # 在内存 Postgres（PGlite）里按顺序应用全部迁移，再以不同用户身份逐条验证
```
