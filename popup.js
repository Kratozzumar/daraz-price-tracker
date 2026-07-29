// Daraz Price Tracker — Popup Script v4 (cross-platform: Windows / Mac / Linux)

// ── Cross-platform confirm dialog ──────────────────────────────────────────
// window.confirm() is BLOCKED in Chrome extension popups on all platforms.
// We use our own modal instead.
function showConfirm() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirm-overlay');
    overlay.classList.remove('hidden');

    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const onOverlay = (e) => { if (e.target === overlay) { cleanup(); resolve(false); } };

    function cleanup() {
      overlay.classList.add('hidden');
      document.getElementById('confirm-ok').removeEventListener('click', onOk);
      document.getElementById('confirm-cancel').removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlay);
    }

    document.getElementById('confirm-ok').addEventListener('click', onOk);
    document.getElementById('confirm-cancel').addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlay);
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getTrend(history) {
  if (!history || history.length < 3) return null;
  const recent = history.slice(-3);
  let up = 0, down = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].price > recent[i-1].price) up++;
    if (recent[i].price < recent[i-1].price) down++;
  }
  if (up > down) return { direction: 'up', icon: '▲', color: 'var(--red)' };
  if (down > up) return { direction: 'down', icon: '▼', color: 'var(--green)' };
  return { direction: 'stable', icon: '→', color: 'var(--muted)' };
}

function getDealBadge(current, lowest, highest) {
  if (current <= lowest * 1.10) return { text: 'Great Deal', class: 'deal-great', icon: '🟢' };
  if (current <= lowest + (highest - lowest) * 0.3) return { text: 'Fair Price', class: 'deal-fair', icon: '🟡' };
  if (current >= lowest + (highest - lowest) * 0.7) return { text: 'Wait', class: 'deal-wait', icon: '🔴' };
  return null;
}

function fmt(price, currency = 'Rs.') {
  if (!price && price !== 0) return '—';
  return currency + ' ' + Number(price).toLocaleString();
}

// Some titles were scraped before this cleanup existed (or came from a
// listing with promo text baked into the name), e.g.
// "【Buy 2 for 12999: UK Plug+1.5M C-L Cable】 UGREEN ..." or a stray leading
// quote character. Clean them up at display time too, so already-stored
// items look right immediately without waiting for their next refresh.
function cleanTitle(raw) {
  if (!raw) return raw;
  let t = String(raw).trim();
  t = t.replace(/^[【\[][^】\]]{0,120}[】\]]\s*/, '');
  t = t.replace(/^["'“”‘’]+/, '').replace(/["'“”‘’]+$/, '');
  t = t.trim();
  return t || String(raw).trim();
}

function timeAgo(ts) {
  if (!ts) return 'Never';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function shortDate(ts) {
  const d = new Date(ts);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function makeThumb(url) {
  const wrap = document.createElement('div');
  wrap.className = 'item-thumb';
  const img = document.createElement('img');
  img.src = url || '';
  img.onerror = () => { wrap.style.background = '#1e293b'; };
  wrap.appendChild(img);
  return wrap;
}

// ── SVG price chart ────────────────────────────────────────────────────────
function renderChart(priceHistory, currency, targetPrice = 0) {
  const svg = document.getElementById('price-chart');
  const labelsEl = document.getElementById('chart-labels');
  const noData = document.getElementById('chart-no-data');

  while (svg.children.length > 1) svg.removeChild(svg.lastChild);
  labelsEl.innerHTML = '';

  if (!priceHistory || priceHistory.length < 1) {
    svg.classList.add('hidden');
    labelsEl.classList.add('hidden');
    noData.classList.remove('hidden');
    return;
  }

  noData.classList.add('hidden');
  svg.classList.remove('hidden');
  labelsEl.classList.remove('hidden');

  const raw = priceHistory.length === 1
    ? [priceHistory[0], { ...priceHistory[0], ts: Date.now() }]
    : priceHistory;

  const W = 340, H = 120, PAD = { top: 12, right: 6, bottom: 6, left: 6 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const prices = raw.map(p => p.price);
  let minP = Math.min(...prices);
  let maxP = Math.max(...prices);
  if (targetPrice > 0) {
    if (targetPrice < minP) minP = targetPrice;
    if (targetPrice > maxP) maxP = targetPrice;
  }
  const range = maxP - minP || 1;

  const xScale = (i) => PAD.left + (i / (raw.length - 1)) * chartW;
  const yScale = (p) => PAD.top + chartH - ((p - minP) / range) * chartH;

  [0, 0.5, 1].forEach(frac => {
    const y = PAD.top + frac * chartH;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'chart-grid');
    line.setAttribute('x1', PAD.left); line.setAttribute('y1', y);
    line.setAttribute('x2', W - PAD.right); line.setAttribute('y2', y);
    svg.appendChild(line);
  });

  const addDashedLine = (val, className, label, offset = -6) => {
    const y = yScale(val);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', `chart-line-dashed ${className}`);
    line.setAttribute('x1', PAD.left); line.setAttribute('y1', y);
    line.setAttribute('x2', W - PAD.right); line.setAttribute('y2', y);
    svg.appendChild(line);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('class', 'chart-label-text');
    text.setAttribute('x', W - PAD.right - 2); 
    text.setAttribute('y', y + offset);
    text.setAttribute('text-anchor', 'end');
    text.textContent = label;
    svg.appendChild(text);
  };

  if (maxP > minP) {
    // Draw Low line with text above it, High line with text below it
    addDashedLine(minP, 'chart-line-min', 'Low', -6);
    addDashedLine(maxP, 'chart-line-max', 'High', 12);
  }
  if (targetPrice > 0) addDashedLine(targetPrice, 'chart-line-target', 'Target', -6);

  const pts = raw.map((p, i) => ({ x: xScale(i), y: yScale(p.price), price: p.price, ts: p.ts }));

  const fillD = `M ${pts[0].x},${pts[0].y} ` +
    pts.slice(1).map(p => `L ${p.x},${p.y}`).join(' ') +
    ` L ${pts[pts.length - 1].x},${H - PAD.bottom} L ${pts[0].x},${H - PAD.bottom} Z`;
  const fill = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  fill.setAttribute('class', 'chart-fill');
  fill.setAttribute('d', fillD);
  svg.appendChild(fill);

  const lineD = `M ${pts[0].x},${pts[0].y} ` + pts.slice(1).map(p => `L ${p.x},${p.y}`).join(' ');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('class', 'chart-line');
  line.setAttribute('d', lineD);
  svg.appendChild(line);

  let tooltip = document.querySelector('.chart-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip hidden';
    tooltip.innerHTML = '<div class="chart-tooltip-price"></div><div class="chart-tooltip-delta" style="font-size:0.7rem; font-weight:600;"></div><div class="chart-tooltip-date"></div>';
    document.querySelector('.chart-wrap').appendChild(tooltip);
  }

  pts.forEach((pt, i) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('class', 'chart-dot');
    circle.setAttribute('cx', pt.x);
    circle.setAttribute('cy', pt.y);
    circle.setAttribute('r', 3.5);

    circle.addEventListener('mouseenter', () => {
      const svgRect = svg.getBoundingClientRect();
      const wrapRect = document.querySelector('.chart-wrap').getBoundingClientRect();
      const dotX = svgRect.left + pt.x * (svgRect.width / W) - wrapRect.left;
      const dotY = svgRect.top + pt.y * (svgRect.height / H) - wrapRect.top;
      tooltip.querySelector('.chart-tooltip-price').textContent = fmt(pt.price, currency);
      tooltip.querySelector('.chart-tooltip-date').textContent = new Date(pt.ts).toLocaleDateString();
      const deltaEl = tooltip.querySelector('.chart-tooltip-delta');
      if (i > 0) {
        const diff = pt.price - pts[i-1].price;
        if (diff > 0) { deltaEl.textContent = '+' + fmt(diff, currency); deltaEl.style.color = 'var(--red)'; }
        else if (diff < 0) { deltaEl.textContent = '-' + fmt(Math.abs(diff), currency); deltaEl.style.color = 'var(--green)'; }
        else deltaEl.textContent = '';
      } else {
        deltaEl.textContent = '';
      }

      tooltip.classList.remove('hidden');

      if (dotX > wrapRect.width - 70) {
        // Close to right edge -> anchor to the right
        tooltip.style.left = 'auto';
        tooltip.style.right = '4px';
        tooltip.style.transform = 'translate(0, -110%)';
      } else if (dotX < 70) {
        // Close to left edge -> anchor to the left
        tooltip.style.left = '4px';
        tooltip.style.right = 'auto';
        tooltip.style.transform = 'translate(0, -110%)';
      } else {
        // Center it above the dot
        tooltip.style.left = dotX + 'px';
        tooltip.style.right = 'auto';
        tooltip.style.transform = 'translate(-50%, -110%)';
      }

      tooltip.style.top = dotY + 'px';
    });
    circle.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));
    svg.appendChild(circle);
  });

  const idxs = [...new Set([0, Math.floor((raw.length - 1) / 2), raw.length - 1])];
  idxs.forEach(i => {
    const span = document.createElement('span');
    span.textContent = shortDate(raw[i].ts);
    labelsEl.appendChild(span);
  });

  const pctBadge = document.getElementById('chart-pct-badge');
  if (raw.length > 1) {
    const firstP = raw[0].price;
    const lastP = raw[raw.length - 1].price;
    if (firstP !== lastP) {
      const pct = Math.abs(Math.round(((lastP - firstP) / firstP) * 100));
      pctBadge.textContent = (lastP > firstP ? '↑ ' : '↓ ') + pct + '%';
      pctBadge.className = 'pct-badge ' + (lastP > firstP ? 'pct-up' : 'pct-down');
    } else {
      pctBadge.className = 'pct-badge hidden';
    }
  } else {
    pctBadge.className = 'pct-badge hidden';
  }
}

// ── Search & Filter ────────────────────────────────────────────────────────
let searchQuery = '';

document.getElementById('search-input').addEventListener('input', (e) => {
  searchQuery = e.target.value.toLowerCase();
  document.getElementById('search-clear').classList.toggle('hidden', !searchQuery);
  filterCards();
});

document.getElementById('search-clear').addEventListener('click', () => {
  document.getElementById('search-input').value = '';
  searchQuery = '';
  document.getElementById('search-clear').classList.add('hidden');
  filterCards();
});

function filterCards() {
  const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
  const listId = activeTab === 'history' ? 'history-list' : 'favs-list';
  const list = document.getElementById(listId);
  const cards = list.querySelectorAll('.item-card');
  let visibleCount = 0;
  
  cards.forEach(card => {
    const title = card.querySelector('.item-name').textContent.toLowerCase();
    const match = title.includes(searchQuery);
    card.classList.toggle('hidden', !match);
    if (match) visibleCount++;
  });
  
  let emptyStateId = activeTab === 'history' ? 'history-empty' : 'favs-empty';
  let emptyState = document.getElementById(emptyStateId);
  if (cards.length > 0 && visibleCount === 0) {
    emptyState.classList.remove('hidden');
    emptyState.querySelector('p').textContent = 'No results found.';
    emptyState.querySelector('small').textContent = 'Try a different search term.';
  } else if (cards.length > 0) {
    emptyState.classList.add('hidden');
  } else {
    emptyState.classList.remove('hidden');
    emptyState.querySelector('p').textContent = activeTab === 'history' ? 'No history yet.' : 'No favorites yet.';
    emptyState.querySelector('small').textContent = activeTab === 'history' ? 'Visit any Daraz product page and it will appear here automatically.' : 'Click the star on any history item to pin it.';
  }
}

// ── View navigation ────────────────────────────────────────────────────────
function showView(id) {
  ['main-view', 'detail-view', 'settings-view', 'compare-view'].forEach(v => {
    document.getElementById(v).classList.toggle('hidden', v !== id);
  });
}

// ── Detail view ─────────────────────────────────────────────────────────────
async function showDetail(fav) {
  showView('detail-view');
  const dv = document.getElementById('detail-view');
  dv.style.animation = 'none'; dv.offsetHeight; dv.style.animation = '';

  const img = document.getElementById('detail-img');
  img.src = fav.imageUrl || '';
  img.onerror = () => { img.parentElement.style.background = '#1e293b'; };

  document.getElementById('detail-title').textContent = cleanTitle(fav.title) || '—';

  const curr = fav.currentPrice || fav.price || 0;
  const orig = fav.originalPrice || 0;
  document.getElementById('detail-price').textContent = fmt(curr, fav.currency);

  const origEl = document.getElementById('detail-orig');
  const discEl = document.getElementById('detail-discount');
  if (orig > curr) {
    origEl.textContent = fmt(orig, fav.currency);
    origEl.classList.remove('hidden');
    discEl.textContent = `-${Math.round(((orig - curr) / orig) * 100)}%`;
    discEl.classList.remove('hidden');
  } else {
    origEl.classList.add('hidden');
    discEl.classList.add('hidden');
  }

  // ── Fake Discount Warning ──
  const fakeDiscountEl = document.getElementById('fake-discount-warning');
  if (fav.fakeDiscountWarning) {
    fakeDiscountEl.classList.remove('hidden');
  } else {
    fakeDiscountEl.classList.add('hidden');
  }

  // ── Shipping Fee ──
  const shipEl = document.getElementById('detail-shipping');
  if (fav.shippingFee !== undefined) {
    if (fav.shippingFee === 0) {
      shipEl.innerHTML = `<span style="color:#10b981; font-weight: 500;">Free Shipping</span> • Total: ${fmt(curr, fav.currency)}`;
    } else {
      shipEl.textContent = `+ ${fmt(fav.shippingFee, fav.currency)} Shipping • Total: ${fmt(curr + fav.shippingFee, fav.currency)}`;
    }
    shipEl.classList.remove('hidden');
  } else {
    shipEl.classList.add('hidden');
  }

  // ── Seller Info ──
  const sellerEl = document.getElementById('detail-seller');
  if (fav.seller) {
    let ratingColor = '#94a3b8'; // default grey
    const rMatch = fav.seller.rating.match(/(\d+)%/);
    if (rMatch) {
      const score = parseInt(rMatch[1]);
      if (score >= 90) ratingColor = '#10b981'; // green
      else if (score >= 75) ratingColor = '#fbbf24'; // yellow
      else ratingColor = '#ef4444'; // red
    }
    sellerEl.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      <span>Sold by <b>${fav.seller.name}</b></span>
      <span style="color: ${ratingColor}; font-weight: 500;">(${fav.seller.rating})</span>
    `;
    sellerEl.classList.remove('hidden');
  } else {
    sellerEl.classList.add('hidden');
  }

  document.getElementById('detail-visit-btn').href = fav.url || '#';

  const history = fav.priceHistory || [{ price: curr, ts: fav.lastUpdated || Date.now() }];
  const histPrices = history.map(h => h.price);
  document.getElementById('stat-low').textContent = fmt(Math.min(...histPrices), fav.currency);
  document.getElementById('stat-high').textContent = fmt(Math.max(...histPrices), fav.currency);
  document.getElementById('stat-points').textContent = history.length + (history.length === 1 ? ' pt' : ' pts');

  renderChart(history, fav.currency, fav.targetPrice);
  currentDetailFav = fav;
  renderDetailTags();

  const trend = getTrend(history);
  const detailTrendIcon = document.getElementById('detail-trend-icon');
  detailTrendIcon.textContent = trend ? trend.icon : '';
  detailTrendIcon.style.color = trend ? trend.color : '';

  const dealBadge = document.getElementById('detail-deal-badge');
  const deal = getDealBadge(curr, fav.lowestPrice, fav.highestPrice);
  if (deal) {
    dealBadge.className = 'deal-badge ' + deal.class;
    dealBadge.classList.remove('hidden');
    dealBadge.textContent = deal.icon + ' ' + deal.text;
  } else {
    dealBadge.className = 'deal-badge hidden';
  }

  const targetInputWrap = document.getElementById('target-input-wrap');
  const targetBadgeWrap = document.getElementById('target-badge-wrap');
  if (fav.targetPrice > 0) {
    targetInputWrap.classList.add('hidden');
    targetBadgeWrap.classList.remove('hidden');
    document.getElementById('target-val').textContent = fmt(fav.targetPrice, fav.currency);
  } else {
    targetInputWrap.classList.remove('hidden');
    targetBadgeWrap.classList.add('hidden');
    document.getElementById('target-input').value = '';
  }

  // ── Smart Sale Predictor ──
  const saleBanner = document.getElementById('smart-sale-banner');
  const saleText = document.getElementById('smart-sale-text');
  const upcomingSale = getUpcomingSale();
  if (upcomingSale && upcomingSale.daysLeft <= 14) {
    saleText.innerHTML = `Wait! The <b>${upcomingSale.name}</b> sale is in ${upcomingSale.daysLeft} days.`;
    saleBanner.classList.remove('hidden');
  } else {
    saleBanner.classList.add('hidden');
  }

  // Promotions
  const promosDiv = document.getElementById('detail-promos');
  if (fav.promotions && fav.promotions.length > 0) {
    promosDiv.innerHTML = '';
    fav.promotions.forEach(p => {
      const span = document.createElement('span');
      span.className = 'tag-pill';
      span.style.background = 'rgba(245, 158, 11, 0.2)';
      span.style.color = '#fbbf24';
      span.style.border = '1px solid rgba(245, 158, 11, 0.3)';
      span.textContent = p;
      promosDiv.appendChild(span);
    });
    promosDiv.classList.remove('hidden');
  } else {
    promosDiv.classList.add('hidden');
  }
}

// ── Settings view ───────────────────────────────────────────────────────────
async function showSettings() {
  showView('settings-view');

  const data = await new Promise(res =>
    chrome.storage.local.get(['settings', 'favorites', 'last_refresh_ts', 'recently_viewed'], res)
  );
  const settings = data.settings || {};
  const favorites = data.favorites || {};
  const lastRefreshTs = data.last_refresh_ts || null;
  const historyItems = data.recently_viewed || [];

  const interval = settings.refreshIntervalMinutes || 360;

  // Highlight correct interval pill
  document.querySelectorAll('#interval-group .pill').forEach(pill => {
    pill.classList.toggle('active', Number(pill.dataset.minutes) === interval);
  });

  // Highlight correct history limit pill
  const histLimit = settings.historyLimit || 20;
  document.querySelectorAll('#history-limit-group .pill').forEach(pill => {
    pill.classList.toggle('active', Number(pill.dataset.limit) === histLimit);
  });
  document.getElementById('current-history-count').textContent = historyItems.length;

  // Highlight correct theme pill
  const theme = settings.theme || 'dark';
  document.querySelectorAll('#theme-group .pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.theme === theme);
  });

  // Notification toggle
  document.getElementById('notif-toggle').checked = settings.notifications !== false;

  // Status values
  document.getElementById('last-refresh-val').textContent = timeAgo(lastRefreshTs);
  document.getElementById('fav-tracked-val').textContent = Object.keys(favorites).length;

  // Next refresh
  chrome.alarms.get('daraz_price_refresh', (alarm) => {
    if (alarm) {
      const mins = Math.round((alarm.scheduledTime - Date.now()) / 60000);
      document.getElementById('next-refresh-val').textContent =
        mins <= 0 ? 'Very soon' : mins < 60 ? `${mins}m` : `${Math.round(mins/60)}h ${mins%60}m`;
    } else {
      document.getElementById('next-refresh-val').textContent = 'Not scheduled';
    }
  });
}

async function saveInterval(minutes) {
  const data = await new Promise(res => chrome.storage.local.get('settings', res));
  const settings = data.settings || {};
  settings.refreshIntervalMinutes = minutes;
  await new Promise(res => chrome.storage.local.set({ settings }, res));

  // Tell background to reschedule the alarm
  chrome.runtime.sendMessage({ action: 'reschedule_alarm', intervalMinutes: minutes }, () => {});

  // Update pill highlight
  document.querySelectorAll('#interval-group .pill').forEach(pill => {
    pill.classList.toggle('active', Number(pill.dataset.minutes) === minutes);
  });

  // Refresh next-refresh display
  setTimeout(() => {
    chrome.alarms.get('daraz_price_refresh', (alarm) => {
      if (alarm) {
        const mins = Math.round((alarm.scheduledTime - Date.now()) / 60000);
        document.getElementById('next-refresh-val').textContent =
          mins <= 0 ? 'Very soon' : mins < 60 ? `${mins}m` : `${Math.round(mins/60)}h ${mins%60}m`;
      }
    });
  }, 600);
}

async function saveHistoryLimit(limit) {
  const data = await new Promise(res => chrome.storage.local.get(['settings', 'recently_viewed'], res));
  const settings = data.settings || {};
  let history = data.recently_viewed || [];

  settings.historyLimit = limit;

  // Trim existing history to new limit immediately
  if (history.length > limit) {
    history = history.slice(0, limit);
  }

  await new Promise(res => chrome.storage.local.set({ settings, recently_viewed: history }, res));

  // Update pill highlight
  document.querySelectorAll('#history-limit-group .pill').forEach(pill => {
    pill.classList.toggle('active', Number(pill.dataset.limit) === limit);
  });
  document.getElementById('current-history-count').textContent = history.length;
}

// ── Card builder ────────────────────────────────────────────────────────────
// ── Smart Sale Calendar ──
function getUpcomingSale() {
  const sales = [
    { name: "Avurudu/Eid", month: 3, date: 10 }, // April 10 (0-indexed month)
    { name: "Daraz Birthday", month: 2, date: 15 }, // March 15
    { name: "11.11", month: 10, date: 11 }, // Nov 11
    { name: "12.12", month: 11, date: 12 }  // Dec 12
  ];
  
  const now = new Date();
  let nextSale = null;
  let minDays = Infinity;
  
  sales.forEach(sale => {
    let saleDate = new Date(now.getFullYear(), sale.month, sale.date);
    if (now > saleDate) {
      saleDate.setFullYear(now.getFullYear() + 1);
    }
    const diffTime = Math.abs(saleDate - now);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    if (diffDays < minDays) {
      minDays = diffDays;
      nextSale = { ...sale, daysLeft: diffDays };
    }
  });
  
  return nextSale;
}

function makeCard(product, isFav, onStarClick, onCardClick) {
  const card = document.createElement('div');
  card.className = 'item-card';
  card.addEventListener('click', (e) => {
    if (e.target.closest('.star-btn')) return;
    onCardClick(product);
  });

  card.appendChild(makeThumb(product.imageUrl));

  const meta = document.createElement('div');
  meta.className = 'item-meta';
  const name = document.createElement('div');
  name.className = 'item-name';
  name.textContent = cleanTitle(product.title) || 'Unknown product';
  if (product.fakeDiscountWarning) {
    const w = document.createElement('span');
    w.innerHTML = ' ⚠️';
    w.title = 'Seller inflated original price to fake discount';
    name.appendChild(w);
  }
  meta.appendChild(name);
  const time = document.createElement('div');
  time.className = 'item-time';
  time.textContent = timeAgo(product.lastUpdated);
  meta.appendChild(time);
  card.appendChild(meta);

  const pricing = document.createElement('div');
  pricing.className = 'item-pricing';

  const trend = getTrend(product.priceHistory);
  const priceEl = document.createElement('div');
  priceEl.className = 'item-price';
  priceEl.textContent = fmt(product.currentPrice || product.price, product.currency);
  if (trend) {
    const trendEl = document.createElement('span');
    trendEl.className = 'trend-icon';
    trendEl.textContent = ' ' + trend.icon;
    trendEl.style.color = trend.color;
    priceEl.appendChild(trendEl);
  }
  pricing.appendChild(priceEl);

  const orig = product.originalPrice || 0;
  const curr = product.currentPrice || product.price || 0;
  if (orig > curr) {
    const origEl = document.createElement('div');
    origEl.className = 'item-orig';
    origEl.textContent = fmt(orig, product.currency);
    pricing.appendChild(origEl);
  }

  // All badges live in one flex-wrap row so they never visually collide
  const badgesRow = document.createElement('div');
  badgesRow.className = 'badges-row';

  if (orig > curr) {
    const badge = document.createElement('div');
    badge.className = 'badge sale';
    badge.textContent = `-${Math.round(((orig - curr) / orig) * 100)}%`;
    badgesRow.appendChild(badge);
  }

  const deal = getDealBadge(product.currentPrice || product.price, product.lowestPrice, product.highestPrice);
  if (deal) {
    const dealBadge = document.createElement('div');
    dealBadge.className = 'deal-badge ' + deal.class;
    dealBadge.textContent = deal.icon + ' ' + deal.text;
    badgesRow.appendChild(dealBadge);
  }

  if (product.inStock === false) {
    const stockBadge = document.createElement('div');
    stockBadge.className = 'badge';
    stockBadge.style.background = 'rgba(244, 63, 94, 0.15)';
    stockBadge.style.color = 'var(--red)';
    stockBadge.textContent = 'Out of Stock';
    badgesRow.appendChild(stockBadge);
  }

  if (product.justRestocked) {
    const restockBadge = document.createElement('div');
    restockBadge.className = 'badge';
    restockBadge.style.background = 'rgba(16, 185, 129, 0.15)';
    restockBadge.style.color = 'var(--green)';
    restockBadge.textContent = '🔔 Back in Stock!';
    badgesRow.appendChild(restockBadge);
  }

  if (product.promotions && product.promotions.length > 0) {
    const promoBadge = document.createElement('div');
    promoBadge.className = 'badge';
    promoBadge.style.background = 'rgba(245, 158, 11, 0.15)';
    promoBadge.style.color = 'var(--gold)';
    promoBadge.textContent = '🏷️ Offers';
    badgesRow.appendChild(promoBadge);
  }

  if (badgesRow.children.length > 0) pricing.appendChild(badgesRow);

  card.appendChild(pricing);

  const star = document.createElement('button');
  star.className = 'star-btn' + (isFav ? ' pinned' : '');
  star.title = isFav ? 'Remove from favorites' : 'Add to favorites';
  star.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? '#f59e0b' : 'none'}" stroke="${isFav ? '#f59e0b' : 'currentColor'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  star.addEventListener('click', (e) => { e.stopPropagation(); onStarClick(product); });
  card.appendChild(star);

  return card;
}

// ── Toggle favorite ─────────────────────────────────────────────────────────
async function toggleFav(product, currentFavs) {
  const key = `${product.itemId}_${product.skuId}`;
  const data = await new Promise(res => chrome.storage.local.get('favorites', res));
  const favorites = data.favorites || currentFavs || {};

  if (favorites[key]) {
    delete favorites[key];
  } else {
    const price = product.price || product.currentPrice || 0;
    const origPrice = product.originalPrice || price;
    favorites[key] = {
      itemId: product.itemId, skuId: product.skuId, key,
      title: cleanTitle(product.title), price, currentPrice: price, originalPrice: origPrice,
      currency: product.currency || 'Rs.', imageUrl: product.imageUrl || '', url: product.url,
      lowestPrice: price, highestPrice: price, targetPrice: 0,
      dateAdded: Date.now(), lastUpdated: Date.now(),
      priceHistory: [{ price, ts: Date.now() }]
    };
  }

  await new Promise(res => chrome.storage.local.set({ favorites }, res));
  await loadAll();
}

// ── Sort ─────────────────────────────────────────────────────────────────────
let currentSort = 'recent';
document.getElementById('sort-select').addEventListener('change', (e) => {
  currentSort = e.target.value;
  loadAll();
});

// ── Main load ────────────────────────────────────────────────────────────────
async function loadAll() {
  const data = await new Promise(res =>
    chrome.storage.local.get(['recently_viewed', 'favorites', 'current_page_product'], res)
  );
  const history = data.recently_viewed || [];
  const favorites = data.favorites || {};
  const currentProduct = data.current_page_product || null;

  // Active card
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const onDaraz = tab && tab.url && /daraz\.(pk|lk|com\.bd|com\.np)\/products\//.test(tab.url);
  const activeCard = document.getElementById('active-card');

  if (onDaraz && currentProduct) {
    document.getElementById('active-title').textContent = cleanTitle(currentProduct.title) || '—';
    document.getElementById('active-price').textContent = fmt(currentProduct.price || currentProduct.currentPrice, currentProduct.currency);
    document.getElementById('active-img').src = currentProduct.imageUrl || '';
    const origVal = currentProduct.originalPrice || 0;
    const currVal = currentProduct.price || currentProduct.currentPrice || 0;
    const origEl = document.getElementById('active-orig');
    if (origVal > currVal) { origEl.textContent = fmt(origVal, currentProduct.currency); origEl.classList.remove('hidden'); }
    else origEl.classList.add('hidden');

    const key = `${currentProduct.itemId}_${currentProduct.skuId}`;
    const isPinned = !!favorites[key];
    document.getElementById('pin-btn').className = 'pin-btn' + (isPinned ? ' pinned' : '');
    document.getElementById('pin-label').textContent = isPinned ? 'Pinned ★' : 'Pin to Favorites';
    activeCard.classList.remove('hidden');
  } else {
    activeCard.classList.add('hidden');
  }

  // History tab
  const histList = document.getElementById('history-list');
  const histEmpty = document.getElementById('history-empty');
  document.getElementById('hist-count').textContent = history.length;
  histList.innerHTML = '';
  if (history.length === 0) { histEmpty.classList.remove('hidden'); }
  else {
    histEmpty.classList.add('hidden');
    history.forEach(p => {
      const key = `${p.itemId}_${p.skuId}`;
      histList.appendChild(makeCard(p, !!favorites[key],
        (prod) => toggleFav(prod, favorites),
        (prod) => chrome.tabs.create({ url: prod.url })
      ));
    });
  }

  // Favorites tab
  const favsList = document.getElementById('favs-list');
  const favsEmpty = document.getElementById('favs-empty');
  const favKeys = Object.keys(favorites);
  document.getElementById('fav-count').textContent = favKeys.length;
  favsList.innerHTML = '';
  if (favKeys.length === 0) { favsEmpty.classList.remove('hidden'); }
  else {
    favsEmpty.classList.add('hidden');

    const allTags = new Set();
    Object.values(favorites).forEach(f => {
      if (f.tags) f.tags.forEach(t => allTags.add(t));
    });
    const filterRow = document.getElementById('favs-tag-filter');
    if (allTags.size > 0) {
      filterRow.innerHTML = '';
      filterRow.classList.remove('hidden');
      const addFilter = (tag) => {
        const p = document.createElement('div');
        p.className = 'tag-filter-pill' + (activeTagFilter === tag ? ' active' : '');
        p.textContent = tag;
        p.onclick = () => {
          activeTagFilter = tag;
          loadAll();
        };
        filterRow.appendChild(p);
      };
      addFilter('All');
      [...allTags].sort().forEach(t => addFilter(t));
    } else {
      filterRow.classList.add('hidden');
    }

    let favArr = Object.values(favorites);
    if (activeTagFilter !== 'All') {
      favArr = favArr.filter(f => f.tags && f.tags.includes(activeTagFilter));
      if (favArr.length === 0) {
        favsEmpty.classList.remove('hidden');
        favsEmpty.querySelector('p').textContent = `No favorites tagged "${activeTagFilter}".`;
        favsEmpty.querySelector('small').textContent = 'Try another tag.';
      }
    }
    
    if (currentSort === 'recent') {
      favArr.sort((a, b) => (b.lastUpdated || b.dateAdded || 0) - (a.lastUpdated || a.dateAdded || 0));
    } else if (currentSort === 'price_asc') {
      favArr.sort((a, b) => (a.currentPrice || a.price) - (b.currentPrice || b.price));
    } else if (currentSort === 'price_desc') {
      favArr.sort((a, b) => (b.currentPrice || b.price) - (a.currentPrice || a.price));
    } else if (currentSort === 'discount') {
      favArr.sort((a, b) => {
        const pA = a.currentPrice || a.price || 0;
        const oA = a.originalPrice || pA;
        const dA = oA > pA ? ((oA - pA) / oA) : 0;
        
        const pB = b.currentPrice || b.price || 0;
        const oB = b.originalPrice || pB;
        const dB = oB > pB ? ((oB - pB) / oB) : 0;
        
        return dB - dA;
      });
    } else if (currentSort === 'name') {
      favArr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    favArr.forEach(p => {
      const key = p.key || `${p.itemId}_${p.skuId}`;
      let cb = null; // compare checkbox ref, set below if compareMode is on

      const card = makeCard(p, true,
        (prod) => toggleFav(prod, favorites),
        (prod) => {
          if (compareMode) {
            toggleCompareSelect(key, card, cb);
          } else {
            showDetail(prod);
          }
        }
      );

      if (compareMode) {
        card.classList.add('has-checkbox');
        cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'compare-checkbox';
        cb.checked = compareSelection.has(key);
        cb.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleCompareSelect(key, card, cb);
        });
        card.insertBefore(cb, card.firstChild);
        if (compareSelection.has(key)) card.classList.add('comparing');
      }

      favsList.appendChild(card);
    });

    // Clear "just restocked" flags after showing them once
    const toClear = favArr.filter(f => f.justRestocked).map(f => f.key);
    if (toClear.length > 0) {
      chrome.storage.local.get('favorites', (freshData) => {
        const freshFavs = freshData.favorites || {};
        toClear.forEach(k => { if (freshFavs[k]) freshFavs[k].justRestocked = false; });
        chrome.storage.local.set({ favorites: freshFavs });
      });
    }
  }

  updateCompareToast();
  if (typeof filterCards === 'function') filterCards();
}

// ── Wire up all event listeners ──────────────────────────────────────────────

// Tab buttons
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById('pane-' + btn.dataset.tab).classList.remove('hidden');
    if (typeof filterCards === 'function') filterCards();
  });
});

// Back buttons
document.getElementById('back-btn').addEventListener('click', () => showView('main-view'));
document.getElementById('settings-back-btn').addEventListener('click', () => showView('main-view'));
document.getElementById('compare-back-btn').addEventListener('click', () => showView('main-view'));



// Settings button
document.getElementById('settings-btn').addEventListener('click', showSettings);

// Refresh button — re-extract current page price + fetch all favorites
document.getElementById('refresh-btn').addEventListener('click', async () => {
  const btn = document.getElementById('refresh-btn');
  if (btn.disabled) return;

  btn.disabled = true;
  btn.classList.add('spinning');
  btn.title = 'Refreshing prices...';

  try {
    // Step 1: If on a Daraz product page, re-inject content.js to capture current price
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && /daraz\.(pk|lk|com\.bd|com\.np)\/products\//.test(tab.url)) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        // Wait a moment for content.js to extract and save
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.warn('Could not re-inject content.js:', e);
      }
    }

    // Step 2: Background refresh all favorites via HTTP
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'refresh_now' }, (response) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(response);
      });
    });
  } catch (err) {
    console.warn('Refresh error:', err);
  }

  // Reload UI with updated data
  await loadAll();

  btn.disabled = false;
  btn.classList.remove('spinning');
  btn.title = 'Refresh prices from Daraz';
});

// Pin button on active card
document.getElementById('pin-btn').addEventListener('click', async () => {
  const data = await new Promise(res =>
    chrome.storage.local.get(['current_page_product', 'favorites'], res)
  );
  if (data.current_page_product) await toggleFav(data.current_page_product, data.favorites || {});
});

// Target buttons
document.getElementById('save-target-btn').addEventListener('click', async () => {
  const input = document.getElementById('target-input');
  const val = parseFloat(input.value);
  if (val > 0 && currentDetailFav) {
    currentDetailFav.targetPrice = val;
    const data = await new Promise(res => chrome.storage.local.get('favorites', res));
    if (data.favorites && data.favorites[currentDetailFav.key]) {
      data.favorites[currentDetailFav.key] = currentDetailFav;
      await new Promise(res => chrome.storage.local.set({ favorites: data.favorites }, res));
      showDetail(currentDetailFav);
      await loadAll();
    }
  }
});

document.getElementById('clear-target-btn').addEventListener('click', async () => {
  if (currentDetailFav) {
    currentDetailFav.targetPrice = 0;
    const data = await new Promise(res => chrome.storage.local.get('favorites', res));
    if (data.favorites && data.favorites[currentDetailFav.key]) {
      data.favorites[currentDetailFav.key] = currentDetailFav;
      await new Promise(res => chrome.storage.local.set({ favorites: data.favorites }, res));
      showDetail(currentDetailFav);
      await loadAll();
    }
  }
});

// Visit button in detail view
document.getElementById('detail-visit-btn').addEventListener('click', (e) => {
  e.preventDefault();
  const url = document.getElementById('detail-visit-btn').href;
  if (url && url !== '#') chrome.tabs.create({ url });
});

// Pill interval selector
document.getElementById('interval-group').addEventListener('click', (e) => {
  const pill = e.target.closest('.pill');
  if (pill) saveInterval(Number(pill.dataset.minutes));
});

// History limit selector
document.getElementById('history-limit-group').addEventListener('click', (e) => {
  const pill = e.target.closest('.pill');
  if (pill) saveHistoryLimit(Number(pill.dataset.limit));
});

// Theme selector
document.getElementById('theme-group').addEventListener('click', async (e) => {
  const pill = e.target.closest('.pill');
  if (pill) {
    const theme = pill.dataset.theme;
    document.documentElement.setAttribute('data-theme', theme);
    const data = await new Promise(res => chrome.storage.local.get('settings', res));
    const settings = data.settings || {};
    settings.theme = theme;
    await new Promise(res => chrome.storage.local.set({ settings }, res));
    document.querySelectorAll('#theme-group .pill').forEach(p => {
      p.classList.toggle('active', p.dataset.theme === theme);
    });
  }
});

// Notification toggle
document.getElementById('notif-toggle').addEventListener('change', async (e) => {
  const data = await new Promise(res => chrome.storage.local.get('settings', res));
  const settings = data.settings || {};
  settings.notifications = e.target.checked;
  await new Promise(res => chrome.storage.local.set({ settings }, res));
});

// Refresh Now button
document.getElementById('refresh-now-btn').addEventListener('click', async () => {
  const btn = document.getElementById('refresh-now-btn');
  const label = document.getElementById('refresh-now-label');
  btn.disabled = true;
  btn.classList.add('spinning');
  label.textContent = 'Refreshing…';

  chrome.runtime.sendMessage({ action: 'refresh_now' }, (resp) => {
    setTimeout(() => {
      btn.disabled = false;
      btn.classList.remove('spinning');
      label.textContent = 'Refresh Now';
      // Update last refresh display
      document.getElementById('last-refresh-val').textContent = 'Just now';
    }, 1000);
  });
});

// Clear all data button
document.getElementById('clear-data-btn').addEventListener('click', async () => {
  const confirmed = await showConfirm();
  if (!confirmed) return;
  await new Promise(res => chrome.storage.local.clear(res));
  await new Promise(res => chrome.storage.local.set({
    recently_viewed: [], favorites: {}, settings: {}
  }, res));
  showView('main-view');
  await loadAll();
});

// ── Boot ──────────────────────────────────────────────────────────────────────
chrome.storage.local.get('settings', data => {
  if (data.settings && data.settings.theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
});
loadAll();

// ── Tags ───────────────────────────────────────────────────────────────────
let activeTagFilter = 'All';
let currentDetailFav = null;

const tagColors = [
  { bg: 'rgba(244, 63, 94, 0.2)', color: '#fb7185', border: 'rgba(244, 63, 94, 0.3)' },
  { bg: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' },
  { bg: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: 'rgba(16, 185, 129, 0.3)' },
  { bg: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)' },
  { bg: 'rgba(129, 140, 248, 0.2)', color: '#818cf8', border: 'rgba(129, 140, 248, 0.3)' },
  { bg: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' }
];
function getTagColor(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return tagColors[Math.abs(hash) % tagColors.length];
}

function renderDetailTags() {
  const list = document.getElementById('detail-tags-list');
  list.innerHTML = '';
  if (!currentDetailFav) return;
  const tags = currentDetailFav.tags || [];
  tags.forEach(tag => {
    const c = getTagColor(tag);
    const pill = document.createElement('div');
    pill.className = 'tag-pill';
    pill.style.background = c.bg;
    pill.style.color = c.color;
    pill.style.border = `1px solid ${c.border}`;
    pill.textContent = tag;
    
    const x = document.createElement('span');
    x.className = 'remove-tag';
    x.textContent = '×';
    x.onclick = async () => {
      currentDetailFav.tags = currentDetailFav.tags.filter(t => t !== tag);
      const data = await new Promise(res => chrome.storage.local.get('favorites', res));
      if (data.favorites && data.favorites[currentDetailFav.key]) {
        data.favorites[currentDetailFav.key] = currentDetailFav;
        await new Promise(res => chrome.storage.local.set({ favorites: data.favorites }, res));
        await loadAll();
      }
      renderDetailTags();
    };
    pill.appendChild(x);
    list.appendChild(pill);
  });
}

document.getElementById('add-tag-btn').addEventListener('click', async () => {
  const input = document.getElementById('tag-input');
  const val = input.value.trim().toLowerCase();
  if (val && currentDetailFav) {
    currentDetailFav.tags = currentDetailFav.tags || [];
    if (!currentDetailFav.tags.includes(val)) {
      currentDetailFav.tags.push(val);
      const data = await new Promise(res => chrome.storage.local.get('favorites', res));
      if (data.favorites && data.favorites[currentDetailFav.key]) {
        data.favorites[currentDetailFav.key] = currentDetailFav;
        await new Promise(res => chrome.storage.local.set({ favorites: data.favorites }, res));
        await loadAll();
      }
      renderDetailTags();
    }
    input.value = '';
  }
});

// ── Export / Import & Toast ──────────────────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

document.getElementById('export-json-btn').addEventListener('click', () => {
  chrome.storage.local.get(null, data => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: 'daraz_tracker_backup.json' }, () => {
      showToast('Exported!');
    });
  });
});

document.getElementById('export-csv-btn').addEventListener('click', () => {
  chrome.storage.local.get('favorites', data => {
    const favs = data.favorites || {};
    let csv = 'Title,Current Price,Original Price,Lowest Price,Highest Price,URL,Date Added\n';
    
    Object.values(favs).forEach(f => {
      const escape = (str) => `"${String(str || '').replace(/"/g, '""')}"`;
      csv += [
        escape(cleanTitle(f.title)),
        f.currentPrice || f.price || 0,
        f.originalPrice || 0,
        f.lowestPrice || f.currentPrice || 0,
        f.highestPrice || f.currentPrice || 0,
        escape(f.url),
        escape(new Date(f.dateAdded || Date.now()).toISOString())
      ].join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: 'daraz_favorites.csv' }, () => {
      showToast('Exported!');
    });
  });
});

document.getElementById('import-btn').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data && typeof data === 'object') {
        const current = await new Promise(res => chrome.storage.local.get(null, res));
        const mergedFavs = { ...(current.favorites || {}), ...(data.favorites || {}) };
        const mergedHist = [...(current.recently_viewed || []), ...(data.recently_viewed || [])];
        const uniqueHist = [];
        const seen = new Set();
        for (const item of mergedHist) {
          const k = item.itemId + '_' + item.skuId;
          if (!seen.has(k)) { seen.add(k); uniqueHist.push(item); }
        }
        await new Promise(res => chrome.storage.local.set({
          favorites: mergedFavs,
          recently_viewed: uniqueHist,
          settings: { ...(current.settings || {}), ...(data.settings || {}) }
        }, res));
        showToast('Imported!');
        await loadAll();
      } else {
        showToast('Invalid file');
      }
    } catch (err) {
      showToast('Invalid file');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

// ── Price Comparison ─────────────────────────────────────────────────────────
let compareMode = false;
let compareSelection = new Set();

function updateCompareToast() {
  const toast = document.getElementById('compare-toast');
  const count = compareSelection.size;
  document.getElementById('compare-count').textContent = `${count} selected`;
  const doBtn = document.getElementById('do-compare-btn');
  doBtn.disabled = count < 2;
  toast.classList.toggle('hidden', !compareMode);
}

function toggleCompareSelect(key, card, cbEl) {
  if (compareSelection.has(key)) {
    compareSelection.delete(key);
    card.classList.remove('comparing');
    if (cbEl) cbEl.checked = false;
  } else {
    if (compareSelection.size >= 3) {
      showToast('You can compare up to 3 items');
      if (cbEl) cbEl.checked = false;
      return;
    }
    compareSelection.add(key);
    card.classList.add('comparing');
    if (cbEl) cbEl.checked = true;
  }
  updateCompareToast();
}

document.getElementById('compare-mode-btn').addEventListener('click', () => {
  compareMode = !compareMode;
  document.getElementById('compare-mode-btn').classList.toggle('active', compareMode);
  if (!compareMode) compareSelection.clear();
  updateCompareToast();
  loadAll();
});

document.getElementById('cancel-compare-btn').addEventListener('click', () => {
  compareMode = false;
  compareSelection.clear();
  document.getElementById('compare-mode-btn').classList.remove('active');
  updateCompareToast();
  loadAll();
});

document.getElementById('do-compare-btn').addEventListener('click', async () => {
  if (compareSelection.size < 2) return;
  const data = await new Promise(res => chrome.storage.local.get('favorites', res));
  const favorites = data.favorites || {};
  const favArr = [...compareSelection].map(k => favorites[k]).filter(Boolean);
  if (favArr.length < 2) { showToast('Select at least 2 items'); return; }
  renderCompareView(favArr);
  showView('compare-view');
});

function renderCompareView(favArr) {
  const thRow = document.getElementById('compare-th-row');
  const tbody = document.getElementById('compare-tbody');
  thRow.innerHTML = '<th></th>';
  tbody.innerHTML = '';

  favArr.forEach(f => {
    const th = document.createElement('th');
    const img = document.createElement('img');
    img.src = f.imageUrl || '';
    img.alt = '';
    th.appendChild(img);
    const titleDiv = document.createElement('div');
    titleDiv.className = 'compare-title-cell';
    titleDiv.textContent = cleanTitle(f.title) || 'Unknown product';
    th.appendChild(titleDiv);
    thRow.appendChild(th);
  });

  const rows = [
    { label: 'Price', get: f => f.currentPrice || f.price || 0, isCurrency: true, lowerIsBetter: true },
    { label: 'Original Price', get: f => f.originalPrice || 0, isCurrency: true },
    {
      label: 'Discount',
      get: f => {
        const c = f.currentPrice || f.price || 0;
        const o = f.originalPrice || c;
        return o > c ? `-${Math.round(((o - c) / o) * 100)}%` : '—';
      }
    },
    { label: 'Lowest Ever', get: f => f.lowestPrice || f.currentPrice || f.price || 0, isCurrency: true },
    { label: 'Highest Ever', get: f => f.highestPrice || f.currentPrice || f.price || 0, isCurrency: true },
    {
      label: 'Trend',
      get: f => { const t = getTrend(f.priceHistory); return t ? t.icon : '—'; },
      getColor: f => { const t = getTrend(f.priceHistory); return t ? t.color : null; }
    },
    {
      label: 'Deal Rating',
      get: f => {
        const d = getDealBadge(f.currentPrice || f.price, f.lowestPrice, f.highestPrice);
        return d ? `${d.icon} ${d.text}` : '—';
      }
    },
    {
      label: 'Stock',
      get: f => f.inStock === false ? '❌ Out of Stock' : '✅ In Stock'
    }
  ];

  rows.forEach(row => {
    const tr = document.createElement('tr');
    const labelTd = document.createElement('td');
    labelTd.textContent = row.label;
    labelTd.style.fontWeight = '700';
    labelTd.style.textAlign = 'left';
    tr.appendChild(labelTd);

    const rawValues = favArr.map(row.get);
    let bestIdx = -1;
    if (row.lowerIsBetter) {
      const nums = rawValues.map(Number);
      bestIdx = nums.indexOf(Math.min(...nums));
    }

    favArr.forEach((f, i) => {
      const td = document.createElement('td');
      td.textContent = row.isCurrency ? fmt(rawValues[i], f.currency) : rawValues[i];
      if (row.getColor) {
        const c = row.getColor(f);
        if (c) td.style.color = c;
      }
      if (i === bestIdx) td.classList.add('best-value');
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  // Visit links row
  const visitTr = document.createElement('tr');
  visitTr.appendChild(document.createElement('td'));
  favArr.forEach(f => {
    const td = document.createElement('td');
    const a = document.createElement('a');
    a.href = f.url || '#';
    a.textContent = 'Visit ↗';
    a.className = 'visit-btn';
    a.style.fontSize = '0.65rem';
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (f.url) chrome.tabs.create({ url: f.url });
    });
    td.appendChild(a);
    visitTr.appendChild(td);
  });
  tbody.appendChild(visitTr);
}

// ── Wishlist Sharing ──────────────────────────────────────────────────────────
document.getElementById('share-wishlist-btn').addEventListener('click', async () => {
  const data = await new Promise(res => chrome.storage.local.get('favorites', res));
  const favorites = data.favorites || {};
  const favArr = Object.values(favorites);

  if (favArr.length === 0) {
    showToast('No favorites to share yet');
    return;
  }

  let text = '🛒 My Daraz Wishlist\n\n';
  favArr.forEach((f, i) => {
    const curr = f.currentPrice || f.price || 0;
    const orig = f.originalPrice || 0;
    const priceStr = fmt(curr, f.currency);
    const wasStr = orig > curr ? ` (was ${fmt(orig, f.currency)})` : '';
    text += `${i + 1}. ${cleanTitle(f.title)}\n   ${priceStr}${wasStr}\n   ${f.url}\n\n`;
  });
  text += 'Tracked with Daraz Price Tracker';

  try {
    await navigator.clipboard.writeText(text);
    showToast('📋 Copied to clipboard!');
  } catch (err) {
    showToast('Could not copy to clipboard');
  }
});
