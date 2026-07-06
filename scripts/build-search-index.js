const fs = require('fs');
const path = require('path');

const EXCHANGE_NAMES = {
  binance: 'Binance',
  okx: 'OKX',
  bybit: 'Bybit',
  kucoin: 'KuCoin',
  gateio: 'Gate.io',
  bitget: 'Bitget',
  mexc: 'MEXC'
};

const dataDir = path.join(__dirname, '..', 'data');
const outputPath = path.join(dataDir, 'search-index.json');

const files = fs.readdirSync(dataDir)
  .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .sort()
  .reverse();

const index = [];

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'));
  const date = data.date || file.replace('.json', '');

  for (const [key, exData] of Object.entries(data.exchanges || {})) {
    const exchange = EXCHANGE_NAMES[key] || key;

    for (const item of (exData.listings || [])) {
      index.push({ date, exchange, token: item.token, type: item.type, detail: item.detail, url: item.url });
    }

    if (key === 'binance') {
      for (const item of (exData.alpha || [])) {
        index.push({ date, exchange: 'Binance Alpha', token: item.token, type: item.type, detail: item.detail, url: item.url });
      }
      for (const item of (exData.wallet || [])) {
        index.push({ date, exchange: 'Binance Wallet', token: item.token, type: item.type, detail: item.detail, url: item.url });
      }
    }
  }
}

fs.writeFileSync(outputPath, JSON.stringify(index));
console.log(`Built search index: ${index.length} entries from ${files.length} days`);
