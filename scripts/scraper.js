const { chromium } = require('playwright');
const Anthropic = require('@anthropic-ai/sdk').default;
const fs = require('fs');
const path = require('path');

const TODAY = new Date().toISOString().split('T')[0];
const DATA_DIR = path.join(__dirname, '..', 'data');
const anthropic = new Anthropic();

const SYSTEM_PROMPT = `你是一个加密货币交易所公告分析助手。从公告内容中提取新币/新合约/新产品上线信息。

对每条相关公告返回一个 JSON 对象：
- token: 代币名称，格式 "Name (TICKER)" 或纯 TICKER。多个代币用顿号分隔如 "LITE 和 SBUX"
- type: 上线类型，从以下选择：现货上线/合约上线/首发上币/World Premiere 现货/Futures + Payment/首发现货 + 闪兑/现货 + 闪兑/闪兑/盘前转正式合约/Meme+ 区/创新区现货/美股合约/合约 + 跟单/首发上币 AI区
- detail: 具体细节。必须包含有价值的信息如：具体交易开放时间（如 "4/30 19:00 UTC+8 开始交易"）、交易对（如 "MEGA/USDT"）、杠杆倍数（如 "20x 杠杆"）、所属板块等。绝对不要只重复 type 字段。

规则：
1. 只返回新币/新合约/新产品上线相关条目
2. 跳过：交易竞赛、AMA、维护、定投支持、手续费调整、下架、活动奖励类公告
3. 时间信息优先使用 UTC+8 格式
4. 如果公告没有明确写交易时间，写 "时间待定" 而不是编造时间
5. 返回纯 JSON 数组，无其他文字`;

function loadYesterdayData() {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const filePath = path.join(DATA_DIR, `${yesterday}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function getYesterdayTokenKeys(yesterdayData, exchangeKey) {
  if (!yesterdayData || !yesterdayData.exchanges || !yesterdayData.exchanges[exchangeKey]) return new Set();
  const ex = yesterdayData.exchanges[exchangeKey];
  const keys = new Set();
  for (const list of [ex.listings, ex.alpha, ex.wallet].filter(Boolean)) {
    for (const item of list) {
      keys.add(`${item.token}||${item.type}`);
    }
  }
  return keys;
}

function dedup(listings, yesterdayKeys) {
  if (!yesterdayKeys || yesterdayKeys.size === 0) return listings;
  return listings.filter(item => !yesterdayKeys.has(`${item.token}||${item.type}`));
}

async function extractWithClaude(articles, exchangeName) {
  if (!articles || articles.length === 0) return [];

  const content = articles.map((a, i) => {
    const body = a.body ? `\n正文：${a.body.slice(0, 1500)}` : '';
    return `--- 公告 ${i + 1} ---\n标题：${a.title}\nURL：${a.url}${body}`;
  }).join('\n\n');

  const userPrompt = `交易所：${exchangeName}\n今日日期：${TODAY}\n\n以下是该交易所今日相关的公告，请提取新上线信息：\n\n${content}\n\n请返回 JSON 数组（如无相关上线信息则返回空数组 []）：`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: userPrompt }],
      system: SYSTEM_PROMPT,
    });

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map(item => ({
      token: item.token || '',
      type: item.type || '现货上线',
      detail: item.detail || '',
      url: ''
    }));
  } catch (e) {
    console.error(`  Claude API error for ${exchangeName}:`, e.message);
    return [];
  }
}

async function fetchPageContent(page, url, selector) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(2000);
    const content = await page.textContent(selector || 'main').catch(() => null);
    return content ? content.slice(0, 3000) : null;
  } catch (e) {
    return null;
  }
}

// --- Exchange scrapers: collect titles + article content ---

async function scrapeBinance(page) {
  const articles = [];
  try {
    let items = [];
    try {
      const res = await fetch('https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&catalogId=48&pageNo=1&pageSize=10');
      const data = await res.json();
      const rawArticles = data?.data?.catalogs?.[0]?.articles || data?.data?.articles || [];
      items = rawArticles.map(a => ({
        title: a.title || '',
        url: `https://www.binance.com/en/support/announcement/${a.code || a.id || ''}`,
      }));
    } catch (e) {
      await page.goto('https://www.binance.com/en/support/announcement/list/48', { waitUntil: 'networkidle', timeout: 40000 });
      await page.waitForTimeout(5000);
      const links = await page.$$eval('a[href*="/support/announcement/"]', links =>
        links.map(a => ({ title: a.textContent?.trim() || '', href: a.getAttribute('href') || '' }))
          .filter(i => i.title.length > 10)
      );
      items = links.map(l => ({ title: l.title, url: `https://www.binance.com${l.href}` }));
    }

    for (const item of items.slice(0, 8)) {
      if (!item.title) continue;
      if (item.title.includes('Trading Competition') || item.title.includes('AMA')) continue;
      if (item.title.includes('Completes Integration') || item.title.includes('Alpha Will Remove')) continue;
      const isRelevant = item.title.includes('Will List') || item.title.includes('Will Add') ||
        (item.title.includes('Futures') && item.title.includes('Launch'));
      if (!isRelevant) continue;

      const body = await fetchPageContent(page, item.url, 'article, main, .content');
      articles.push({ title: item.title, url: item.url, body });
    }
  } catch (e) {
    console.error('  Binance scrape error:', e.message);
  }
  return articles;
}

async function scrapeOKX(page) {
  const articles = [];
  try {
    const res = await fetch('https://www.okx.com/v2/support/home/web');
    const data = await res.json();
    const notices = data?.data?.notices || [];
    for (const n of notices) {
      if (n.sectionSlug !== 'announcements-new-listings') continue;
      const publishDate = new Date(n.publishDate).toISOString().split('T')[0];
      if (publishDate !== TODAY) continue;
      const url = `https://www.okx.com${n.link}`;
      articles.push({ title: n.shareText || n.shareTitle || '', url, body: null });
    }
    // Try to fetch article content
    for (const a of articles) {
      const body = await fetchPageContent(page, a.url, 'article, main, .article-content');
      a.body = body;
    }
  } catch (e) {
    console.error('  OKX scrape error:', e.message);
  }
  return articles;
}

async function scrapeBybit(page) {
  const articles = [];
  try {
    const res = await fetch('https://api.bybit.com/v5/announcements/index?locale=zh-TW&type=new_crypto&limit=10');
    const data = await res.json();
    const list = data?.result?.list || [];

    for (const item of list) {
      const publishDate = new Date(parseInt(item.publishTime)).toISOString().split('T')[0];
      if (publishDate !== TODAY) continue;
      if (item.title.includes('Competition') || item.title.includes('Campaign')) continue;
      articles.push({ title: item.title, url: item.url || '', body: item.description || null });
    }
  } catch (e) {
    console.error('  Bybit API error:', e.message);
  }
  return articles;
}

async function scrapeKuCoin(page) {
  const articles = [];
  try {
    await page.goto('https://www.kucoin.com/announcement/new-listings', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const items = await page.$$eval('a[href*="/announcement/"]', links =>
      links.map(a => ({ title: a.textContent?.trim() || '', href: a.getAttribute('href') || '' }))
        .filter(i => i.title.length > 15 && !i.href.includes('/announcement/new-listings'))
    );

    // Take latest 10 items (KuCoin doesn't show dates in list, so take recent ones)
    for (const item of items.slice(0, 10)) {
      const url = item.href.startsWith('http') ? item.href : `https://www.kucoin.com${item.href}`;
      const body = await fetchPageContent(page, url, 'article, main, .content');
      articles.push({ title: item.title, url, body });
    }
  } catch (e) {
    console.error('  KuCoin scrape error:', e.message);
  }
  return articles;
}

async function scrapeGateio(page) {
  const articles = [];
  try {
    await page.goto('https://www.gate.com/zh/announcements/newspotlistings', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const items = await page.$$eval('a[href*="/article/"]', links =>
      links.map(a => ({ title: a.textContent?.trim() || '', href: a.getAttribute('href') || '' }))
        .filter(i => i.title.length > 15)
    );

    // Gate.io shows relative time - take items with "小时前" or "分钟前"
    for (const item of items.slice(0, 8)) {
      const isRecent = item.title.includes('小时前') || item.title.includes('分钟前') || item.title.includes('1 天前');
      if (!isRecent) continue;
      const url = item.href.startsWith('http') ? item.href : `https://www.gate.com${item.href}`;
      const body = await fetchPageContent(page, url, 'article, main, .content');
      articles.push({ title: item.title, url, body });
    }
  } catch (e) {
    console.error('  Gate.io scrape error:', e.message);
  }
  return articles;
}

async function scrapeBitget(page) {
  const articles = [];
  try {
    await page.goto('https://www.bitget.com/zh-CN/support/sections/5955813039257', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const items = await page.$$eval('a[href*="/articles/"]', links =>
      links.map(a => {
        const dateEl = a.closest('[class]')?.querySelector('[class*="date"], [class*="time"], span:last-child');
        const dateText = dateEl?.textContent?.trim() || '';
        return { title: a.textContent?.trim() || '', href: a.getAttribute('href') || '', date: dateText };
      }).filter(i => i.title.length > 10)
    );

    // Get today's date prefix to filter
    const todayPrefix = TODAY; // "2026-04-30"
    for (const item of items.slice(0, 6)) {
      const url = item.href.startsWith('http') ? item.href : `https://www.bitget.com${item.href}`;
      const body = await fetchPageContent(page, url, 'article, main, [class*="article"]');
      articles.push({ title: item.title, url, body });
    }
  } catch (e) {
    console.error('  Bitget scrape error:', e.message);
  }
  return articles;
}

async function scrapeMEXC(page) {
  const articles = [];
  try {
    await page.goto('https://www.mexc.com/zh-TW/announcements/new-listings', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(1000);

    const items = await page.$$eval('a[href*="/announcements/article/"]', links =>
      links.map(a => {
        const parent = a.closest('[class]');
        const timeEl = parent?.querySelector('time');
        return {
          title: a.textContent?.trim() || '',
          href: a.getAttribute('href') || '',
          time: timeEl?.textContent?.trim() || ''
        };
      }).filter(i => i.title.length > 10)
    );

    // Take recent items (those with "小时前" or "分钟前" or "1 天前")
    for (const item of items.slice(0, 10)) {
      const isRecent = item.time.includes('小時前') || item.time.includes('小时前') ||
        item.time.includes('分鐘前') || item.time.includes('分钟前') ||
        item.time.includes('約') || item.time.includes('大約');
      if (!isRecent && !item.time.includes('天前')) continue;
      if (item.title.includes('定投') || item.title.includes('手續費') || item.title.includes('下架')) continue;

      const url = item.href.startsWith('http') ? item.href : `https://www.mexc.com${item.href}`;
      // MEXC article pages are JS-heavy, use preview text from listing
      articles.push({ title: item.title, url, body: null });
    }

    // Try to fetch content for MEXC articles via page navigation
    for (const a of articles.slice(0, 8)) {
      const body = await fetchPageContent(page, a.url, 'article, main, [class*="article"]');
      a.body = body;
    }
  } catch (e) {
    console.error('  MEXC scrape error:', e.message);
  }
  return articles;
}

// --- Main ---

async function main() {
  console.log(`Scraping exchange listings for ${TODAY}...`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }

  const yesterdayData = loadYesterdayData();
  if (yesterdayData) {
    console.log(`Loaded yesterday's data for deduplication (${yesterdayData.date})`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  async function withNewPage(fn) {
    const p = await context.newPage();
    try { return await fn(p); } finally { await p.close(); }
  }

  // Step 1: Scrape announcements from all exchanges
  console.log('\n--- Collecting announcements ---');

  console.log('  Binance...');
  const binanceArticles = await withNewPage(p => scrapeBinance(p));
  console.log(`    Found ${binanceArticles.length} relevant announcements`);

  console.log('  OKX...');
  const okxArticles = await withNewPage(p => scrapeOKX(p));
  console.log(`    Found ${okxArticles.length} relevant announcements`);

  console.log('  Bybit...');
  const bybitArticles = await withNewPage(p => scrapeBybit(p));
  console.log(`    Found ${bybitArticles.length} relevant announcements`);

  console.log('  KuCoin...');
  const kucoinArticles = await withNewPage(p => scrapeKuCoin(p));
  console.log(`    Found ${kucoinArticles.length} relevant announcements`);

  console.log('  Gate.io...');
  const gateioArticles = await withNewPage(p => scrapeGateio(p));
  console.log(`    Found ${gateioArticles.length} relevant announcements`);

  console.log('  Bitget...');
  const bitgetArticles = await withNewPage(p => scrapeBitget(p));
  console.log(`    Found ${bitgetArticles.length} relevant announcements`);

  console.log('  MEXC...');
  const mexcArticles = await withNewPage(p => scrapeMEXC(p));
  console.log(`    Found ${mexcArticles.length} relevant announcements`);

  await browser.close();

  // Step 2: Send to Claude API for structured extraction
  console.log('\n--- Extracting with Claude API ---');

  console.log('  Processing Binance...');
  const binanceRaw = await extractWithClaude(binanceArticles, 'Binance');

  console.log('  Processing OKX...');
  const okxRaw = await extractWithClaude(okxArticles, 'OKX');

  console.log('  Processing Bybit...');
  const bybitRaw = await extractWithClaude(bybitArticles, 'Bybit');

  console.log('  Processing KuCoin...');
  const kucoinRaw = await extractWithClaude(kucoinArticles, 'KuCoin');

  console.log('  Processing Gate.io...');
  const gateioRaw = await extractWithClaude(gateioArticles, 'Gate.io');

  console.log('  Processing Bitget...');
  const bitgetRaw = await extractWithClaude(bitgetArticles, 'Bitget');

  console.log('  Processing MEXC...');
  const mexcRaw = await extractWithClaude(mexcArticles, 'MEXC');

  // Attach URLs back from articles
  function attachUrls(listings, articles) {
    return listings.map((item, i) => {
      if (!item.url && articles[i]) item.url = articles[i].url;
      if (!item.url) {
        const match = articles.find(a =>
          a.title.includes(item.token?.split(' ')[0] || 'ZZZZZ') ||
          a.title.includes(item.token?.match(/\(([^)]+)\)/)?.[1] || 'ZZZZZ')
        );
        if (match) item.url = match.url;
      }
      return item;
    });
  }

  const binanceListings = dedup(attachUrls(binanceRaw, binanceArticles), getYesterdayTokenKeys(yesterdayData, 'binance'));
  const okxListings = dedup(attachUrls(okxRaw, okxArticles), getYesterdayTokenKeys(yesterdayData, 'okx'));
  const bybitListings = dedup(attachUrls(bybitRaw, bybitArticles), getYesterdayTokenKeys(yesterdayData, 'bybit'));
  const kucoinListings = dedup(attachUrls(kucoinRaw, kucoinArticles), getYesterdayTokenKeys(yesterdayData, 'kucoin'));
  const gateioListings = dedup(attachUrls(gateioRaw, gateioArticles), getYesterdayTokenKeys(yesterdayData, 'gateio'));
  const bitgetListings = dedup(attachUrls(bitgetRaw, bitgetArticles), getYesterdayTokenKeys(yesterdayData, 'bitget'));
  const mexcListings = dedup(attachUrls(mexcRaw, mexcArticles), getYesterdayTokenKeys(yesterdayData, 'mexc'));

  // Step 3: Write output
  const result = {
    date: TODAY,
    updatedAt: new Date().toISOString(),
    exchanges: {
      binance: { listings: binanceListings, alpha: [], wallet: [] },
      okx: { listings: okxListings },
      bybit: { listings: bybitListings },
      kucoin: { listings: kucoinListings },
      gateio: { listings: gateioListings },
      bitget: { listings: bitgetListings },
      mexc: { listings: mexcListings }
    }
  };

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const outputPath = path.join(DATA_DIR, `${TODAY}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

  console.log(`\nData saved to ${outputPath}`);
  console.log(`\nSummary:`);
  console.log(`  Binance: ${binanceListings.length} listings`);
  console.log(`  OKX: ${okxListings.length} listings`);
  console.log(`  Bybit: ${bybitListings.length} listings`);
  console.log(`  KuCoin: ${kucoinListings.length} listings`);
  console.log(`  Gate.io: ${gateioListings.length} listings`);
  console.log(`  Bitget: ${bitgetListings.length} listings`);
  console.log(`  MEXC: ${mexcListings.length} listings`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
