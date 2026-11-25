# 爪印日记

给香港养宠人的宠物日记与同区社区：一个没有构建步骤的静态网页，直接连 Supabase；前端拿到的 key 是公开的，谁能读写什么全部由数据库的行级安全策略决定，并有测试守着。

[正式版](https://lisayinyy.github.io/pawprint/) · [免登录体验](https://lisayinyy.github.io/pawprint/?demo=1)

它的前身是单文件原型 [pettrail](https://github.com/Lisayinyy/pettrail)。

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
supabase/tests/rls.test.mjs   权限回归测试（以不同用户身份逐条读写）
supabase/tests/invariants.sql 全库权限不变量（只读的系统表查询，每行是一处违规）
```

## 谁能读写什么

`cloud-config.js` 里的 key 是公开的，数据边界完全由数据库里的行级安全策略决定：

- 个人资料、宠物档案和成长记录：只有本人可读写。
- 社区动态、评论、点赞：只对资料里所选地区相同的登录用户可见；发帖和评论的昵称、地区必须与本人资料一致，作者和发布时间由数据库填写。
- 家庭照护：主人和已接受邀请的在册成员可读、可新增记录；邀请码只存哈希、48 小时有效、仅供一人使用；主人移除成员后对方立即失去访问。成员看不到主人的私人档案。
- 未登录访客在任何表、任何函数上都没有权限。

## 权限测试

改动 `supabase/migrations/` 后先跑测试，再到 Supabase 应用：

```bash
cd supabase/tests
npm ci
npm test    # 在内存 Postgres（PGlite）里按顺序应用全部迁移，再逐条验证；11 个用例，约 2 秒
```

测试分两层：

- **行为**（`rls.test.mjs`）：以主人、同区用户、异区用户、被邀请的家人、被移除的家人、未登录访客的身份实际执行读写，包括冒充作者、改发布时间、重放邀请码、用空格绕过长度上限，以及按前端真实发出的 upsert 语句去覆盖别人的行。
- **不变量**（`invariants.sql`）：一条查询扫描 `public` 和 `paw_private` 的系统表，列出所有违规：表没开行级安全、开了却没有策略、策略不是只给登录用户、未登录角色在表/列/函数/私有 schema 上有任何权限、登录用户拿到 TRUNCATE 之类的表级权限、函数没固定 `search_path`、对外 schema 里出现 `SECURITY DEFINER` 函数。另有一个用例把登录用户的全部授权（哪张表、哪种操作、哪些列）逐项钉住，迁移改了授权就必须同时改这份清单。

不变量这一层是为「以后新加的表和函数」准备的。验证方法：往迁移末尾各加一处常见疏漏（共 10 种，例如新表忘了 `enable row level security`、新函数忘了 `revoke`、给未登录角色多授了一列），看测试会不会失败：

| | 抓到的疏漏 |
|---|---|
| 只有行为测试（7 个用例） | 2 / 10 |
| 加上不变量和授权清单（11 个用例） | 10 / 10 |

当前五个迁移应用后不变量查询返回 0 行；同一份 `invariants.sql` 在本机真实的 PostgreSQL 17 上重放迁移后也返回 0 行。它只读系统表，可以直接贴进 Supabase 的 SQL 编辑器检查线上库（项目里如果还有别的应用，结果里可能出现它们的对象）。

## 已知限制

- 测试里的 `auth` schema、角色和默认授权是按 Supabase 的初始化脚本仿的替身，没有经过真实的 PostgREST、Auth 和 Realtime；分页过滤、嵌套计数这些 PostgREST 语法不在测试范围内。
- 帖子和评论发出后不能删除或举报，没有发帖限流。
- 昵称不唯一，同区内可以取和别人一样的昵称。
- 家庭照护的成员不能自己退出，只能由主人移除。
- 前端没有自动化测试，页面流程是在浏览器里手动检查的。

## 参考

- 不变量查询的写法来自 Supabase 数据库检查器 [supabase/splinter](https://github.com/supabase/splinter) 的 `lints/`（0007、0008、0011、0013、0028、0029）：每条规则是一条系统表查询，返回的每一行是一处问题。这里按本项目收紧（未登录角色不应有任何权限），并合成一份可在测试和线上共用的查询。
- 「整个 schema 都开了行级安全」作为一条测试、以及切换身份的方式，参考 [usebasejump/supabase-test-helpers](https://github.com/usebasejump/supabase-test-helpers)（`tests.rls_enabled`、`tests.authenticate_as`）和 Supabase 文档的 pgTAP 测试指南。试过在 PGlite 里直接加载 pgTAP，能跑，但没有采用：断言结果是 TAP 文本，还得再解析一遍才能让 `node --test` 失败，而普通查询写成的不变量既能在测试里断言「0 行」，也能原样拿到线上库执行。
- 测试替身里的角色、默认授权和 `auth.uid()` 取自 [supabase/postgres](https://github.com/supabase/postgres) 的初始化脚本和 [supabase/auth](https://github.com/supabase/auth) 的迁移。
