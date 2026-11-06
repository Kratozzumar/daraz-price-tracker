// Daraz Price Tracker — full-page dashboard (JavaScript)
// Reads/writes exactly the same chrome.storage.local keys as the old popup
// (favorites, recently_viewed, settings, last_refresh_ts), so existing data
// is used as-is — nothing is migrated or reset.

const $ = (id) => document.getElementById(id);
const store = {
  get: (keys) => new Promise(res => chrome.storage.local.get(keys, res)),
  set: (obj) => new Promise(res => chrome.storage.local.set(obj, res)),
};

// ── State ─────────────────────────────────────────────────────────────────
let data = { favorites: {}, history: [], settings: {}, lastRefresh: null };
let tab = 'favs';
let query = '';
let sort = 'recent';
let tagFilter = 'All';
let compareMode = false;
const compareSel = new Set();
let detailKey = null;         // key of the item open in the detail modal
let detailFallback = null;    // history item shown when it's not a favorite

// ── Helpers (ported from popup.js) ──────────────────────────────────────────
const keyOf = (p) => p.key || `${p.itemId}_${p.skuId}`;
const priceOf = (p) => p.currentPrice || p.price || 0;

function fmt(price, currency = 'Rs.') {
  if (!price && price !== 0) return '—';
  return (currency || 'Rs.') + ' ' + Number(price).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Strip promo prefixes like "【Buy 2 for 12999】" and stray quotes from titles
function cleanTitle(raw) {
  if (!raw) return raw;
  let t = String(raw).trim();
  t = t.replace(/^[【\[][^】\]]{0,120}[】\]]\s*/, '');
  t = t.replace(/^["'“”‘’]+/, '').replace(/["'“”‘’]+$/, '').trim();
  return t || String(raw).trim();
}

function timeAgo(ts) {
  if (!ts) return 'Never';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Trend over the last 3 data points
function getTrend(history) {
  if (!history || history.length < 3) return null;
  const r = history.slice(-3);
  let up = 0, down = 0;
  for (let i = 1; i < r.length; i++) {
    if (r[i].price > r[i - 1].price) up++;
    if (r[i].price < r[i - 1].price) down++;
  }
  if (up > down) return { icon: '▲ Rising', color: 'var(--red)' };
  if (down > up) return { icon: '▼ Falling', color: 'var(--green)' };
  return { icon: '→ Stable', color: 'var(--muted)' };
}

// Where the current price sits between the all-time low and high
function getDealBadge(current, lowest, highest) {
  if (!lowest || !highest) return null;
  if (current <= lowest * 1.10) return { text: '🟢 Great Deal', cls: 'great' };
  if (current <= lowest + (highest - lowest) * 0.3) return { text: '🟡 Fair Price', cls: 'fair' };
  if (current >= lowest + (highest - lowest) * 0.7) return { text: '🔴 Wait', cls: 'wait' };
  return null;
}

function discountPct(p) {
  const c = priceOf(p), o = p.originalPrice || 0;
  return o > c ? Math.round(((o - c) / o) * 100) : 0;
}

// Next big Daraz sale (month is 0-indexed)
function getUpcomingSale() {
  const sales = [
    { name: 'Daraz Birthday', month: 2, date: 15 },
    { name: 'Avurudu/Eid', month: 3, date: 10 },
    { name: '11.11', month: 10, date: 11 },
    { name: '12.12', month: 11, date: 12 },
  ];
  const now = new Date();
  let best = null;
  for (const s of sales) {
    const d = new Date(now.getFullYear(), s.month, s.date);
    if (now > d) d.setFullYear(now.getFullYear() + 1);
    const days = Math.ceil((d - now) / 86400000);
    if (!best || days < best.daysLeft) best = { ...s, daysLeft: days };
  }
  return best;
}

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.add('hidden'), 3000);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ── Load data ───────────────────────────────────────────────────────────────
async function load() {
  const d = await store.get(['favorites', 'recently_viewed', 'settings', 'last_refresh_ts']);
  data = {
    favorites: d.favorites || {},
    history: d.recently_viewed || [],
    settings: d.settings || {},
    lastRefresh: d.last_refresh_ts || null,
  };
  document.documentElement.setAttribute('data-theme', data.settings.theme === 'light' ? 'light' : 'dark');
}

// ── Render: stats + grid ────────────────────────────────────────────────────
function render() {
  const favs = Object.values(data.favorites);

  // Summary stats
  $('s-favs').textContent = favs.length;
  $('s-hist').textContent = data.history.length;
  $('s-drops').textContent = favs.filter(f => {
    const h = f.priceHistory || [];
    return h.length > 1 && h[h.length - 1].price < h[h.length - 2].price;
  }).length;
  $('s-target').textContent = favs.filter(f => f.targetPrice > 0 && priceOf(f) <= f.targetPrice).length;
  $('s-refresh').textContent = timeAgo(data.lastRefresh);
  $('fav-count').textContent = favs.length;
  $('hist-count').textContent = data.history.length;

  // Tag filter chips (favorites only)
  const tags = [...new Set(favs.flatMap(f => f.tags || []))].sort();
  const chipRow = $('tag-filter');
  chipRow.innerHTML = '';
  if (tab === 'favs' && tags.length) {
    if (tagFilter !== 'All' && !tags.includes(tagFilter)) tagFilter = 'All';
    ['All', ...tags].forEach(t => {
      const c = el('button', 'chip' + (t === tagFilter ? ' active' : ''), t);
      c.onclick = () => { tagFilter = t; render(); };
      chipRow.appendChild(c);
    });
    chipRow.classList.remove('hidden');
  } else {
    chipRow.classList.add('hidden');
  }

  // Pick list: history items are shown with their favorite data if pinned
  // (so they get price history / sparkline too).
  let items = tab === 'favs'
    ? favs
    : data.history.map(h => data.favorites[keyOf(h)] || h);

  if (tab === 'favs' && tagFilter !== 'All') items = items.filter(f => (f.tags || []).includes(tagFilter));
  if (query) items = items.filter(p => (cleanTitle(p.title) || '').toLowerCase().includes(query));

  // Sorting ("recent" keeps history in visit order)
  const sorters = {
    recent: (a, b) => (b.lastUpdated || b.dateAdded || 0) - (a.lastUpdated || a.dateAdded || 0),
    price_asc: (a, b) => priceOf(a) - priceOf(b),
    price_desc: (a, b) => priceOf(b) - priceOf(a),
    discount: (a, b) => discountPct(b) - discountPct(a),
    name: (a, b) => (cleanTitle(a.title) || '').localeCompare(cleanTitle(b.title) || ''),
  };
  if (!(tab === 'history' && sort === 'recent')) items = [...items].sort(sorters[sort]);

  // Build cards in a fragment — one DOM write
  const frag = document.createDocumentFragment();
  items.forEach(p => frag.appendChild(makeCard(p)));
  const grid = $('grid');
  grid.innerHTML = '';
  grid.appendChild(frag);

  // Empty state
  const empty = $('empty');
  if (items.length === 0) {
    const hasAny = tab === 'favs' ? favs.length : data.history.length;
    $('empty-title').textContent = hasAny ? 'No matching products.' : (tab === 'favs' ? 'No favorites yet.' : 'No history yet.');
    $('empty-sub').textContent = hasAny ? 'Try a different search or tag.'
      : tab === 'favs' ? 'Open the History tab and tap the ★ on a product to start tracking it.'
      : 'Visit any Daraz product page and it will appear here automatically.';
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
  }

  updateCompareBar();
  clearRestockFlags();
}

// Tiny sparkline from price history
function sparkline(history) {
  if (!history || history.length < 2) return null;
  const pts = history.map(h => h.price);
  const min = Math.min(...pts), max = Math.max(...pts), range = max - min || 1;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('viewBox', '0 0 100 30');
  svg.setAttribute('preserveAspectRatio', 'none');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${28 - ((p - min) / range) * 26}`).join(' '));
  svg.appendChild(line);
  return svg;
}

function makeCard(p) {
  const key = keyOf(p);
  const isFav = !!data.favorites[key];
  const curr = priceOf(p);
  const card = el('article', 'card' + (compareSel.has(key) ? ' selected' : ''));

  // Image
  const imgWrap = el('div', 'card-img');
  const img = el('img');
  img.loading = 'lazy';
  img.alt = '';
  img.src = p.imageUrl || 'icon128.png';
  img.onerror = () => { img.src = 'icon128.png'; };
  imgWrap.appendChild(img);
  card.appendChild(imgWrap);

  // Compare checkbox (favorites only)
  if (compareMode && isFav) {
    const cb = el('input', 'card-check');
    cb.type = 'checkbox';
    cb.checked = compareSel.has(key);
    cb.onclick = (e) => { e.stopPropagation(); toggleCompare(key); };
    card.appendChild(cb);
  }

  // Overlay buttons: favorite + delete
  const actions = el('div', 'card-actions');
  const star = el('button', 'card-btn' + (isFav ? ' fav' : ''));
  star.title = isFav ? 'Remove from favorites' : 'Add to favorites';
  star.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  star.onclick = (e) => { e.stopPropagation(); toggleFav(p); };
  const del = el('button', 'card-btn del');
  del.title = 'Delete item';
  del.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
  del.onclick = (e) => { e.stopPropagation(); deleteItem(p); };
  actions.append(star, del);
  card.appendChild(actions);

  // Body
  const body = el('div', 'card-body');
  const title = el('div', 'card-title', cleanTitle(p.title) || 'Unknown product');
  title.title = cleanTitle(p.title) || '';
  body.appendChild(title);

  const priceLine = el('div', 'price-line');
  priceLine.appendChild(el('span', 'price', fmt(curr, p.currency)));
  if ((p.originalPrice || 0) > curr) priceLine.appendChild(el('span', 'orig', fmt(p.originalPrice, p.currency)));
  const trend = getTrend(p.priceHistory);
  if (trend) {
    const t = el('span', 'trend', trend.icon.split(' ')[0]);
    t.style.color = trend.color;
    t.title = trend.icon;
    priceLine.appendChild(t);
  }
  body.appendChild(priceLine);

  const spark = sparkline(p.priceHistory);
  if (spark) body.appendChild(spark);

  // Badges
  const badges = el('div', 'badges');
  const pct = discountPct(p);
  if (pct) badges.appendChild(el('span', 'badge sale', `-${pct}%`));
  const deal = isFav ? getDealBadge(curr, p.lowestPrice, p.highestPrice) : null;
  if (deal) badges.appendChild(el('span', 'badge ' + deal.cls, deal.text));
  if (p.targetPrice > 0 && curr <= p.targetPrice) badges.appendChild(el('span', 'badge target', '🎯 Target hit'));
  if (p.inStock === false) badges.appendChild(el('span', 'badge oos', 'Out of stock'));
  if (p.justRestocked) badges.appendChild(el('span', 'badge restock', '🔔 Back in stock'));
  if (p.promotions && p.promotions.length) badges.appendChild(el('span', 'badge offer', '🏷️ Offers'));
  if (p.fakeDiscountWarning) badges.appendChild(el('span', 'badge wait', '⚠️ Fake discount?'));
  if (badges.children.length) body.appendChild(badges);

  const meta = el('div', 'card-meta');
  meta.appendChild(el('span', '', 'Updated ' + timeAgo(p.lastUpdated)));
  body.appendChild(meta);
  card.appendChild(body);

  card.onclick = () => {
    if (compareMode && isFav) toggleCompare(key);
    else openDetail(p);
  };
  return card;
}

// "Back in stock" badge is shown once, then cleared
function clearRestockFlags() {
  const keys = Object.values(data.favorites).filter(f => f.justRestocked).map(keyOf);
  if (!keys.length) return;
  setTimeout(async () => {
    const { favorites = {} } = await store.get('favorites');
    keys.forEach(k => { if (favorites[k]) favorites[k].justRestocked = false; });
    await store.set({ favorites });
  }, 5000);
}

// ── Favorite / delete ─────────────────────────────────────────────────────
async function toggleFav(product) {
  const key = keyOf(product);
  const { favorites = {} } = await store.get('favorites');
  if (favorites[key]) {
    delete favorites[key];
    showToast('Removed from favorites');
  } else {
    const price = priceOf(product);
    favorites[key] = {
      itemId: product.itemId, skuId: product.skuId, key,
      title: cleanTitle(product.title), price, currentPrice: price,
      originalPrice: product.originalPrice || price,
      currency: product.currency || 'Rs.', imageUrl: product.imageUrl || '', url: product.url,
      lowestPrice: price, highestPrice: price, targetPrice: 0,
      dateAdded: Date.now(), lastUpdated: Date.now(),
      priceHistory: [{ price, ts: Date.now() }],
    };
    showToast('⭐ Added to favorites');
  }
  await store.set({ favorites });
}

async function deleteItem(product) {
  const key = keyOf(product);
  const d = await store.get(['favorites', 'recently_viewed']);
  const favorites = d.favorites || {};
  delete favorites[key];
  const recently_viewed = (d.recently_viewed || []).filter(h => keyOf(h) !== key);
  await store.set({ favorites, recently_viewed });
  if (detailKey === key) closeModal('detail-modal');
  showToast('Item deleted');
}

// Update just a few fields on a favorite — re-reads storage first so we
// never overwrite a price the background refresh just wrote.
async function patchFav(key, patch) {
  const { favorites = {} } = await store.get('favorites');
  if (!favorites[key]) return;
  Object.assign(favorites[key], patch);
  await store.set({ favorites });
}

// ── Modals ─────────────────────────────────────────────────────────────────
function openModal(id) { $(id).classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function closeModal(id) {
  $(id).classList.add('hidden');
  if (id === 'detail-modal') { detailKey = null; detailFallback = null; }
  if (!document.querySelector('.modal:not(.hidden)')) document.body.style.overflow = '';
}
document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', (e) => {
    if (e.target === m || e.target.hasAttribute('data-close')) closeModal(m.id);
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = [...document.querySelectorAll('.modal:not(.hidden)')].pop();
  if (open) closeModal(open.id);
});

// ── Detail modal ──────────────────────────────────────────────────────────
function openDetail(p) {
  detailKey = keyOf(p);
  detailFallback = p;
  renderDetail();
  openModal('detail-modal');
}

function renderDetail() {
  if (!detailKey) return;
  const fav = data.favorites[detailKey];
  const p = fav || data.history.find(h => keyOf(h) === detailKey) || detailFallback;
  if (!p) return closeModal('detail-modal');

  const curr = priceOf(p);
  const cur = p.currency;
  $('d-img').src = p.imageUrl || 'icon128.png';
  $('d-title').textContent = cleanTitle(p.title) || '—';
  $('d-price').textContent = fmt(curr, cur);
  $('d-visit').href = p.url || '#';

  const pct = discountPct(p);
  $('d-orig').textContent = fmt(p.originalPrice, cur);
  $('d-orig').classList.toggle('hidden', !pct);
  $('d-disc').textContent = `-${pct}%`;
  $('d-disc').classList.toggle('hidden', !pct);

  const trend = getTrend(p.priceHistory);
  $('d-trend').textContent = trend ? trend.icon : '';
  $('d-trend').style.color = trend ? trend.color : '';

  // Shipping
  const ship = $('d-shipping');
  if (p.shippingFee !== undefined) {
    ship.textContent = p.shippingFee === 0
      ? `🚚 Free shipping • Total ${fmt(curr, cur)}`
      : `🚚 + ${fmt(p.shippingFee, cur)} shipping • Total ${fmt(curr + p.shippingFee, cur)}`;
    ship.classList.remove('hidden');
  } else ship.classList.add('hidden');

  // Seller (textContent only — scraped values are never injected as HTML)
  const seller = $('d-seller');
  if (p.seller && p.seller.name) {
    seller.textContent = `👤 Sold by ${p.seller.name}${p.seller.rating ? ` (${p.seller.rating})` : ''}`;
    seller.classList.remove('hidden');
  } else seller.classList.add('hidden');

  $('d-fake').classList.toggle('hidden', !p.fakeDiscountWarning);

  const deal = fav ? getDealBadge(curr, p.lowestPrice, p.highestPrice) : null;
  $('d-deal').className = deal ? 'badge ' + deal.cls : 'hidden';
  $('d-deal').textContent = deal ? deal.text : '';

  const promos = $('d-promos');
  promos.innerHTML = '';
  (p.promotions || []).forEach(t => promos.appendChild(el('span', 'badge offer', t)));
  promos.classList.toggle('hidden', !(p.promotions && p.promotions.length));

  const sale = getUpcomingSale();
  $('sale-banner').textContent = sale ? `⏳ Wait! The ${sale.name} sale is in ${sale.daysLeft} day${sale.daysLeft === 1 ? '' : 's'}.` : '';
  $('sale-banner').classList.toggle('hidden', !(sale && sale.daysLeft <= 14));

  // Stats + chart
  const history = p.priceHistory && p.priceHistory.length ? p.priceHistory : [{ price: curr, ts: p.lastUpdated || Date.now() }];
  const prices = history.map(h => h.price);
  $('d-low').textContent = fmt(Math.min(...prices), cur);
  $('d-high').textContent = fmt(Math.max(...prices), cur);
  $('d-points').textContent = history.length;
  const first = prices[0], last = prices[prices.length - 1];
  const change = first ? Math.round(((last - first) / first) * 100) : 0;
  $('d-pct').textContent = change === 0 ? '—' : (change > 0 ? '↑ ' : '↓ ') + Math.abs(change) + '%';
  $('d-pct').className = 'stat-v ' + (change > 0 ? 'bad' : change < 0 ? 'good' : '');

  // Favorites-only controls
  $('fav-controls').classList.toggle('hidden', !fav);
  $('not-fav-note').classList.toggle('hidden', !!fav);
  if (fav) {
    const hasTarget = fav.targetPrice > 0;
    $('target-edit').classList.toggle('hidden', hasTarget);
    $('target-show').classList.toggle('hidden', !hasTarget);
    $('target-val').textContent = fmt(fav.targetPrice, cur);
    const list = $('tags-list');
    list.innerHTML = '';
    (fav.tags || []).forEach(t => {
      const chip = el('span', 'chip active', t);
      const x = el('span', 'x', '×');
      x.title = 'Remove tag';
      x.onclick = () => patchFav(detailKey, { tags: (fav.tags || []).filter(v => v !== t) });
      chip.appendChild(x);
      list.appendChild(chip);
    });
  }

  // Draw after the modal is visible so the SVG has a real width
  requestAnimationFrame(() => renderChart(history, cur, fav ? fav.targetPrice : 0));
}

// Full-size SVG price chart drawn at the element's real pixel width
function renderChart(history, currency, target) {
  const svg = $('chart');
  const tip = $('chart-tip');
  const labels = $('chart-labels');
  svg.innerHTML = '';
  labels.innerHTML = '';
  tip.classList.add('hidden');

  if (!history.length) {
    svg.classList.add('hidden');
    $('chart-empty').classList.remove('hidden');
    return;
  }
  svg.classList.remove('hidden');
  $('chart-empty').classList.toggle('hidden', history.length > 1);

  const pts = history.length === 1 ? [history[0], { ...history[0], ts: Date.now() }] : history;
  const W = svg.clientWidth || 800, H = 220, PAD = 14;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  let min = Math.min(...pts.map(p => p.price)), max = Math.max(...pts.map(p => p.price));
  if (target > 0) { min = Math.min(min, target); max = Math.max(max, target); }
  const range = max - min || 1;
  const x = (i) => PAD + (i / (pts.length - 1)) * (W - PAD * 2);
  const y = (v) => PAD + (1 - (v - min) / range) * (H - PAD * 2);
  const NS = 'http://www.w3.org/2000/svg';
  const add = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    svg.appendChild(n);
    return n;
  };

  [0, 0.5, 1].forEach(f => add('line', { class: 'grid-line', x1: PAD, x2: W - PAD, y1: PAD + f * (H - PAD * 2), y2: PAD + f * (H - PAD * 2) }));
  const ref = (v, cls) => add('line', { class: 'ref ' + cls, x1: PAD, x2: W - PAD, y1: y(v), y2: y(v) });
  if (max > min) { ref(min, 'low'); ref(max, 'high'); }
  if (target > 0) ref(target, 'target');

  const coords = pts.map((p, i) => [x(i), y(p.price)]);
  const lineD = coords.map((c, i) => (i ? 'L' : 'M') + c[0] + ',' + c[1]).join(' ');
  add('path', { class: 'area', d: `${lineD} L${coords[coords.length - 1][0]},${H - PAD} L${coords[0][0]},${H - PAD} Z` });
  add('path', { class: 'line', d: lineD });

  coords.forEach(([cx, cy], i) => {
    const dot = add('circle', { class: 'dot', cx, cy, r: 5 });
    dot.addEventListener('mouseenter', () => {
      const diff = i > 0 ? pts[i].price - pts[i - 1].price : 0;
      tip.textContent = `${fmt(pts[i].price, currency)}${diff ? ` (${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff), currency)})` : ''} • ${new Date(pts[i].ts).toLocaleDateString()}`;
      tip.style.left = Math.min(Math.max(cx + 16, 90), W - 90) + 'px';
      tip.style.top = (cy + 16) + 'px';
      tip.classList.remove('hidden');
    });
    dot.addEventListener('mouseleave', () => tip.classList.add('hidden'));
  });

  [...new Set([0, Math.floor((pts.length - 1) / 2), pts.length - 1])]
    .forEach(i => labels.appendChild(el('span', '', new Date(pts[i].ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))));
}

// Target price
$('save-target-btn').onclick = async () => {
  const v = parseFloat($('target-input').value);
  if (!(v > 0) || !detailKey) return showToast('Enter a valid price');
  await patchFav(detailKey, { targetPrice: v });
  $('target-input').value = '';
  showToast('🎯 Target saved — you\'ll be notified when it drops to this');
};
$('target-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('save-target-btn').click(); });
$('clear-target-btn').onclick = () => detailKey && patchFav(detailKey, { targetPrice: 0 });

// Tags
$('add-tag-btn').onclick = async () => {
  const v = $('tag-input').value.trim().toLowerCase();
  const fav = data.favorites[detailKey];
  if (!v || !fav) return;
  const tags = fav.tags || [];
  if (!tags.includes(v)) await patchFav(detailKey, { tags: [...tags, v] });
  $('tag-input').value = '';
};
$('tag-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('add-tag-btn').click(); });

// ── Toolbar ────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === b));
    tab = b.dataset.tab;
    render();
  };
});
$('search-input').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); render(); });
$('sort-select').onchange = (e) => { sort = e.target.value; render(); };

// Refresh: Shift+Click forces a full sync (same as before)
$('refresh-btn').onclick = (e) => {
  const btn = $('refresh-btn');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.classList.add('spinning');
  chrome.runtime.sendMessage({ action: 'refresh_now', forceSync: e.shiftKey }, (resp) => {
    if (chrome.runtime.lastError) showToast('Refresh failed — try again');
    else if (resp && resp.skipped) showToast('All prices are fresh! (Shift+Click to force sync)');
    btn.disabled = false;
    btn.classList.remove('spinning');
  });
};

// Progress messages broadcast by background.js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action !== 'sync_progress') return;
  const { done, total } = msg;
  $('sync-label').textContent = done < total
    ? `Syncing ${done} of ${total}…`
    : `✓ Sync complete — ${total} item${total !== 1 ? 's' : ''} checked`;
  $('sync-bar').style.width = (total ? Math.round(done / total * 100) : 0) + '%';
  $('sync-banner').classList.remove('hidden');
  clearTimeout(window._syncHide);
  if (done >= total) window._syncHide = setTimeout(() => $('sync-banner').classList.add('hidden'), 2500);
});

// Share wishlist → clipboard
$('share-wishlist-btn').onclick = async () => {
  const favs = Object.values(data.favorites);
  if (!favs.length) return showToast('No favorites to share yet');
  let text = '🛒 My Daraz Wishlist\n\n';
  favs.forEach((f, i) => {
    const c = priceOf(f), o = f.originalPrice || 0;
    text += `${i + 1}. ${cleanTitle(f.title)}\n   ${fmt(c, f.currency)}${o > c ? ` (was ${fmt(o, f.currency)})` : ''}\n   ${f.url}\n\n`;
  });
  text += 'Tracked with Daraz Price Tracker';
  try { await navigator.clipboard.writeText(text); showToast('📋 Wishlist copied to clipboard'); }
  catch { showToast('Could not copy to clipboard'); }
};

// ── Compare ────────────────────────────────────────────────────────────────
function updateCompareBar() {
  $('compare-bar').classList.toggle('hidden', !compareMode);
  $('compare-count').textContent = `${compareSel.size} selected (max 3)`;
  $('do-compare-btn').disabled = compareSel.size < 2;
  $('compare-mode-btn').classList.toggle('active', compareMode);
}
function toggleCompare(key) {
  if (compareSel.has(key)) compareSel.delete(key);
  else if (compareSel.size >= 3) return showToast('You can compare up to 3 items');
  else compareSel.add(key);
  render();
}
function setCompareMode(on) {
  compareMode = on;
  compareSel.clear();
  if (on && tab !== 'favs') document.querySelector('.tab[data-tab="favs"]').click();
  else render();
  if (on) showToast('Select 2–3 favorites to compare');
}
$('compare-mode-btn').onclick = () => setCompareMode(!compareMode);
$('cancel-compare-btn').onclick = () => setCompareMode(false);

$('do-compare-btn').onclick = () => {
  const items = [...compareSel].map(k => data.favorites[k]).filter(Boolean);
  if (items.length < 2) return showToast('Select at least 2 items');
  const head = $('compare-head'), body = $('compare-body');
  head.innerHTML = '<th></th>';
  body.innerHTML = '';
  items.forEach(f => {
    const th = el('th');
    const img = el('img');
    img.src = f.imageUrl || 'icon128.png';
    img.alt = '';
    th.append(img, el('div', '', cleanTitle(f.title) || 'Unknown product'));
    head.appendChild(th);
  });
  const rows = [
    ['Price', f => priceOf(f), true, true],
    ['Original price', f => f.originalPrice || 0, true],
    ['Discount', f => discountPct(f) ? `-${discountPct(f)}%` : '—'],
    ['Lowest ever', f => f.lowestPrice || priceOf(f), true],
    ['Highest ever', f => f.highestPrice || priceOf(f), true],
    ['Trend', f => (getTrend(f.priceHistory) || {}).icon || '—'],
    ['Deal rating', f => (getDealBadge(priceOf(f), f.lowestPrice, f.highestPrice) || {}).text || '—'],
    ['Stock', f => f.inStock === false ? '❌ Out of stock' : '✅ In stock'],
  ];
  rows.forEach(([label, get, isMoney, lowerBetter]) => {
    const tr = el('tr');
    tr.appendChild(el('td', '', label));
    const vals = items.map(get);
    const best = lowerBetter ? vals.indexOf(Math.min(...vals)) : -1;
    items.forEach((f, i) => tr.appendChild(el('td', i === best ? 'best' : '', isMoney ? fmt(vals[i], f.currency) : vals[i])));
    body.appendChild(tr);
  });
  const tr = el('tr');
  tr.appendChild(el('td'));
  items.forEach(f => {
    const td = el('td');
    const a = el('a', 'btn btn-primary', 'View ↗');
    a.href = f.url || '#';
    a.target = '_blank';
    a.rel = 'noopener';
    td.appendChild(a);
    tr.appendChild(td);
  });
  body.appendChild(tr);
  openModal('compare-modal');
};

// ── Settings ───────────────────────────────────────────────────────────────
function markActive(groupId, attr, value) {
  document.querySelectorAll(`#${groupId} button`).forEach(b => b.classList.toggle('active', b.dataset[attr] === String(value)));
}
async function saveSettings(patch) {
  const { settings = {} } = await store.get('settings');
  await store.set({ settings: { ...settings, ...patch } });
}
function showNextRefresh() {
  chrome.alarms.get('daraz_price_refresh', (alarm) => {
    if (!alarm) return ($('next-refresh-val').textContent = 'Not scheduled');
    const mins = Math.round((alarm.scheduledTime - Date.now()) / 60000);
    $('next-refresh-val').textContent = mins <= 0 ? 'Very soon' : mins < 60 ? `in ${mins}m` : `in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  });
}
function renderSettings() {
  const s = data.settings;
  markActive('interval-group', 'minutes', s.refreshIntervalMinutes || 360);
  markActive('history-limit-group', 'limit', s.historyLimit || 20);
  markActive('theme-group', 'theme', s.theme === 'light' ? 'light' : 'dark');
  $('notif-toggle').checked = s.notifications !== false;
  $('last-refresh-val').textContent = timeAgo(data.lastRefresh);
  $('fav-tracked-val').textContent = Object.keys(data.favorites).length;
  $('current-history-count').textContent = data.history.length;
  showNextRefresh();
}
$('settings-btn').onclick = () => { renderSettings(); openModal('settings-modal'); };

$('interval-group').onclick = async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const minutes = Number(b.dataset.minutes);
  await saveSettings({ refreshIntervalMinutes: minutes });
  chrome.runtime.sendMessage({ action: 'reschedule_alarm', intervalMinutes: minutes }, () => {});
  setTimeout(showNextRefresh, 600);
};

$('history-limit-group').onclick = async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const limit = Number(b.dataset.limit);
  const d = await store.get(['settings', 'recently_viewed']);
  const history = d.recently_viewed || [];
  // Lowering the limit trims the oldest history entries (favorites are untouched)
  if (history.length > limit && !confirm(`This removes the ${history.length - limit} oldest history items. Favorites are not affected. Continue?`)) return;
  await store.set({ settings: { ...(d.settings || {}), historyLimit: limit }, recently_viewed: history.slice(0, limit) });
};

$('theme-group').onclick = (e) => {
  const b = e.target.closest('button');
  if (b) saveSettings({ theme: b.dataset.theme });
};
$('notif-toggle').onchange = (e) => saveSettings({ notifications: e.target.checked });

// Export / import
function download(text, type, filename) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  chrome.downloads.download({ url, filename }, () => showToast('Exported!'));
}
$('export-json-btn').onclick = async () => {
  download(JSON.stringify(await store.get(null), null, 2), 'application/json', 'daraz_tracker_backup.json');
};
$('export-csv-btn').onclick = () => {
  const esc = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
  let csv = 'Title,Current Price,Original Price,Lowest Price,Highest Price,Target Price,URL,Date Added\n';
  Object.values(data.favorites).forEach(f => {
    csv += [esc(cleanTitle(f.title)), priceOf(f), f.originalPrice || 0, f.lowestPrice || priceOf(f),
      f.highestPrice || priceOf(f), f.targetPrice || 0, esc(f.url), esc(new Date(f.dateAdded || Date.now()).toISOString())].join(',') + '\n';
  });
  download(csv, 'text/csv', 'daraz_favorites.csv');
};
$('import-btn').onclick = () => $('import-file').click();
$('import-file').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const incoming = JSON.parse(ev.target.result);
      if (!incoming || typeof incoming !== 'object') throw new Error('bad file');
      // Merge — existing data is kept, imported items are added on top
      const cur = await store.get(['favorites', 'recently_viewed', 'settings']);
      const seen = new Set();
      const history = [...(cur.recently_viewed || []), ...(incoming.recently_viewed || [])]
        .filter(h => { const k = keyOf(h); if (seen.has(k)) return false; seen.add(k); return true; });
      await store.set({
        favorites: { ...(cur.favorites || {}), ...(incoming.favorites || {}) },
        recently_viewed: history,
        settings: { ...(cur.settings || {}), ...(incoming.settings || {}) },
      });
      showToast('Imported!');
    } catch {
      showToast('Invalid backup file');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
};

// Clear all — only after explicit confirmation
$('clear-data-btn').onclick = () => openModal('confirm-modal');
$('confirm-cancel').onclick = () => closeModal('confirm-modal');
$('confirm-ok').onclick = async () => {
  await new Promise(res => chrome.storage.local.clear(res));
  await store.set({ recently_viewed: [], favorites: {}, settings: {} });
  closeModal('confirm-modal');
  closeModal('settings-modal');
  showToast('All data cleared');
};

// ── Live updates ───────────────────────────────────────────────────────────
// Any change (content script on a Daraz tab, background refresh, this page)
// re-renders automatically — no need to reopen the page.
let reloadTimer = null;
chrome.storage.onChanged.addListener((_, area) => {
  if (area !== 'local') return;
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => {
    await load();
    render();
    if (detailKey) renderDetail();
    if (!$('settings-modal').classList.contains('hidden')) renderSettings();
  }, 150);
});

// Refresh "x minutes ago" labels while the tab stays open
setInterval(() => { if (!document.hidden) render(); }, 60000);

// ── Boot ───────────────────────────────────────────────────────────────────
load().then(() => {
  // Land on History if there are no favorites yet
  if (!Object.keys(data.favorites).length && data.history.length) {
    tab = 'history';
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'history'));
  }
  render();
});
