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
function fmt(price) {
  if (!price && price !== 0) return '—';
  return 'Rs. ' + Number(price).toLocaleString();
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
function renderChart(priceHistory) {
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

  const W = 340, H = 120, PAD = { top: 10, right: 6, bottom: 6, left: 6 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const prices = raw.map(p => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
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
    tooltip.innerHTML = '<div class="chart-tooltip-price"></div><div class="chart-tooltip-date"></div>';
    document.querySelector('.chart-wrap').appendChild(tooltip);
  }

  pts.forEach((pt) => {
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
      tooltip.querySelector('.chart-tooltip-price').textContent = fmt(pt.price);
      tooltip.querySelector('.chart-tooltip-date').textContent = new Date(pt.ts).toLocaleDateString();

      // Clamp tooltip so it doesn't overflow left or right edges
      const tooltipW = tooltip.offsetWidth || 80;
      const minLeft = tooltipW / 2 + 4;  // half width + small padding
      const maxLeft = wrapRect.width - tooltipW / 2 - 4;
      const clampedX = Math.max(minLeft, Math.min(dotX, maxLeft));

      tooltip.style.left = clampedX + 'px';
      tooltip.style.top = dotY + 'px';
      tooltip.classList.remove('hidden');
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
}

// ── View navigation ────────────────────────────────────────────────────────
function showView(id) {
  ['main-view', 'detail-view', 'settings-view'].forEach(v => {
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

  document.getElementById('detail-title').textContent = fav.title || '—';

  const curr = fav.currentPrice || fav.price || 0;
  const orig = fav.originalPrice || 0;
  document.getElementById('detail-price').textContent = fmt(curr);

  const origEl = document.getElementById('detail-orig');
  const discEl = document.getElementById('detail-discount');
  if (orig > curr) {
    origEl.textContent = fmt(orig);
    origEl.classList.remove('hidden');
    discEl.textContent = `-${Math.round(((orig - curr) / orig) * 100)}%`;
    discEl.classList.remove('hidden');
  } else {
    origEl.classList.add('hidden');
    discEl.classList.add('hidden');
  }

  document.getElementById('detail-visit-btn').href = fav.url || '#';

  const history = fav.priceHistory || [{ price: curr, ts: fav.lastUpdated || Date.now() }];
  const histPrices = history.map(h => h.price);
  document.getElementById('stat-low').textContent = fmt(Math.min(...histPrices));
  document.getElementById('stat-high').textContent = fmt(Math.max(...histPrices));
  document.getElementById('stat-points').textContent = history.length + (history.length === 1 ? ' pt' : ' pts');

  renderChart(history);
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
  name.textContent = product.title || 'Unknown product';
  meta.appendChild(name);
  const time = document.createElement('div');
  time.className = 'item-time';
  time.textContent = timeAgo(product.lastUpdated);
  meta.appendChild(time);
  card.appendChild(meta);

  const pricing = document.createElement('div');
  pricing.className = 'item-pricing';
  const priceEl = document.createElement('div');
  priceEl.className = 'item-price';
  priceEl.textContent = fmt(product.price || product.currentPrice);
  pricing.appendChild(priceEl);

  const orig = product.originalPrice || 0;
  const curr = product.price || product.currentPrice || 0;
  if (orig > curr) {
    const origEl = document.createElement('div');
    origEl.className = 'item-orig';
    origEl.textContent = fmt(orig);
    pricing.appendChild(origEl);
    const badge = document.createElement('div');
    badge.className = 'badge sale';
    badge.textContent = `-${Math.round(((orig - curr) / orig) * 100)}%`;
    pricing.appendChild(badge);
  }
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
      title: product.title, price, currentPrice: price, originalPrice: origPrice,
      currency: 'Rs.', imageUrl: product.imageUrl || '', url: product.url,
      lowestPrice: price, highestPrice: price, targetPrice: 0,
      dateAdded: Date.now(), lastUpdated: Date.now(),
      priceHistory: [{ price, ts: Date.now() }]
    };
  }

  await new Promise(res => chrome.storage.local.set({ favorites }, res));
  await loadAll();
}

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
    document.getElementById('active-title').textContent = currentProduct.title || '—';
    document.getElementById('active-price').textContent = fmt(currentProduct.price || currentProduct.currentPrice);
    document.getElementById('active-img').src = currentProduct.imageUrl || '';
    const origVal = currentProduct.originalPrice || 0;
    const currVal = currentProduct.price || currentProduct.currentPrice || 0;
    const origEl = document.getElementById('active-orig');
    if (origVal > currVal) { origEl.textContent = fmt(origVal); origEl.classList.remove('hidden'); }
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
    Object.values(favorites)
      .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0))
      .forEach(p => {
        favsList.appendChild(makeCard(p, true,
          (prod) => toggleFav(prod, favorites),
          (prod) => showDetail(prod)
        ));
      });
  }
}

// ── Wire up all event listeners ──────────────────────────────────────────────

// Tab buttons
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById('pane-' + btn.dataset.tab).classList.remove('hidden');
  });
});

// Back buttons
document.getElementById('back-btn').addEventListener('click', () => showView('main-view'));
document.getElementById('settings-back-btn').addEventListener('click', () => showView('main-view'));



// Settings button
document.getElementById('settings-btn').addEventListener('click', showSettings);

// Refresh (storage reload) button
document.getElementById('refresh-btn').addEventListener('click', () => loadAll());

// Pin button on active card
document.getElementById('pin-btn').addEventListener('click', async () => {
  const data = await new Promise(res =>
    chrome.storage.local.get(['current_page_product', 'favorites'], res)
  );
  if (data.current_page_product) await toggleFav(data.current_page_product, data.favorites || {});
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
loadAll();
