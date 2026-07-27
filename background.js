// Daraz Price Tracker — Background Service Worker
// Handles: badge setting + automatic background price refresh for favorites

const ALARM_NAME = 'daraz_price_refresh';
const DEFAULT_INTERVAL_MINUTES = 360; // fallback if no setting saved

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
    refreshAllTracked().then(() => reply && reply({ ok: true }));
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
    console.log('[DarazBG] Alarm fired — starting price refresh');
    refreshAllTracked();
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
    if (!response.ok) {
      console.warn('[DarazBG] HTTP', response.status, 'for', entry.title);
      return null;
    }

    const html = await response.text();
    const result = parsePriceFromHtml(html);
    const origPrice = parseOriginalPriceFromHtml(html);
    const htmlLower = html.toLowerCase();
    // Check for actual sold-out markers — avoid 'almost sold out' false positives
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

// ── Reliable fallback: render the page for real in a hidden background tab ─
//
// Daraz's product pages are client-rendered — the price isn't present
// anywhere in the raw HTML (no JSON-LD offers, no price meta tags, nothing
// our regexes can match). It only appears after the page's own JavaScript
// runs. That's why fetchProductPrice() above silently fails for most
// products. To get a real answer we open the product in a minimized,
// unfocused background tab, let it actually load and render, extract the
// price with the exact same DOM selectors content.js already uses
// successfully when you browse normally, then close the tab.
//
// This is slower than a raw fetch, so it's only used when the fast path
// above comes back empty.
function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === 'complete') finish();
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// Injected into the live page via chrome.scripting.executeScript — must be
// fully self-contained (no references to outer-scope variables), since it
// runs inside the target page's context, not this service worker's.
function extractPriceFromLiveDom() {
  function parsePrice(str) {
    if (!str) return 0;
    let s = str.trim().replace(/^[^\d]+/, '');
    s = s.replace(/,/g, '');
    return parseFloat(s) || 0;
  }

  const priceEl =
    document.querySelector('.pdp-price_color_orange') ||
    document.querySelector('[class*="pdp-price"][class*="color_orange"]') ||
    document.querySelector('[class*="pdp-price"]:not([class*="deleted"])') ||
    document.querySelector('.notranslate') ||
    document.querySelector('[class*="price_current"]') ||
    document.querySelector('[class*="current-price"]');
  const price = parsePrice(priceEl ? priceEl.innerText : '');

  const origEl =
    document.querySelector('.pdp-price_type_deleted') ||
    document.querySelector('[class*="price_type_deleted"]') ||
    document.querySelector('[class*="price-deleted"]') ||
    document.querySelector('[class*="origin-block-price"]') ||
    document.querySelector('del');
  const originalPrice = parsePrice(origEl ? origEl.innerText : '') || price;

  const soldOutEl = document.querySelector('.pdp-mod-soldOut') ||
                     document.querySelector('[class*="soldout"]') ||
                     document.querySelector('[class*="sold-out"]');
  const buyBtn = document.querySelector('.pdp-button_theme_orange') ||
                 document.querySelector('button.add-to-cart-buy-now-btn');
  const buyBtnDisabled = buyBtn ? buyBtn.disabled : false;
  const unavailLabel = document.querySelector('.pdp-mod-product-unavailable') ||
                       document.querySelector('[class*="currently-unavailable"]');
  const inStock = !soldOutEl && !buyBtnDisabled && !unavailLabel;

  return { price, originalPrice, inStock };
}

async function fetchViaHiddenTab(entry) {
  const url = entry.url;
  if (!url || !url.includes('daraz')) return null;

  let win = null;
  try {
    win = await chrome.windows.create({ url, focused: false, state: 'minimized', type: 'popup' });
    const tab = win && win.tabs && win.tabs[0];
    if (!tab) return null;

    await waitForTabComplete(tab.id, 15000);
    // Daraz is a client-rendered SPA — give it a beat after "complete" to
    // finish hydrating and actually paint the price into the DOM.
    await new Promise((r) => setTimeout(r, 1500));

    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPriceFromLiveDom
    });

    const data = injectionResults && injectionResults[0] && injectionResults[0].result;
    if (!data || !(data.price > 0)) {
      console.warn('[DarazBG] Hidden-tab render found no price for:', entry.title);
      return null;
    }

    console.log('[DarazBG] Price found via rendered page for:', entry.title, '→', data.price);
    return { price: data.price, originalPrice: data.originalPrice || data.price, source: 'rendered-dom', inStock: data.inStock };
  } catch (err) {
    console.warn('[DarazBG] Hidden-tab fetch failed for', entry.title, ':', err.message);
    return null;
  } finally {
    if (win && win.id) {
      try { await chrome.windows.remove(win.id); } catch (_) {}
    }
  }
}

// Try the fast static-HTML fetch first; only pay the cost of actually
// rendering the page if that comes back empty.
async function fetchPriceReliably(entry) {
  const fast = await fetchProductPrice(entry);
  if (fast) return fast;
  return fetchViaHiddenTab(entry);
}

// ── Clean up "half dead" scraped titles ────────────────────────────────────
// Some Daraz listings have marketing text baked right into the title, e.g.
// "【Buy 2 for 12999: UK Plug+1.5M C-L Cable】 UGREEN ..." or a stray leading
// quote character like `"Soundcore P30i by An...`. Strip that noise so the
// name shown is just the product name.
function cleanTitle(raw) {
  if (!raw) return raw;
  let t = String(raw).trim();
  // Drop a leading bracketed marketing tag: "【...】" or "[...]"
  t = t.replace(/^[【\[][^】\]]{0,120}[】\]]\s*/, '');
  // Drop stray wrapping quote characters some sellers add
  t = t.replace(/^["'“”‘’]+/, '').replace(/["'“”‘’]+$/, '');
  t = t.trim();
  return t || String(raw).trim();
}

// ── Build a merged worklist: favorites ∪ history, deduped by key ──────────
// A product that's both favorited AND in recently-viewed history only gets
// fetched once, and the result is applied to both records.
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

// ── Main refresh loop — updates every favorite AND every history item ─────
//
// Each item is committed to storage IMMEDIATELY after it's fetched (fresh
// read → merge → write), rather than accumulating every change in memory
// and writing once at the very end. This matters for two reasons:
//   1. It avoids clobbering updates written elsewhere (e.g. content.js
//      updating the same product live, from an open tab) with a stale
//      in-memory snapshot taken at the start of a multi-second refresh.
//   2. MV3 service workers can be suspended mid-execution during long
//      idle waits. If we only wrote once at the end, a suspension partway
//      through would silently discard every price we'd already fetched.
//      Committing per-item means progress is never lost.
async function refreshAllTracked() {
  const initial = await new Promise(res =>
    chrome.storage.local.get(['favorites', 'recently_viewed'], res)
  );
  const worklist = buildWorklist(initial.favorites || {}, initial.recently_viewed || []);

  if (worklist.length === 0) {
    console.log('[DarazBG] Nothing to refresh (no favorites or history)');
    return;
  }

  console.log('[DarazBG] Refreshing', worklist.length, 'tracked item(s)...');

  let updatedCount = 0;
  let priceDropCount = 0;

  for (let i = 0; i < worklist.length; i++) {
    const entry = worklist[i];

    // Small stagger to be polite to Daraz's servers — short enough to keep
    // the service worker's fetch/storage activity from going idle for long.
    if (i > 0) {
      await new Promise(r => setTimeout(r, 600));
    }

    const result = await fetchPriceReliably(entry);
    const now = Date.now();

    if (!result) {
      console.log('[DarazBG] Could not fetch price for:', entry.title);
      continue;
    }

    // Re-read the latest state right before writing, so we build on top of
    // whatever's actually in storage right now instead of a stale snapshot.
    const fresh = await new Promise(res =>
      chrome.storage.local.get(['favorites', 'recently_viewed'], res)
    );
    const favorites = fresh.favorites || {};
    const history = fresh.recently_viewed || [];
    let favDirty = false;
    let histDirty = false;

    // ── Update the favorite record (full tracking: history/stats/alerts) ──
    if (entry.isFav && favorites[entry.key]) {
      const fav = favorites[entry.key];
      const newPrice = result.price;
      const oldPrice = fav.currentPrice || fav.price;

      fav.title = cleanTitle(fav.title);

      // Always bump the timestamp — even when the price hasn't moved — so
      // "last checked" always reflects today's refresh, not a stale date.
      fav.lastUpdated = now;
      fav.currentPrice = newPrice;
      fav.price = newPrice;
      if (result.originalPrice) fav.originalPrice = result.originalPrice;

      const wasInStock = fav.inStock !== false;
      fav.inStock = result.inStock;
      if (!wasInStock && fav.inStock) {
        fav.justRestocked = true; // popup shows a "Back in Stock!" badge
        console.log('[DarazBG] Back in stock:', entry.title);
        await notifyBackInStock({ key: entry.key, title: fav.title });
      }

      fav.lowestPrice  = Math.min(fav.lowestPrice  || newPrice, newPrice);
      fav.highestPrice = Math.max(fav.highestPrice || newPrice, newPrice);

      if (newPrice !== oldPrice) {
        fav.priceHistory = fav.priceHistory || [];
        fav.priceHistory.push({ price: newPrice, ts: now });
        updatedCount++;

        if (newPrice < oldPrice) {
          priceDropCount++;
          console.log('[DarazBG] Price DROP:', entry.title, oldPrice, '→', newPrice);
          await notifyPriceDrop({
            key: entry.key,
            title: fav.title,
            currency: fav.currency,
            oldPrice,
            newPrice,
            targetPrice: fav.targetPrice || 0
          });
        } else {
          console.log('[DarazBG] Price change:', entry.title, oldPrice, '→', newPrice);
        }
      } else {
        console.log('[DarazBG] Price unchanged:', entry.title, newPrice);
      }

      favorites[entry.key] = fav;
      favDirty = true;
    }

    // ── Update the plain history record too (price + freshness only) ──────
    // Look the entry up by key fresh each time — it may have moved/been
    // reordered since the worklist was first built.
    const histIdx = history.findIndex(h => (h.key || `${h.itemId}_${h.skuId}`) === entry.key);
    if (histIdx > -1) {
      const h = history[histIdx];
      h.title = cleanTitle(h.title);
      h.price = result.price;
      h.currentPrice = result.price;
      if (result.originalPrice) h.originalPrice = result.originalPrice;
      h.inStock = result.inStock;
      h.lastUpdated = now; // history always shows the latest checked price/date too
      history[histIdx] = h;
      histDirty = true;
    }

    if (favDirty || histDirty) {
      await new Promise(res => chrome.storage.local.set({ favorites, recently_viewed: history }, res));
    }
  }

  await new Promise(res => chrome.storage.local.set({ last_refresh_ts: Date.now() }, res));
  console.log('[DarazBG] Refresh complete.', updatedCount, 'price changes,', priceDropCount, 'drops.');
}

