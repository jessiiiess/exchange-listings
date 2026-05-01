const EXCHANGE_NAMES = {
  binance: 'Binance',
  okx: 'OKX',
  bybit: 'Bybit',
  kucoin: 'KuCoin',
  gateio: 'Gate.io',
  bitget: 'Bitget',
  mexc: 'MEXC'
};

let currentData = null;

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function init() {
  const picker = document.getElementById('date-picker');
  picker.value = getToday();
  picker.addEventListener('change', () => loadData(picker.value));
  loadData(getToday());
  initExport();
}

async function loadData(date) {
  const content = document.getElementById('content');
  const noData = document.getElementById('no-data');
  const updateTime = document.getElementById('update-time');
  const liveDot = document.getElementById('live-dot');

  content.innerHTML = '<div class="loading">正在加载数据</div>';
  noData.classList.add('hidden');
  liveDot.classList.add('hidden');
  updateTime.textContent = '';

  try {
    const res = await fetch(`data/${date}.json`);
    if (!res.ok) throw new Error('not found');
    const data = await res.json();
    currentData = data;

    if (data.updatedAt) {
      updateTime.textContent = `更新于 ${new Date(data.updatedAt).toLocaleString('zh-CN')}`;
      liveDot.classList.remove('hidden');
    }

    content.innerHTML = '';
    noData.classList.add('hidden');
    renderExchanges(content, data.exchanges);
  } catch (e) {
    content.innerHTML = '';
    noData.classList.remove('hidden');
    currentData = null;
  }
}

function countListings(data) {
  let total = (data.listings || []).length;
  if (data.alpha) total += data.alpha.length;
  if (data.wallet) total += data.wallet.length;
  return total;
}

function renderExchanges(container, exchanges) {
  for (const [key, data] of Object.entries(exchanges)) {
    const card = document.createElement('div');
    card.className = 'exchange-card';

    const name = EXCHANGE_NAMES[key] || key;
    const count = countListings(data);
    const badge = count > 0 ? `<span class="badge">+${count}</span>` : '';

    let html = `<div class="card-head">
      <h2>${escapeHtml(name)}</h2>
      ${badge}
    </div><div class="card-body">`;

    const listings = data.listings || [];
    if (listings.length > 0) {
      html += renderTable(listings);
    } else {
      html += `<p class="empty-msg">今日无新币上线</p>`;
    }

    if (key === 'binance') {
      const alpha = data.alpha || [];
      html += `<div class="sub-section"><div class="sub-title">Binance Alpha</div>`;
      if (alpha.length > 0) {
        html += renderTable(alpha);
      } else {
        html += `<p class="empty-msg">今日无新增代币</p>`;
      }
      html += `</div>`;

      const wallet = data.wallet || [];
      html += `<div class="sub-section"><div class="sub-title">Binance Wallet</div>`;
      if (wallet.length > 0) {
        html += renderTable(wallet);
      } else {
        html += `<p class="empty-msg">今日无新代币上线</p>`;
      }
      html += `</div>`;
    }

    html += `</div>`;
    card.innerHTML = html;
    container.appendChild(card);
  }
}

function renderTable(items) {
  let html = `<table>
    <thead><tr><th>币种</th><th>类型</th><th>详情</th></tr></thead>
    <tbody>`;
  for (const item of items) {
    const link = item.url ? ` <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="detail-link">（查看公告）</a>` : '';
    html += `<tr>
      <td class="token-name">${escapeHtml(item.token)}</td>
      <td class="listing-type">${escapeHtml(item.type)}</td>
      <td class="listing-detail">${escapeHtml(item.detail)}${link}</td>
    </tr>`;
  }
  html += `</tbody></table>`;
  return html;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function initExport() {
  const btn = document.getElementById('export-btn');
  const panel = document.getElementById('export-panel');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('open');
  });

  document.addEventListener('click', () => panel.classList.remove('open'));
  panel.addEventListener('click', (e) => e.stopPropagation());

  panel.querySelectorAll('.export-option').forEach(opt => {
    opt.addEventListener('click', () => {
      if (!currentData) return;
      const format = opt.dataset.format;
      let text = '';
      if (format === 'markdown') text = exportMarkdown(currentData);
      else if (format === 'text') text = exportText(currentData);
      else if (format === 'csv') text = exportCSV(currentData);
      navigator.clipboard.writeText(text).then(() => showToast());
      panel.classList.remove('open');
    });
  });
}

function showToast() {
  const toast = document.getElementById('export-toast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function getAllItems(data) {
  const items = [];
  for (const [key, exData] of Object.entries(data.exchanges)) {
    const name = EXCHANGE_NAMES[key] || key;
    for (const item of (exData.listings || [])) {
      items.push({ exchange: name, ...item });
    }
    if (key === 'binance') {
      for (const item of (exData.alpha || [])) {
        items.push({ exchange: name + ' Alpha', ...item });
      }
      for (const item of (exData.wallet || [])) {
        items.push({ exchange: name + ' Wallet', ...item });
      }
    }
  }
  return items;
}

function exportMarkdown(data) {
  let out = `## ${data.date} 交易所新币上线日报\n\n`;
  for (const [key, exData] of Object.entries(data.exchanges)) {
    const name = EXCHANGE_NAMES[key] || key;
    const listings = exData.listings || [];
    const count = countListings(exData);
    if (count === 0) continue;
    out += `### ${name}（${count}则）\n`;
    out += `| 币种 | 类型 | 详情 |\n|------|------|------|\n`;
    for (const item of listings) {
      out += `| ${item.token} | ${item.type} | ${item.detail} |\n`;
    }
    if (key === 'binance') {
      for (const item of (exData.alpha || [])) {
        out += `| ${item.token} | Alpha | ${item.detail} |\n`;
      }
      for (const item of (exData.wallet || [])) {
        out += `| ${item.token} | Wallet | ${item.detail} |\n`;
      }
    }
    out += '\n';
  }
  return out.trim();
}

function exportText(data) {
  let out = '';
  for (const [key, exData] of Object.entries(data.exchanges)) {
    const name = EXCHANGE_NAMES[key] || key;
    const listings = exData.listings || [];
    const alpha = key === 'binance' ? (exData.alpha || []) : [];
    const wallet = key === 'binance' ? (exData.wallet || []) : [];
    const all = [...listings, ...alpha, ...wallet];
    if (all.length === 0) continue;
    out += `${name}：\n今日${all.length}则上币公告。\n`;
    all.forEach((item, i) => {
      out += `${i + 1}. ${item.detail || item.token + ' ' + item.type}\n`;
    });
    out += '\n';
  }
  return out.trim();
}

function exportCSV(data) {
  let out = '交易所\t币种\t类型\t详情\tURL\n';
  const items = getAllItems(data);
  for (const item of items) {
    out += `${item.exchange}\t${item.token}\t${item.type}\t${item.detail || ''}\t${item.url || ''}\n`;
  }
  return out.trim();
}

init();
