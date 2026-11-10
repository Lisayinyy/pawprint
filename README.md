# 爪印日记

[正式版](https://lisayinyy.github.io/pawprint/) · [免登录体验](https://lisayinyy.github.io/pawprint/?demo=1)

- 宠物档案、成长时间线、护理待办、日历提醒、看诊摘要与照护交接单。
- 同区动态、试走卡、路线收藏、分时段复走反馈和互助后续。
- 正式版用 GitHub 登录，记录同步到 Supabase。免登录体验用标签页数据。

## 发布

前端由 GitHub Pages 从 `main` 根目录发布。数据库变更先在 Supabase 应用，再发布依赖新结构的前端。保持 `cloud-config.js` 的登录回跳地址与 Pages 地址一致。

本地可用 `python3 -m http.server 8765` 启动，再打开 `/?demo=1` 测试。免登录流程支持发帖、评论和复走，操作仅保存在当前标签页。
