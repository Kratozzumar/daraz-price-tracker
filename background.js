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
    refreshAllTracked(false, msg.forceSync).then((res) => reply && reply({ ok: true, skipped: res?.skipped }));
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
      
      const pdtDiscountMatch = innerJson.match(/"pdt_discount_price"\s*:\s*"?[^\d]*([\d.,]+)"?/);
      if (pdtDiscountMatch) {
        const p = parseFloat(pdtDiscountMatch[1].replace(/,/g, ''));
        if (p > 0) return { price: p, source: '__moduleData__pdtDiscount' };
      }
      
      const pdtMatch = innerJson.match(/"pdt_price"\s*:\s*"?[^\d]*([\d.,]+)"?/);
      if (pdtMatch) {
        const p = parseFloat(pdtMatch[1].replace(/,/g, ''));
        if (p > 0) return { price: p, source: '__moduleData__pdt' };
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
async function fetchViaHiddenTab(url) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, active: false }, (tab) => {
      let resolved = false;

      const complete = (data) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(fallbackTimeout);
        chrome.tabs.remove(tab.id).catch(() => {});
        resolve(data);
      };

      const fallbackTimeout = setTimeout(() => {
        console.warn('[DarazBG] Hidden tab timeout for', url);
        complete(null);
      }, 8000);

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return new Promise((res) => {
            const getStrPrice = (str) => {
              const s = str.trim().replace(/^[^\d]+/, '').replace(/,/g, '');
              return parseFloat(s) || 0;
            };

            const attempt = () => {
              const priceEl = document.querySelector('.pdp-price_type_normal');
              const origPriceEl = document.querySelector('.pdp-price_type_deleted');
              if (priceEl && priceEl.innerText) {
                const current = getStrPrice(priceEl.innerText);
                let original = current;
                if (origPriceEl && origPriceEl.innerText) {
                  original = getStrPrice(origPriceEl.innerText) || current;
                }
                
                const hasSoldOutClass = document.querySelector('.pdp-mod-soldout, .pdp-mod-product-unavailable');
                const hasUnavailableText = Array.from(document.querySelectorAll('*')).some(el => 
                  el.childNodes.length === 1 && el.innerText.toLowerCase().includes('currently unavailable')
                );
                
                res({ price: current, originalPrice: original, inStock: !hasSoldOutClass && !hasUnavailableText });
                return true;
              }
              return false;
            };

            if (attempt()) return;

            const observer = new MutationObserver(() => {
              if (attempt()) observer.disconnect();
            });
            observer.observe(document.body, { childList: true, subtree: true });
            
            setTimeout(() => { observer.disconnect(); res(null); }, 5000);
          });
        }
      }).then((results) => {
        if (results && results[0] && results[0].result) {
          console.log('[DarazBG] Price found via hidden tab:', results[0].result.price);
          complete({ ...results[0].result, source: 'hidden-tab' });
        } else {
          console.warn('[DarazBG] Script execution yielded no price for', url);
          complete(null);
        }
      }).catch(err => {
        console.warn('[DarazBG] Scripting error on hidden tab:', err);
        complete(null);
      });
    });
  });
}

// ── Orchestrator ──
async function fetchPriceReliably(entry, allowWindowFallback = false) {
  // Try raw HTTP first — extremely fast, invisible, and safe.
  const rawResult = await fetchProductPrice(entry);
  if (rawResult) return rawResult;

  // If that failed, fall back to a hidden background tab ONLY if explicitly
  // allowed (i.e. manual user refreshes). Background alarms must NEVER
  // open windows, as they steal focus and annoy the user.
  if (allowWindowFallback) {
    console.log('[DarazBG] Falling back to hidden tab for:', entry.title);
    return await fetchViaHiddenTab(entry.url);
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

// ── Main refresh loop — updates every favorite AND every history item ─────
async function refreshAllTracked(allowWindowFallback = false, forceSync = false) {
  const initial = await new Promise(res =>
    chrome.storage.local.get(['favorites', 'recently_viewed'], res)
  );
  let worklist = buildWorklist(initial.favorites || {}, initial.recently_viewed || []);

  if (worklist.length === 0) {
    console.log('[DarazBG] Nothing to refresh (no favorites or history)');
    return;
  }

  // SMART CACHING
  const now = Date.now();
  if (!forceSync) {
    worklist = worklist.filter(entry => {
      let lastUpdated = 0;
      if (entry.isFav && initial.favorites && initial.favorites[entry.key]) {
        lastUpdated = initial.favorites[entry.key].lastUpdated || 0;
      } else {
        const histItem = (initial.recently_viewed || []).find(h => (h.key || `${h.itemId}_${h.skuId}`) === entry.key);
        if (histItem) lastUpdated = histItem.lastUpdated || 0;
      }
      return (now - lastUpdated) > (2 * 60 * 60 * 1000); // 2 hours
    });
  }

  if (worklist.length === 0) {
    console.log('[DarazBG] All items are fresh. Skipping refresh.');
    return { skipped: true };
  }

  console.log(`[DarazBG] Refreshing ${worklist.length} item(s)... (forceSync: ${forceSync})`);

  let updatedCount = 0;
  let priceDropCount = 0;

  // PARALLEL PROCESSING
  const CONCURRENCY = 4;
  for (let i = 0; i < worklist.length; i += CONCURRENCY) {
    const batch = worklist.slice(i, i + CONCURRENCY);
    console.log(`[DarazBG] Processing batch ${Math.floor(i/CONCURRENCY) + 1} of ${Math.ceil(worklist.length/CONCURRENCY)}`);

    const results = await Promise.all(batch.map(async (entry) => {
      const result = await fetchPriceReliably(entry, allowWindowFallback);
      return { entry, result };
    }));

    // Process results sequentially to avoid storage race conditions
    for (const { entry, result } of results) {
      if (!result) {
        console.log('[DarazBG] Could not fetch price for:', entry.title);
        continue;
      }

      const fresh = await new Promise(res =>
        chrome.storage.local.get(['favorites', 'recently_viewed'], res)
      );
      const favorites = fresh.favorites || {};
      const history = fresh.recently_viewed || [];
      let favDirty = false;
      let histDirty = false;
      const ts = Date.now();

      if (entry.isFav && favorites[entry.key]) {
        const fav = favorites[entry.key];
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
          console.log('[DarazBG] Back in stock:', entry.title);
          await notifyBackInStock({ key: entry.key, title: fav.title });
        }

        fav.lowestPrice  = Math.min(fav.lowestPrice  || newPrice, newPrice);
        fav.highestPrice = Math.max(fav.highestPrice || newPrice, newPrice);

        if (newPrice !== oldPrice) {
          fav.priceHistory = fav.priceHistory || [];
          fav.priceHistory.push({ price: newPrice, ts });
          updatedCount++;

          if (newPrice < oldPrice) {
            priceDropCount++;
            console.log('[DarazBG] Price DROP:', entry.title, oldPrice, '→', newPrice);
            await notifyPriceDrop({
              key: entry.key, title: fav.title, currency: fav.currency, oldPrice, newPrice, targetPrice: fav.targetPrice || 0
            });
          }
        }

        favorites[entry.key] = fav;
        favDirty = true;
      }

      const histIdx = history.findIndex(h => (h.key || `${h.itemId}_${h.skuId}`) === entry.key);
      if (histIdx > -1) {
        const h = history[histIdx];
        h.title = cleanTitle(h.title);
        h.price = result.price;
        h.currentPrice = result.price;
        if (result.originalPrice) h.originalPrice = result.originalPrice;
        h.inStock = result.inStock;
        h.lastUpdated = ts;
        history[histIdx] = h;
        histDirty = true;
      }

      if (favDirty || histDirty) {
        await new Promise(res => chrome.storage.local.set({ favorites, recently_viewed: history }, res));
      }
    }
  }

  await new Promise(res => chrome.storage.local.set({ last_refresh_ts: Date.now() }, res));
  console.log('[DarazBG] Refresh complete.', updatedCount, 'price changes,', priceDropCount, 'drops.');
}

