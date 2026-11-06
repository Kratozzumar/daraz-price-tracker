// Daraz Price Tracker — Background Service Worker
// Handles: badge setting + automatic background price refresh for favorites

const ALARM_NAME = 'daraz_price_refresh';
const DEFAULT_INTERVAL_MINUTES = 360; // fallback if no setting saved

// ── Polite-sync tuning ──────────────────────────────────────────────────────
// Note: fixed values; raise CONCURRENCY only if Daraz never rate-limits you.
const CONCURRENCY = 3;                      // max simultaneous page requests
const GAP_MS = [400, 1200];                 // random pause before each request
const DOM_GAP_MS = [1500, 3000];            // longer pause for the hidden-tab fallback
const BLOCK_COOLDOWN_MS = 60 * 60 * 1000;   // pause 1h after Daraz rate-limits us
const FAV_STALE_MS = 2 * 60 * 60 * 1000;    // favorites: re-check after 2h
const HIST_STALE_MS = 12 * 60 * 60 * 1000;  // history-only items: re-check after 12h

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randomGap = ([min, max]) => sleep(min + Math.random() * (max - min));

// Markers of Daraz/Alibaba's captcha ("punish") page. Best-effort heuristic:
// if Daraz changes the page these may need updating.
function isBlockPage(text) {
  return /_____tmd_____|\/punish|x5secdata|baxia-punish|nc_1_wrapper/i.test(text || '');
}

// Run `worker` over `items` with at most `limit` running at once.
async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

// ── Init ──────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['recently_viewed', 'favorites'], (data) => {
    if (!data.recently_viewed) chrome.storage.local.set({ recently_viewed: [] });
    if (!data.favorites)       chrome.storage.local.set({ favorites: {} });
  });
  scheduleAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleAlarm();
});

// ── Toolbar icon → open the full-page dashboard (reuse the tab if already open) ──
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('dashboard.html');
  const [existing] = await chrome.tabs.query({ url });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
});

async function scheduleAlarm(intervalMinutes) {
  if (!intervalMinutes) {
    const data = await new Promise(res => chrome.storage.local.get('settings', res));
    intervalMinutes = (data.settings || {}).refreshIntervalMinutes || DEFAULT_INTERVAL_MINUTES;
  }
  // Remove old alarm and create fresh with new interval
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 5,
    periodInMinutes: intervalMinutes
  });
  console.log('[DarazBG] Alarm scheduled every', intervalMinutes, 'minutes');
}

// ── Badge + reschedule + refresh_now messages ────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.action === 'set_badge' && sender.tab) {
    chrome.action.setBadgeText({ text: '✓', tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId: sender.tab.id });
    reply && reply({});
    return;
  }

  if (msg.action === 'reschedule_alarm') {
    scheduleAlarm(msg.intervalMinutes);
    reply && reply({ ok: true });
    return;
  }

  if (msg.action === 'refresh_now') {
    refreshAllTracked(true, msg.forceSync).then((res) => reply && reply({ ok: true, ...(res || {}) }));
    return true; // keep message channel open for async
  }

  // Sent by content.js when it detects a price drop on a favorite while the
  // user is just browsing (i.e. not triggered by a manual/scheduled refresh).
  // Content scripts can't call chrome.notifications directly, so they ask us.
  if (msg.action === 'price_drop_detected') {
    notifyPriceDrop(msg).then(() => reply && reply({ ok: true }));
    return true;
  }

  reply && reply({});
});


// ── Alarm fires → refresh everything we're tracking ───────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log('[DarazBG] Alarm fired — starting background price refresh (no popup fallback)');
    refreshAllTracked(false);
  }
});

// ── Shared notification helpers (used by both the HTTP refresh loop below
//    and by content.js's live price-drop detection) so a price drop is
//    always surfaced as a Chrome notification, however it was detected. ──
async function notificationsAreEnabled() {
  const data = await new Promise(res => chrome.storage.local.get('settings', res));
  return (data.settings || {}).notifications !== false;
}

async function notifyPriceDrop({ key, title, currency, oldPrice, newPrice, targetPrice }) {
  if (!(await notificationsAreEnabled())) return;
  if (!(newPrice < oldPrice)) return; // safety: only ever notify on an actual drop

  const currencyLabel = currency || 'Rs.';
  const now = Date.now();
  const safeTitle = (title || 'Tracked item').slice(0, 60);

  if (targetPrice > 0 && newPrice <= targetPrice) {
    chrome.notifications.create(`target_${key}_${now}`, {
      type: 'basic',
      iconUrl: 'icon48.png',
      title: '🎯 Price hit your target!',
      message: `${safeTitle}...\nNow: ${currencyLabel} ${newPrice.toLocaleString()} (Target: ${currencyLabel} ${targetPrice.toLocaleString()})`,
      priority: 2
    });
  } else {
    chrome.notifications.create(`drop_${key}_${now}`, {
      type: 'basic',
      iconUrl: 'icon48.png',
      title: '📉 Price dropped on Daraz!',
      message: `${safeTitle}...\n${currencyLabel} ${oldPrice.toLocaleString()} → ${currencyLabel} ${newPrice.toLocaleString()}`,
      priority: 2
    });
  }
}

async function notifyBackInStock({ key, title }) {
  if (!(await notificationsAreEnabled())) return;
  chrome.notifications.create(`stock_${key}_${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icon48.png',
    title: '🔔 Back in Stock!',
    message: `${(title || 'Tracked item').slice(0, 60)}... is now available.`,
    priority: 2
  });
}

// ── Price extraction from raw HTML (fallback strategy) ────────────────────
function parsePriceFromHtml(html) {
  // Strategy 1: JSON-LD structured data
  const ldBlocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of ldBlocks) {
    try {
      const inner = block.replace(/<\/?script[^>]*>/gi, '').trim();
      const obj = JSON.parse(inner);
      const items = Array.isArray(obj) ? obj : [obj];
      for (const item of items) {
        const offers = item.offers || (item['@graph'] || []).flatMap(n => n.offers || []);
        const offArr = Array.isArray(offers) ? offers : [offers];
        for (const off of offArr) {
          if (off && off.price) {
            const p = parseFloat(String(off.price).replace(/,/g, ''));
            if (p > 0) return { price: p, source: 'json-ld' };
          }
        }
      }
    } catch (_) {}
  }
  
  // Strategy: Daraz __moduleData__
  const moduleMatch = html.match(/var\s+__moduleData__\s*=\s*({.+?});\s*\n/s) ||
                      html.match(/__moduleData__\s*=\s*({.+?});/s);
  if (moduleMatch) {
    try {
      const innerJson = moduleMatch[1];
      const saleM = innerJson.match(/"salePrice"\s*:\s*\{\s*"value"\s*:\s*([\d.]+)/) ||
                    innerJson.match(/"price"\s*:\s*"?([\d.]+)"?/);
      if (saleM) {
        const p = parseFloat(saleM[1]);
        if (p > 0) return { price: p, source: '__moduleData__' };
      }
      
      const pdtSaleMatch = innerJson.match(/"salePrice"\s*:\s*"?[^\d]*([\d.,]+)"?/);
      if (pdtSaleMatch) {
        const p = parseFloat(pdtSaleMatch[1].replace(/,/g, ''));
        if (p > 0) return { price: p, source: '__moduleData__salePrice' };
      }
    } catch (_) {}
  }

  // Strategy 2: embedded JS data
  const pageDataPatterns = [
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})(?=;\s*(?:window|<\/script>))/,
    /window\.pageData\s*=\s*({[\s\S]*?})(?=;\s*(?:window|<\/script>))/,
    /"skuPriceInfo"\s*:\s*\[[\s\S]*?"price"\s*:\s*"?([\d.]+)"?/,
  ];
  for (const pat of pageDataPatterns) {
    const m = html.match(pat);
    if (!m) continue;
    if (m[1] && !m[1].startsWith('{')) {
      const p = parseFloat(m[1]);
      if (p > 0) return { price: p, source: 'skuPriceInfo' };
    }
    try {
      const priceM = m[1].match(/"price"\s*:\s*"?([\d.]+)"?/);
      if (priceM) {
        const p = parseFloat(priceM[1]);
        if (p > 0) return { price: p, source: 'pageData' };
      }
    } catch (_) {}
  }

  // Strategy 3: meta tags
  const metaM = html.match(/property=["']product:price:amount["'][^>]*content=["']([\d.,]+)["']/i)
             || html.match(/content=["']([\d.,]+)["'][^>]*property=["']product:price:amount["']/i);
  if (metaM) {
    const p = parseFloat(metaM[1].replace(/,/g, ''));
    if (p > 0) return { price: p, source: 'meta' };
  }

  // Strategy 4: sale price attributes
  const salePriceM = html.match(/"(?:salePrice|currentPrice|discountPrice|sellPrice)"\s*:\s*"?([\d.]+)"?/i);
  if (salePriceM) {
    const p = parseFloat(salePriceM[1]);
    if (p > 0) return { price: p, source: 'salePrice-attr' };
  }

  return null;
}

function parseOriginalPriceFromHtml(html) {
  const patterns = [
    /"(?:originalPrice|listPrice|regularPrice|mrpPrice|originalCost)"\s*:\s*"?([\d.]+)"?/i,
    /property=["']product:original_price["'][^>]*content=["']([\d.,]+)["']/i,
  ];
  for (const pat of patterns) {
    const m = html.match(pat);
    if (m) {
      const p = parseFloat(m[1].replace(/,/g, ''));
      if (p > 0) return p;
    }
  }
  return null;
}

// ── Fetch product page and extract price via HTTP ─────────────────────────
async function fetchProductPrice(entry) {
  const url = entry.url;
  if (!url || !url.includes('daraz')) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: 'include',  // Send cookies for better results
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
      }
    });
    clearTimeout(timeoutId);
    // 429/403 or a redirect to Daraz's captcha ("punish") page = we're being
    // rate-limited. Report it so the whole sync stops instead of hammering.
    if (response.status === 429 || response.status === 403 || isBlockPage(response.url)) {
      console.warn('[DarazBG] Rate-limited by Daraz (HTTP', response.status + ') — pausing sync');
      return { blocked: true };
    }
    if (!response.ok) {
      console.warn('[DarazBG] HTTP', response.status, 'for', entry.title);
      return null;
    }

    const html = await response.text();
    if (isBlockPage(html.slice(0, 5000))) {
      console.warn('[DarazBG] Captcha page served — pausing sync');
      return { blocked: true };
    }
    const result = parsePriceFromHtml(html);
    const origPrice = parseOriginalPriceFromHtml(html);
    
    const hasSoldOutClass = /class="[^"]*pdp-mod-soldout[^"]*"/i.test(html) ||
                            /class="[^"]*pdp-mod-product-unavailable[^"]*"/i.test(html);
    const hasUnavailableText = />\s*currently unavailable\s*</i.test(html);
    const inStock = !hasSoldOutClass && !hasUnavailableText;

    if (result) {
      console.log('[DarazBG] Price found via', result.source, 'for:', entry.title, '→', result.price);
      return { price: result.price, originalPrice: origPrice || result.price, source: result.source, inStock: inStock };
    }
    console.warn('[DarazBG] No price found in HTML for:', entry.title);
    return null;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[DarazBG] Fetch error for', entry.title, ':', err.name === 'AbortError' ? 'timeout' : err.message);
    return null;
  }
}

// ── Single-Tab DOM Scraper ────────────────────────────────────────────────
// Uses ONE minimized popup window with ONE reused tab.
// The tab navigates from URL to URL — no new tabs created per item.
let _scraperWinId = null;
let _scraperTabId = null;

async function _ensureScraperTab() {
  // Check if the window still exists
  if (_scraperWinId) {
    try { await chrome.windows.get(_scraperWinId); }
    catch (_) { _scraperWinId = null; _scraperTabId = null; }
  }
  // Create the window + tab if needed
  if (!_scraperWinId) {
    // Chrome rejects windows placed mostly off-screen ("Bounds must be at least
    // 50% within visible screen space"), so open it minimized instead.
    // `state: 'minimized'` can't be combined with position/size/focused.
    const win = await chrome.windows.create({
      url: 'about:blank',
      type: 'popup',
      state: 'minimized'
    });
    _scraperWinId = win.id;
    _scraperTabId = win.tabs[0].id;
    console.log('[DarazBG] Scraper window created:', _scraperWinId);
  }
  return _scraperTabId;
}

async function _destroyScraperTab() {
  if (_scraperWinId) {
    try { await chrome.windows.remove(_scraperWinId); } catch (_) {}
    _scraperWinId = null;
    _scraperTabId = null;
    console.log('[DarazBG] Scraper window destroyed.');
  }
}

// Runs inside the product page: waits for the price element and reads it.
// Returns {wrongPage} if the tab still shows the previous page (tab is reused).
function pollForPrice(expectMarker, maxMs) {
  return new Promise((resolve) => {
    if (!location.href.includes(expectMarker)) return resolve({ wrongPage: true });
    const started = Date.now();
    const num = (s) => parseFloat(String(s).trim().replace(/^[^\d]+/, '').replace(/,/g, '')) || 0;
    const check = () => {
      const priceEl = document.querySelector('.pdp-price_type_normal');
      const current = priceEl ? num(priceEl.innerText) : 0;
      if (current > 0) {
        const origEl = document.querySelector('.pdp-price_type_deleted');
        const soldOut = !!document.querySelector('.pdp-mod-soldout, .pdp-mod-product-unavailable');
        resolve({ price: current, originalPrice: (origEl && num(origEl.innerText)) || current, inStock: !soldOut });
        return true;
      }
      if (Date.now() - started >= maxMs) { resolve({ gaveUp: true }); return true; }
      return false;
    };
    if (!check()) {
      const iv = setInterval(() => { if (check()) clearInterval(iv); }, 150);
    }
  });
}

// Scrape a single URL by navigating the ONE shared tab to it.
// Faster than before: starts looking for the price as soon as the new page
// exists, instead of waiting up to 12s for every ad/image to finish loading.
const SCRAPE_DEADLINE_MS = 12000;
async function scrapeUrlViaSingleTab(url) {
  const tabId = await _ensureScraperTab();
  await chrome.tabs.update(tabId, { url });

  // Something unique to this product's URL (item id "-i123…") so we never
  // read the previous product still showing in the reused tab.
  const idMatch = url.match(/-i(\d+)/);
  const marker = idMatch ? `-i${idMatch[1]}` : new URL(url).pathname;
  const deadline = Date.now() + SCRAPE_DEADLINE_MS;

  while (Date.now() < deadline) {
    try {
      const t = await chrome.tabs.get(tabId);
      if (isBlockPage(t.url)) return { blocked: true }; // captcha → stop, don't try to get past it
      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        injectImmediately: true,
        func: pollForPrice,
        args: [marker, Math.max(500, deadline - Date.now())],
      });
      const data = res && res.result;
      if (data && data.price > 0) {
        console.log('[DarazBG] Scraped via single tab:', url, '→', data.price);
        return { ...data, source: 'single-tab' };
      }
      if (data && data.gaveUp) break;  // right page, but no price ever appeared
    } catch (_) {
      // Page swapped mid-navigation ("frame removed") — just retry
    }
    await sleep(250);
  }
  console.warn('[DarazBG] Hidden tab found no price for:', url);
  return null;
}

// ── Orchestrator ──
async function fetchPriceReliably(entry, allowWindowFallback = false) {
  // Try raw HTTP first — extremely fast, invisible, and safe.
  const rawResult = await fetchProductPrice(entry);
  if (rawResult) return rawResult;

  // If raw HTML failed (e.g. Flash Sale only visible after JS runs),
  // fall back to the single shared scraper tab.
  if (allowWindowFallback) {
    console.log('[DarazBG] Falling back to single-tab scraper for:', entry.title);
    return await scrapeUrlViaSingleTab(entry.url);
  }

  return null;
}

// ── Clean up "half dead" scraped titles ────────────────────────────────────
function cleanTitle(raw) {
  if (!raw) return raw;
  let t = String(raw).trim();
  t = t.replace(/^[【\[][^】\]]{0,120}[】\]]\s*/, '');
  t = t.replace(/^["'“”‘’]+/, '').replace(/["'“”‘’]+$/, '');
  t = t.trim();
  return t || String(raw).trim();
}

// ── Build a merged worklist: favorites ∪ history, deduped by key ──────────
function buildWorklist(favorites, history) {
  const map = new Map();
  Object.keys(favorites).forEach(key => {
    map.set(key, { key, url: favorites[key].url, title: favorites[key].title, isFav: true, historyIdx: -1 });
  });
  history.forEach((item, idx) => {
    const key = item.key || `${item.itemId}_${item.skuId}`;
    if (map.has(key)) {
      map.get(key).historyIdx = idx;
    } else {
      map.set(key, { key, url: item.url, title: item.title, isFav: false, historyIdx: idx });
    }
  });
  return [...map.values()];
}

// Apply one batch of {entry, result} to storage (fresh read-modify-write,
// so anything content.js saved meanwhile is kept), then send notifications.
async function applyResults(batch) {
  const fresh = await new Promise(res => chrome.storage.local.get(['favorites', 'recently_viewed'], res));
  const favorites = fresh.favorites || {};
  const history = fresh.recently_viewed || [];
  const notices = [];
  let changed = 0;
  const ts = Date.now();

  for (const { entry, result } of batch) {
    const fav = favorites[entry.key];
    if (fav) {
      const newPrice = result.price;
      const oldPrice = fav.currentPrice || fav.price;
      fav.title = cleanTitle(fav.title);
      fav.lastUpdated = ts;
      fav.currentPrice = newPrice;
      fav.price = newPrice;
      if (result.originalPrice) fav.originalPrice = result.originalPrice;

      const wasInStock = fav.inStock !== false;
      fav.inStock = result.inStock;
      if (!wasInStock && fav.inStock) {
        fav.justRestocked = true;
        notices.push(() => notifyBackInStock({ key: entry.key, title: fav.title }));
      }

      fav.lowestPrice  = Math.min(fav.lowestPrice  || newPrice, newPrice);
      fav.highestPrice = Math.max(fav.highestPrice || newPrice, newPrice);

      if (newPrice !== oldPrice) {
        fav.priceHistory = fav.priceHistory || [];
        fav.priceHistory.push({ price: newPrice, ts });
        changed++;
        if (newPrice < oldPrice) {
          notices.push(() => notifyPriceDrop({
            key: entry.key, title: fav.title, currency: fav.currency, oldPrice, newPrice, targetPrice: fav.targetPrice || 0
          }));
        }
      }
    }

    const h = history.find(x => (x.key || `${x.itemId}_${x.skuId}`) === entry.key);
    if (h) {
      h.title = cleanTitle(h.title);
      h.price = result.price;
      h.currentPrice = result.price;
      if (result.originalPrice) h.originalPrice = result.originalPrice;
      h.inStock = result.inStock;
      h.lastUpdated = ts;
    }
  }

  await new Promise(res => chrome.storage.local.set({ favorites, recently_viewed: history }, res));
  for (const n of notices) await n();
  return changed;
}

// ── Main refresh loop — updates every favorite AND every history item ─────
// Polite by design: at most CONCURRENCY requests at once with random gaps,
// stops the moment Daraz rate-limits us. Prices are saved every SAVE_EVERY
// items so the dashboard fills in while the sync is still running.
const SAVE_EVERY = 5;

async function refreshAllTracked(allowWindowFallback = false, forceSync = false) {
  const initial = await new Promise(res =>
    chrome.storage.local.get(['favorites', 'recently_viewed', 'sync_blocked_until'], res)
  );

  // Still cooling down after a rate-limit → don't touch Daraz at all (even on force sync)
  if (initial.sync_blocked_until > Date.now()) {
    console.log('[DarazBG] Paused after rate-limit until', new Date(initial.sync_blocked_until).toLocaleTimeString());
    return { blocked: true, until: initial.sync_blocked_until };
  }

  let worklist = buildWorklist(initial.favorites || {}, initial.recently_viewed || []);
  if (worklist.length === 0) {
    console.log('[DarazBG] Nothing to refresh (no favorites or history)');
    return;
  }

  // SMART CACHING — skip items checked recently (history-only items less often)
  const now = Date.now();
  if (!forceSync) {
    const histByKey = new Map((initial.recently_viewed || []).map(h => [h.key || `${h.itemId}_${h.skuId}`, h]));
    worklist = worklist.filter(entry => {
      const src = entry.isFav ? initial.favorites[entry.key] : histByKey.get(entry.key);
      const lastUpdated = (src && src.lastUpdated) || 0;
      return (now - lastUpdated) > (entry.isFav ? FAV_STALE_MS : HIST_STALE_MS);
    });
  }
  if (worklist.length === 0) {
    console.log('[DarazBG] All items are fresh. Skipping refresh.');
    return { skipped: true };
  }

  // Favorites first, so they get priced even if Daraz cuts us off part-way
  worklist.sort((a, b) => b.isFav - a.isFav);
  console.log(`[DarazBG] Refreshing ${worklist.length} item(s)... (forceSync: ${forceSync})`);

  const total = worklist.length;
  let doneCount = 0;
  let blocked = false;
  let changed = 0;
  const tick = () => chrome.runtime.sendMessage({ action: 'sync_progress', done: doneCount, total }).catch(() => {});
  tick(); // banner appears right away

  // Batched saving — saves run one after another so they never overwrite each other
  let pending = [];
  let saveChain = Promise.resolve();
  const flush = () => {
    if (!pending.length) return;
    const batch = pending;
    pending = [];
    saveChain = saveChain.then(() => applyResults(batch)).then(n => { changed += n; })
      .catch(err => console.warn('[DarazBG] Save failed:', err.message));
  };
  const got = (entry, result) => {
    pending.push({ entry, result });
    if (pending.length >= SAVE_EVERY) flush();
  };

  // Timing stats so slow syncs can be diagnosed (shown in dashboard Settings)
  const stats = { total, http: 0, httpMs: 0, hiddenTab: 0, hiddenTabMs: 0, failed: 0, ms: 0, blocked: false, ts: now };
  const t0 = Date.now();

  // Phase 1: plain HTTP, a few at a time with random gaps
  const rawResults = await runPool(worklist, CONCURRENCY, async (entry) => {
    if (blocked) return { entry, result: null };
    await randomGap(GAP_MS);
    if (blocked) return { entry, result: null };
    const result = await fetchProductPrice(entry);
    if (result && result.blocked) { blocked = true; return { entry, result: null }; }
    if (result) { doneCount++; tick(); got(entry, result); }
    return { entry, result };
  });
  stats.http = rawResults.filter(r => r.result).length;
  stats.httpMs = Date.now() - t0;

  // Phase 2: items HTTP couldn't price → hidden single tab, one by one
  const needsDom = rawResults.filter(r => !r.result);
  const t1 = Date.now();
  if (allowWindowFallback && !blocked && needsDom.length) {
    try {
      for (const { entry } of needsDom) {
        await randomGap(DOM_GAP_MS);
        const result = await scrapeUrlViaSingleTab(entry.url);
        if (result && result.blocked) { blocked = true; break; }
        doneCount++; tick();
        if (result) { stats.hiddenTab++; got(entry, result); }
      }
    } catch (err) {
      // Fallback failing must never throw away the prices Phase 1 already got
      console.warn('[DarazBG] Hidden-tab fallback failed, skipping:', err.message);
    } finally {
      await _destroyScraperTab();
    }
  }
  stats.hiddenTabMs = Date.now() - t1;

  flush();
  await saveChain;

  stats.ms = Date.now() - t0;
  stats.failed = total - stats.http - stats.hiddenTab;
  stats.blocked = blocked;
  const ts = Date.now();
  const update = { last_refresh_ts: ts, last_sync_stats: stats };
  if (blocked) update.sync_blocked_until = ts + BLOCK_COOLDOWN_MS;
  await new Promise(res => chrome.storage.local.set(update, res));

  doneCount = total; tick(); // banner reaches 100%
  console.log(`[DarazBG] Refresh complete in ${(stats.ms / 1000).toFixed(1)}s —`,
    `${stats.http} via HTTP (${(stats.httpMs / 1000).toFixed(1)}s),`,
    `${stats.hiddenTab} via hidden tab (${(stats.hiddenTabMs / 1000).toFixed(1)}s),`,
    `${stats.failed} failed, ${changed} price changes`, blocked ? '— STOPPED: rate-limited' : '');
  return blocked ? { blocked: true, until: update.sync_blocked_until } : { ok: true };
}
