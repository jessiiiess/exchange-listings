const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TODAY = new Date().toISOString().split('T')[0];
const DATA_DIR = path.join(__dirname, '..', 'data');

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

function summarizeDetail(title, exchange) {
  let detail = title;

  // Extract trading pairs
  const pairs = title.match(/[A-Z0-9]+\/[A-Z]+/g);
  const pairStr = pairs ? pairs.join('、') : '';

  // Extract time info
  const timeMatch = title.match(/(\d{1,2}[:/]\d{2}\s*(?:UTC|AM|PM))/i) ||
    title.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
  const timeStr = timeMatch ? timeMatch[1] : '';

  // Common English to Chinese translations
  const translations = {
    'Seed Tag': 'Seed Tag',
    'with Seed Tag Applied': 'Seed Tag',
    'Innovation Zone': '创新区',
    'Spot Trading': '现货交易',
    'Perpetual Contract': '永续合约',
    'Futures Trading': '合约交易',
    'World Premiere': 'World Premiere',
  };

  if (exchange === 'binance') {
    if (title.includes('Seed Tag')) {
      detail = `Seed Tag${pairStr ? '，' + pairStr + ' 交易对' : ''}`;
    } else if (title.includes('Futures')) {
      detail = `永续合约上线${pairStr ? '，' + pairStr : ''}`;
    } else if (pairStr) {
      detail = `${pairStr} 交易对`;
    } else {
      detail = '现货交易对上线';
    }
  } else if (exchange === 'okx') {
    if (title.includes('永续') || title.includes('Perpetual')) {
      detail = `永续合约${pairStr ? '，' + pairStr : ''}`;
    } else {
      detail = `${pairStr ? pairStr + ' ' : ''}现货交易`;
    }
  } else if (exchange === 'bybit') {
    if (timeStr) {
      detail = `${timeStr} 开始交易`;
    } else if (pairStr) {
      detail = `${pairStr} 现货交易对`;
    } else {
      detail = '现货交易上线';
    }
  } else if (exchange === 'kucoin') {
    if (title.includes('World Premiere')) {
      detail = timeStr ? `${timeStr} 开始交易` : 'World Premiere 首发';
    } else if (title.includes('Futures') && title.includes('Payment')) {
      detail = '合约及支付服务上线';
    } else if (title.includes('Futures') || title.includes('Perpetual')) {
      const leverageMatch = title.match(/(\d+)x/i);
      detail = leverageMatch ? `${leverageMatch[1]}x 杠杆永续` : '永续合约上线';
    } else if (timeStr) {
      detail = `${timeStr} 开始交易`;
    } else {
      detail = `${pairStr ? pairStr + ' ' : ''}现货上线`;
    }
  } else if (exchange === 'gateio') {
    if (title.includes('首发')) {
      detail = '首发上线，现货+闪兑';
    } else if (title.includes('永续')) {
      detail = '永续合约上线';
    } else {
      detail = `${pairStr ? pairStr + ' ' : ''}现货+闪兑`;
    }
  } else if (exchange === 'bitget') {
    if (title.includes('首发上币')) {
      const zone = title.includes('创新区') ? '创新区' : title.includes('AI') ? 'AI区' : '';
      detail = `首发上币${zone ? '，' + zone : ''}${pairStr ? '，' + pairStr : ''}`;
    } else {
      detail = `${pairStr ? pairStr + ' ' : ''}现货交易`;
    }
  } else if (exchange === 'mexc') {
    if (title.includes('合約') || title.includes('合约')) {
      const hasFollow = title.includes('跟單') || title.includes('跟单');
      detail = `USDT永续合约${hasFollow ? '，支持跟单' : ''}`;
    } else if (title.includes('Meme+') || title.includes('Meme+')) {
      detail = 'Meme+ 专区上线';
    } else if (title.includes('創新區') || title.includes('创新区')) {
      detail = `创新区${pairStr ? ' ' + pairStr : ' 现货上线'}`;
    } else if (title.includes('首發') || title.includes('首发')) {
      detail = '现货交易已开放';
    } else if (title.includes('閃兌') || title.includes('闪兑')) {
      detail = '闪兑上线';
    } else {
      detail = `${pairStr ? pairStr + ' ' : ''}交易对上线`;
    }
  }

  return detail;
}

async function scrapeBinance(page) {
  const listings = [];
  try {
    await page.goto('https://www.binance.com/en/support/announcement/list/48', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const items = await page.$$eval('a[href*="/support/announcement/detail/"]', (links) => {
      return links.map(a => ({
        title: a.textContent?.trim() || '',
        href: a.getAttribute('href') || '',
        date: a.closest('[class]')?.querySelector('[class]')?.nextElementSibling?.textContent?.trim() || ''
      }));
    });

    for (const item of items) {
      if (!item.title || !item.title.includes(TODAY.replace(/-/g, '-'))) {
        const dateMatch = item.date || '';
        if (!dateMatch.includes(TODAY)) continue;
      }
      if (item.title.includes('Alpha Will Remove')) continue;

      let type = '现货上线';
      if (item.title.includes('Futures')) type = '合约上线';
      if (item.title.includes('Earn') || item.title.includes('Convert') || item.title.includes('Margin')) type = 'Earn/Margin/Futures';
      if (item.title.includes('Trading Pair')) type = '新交易对';

      const url = item.href.startsWith('http') ? item.href : `https://www.binance.com${item.href}`;
      listings.push({ token: extractToken(item.title), type, detail: summarizeDetail(item.title, 'binance'), url });
    }
  } catch (e) {
    console.error('Binance scrape error:', e.message);
  }
  return listings;
}

async function scrapeBinanceAlpha(page) {
  const listings = [];
  try {
    await page.goto('https://www.binance.com/en/support/search?type=Announcement&q=Binance%20Alpha%20Adds', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const items = await page.$$eval('a[href*="/support/announcement/detail/"]', (links) => {
      return links.map(a => ({ title: a.textContent?.trim() || '', href: a.getAttribute('href') || '' }));
    });

    for (const item of items) {
      if (item.title.toLowerCase().includes('alpha') && item.title.toLowerCase().includes('add') && item.title.includes(TODAY.slice(0, 7))) {
        const tokens = extractAlphaTokens(item.title);
        const url = item.href.startsWith('http') ? item.href : `https://www.binance.com${item.href}`;
        for (const token of tokens) {
          listings.push({ token, type: 'Alpha 新增', detail: 'Alpha 平台新增代币', url });
        }
      }
    }
  } catch (e) {
    console.error('Binance Alpha scrape error:', e.message);
  }
  return listings;
}

async function scrapeBinanceWallet(page) {
  const listings = [];
  try {
    await page.goto('https://www.binance.com/en/support/search?type=Announcement&q=Binance%20Wallet%20token', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const items = await page.$$eval('a[href*="/support/announcement/detail/"]', (links) => {
      return links.map(a => ({ title: a.textContent?.trim() || '', href: a.getAttribute('href') || '' }));
    });

    for (const item of items) {
      if (item.title.toLowerCase().includes('wallet') && item.title.toLowerCase().includes('list') && item.title.includes(TODAY.slice(0, 7))) {
        const url = item.href.startsWith('http') ? item.href : `https://www.binance.com${item.href}`;
        listings.push({ token: extractToken(item.title), type: 'Wallet 上新', detail: 'Wallet 新代币上线', url });
      }
    }
  } catch (e) {
    console.error('Binance Wallet scrape error:', e.message);
  }
  return listings;
}

async function scrapeOKX(page) {
  const listings = [];
  try {
    await page.goto('https://www.okx.com/help/section/announcements-new-listings', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const items = await page.$$eval('a[href*="/help/"]', (links) => {
      return links.map(a => ({ title: a.textContent?.trim() || '', href: a.getAttribute('href') || '' })).filter(i => i.title.length > 15);
    });

    const todayPatterns = [TODAY, TODAY.replace(/-/g, '年').replace('年', '年').slice(0, 7)];
    for (const item of items) {
      const isRecent = todayPatterns.some(p => item.title.includes(p)) ||
        item.title.includes('4月30') || item.title.includes('4月29');
      if (!isRecent) continue;
      if (!item.title.includes('上线') && !item.title.includes('List')) continue;

      let type = '现货上线';
      if (item.title.includes('永续') || item.title.includes('Perpetual') || item.title.includes('合约')) type = '合约上线';

      const url = item.href.startsWith('http') ? item.href : `https://www.okx.com${item.href}`;
      listings.push({ token: extractToken(item.title), type, detail: summarizeDetail(item.title, 'okx'), url });
    }
  } catch (e) {
    console.error('OKX scrape error:', e.message);
  }
  return listings;
}

async function scrapeBybit() {
  const listings = [];
  try {
    const apiUrl = 'https://api.bybit.com/v5/announcements/index?locale=en-US&tag=Spot%20Listings&type=new_crypto&limit=10';
    const res = await fetch(apiUrl);
    const data = await res.json();
    const articles = data?.result?.list || [];

    for (const a of articles) {
      const publishDate = new Date(parseInt(a.publishTime)).toISOString().split('T')[0];
      if (publishDate !== TODAY) continue;

      let type = '现货上线';
      if (a.title.includes('Futures') || a.title.includes('Perpetual')) type = '合约上线';
      if (a.title.includes('Splash') || a.title.includes('prize')) continue;

      const url = a.url || `https://announcements.bybit.com/article/${a.id || ''}`;
      listings.push({ token: extractToken(a.title), type, detail: summarizeDetail(a.title, 'bybit'), url });
    }
  } catch (e) {
    console.error('Bybit API error:', e.message);
  }
  return listings;
}

async function scrapeKuCoin(page) {
  const listings = [];
  try {
    await page.goto('https://www.kucoin.com/announcement/new-listings', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const items = await page.$$eval('a[href*="/announcement/"]', (links) => {
      return links.map(a => ({ title: a.textContent?.trim() || '', href: a.getAttribute('href') || '' }))
        .filter(i => i.title.length > 15 && !i.href.includes('/announcement/new-listings'));
    });

    const todayMonth = TODAY.slice(5, 7);
    const todayDay = TODAY.slice(8, 10);
    const todayStr = `${todayMonth}/${todayDay}/${TODAY.slice(0, 4)}`;
    const yesterdayDay = String(parseInt(todayDay) - 1).padStart(2, '0');
    const yesterdayStr = `${todayMonth}/${yesterdayDay}/${TODAY.slice(0, 4)}`;

    for (const item of items) {
      const isToday = item.title.includes(todayStr) || item.title.toLowerCase().includes(`april ${parseInt(todayDay)}`);
      const isYesterday = item.title.includes(yesterdayStr) || item.title.toLowerCase().includes(`april ${parseInt(yesterdayDay)}`);
      if (!isToday && !isYesterday) continue;

      let type = '现货上线';
      if (item.title.includes('World Premiere')) type = 'World Premiere 现货';
      if (item.title.includes('Futures') || item.title.includes('Perpetual')) type = '合约上线';
      if (item.title.includes('Payment')) type = 'Futures + Payment';

      const url = item.href.startsWith('http') ? item.href : `https://www.kucoin.com${item.href}`;
      const cleanTitle = item.title
        .replace(/\d{2}\/\d{2}\/\d{4},?\s*\d{2}:\d{2}:\d{2}/g, '')
        .replace(/^(?:KuCoin\s+)?(?:Adding|Premiere:|World Premiere:|HODLer Airdrops:|Airdrops:)\s*/i, '')
        .replace(/\s*(?:Listed on KuCoin|to Futures|to Payment|to KuCoin).*$/i, '')
        .replace(/^KuCoin\s+(?:Futures\s+)?(?:New\s+)?(?:Listing:?\s*)?/i, '')
        .trim();
      listings.push({ token: extractToken(cleanTitle), type, detail: summarizeDetail(item.title, 'kucoin'), url });
    }
  } catch (e) {
    console.error('KuCoin scrape error:', e.message);
  }
  return listings;
}

async function scrapeGateio(page) {
  const listings = [];
  try {
    await page.goto('https://www.gate.com/zh/announcements/newspotlistings', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const items = await page.$$eval('a[href*="/article/"]', (links) => {
      return links.map(a => ({ title: a.textContent?.trim() || '', href: a.getAttribute('href') || '' })).filter(i => i.title.length > 15);
    });

    for (const item of items) {
      const isRecent = item.title.includes('小时前') || item.title.includes('分钟前') ||
        item.title.includes('1 天前') || item.title.includes('天前');
      if (!isRecent && !item.title.includes(TODAY) && !item.title.includes(TODAY.replace(/2026-04-30/, '2026-04-29'))) continue;

      let type = '现货 + 闪兑';
      if (item.title.includes('首发')) type = '首发现货 + 闪兑';
      if (item.title.includes('永续')) type = '合约';

      const url = item.href.startsWith('http') ? item.href : `https://www.gate.com${item.href}`;
      const cleanTitle = item.title.replace(/\d+\s*(小时|分钟|天)前\d*,?\d*/g, '').replace(/2026-\d{2}-\d{2}\d*,?\d*/g, '').trim();
      listings.push({ token: extractToken(cleanTitle), type, detail: summarizeDetail(cleanTitle, 'gateio'), url });
    }
  } catch (e) {
    console.error('Gate.io scrape error:', e.message);
  }
  return listings;
}

async function scrapeBitget(page) {
  const listings = [];
  try {
    await page.goto('https://www.bitget.com/zh-CN/support/sections/5955813039257', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const items = await page.$$eval('a[href*="/articles/"]', (links) => {
      return links.map(a => ({ title: a.textContent?.trim() || '', href: a.getAttribute('href') || '' })).filter(i => i.title.length > 10);
    });

    const recentTitles = items.slice(0, 5);
    for (const item of recentTitles) {
      let type = '现货上线';
      if (item.title.includes('首发上币')) type = '首发上币';
      if (item.title.includes('AI 区') || item.title.includes('AI区')) type += ' AI区';
      if (item.title.includes('创新区')) type += ' 创新区';
      if (item.title.includes('合约') || item.title.includes('Futures')) type = '合约';

      const url = item.href.startsWith('http') ? item.href : `https://www.bitget.com${item.href}`;
      const cleanTitle = item.title
        .replace(/^【[^】]+】\s*/, '')
        .replace(/将上线\s*Bitget.*$/, '')
        .replace(/將上線\s*Bitget.*$/, '')
        .trim();
      listings.push({ token: extractToken(cleanTitle), type, detail: summarizeDetail(item.title, 'bitget'), url });
    }
  } catch (e) {
    console.error('Bitget scrape error:', e.message);
  }
  return listings;
}

async function scrapeMEXC(page) {
  const listings = [];
  try {
    await page.goto('https://www.mexc.com/zh-TW/announcements/new-listings', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    const items = await page.$$eval('a[href*="/announcements/article/"]', (links) => {
      return links.map(a => ({ title: a.textContent?.trim() || '', href: a.getAttribute('href') || '' })).filter(i => i.title.length > 10);
    });

    const recentItems = items.slice(0, 10);
    for (const item of recentItems) {
      let type = '现货上线';
      if (item.title.includes('首發上線') || item.title.includes('首发上线')) type = '首发上线';
      if (item.title.includes('Meme+') || item.title.includes('Meme+')) type = 'Meme+ 区';
      if (item.title.includes('創新區') || item.title.includes('创新区')) type = '创新区现货';
      if (item.title.includes('合約') || item.title.includes('合约') || item.title.includes('USDT合約')) type = '合约';
      if (item.title.includes('盤前') || item.title.includes('盘前')) type = '盘前转正式合约';
      if (item.title.includes('閃兌') || item.title.includes('闪兑')) type = '闪兑';
      if (item.title.includes('跟單') || item.title.includes('跟单')) type = '合约 + 跟单';
      if (item.title.includes('定投')) continue;

      const url = item.href.startsWith('http') ? item.href : `https://www.mexc.com${item.href}`;
      const cleanTitle = item.title
        .replace(/^MEXC\s*將於?\s*/, '')
        .replace(/^將於?\s*/, '')
        .replace(/^MEXC\s+/, '')
        .replace(/^跟單新增\s*/, '')
        .replace(/^新美股合約上線[：:]\s*/, '')
        .replace(/^閃兌新幣上線[：:]\s*/, '')
        .replace(/^首發上線[：:]\s*/, '')
        .replace(/[，,].*瓜分.*$/, '')
        .replace(/[，,].*獎池.*$/, '')
        .replace(/\s*現已上線.*$/, '')
        .replace(/\s*U\s*本位.*$/, '')
        .trim();
      listings.push({ token: extractTokenMEXC(cleanTitle), type, detail: summarizeDetail(item.title, 'mexc'), url });
    }
  } catch (e) {
    console.error('MEXC scrape error:', e.message);
  }
  return listings;
}

function extractToken(title) {
  // Match "Token Name (TICKER)" or "Token Name（TICKER）" pattern
  const tickerMatch = title.match(/([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*)\s*[\(（]([A-Z0-9]+)[\)）]/);
  if (tickerMatch) return `${tickerMatch[1]} (${tickerMatch[2]})`;

  // Match standalone ticker like "XYZUSDT"
  const usdtMatch = title.match(/\b([A-Z]{2,10})USDT\b/);
  if (usdtMatch) return usdtMatch[1];

  // Match "List TOKEN" or "listing TOKEN"
  const listMatch = title.match(/(?:List(?:ed|ing)?|上线|上線)\s+([A-Z][A-Za-z0-9\s]+?)(?:\s*[\(（]|\s+on\b|\s+in\b|$)/i);
  if (listMatch) return listMatch[1].trim();

  // Fallback: find anything in parentheses (normal or Chinese) that looks like a ticker
  const parenMatch = title.match(/[\(（]([A-Z][A-Z0-9]{1,9})[\)）]/);
  if (parenMatch) return parenMatch[1];

  return title.substring(0, 25);
}

function extractTokenMEXC(title) {
  // Match "Name (TICKER)" pattern
  const tickerMatch = title.match(/([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*)\s*\(([A-Z0-9]+)\)/);
  if (tickerMatch) return `${tickerMatch[1]} (${tickerMatch[2]})`;

  // Match standalone USDT pair
  const usdtMatch = title.match(/\b([A-Z]{2,10})USDT\b/);
  if (usdtMatch) return usdtMatch[1];

  // Match ticker in parentheses
  const parenMatch = title.match(/\(([A-Z][A-Z0-9]{1,9})\)/);
  if (parenMatch) return parenMatch[1];

  // Match after Chinese colon: "上線：TOKEN" or "上線：TOKEN 現已上線"
  const colonMatch = title.match(/[：:]\s*([A-Z][A-Za-z0-9\s]+?)(?:\s*[\(（,，]|\s+現|\s+现|$)/);
  if (colonMatch) return colonMatch[1].trim();

  // Match Chinese pattern "上線 TOKEN"
  const listMatch = title.match(/(?:上線|上线)\s+([A-Z][A-Za-z0-9\s]+?)(?:\s*[\(（]|\s+現|\s+现|$)/);
  if (listMatch) return listMatch[1].trim();

  // Match multiple tokens after colon like "：KAG、MANTRA、SOXXON"
  const multiMatch = title.match(/[：:]\s*([A-Z][A-Z0-9]+(?:[、,]\s*[A-Z][A-Z0-9]+)+)/);
  if (multiMatch) return multiMatch[1].replace(/\s+/g, '');

  return title.substring(0, 20);
}

function extractAlphaTokens(title) {
  const match = title.match(/Adds?\s+(.+?)(?:\s*\(|\s*on)/i);
  if (match) {
    return match[1].split(',').map(t => t.trim()).filter(t => t.length > 0);
  }
  return [title.substring(0, 30)];
}

async function main() {
  console.log(`Scraping exchange listings for ${TODAY}...`);

  const yesterdayData = loadYesterdayData();
  if (yesterdayData) {
    console.log(`Loaded yesterday's data for deduplication (${yesterdayData.date})`);
  } else {
    console.log('No yesterday data found, skipping deduplication');
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  console.log('Scraping Binance...');
  const binanceRaw = await scrapeBinance(page);
  const binanceListings = dedup(binanceRaw, getYesterdayTokenKeys(yesterdayData, 'binance'));

  console.log('Scraping Binance Alpha...');
  const binanceAlphaRaw = await scrapeBinanceAlpha(page);
  const binanceAlpha = dedup(binanceAlphaRaw, getYesterdayTokenKeys(yesterdayData, 'binance'));

  console.log('Scraping Binance Wallet...');
  const binanceWalletRaw = await scrapeBinanceWallet(page);
  const binanceWallet = dedup(binanceWalletRaw, getYesterdayTokenKeys(yesterdayData, 'binance'));

  console.log('Scraping OKX...');
  const okxRaw = await scrapeOKX(page);
  const okxListings = dedup(okxRaw, getYesterdayTokenKeys(yesterdayData, 'okx'));

  console.log('Scraping Bybit (API)...');
  const bybitRaw = await scrapeBybit();
  const bybitListings = dedup(bybitRaw, getYesterdayTokenKeys(yesterdayData, 'bybit'));

  console.log('Scraping KuCoin...');
  const kucoinRaw = await scrapeKuCoin(page);
  const kucoinListings = dedup(kucoinRaw, getYesterdayTokenKeys(yesterdayData, 'kucoin'));

  console.log('Scraping Gate.io...');
  const gateioRaw = await scrapeGateio(page);
  const gateioListings = dedup(gateioRaw, getYesterdayTokenKeys(yesterdayData, 'gateio'));

  console.log('Scraping Bitget...');
  const bitgetRaw = await scrapeBitget(page);
  const bitgetListings = dedup(bitgetRaw, getYesterdayTokenKeys(yesterdayData, 'bitget'));

  console.log('Scraping MEXC...');
  const mexcRaw = await scrapeMEXC(page);
  const mexcListings = dedup(mexcRaw, getYesterdayTokenKeys(yesterdayData, 'mexc'));

  await browser.close();

  const result = {
    date: TODAY,
    updatedAt: new Date().toISOString(),
    exchanges: {
      binance: { listings: binanceListings, alpha: binanceAlpha, wallet: binanceWallet },
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
  console.log(`\nSummary (after dedup):`);
  console.log(`  Binance: ${binanceListings.length} listings, Alpha: ${binanceAlpha.length}, Wallet: ${binanceWallet.length}`);
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
