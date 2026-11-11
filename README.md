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
