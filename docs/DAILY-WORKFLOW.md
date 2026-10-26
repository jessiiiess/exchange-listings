# 交易所上新网站更新流程

确认日期：2026-10-26（北京时间）。仓库：https://github.com/jessiiiess/exchange-listings ，网站：https://jessiiiess.github.io/exchange-listings/ 。

## 执行入口

每日自动任务读取仓库最新 `.agents/skills/update-exchange-listings/SKILL.md` 及其 `references/sources.md`，按其中的筛选、时间、来源核查、数据合并和发布规则执行。Skill 同时保存到用户 Skills 工作区。仓库副本保证新任务不用依赖旧会话或临时目录；更改流程时同步两份。

每日北京时间 18:30 启动。先更新当天截至执行时刻的公告，再补齐昨天全天和跨日候选；晚于本次执行的公告在下一次回补原公告日期。18:30 是开始执行时间，核查和部署完成时间随后。历史单日候选窗口为前一天 18:00（含）到次日 00:00（不含），避免漏跨日；按实际公告日期归档并跨文件去重。

## 已完成的迁移与实际工作

1. 阅读用户原 Claude SKILL.md，确认最终需要七家交易所、Binance Alpha、Binance Wallet，沿用日期 JSON、交易所分组、中文展示与网站发布格式；不要求复刻 Playwright 实现。
2. 确认仓库、网站、JSON 结构、搜索索引脚本及 main 分支推送触发的 GitHub Pages 工作流。旧 scraper 不作为此次可靠数据来源，不直接执行覆盖。
3. 补 2026-10-25：收录 Predict.fun (PREDICT) 的 PREDICTUSDT 盘前永续及跟单，最高 5 倍，按修改后的 16:15（UTC+8）开盘时间写入。没有因其他日期公告在 25 日开盘而重复插入旧公告。
4. 重建搜索索引，核对 JSON 与页面兼容。本地 Git 提交成功但 CLI 推送缺少认证，因此改用用户连接的 GitHub 工具，实际提交并更新 main；检查 Actions 成功，再核对公开站点数据。发布提交为 `7b8c67375b1750959c2089d8fa1f150b8fa7686e`。
5. 对 Alpha 调用官方 token list API，685 条记录按 listingTime 核查，保留 offline；所查窗口无匹配，最近 AXIS 于 10-21 19:00 上线。记录实际计数、范围与来源，避免使用 X 作为唯一来源。
6. 对 Wallet 检索官方 Square、Telegram 及活动说明，未得到完整历史 TGE/Pre-TGE 列表。因此只记部分核查，未将“没搜到”当作确定无新增；不把 onlineTge 布尔值当作日期。
7. 在 app.js 给 Alpha/Wallet 空态加入 verification.emptyMessage 支持，旧文件仍使用原默认文本；校验兼容性后发布 `1ee8edf9f11296340f43a543895f4f410c75611b`，检查部署成功，并对照线上 JSON 与 app.js。

这次流程验证了 GitHub 连接写入和 Pages 部署，以及 Alpha 官方接口。其余旧流程 API 仅列作候选，未来运行需重新核实；不能宣称所有来源已建立全自动、完整的接口覆盖。

## 每次发布的交付内容

- `data/YYYY-MM-DD.json`：合并新条目与修订，保留历史条目和核查状态；记录真实更新时间、公告时间精度、开盘时间、交易对、产品、杠杆、专区和官方链接。
- `data/search-index.json`：有条目变化时运行 `node scripts/build-search-index.js`，确保网站搜索能找到新增内容。元数据不得混入索引。
- 必要的前端兼容修改：只在新状态无法正确显示时更改，避免“待核实”被渲染成“无新增”。
- GitHub main commit、对应部署成功记录，以及线上数据验证；仅 commit 成功不能报告已上线。
- 中文运行报告：新增和修订、补漏日期、来源覆盖限制、部署结果及网站链接。没有新增也应报告实际核查结果；失败时说明失败环节。

## 操作与恢复

每次取最新 main/tree，不硬编码旧 SHA。GitHub 连接可读取文件、创建 tree/commit、带 expected_sha 更新分支。并发更新时重读合并，禁止强推；不存储 token 或凭据。本地工作目录可重建，Skills 和仓库记录才是长期入口。

按 JSON 解析、必需字段、时间边界、URL/类型/交易对去重、索引一致性验证数据。部署后读取线上数据，可附缓存参数。API 请求失败、分页重复、正文打不开时保留已核实成果并标注 partial/failed，不能删除已确认内容或制造无新增。若无法部署，报告已提交/未提交/部署失败的准确阶段，下次继续恢复。

有关来源入口、API 时间单位、Alpha 样例与 Wallet 限制，见 Skill 的 `references/sources.md`；自动任务每次都要重新核查实时来源，不复用本次结果。


## 页面展示偏好（2026-10-26 更新，优先于前文展示规则）

按用户要求，交易所、Alpha、Wallet 的空列表统一显示“今日无新币上线”，不显示“待核实”或覆盖范围提示；有条目时也不追加 verification.coverageMessage。保留后台真实 verification 状态、来源和限制供后续补漏，空态文案不代表所有来源已完整核实。日常结果简报不再重复待核实提示；实际发布失败仍如实报告。不要为了页面简洁而删除核查记录或虚构已核实时间。
