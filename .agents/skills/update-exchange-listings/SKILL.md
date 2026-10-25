---
name: update-exchange-listings
description: 核查七家交易所及 Binance Alpha、Wallet 的新币和新合约公告，按北京时间整理、去重、更新 JSON 与搜索索引并部署 GitHub Pages。用于 Jessie 的 exchange-listings 网站每日更新、历史补漏、来源核验及发布故障处理。
---

# 更新交易所上新网站

使用仓库 `jessiiiess/exchange-listings`，分支 `main`，网站 https://jessiiiess.github.io/exchange-listings/ 。每次先通过 GitHub 连接读取最新 `docs/DAILY-WORKFLOW.md`、本 Skill 的仓库副本 `.agents/skills/update-exchange-listings/SKILL.md` 和所需数据。本地不存在时取回或克隆；不依赖上次会话临时路径、缓存、凭据或 commit SHA。按 [来源说明](references/sources.md) 核查。用户已授权日常数据更新与网站发布，无需每次再次请求发布许可。

1. 用 `Asia/Shanghai` 取得执行当天 D。核查 D 当日截至实际执行时刻的公告，同时补查 D−1 全天及其前一日 18:00 后的跨日候选。历史单日窗口为 `[D−1 18:00, D+1 00:00)`；未到来的时段不得标为已检查。使用日期库计算边界。
2. 先读 D、D−1 和必要的更早文件。按公告发布时间归档。来源只有上线时间时记录 `timeBasis: listingTime`，不能伪装成公告时间。跨日候选已在原日期收录时不要复制到新一天，遗漏公告回补所属日期。
3. 覆盖 Binance、OKX、Bybit、KuCoin、Gate.io、Bitget、MEXC，独立核查 Binance Alpha 和 Wallet。以官方正文及有语义说明的官方 API 为主；X 只能辅助发现线索。分页直至覆盖下界，验证每页日期和标题确实变化。
4. 包含现货、永续、股票及股指永续、TradFi/CFD、全仓/逐仓杠杆、闪兑、跟单新增对、Meme+、AI 区首发。跳过竞赛、AMA、维护、定投支持、手续费调整、下架、奖励活动、充提暂停；混合公告提取真实上线内容。
5. 核实代币全称、代码、交易对、产品类型、最高杠杆、专区、开盘时间及原文链接。区分股票和股指、公告和开盘时间、盘前和正式合约。按规范 URL + 产品类型 + 交易对去重，不能只按币名去重。同公告修改开盘时间时更新原条目，不复制。
6. 合并 `data/YYYY-MM-DD.json`，保留 `date`、带时区的 `updatedAt`、七家 `exchanges.*.listings` 及 `binance.alpha/wallet`。条目保留 `token/type/detail/url`。能核实则补 `announcedAt/launchAt/timeBasis`；无法核实不填假零点。尚未单独渲染的时间同时写入 detail，标明 UTC+8。
7. 为检查的来源记录 `verification`：实际检查时间、窗口、来源、状态、覆盖范围及限制。请求失败、摘要搜索、分页不全不能证明无上新。Alpha 按 listingTime 检查全部返回记录，包含 offline；onlineTge 布尔值不是 Wallet 活动日期。Wallet 未取得完整历史时保留 `partial_check`，不能断言无新增。
8. 条目变化时执行 `node scripts/build-search-index.js`；检查 JSON、字段、链接、时区、去重、索引一致性。不要运行旧 `scripts/scraper.js` 覆盖核查结果。新增状态如需前端支持，最小修改 renderer，让用户看见“待核实”，不顺带重做 UI。
9. 提交数据、索引及必要兼容修改。优先使用已连接的 GitHub：读取最新 head，基于最新 tree 创建 tree/commit，使用 expected_sha 更新 main；并发冲突重读合并，不强推。已认证的本地 Git 也可正常 commit/push。CLI 无凭据时用连接；本地 commit 不等于上线。
10. 检查本次 commit 的 GitHub Actions `Deploy to GitHub Pages` 成功，再取线上 JSON/索引/必要的 app.js 对照，可加 cache-busting 参数。区分已提交、部署中、已上线。失败时保留已核实成果、说明失败环节，不把失败发布为无新增。

用中文报告网站链接、新增/修订数、补漏日期、来源限制和部署结果。每日任务从北京时间 18:30 开始，完成时间取决于核查与部署。当天晚间公告下次补回，不能在 18:30 声称覆盖完整一天。
