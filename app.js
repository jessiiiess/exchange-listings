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
let searchIndex = null;
let searchDebounceTimer = null;

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function init() {
  const picker = document.getElementById('date-picker');
  picker.value = getToday();
  picker.addEventListener('change', () => loadData(picker.value));
  loadData(getToday());
  initExport();
  initSearch();
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
    <colgroup><col class="col-token"><col class="col-type"><col class="col-detail"></colgroup>
    <thead><tr><th>币种</th><th>类型</th><th>详情</th></tr></thead>
    <tbody>`;
  for (const item of items) {
    const link = item.url ? ` <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="detail-link">（查看公告）</a>` : '';
    html += `<tr>
      <td class="token-name">${escapeHtml(item.token).replace(/\n/g, '<br>')}</td>
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
  const wrapper = btn.closest('.export-wrapper');

  btn.addEventListener('click', () => {
    panel.classList.toggle('open');
  });

  document.addEventListener('mousedown', (e) => {
    if (!wrapper.contains(e.target)) {
      panel.classList.remove('open');
    }
  });

  panel.querySelectorAll('.export-option').forEach(opt => {
    opt.addEventListener('click', () => {
      if (!currentData) return;
      const format = opt.dataset.format;
      if (format === 'pdf') {
        exportPDF(currentData);
      } else if (format === 'copy') {
        navigator.clipboard.writeText(exportText(currentData)).then(() => showToast());
      }
      panel.classList.remove('open');
    });
  });
}

function showToast() {
  const toast = document.getElementById('export-toast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function exportPDF(data) {
  const printTitle = document.getElementById('print-title');
  printTitle.textContent = data.date + ' 各交易所新币上线公告';
  window.print();
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

function initSearch() {
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');
  const searchBtn = document.getElementById('search-btn');
  const suggestions = document.getElementById('search-suggestions');
  let activeSuggestion = -1;

  input.addEventListener('focus', loadSearchIndex);

  input.addEventListener('input', () => {
    const query = input.value.trim();
    clearBtn.style.display = query ? 'block' : 'none';
    activeSuggestion = -1;

    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      if (query) {
        showSuggestions(query);
      } else {
        hideSuggestions();
      }
    }, 150);
  });

  input.addEventListener('keydown', (e) => {
    const items = suggestions.querySelectorAll('.search-suggestion-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeSuggestion = Math.min(activeSuggestion + 1, items.length - 1);
      updateActiveSuggestion(items, activeSuggestion);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeSuggestion = Math.max(activeSuggestion - 1, -1);
      updateActiveSuggestion(items, activeSuggestion);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSuggestion >= 0 && items[activeSuggestion]) {
        input.value = items[activeSuggestion].dataset.token;
        clearBtn.style.display = 'block';
      }
      hideSuggestions();
      doSearch();
    }
  });

  searchBtn.addEventListener('click', () => {
    hideSuggestions();
    doSearch();
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    hideSuggestions();
    exitSearch();
    input.focus();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-input-wrapper')) {
      hideSuggestions();
    }
  });

  function doSearch() {
    const query = input.value.trim();
    if (query) {
      performSearch(query);
    }
  }

  function updateActiveSuggestion(items, idx) {
    items.forEach((el, i) => el.classList.toggle('active', i === idx));
  }
}

function showSuggestions(query) {
  if (!searchIndex) return;
  const suggestions = document.getElementById('search-suggestions');
  const q = query.toLowerCase();

  const tokenSet = new Set();
  for (const item of searchIndex) {
    if (item.token && item.token.toLowerCase().includes(q)) {
      const tokens = item.token.split(/[、,，]\s*/);
      for (const t of tokens) {
        if (t.trim().toLowerCase().includes(q)) {
          tokenSet.add(t.trim());
        }
      }
      if (tokenSet.size >= 20) break;
    }
  }

  if (tokenSet.size === 0) {
    suggestions.classList.remove('open');
    return;
  }

  const sorted = [...tokenSet].sort((a, b) => a.length - b.length).slice(0, 8);
  let html = '';
  for (const token of sorted) {
    const highlighted = highlightMatch(escapeHtml(token), query);
    html += `<div class="search-suggestion-item" data-token="${escapeHtml(token)}">${highlighted}</div>`;
  }
  suggestions.innerHTML = html;
  suggestions.classList.add('open');

  suggestions.querySelectorAll('.search-suggestion-item').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const input = document.getElementById('search-input');
      input.value = el.dataset.token;
      document.getElementById('search-clear').style.display = 'block';
      hideSuggestions();
      performSearch(el.dataset.token);
    });
  });
}

function hideSuggestions() {
  document.getElementById('search-suggestions').classList.remove('open');
}

async function loadSearchIndex() {
  if (searchIndex) return;
  try {
    const res = await fetch('data/search-index.json');
    if (res.ok) searchIndex = await res.json();
  } catch (e) {
    // silently fail
  }
}

function performSearch(query) {
  if (!searchIndex) return;

  const q = query.toLowerCase();
  const results = searchIndex.filter(item =>
    item.token && item.token.toLowerCase().includes(q)
  );

  const dailyContent = document.getElementById('daily-content');
  const searchContainer = document.getElementById('search-results-container');
  const searchResults = document.getElementById('search-results');
  const searchInfo = document.getElementById('search-results-info');

  dailyContent.classList.add('hidden');
  searchContainer.classList.remove('hidden');
  searchInfo.textContent = `找到 ${results.length} 条相关公告`;

  if (results.length === 0) {
    searchResults.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-3);font-size:0.82rem;">无匹配结果</div>';
    return;
  }

  let html = '';
  for (const item of results) {
    const tokenHtml = highlightMatch(escapeHtml(item.token), query);
    const link = item.url ? ` <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">查看公告</a>` : '';
    const typeHtml = item.type ? `<span class="search-result-type">${escapeHtml(item.type)}</span>` : '';
    html += `<div class="search-result-item">
      <span class="search-result-date">${escapeHtml(item.date)}</span>
      <span class="search-result-exchange">${escapeHtml(item.exchange)}</span>
      <span class="search-result-detail"><span class="token-highlight">${tokenHtml}</span>${typeHtml} ${escapeHtml(item.detail || '')}${link}</span>
    </div>`;
  }
  searchResults.innerHTML = html;
}

function highlightMatch(html, query) {
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return html.replace(regex, '<mark style="background:rgba(59,110,218,0.12);color:var(--text);padding:0 1px;border-radius:2px;">$1</mark>');
}

function exitSearch() {
  const dailyContent = document.getElementById('daily-content');
  const searchContainer = document.getElementById('search-results-container');
  dailyContent.classList.remove('hidden');
  searchContainer.classList.add('hidden');
}

init();
