# 来源与字段说明

以下旧流程端点均须现场验证响应、分页和字段语义；只有 Alpha 接口在此次流程中实际调用验证。不得把候选端点当成永久可用保证。以官方正文核实细节，不拼造 slug。

| 来源 | 官方入口与候选接口 |
| --- | --- |
| Binance | https://www.binance.com/en/support/announcement/list/48 ；候选 `https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&catalogId=48&pageNo=1&pageSize=20`，title/code/releaseDate 毫秒，详情 `/en/support/announcement/detail/{code}`。另补杠杆、闪兑、跟单分类。 |
| Gate | https://www.gate.com/zh/announcements/newspotlistings 、 https://www.gate.com/zh/announcements/newfutureslistings 、 https://www.gate.com/zh/announcements/tradfi ，另补 https://www.gate.com/zh/announcements/cfd 。tradfi 曾显示通用列表，须看实际内容。 |
| MEXC | https://www.mexc.com/zh-TW/announcements/new-listings ，验证 `?page=N` 真正换页；曾出现重复页。日期可能位于父容器且没有时分，不能据此声称边界精确覆盖。 |
| Bitget | 现货 https://www.bitget.com/support/sections/5955813039257 、合约 https://www.bitget.com/support/sections/12508313405000 ；support 分类与 sitemap 补查跟单、杠杆、CFD。候选 `https://api.bitget.com/api/v2/public/annoucements?language=zh_CN&annType=coin_listings&limit=10`（保留 annoucements 拼法），旧流程 cTime 毫秒、limit 最大 10，须核实与补翻页。 |
| OKX | https://www.okx.com/help/section/announcements-new-listings ；`https://www.okx.com/api/v5/public/instruments?instType=SWAP` 与 SPOT 可辅助发现；listTime 是上线时间，不能当公告时间。核实产品分类，不把 xstock 现货写成永续。 |
| Bybit | https://announcements.bybit.com/en/?category=new_crypto ；候选 `https://api.bybit.com/v5/announcements/index?locale=zh-TW&type=new_crypto&limit=20`，旧流程 result.list/publishTime 毫秒。补查其他产品分类。 |
| KuCoin | https://www.kucoin.com/announcement/new-listings ；候选 `https://www.kucoin.com/_api/cms/articles?page=1&pageSize=50&category=new-listings&lang=en_US`，旧流程 publish_ts 为秒，先检验再转换。 |

## Alpha：实际验证的官方来源

GET https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list

说明入口：https://developers.binance.com/en/docs/catalog/advanced-trading-alpha-trading/api/rest-api/market-data

2026-10-26 00:49（UTC+8）成功返回 code=000000，data 共 685 条，均有 listingTime，含 306 条 offline。最新是 Axis Robotics (AXIS)，2026-10-21 19:00（UTC+8）；目标 `[2026-10-24 18:00, 2026-10-26 00:00)` 零匹配。这是历史样例，以后必须重新请求，不能复用计数、最新币或时间。

读取全量响应，以 listingTime 毫秒转北京时间，保留 offline。用 chainId + 合约地址区分重名币。记录 recordsChecked、missingListingTime、includesOfflineRecords、windowStart/End、checkedAt、latestListing 和 sources。当前快照不能保证所有已删除历史，零匹配使用 `no_matches_in_returned_records`。需要长期比较时保存快照，而不是仅对比币数。onlineTge 为当前属性，不是活动日期。

## Wallet：保留覆盖限制

优先官方 App Alpha Events/TGE/Pre-TGE 活动详情、官网和项目原文。辅助渠道为认证 Square https://www.binance.com/en/square/profile/binancewallet 和官方 Telegram https://t.me/s/binance_wallet_announcements 。说明入口：https://www.binance.com/en/learn/binance-alpha-events 及 https://www.binance.com/en/support/faq/detail/5ee2a485f6434f13b1a3581a2d4d7129 。

此次未取得完整历史活动列表。公开渠道有时只提供摘要或最近帖子，不能断言没有活动。Wallet 宣传交易所永续不等于 Wallet TGE。完整历史仍不可得时使用 `partial_check`、实际 checkedAt、sources、limitation、用户可见 emptyMessage。不要把 Alpha 接口的 onlineTge 当作 TGE 发生时间。

## 数据兼容

保留根字段 date/updatedAt/exchanges。exchange keys 为 binance/okx/bybit/kucoin/gateio/bitget/mexc，各有 listings 数组，binance 另有 alpha/wallet 数组。每条至少 token/type/detail/url；已核实时间可加 announcedAt/launchAt/timeBasis。只有日期可用 announcedDate 与精度说明，不编造秒级时间。

verification 应与 listings 平级，避免被索引脚本误作条目。Alpha 已有状态 `no_matches_in_returned_records`，Wallet 已有 `partial_check`；emptyMessage 的前端兼容已在 app.js 实现。其他来源如需待核实提示，先检查并补齐对应 renderer，再发布，不能只写隐藏元数据。
