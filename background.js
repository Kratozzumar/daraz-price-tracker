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
    refreshAllFavorites().then(() => reply && reply({ ok: true }));
    return true; // keep message channel open for async
  }

  reply && reply({});
});


// ── Alarm fires → refresh all favorites ──────────────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log('[DarazBG] Alarm fired — starting price refresh');
    refreshAllFavorites();
  }
});

// ── Price extraction from raw HTML ────────────────────────────────────────
function parsePriceFromHtml(html) {
  // Strategy 1: JSON-LD structured data  (<script type="application/ld+json">)
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

  // Strategy 2: window.__INITIAL_STATE__ or window.pageData embedded JS
  const pageDataPatterns = [
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})(?=;\s*(?:window|<\/script>))/,
    /window\.pageData\s*=\s*({[\s\S]*?})(?=;\s*(?:window|<\/script>))/,
    /"skuPriceInfo"\s*:\s*\[[\s\S]*?"price"\s*:\s*"?([\d.]+)"?/,
  ];

  for (const pat of pageDataPatterns) {
    const m = html.match(pat);
    if (!m) continue;
    if (m[1] && !m[1].startsWith('{')) {
      // Direct price capture group
      const p = parseFloat(m[1]);
      if (p > 0) return { price: p, source: 'skuPriceInfo' };
    }
    try {
      // Try to find price inside the JSON blob (look for "price":"73499")
      const priceM = m[1].match(/"price"\s*:\s*"?([\d.]+)"?/);
      if (priceM) {
        const p = parseFloat(priceM[1]);
        if (p > 0) return { price: p, source: 'pageData' };
      }
    } catch (_) {}
  }

  // Strategy 3: <meta property="product:price:amount" content="73499">
  const metaM = html.match(/property=["']product:price:amount["'][^>]*content=["']([\d.,]+)["']/i)
             || html.match(/content=["']([\d.,]+)["'][^>]*property=["']product:price:amount["']/i);
  if (metaM) {
    const p = parseFloat(metaM[1].replace(/,/g, ''));
    if (p > 0) return { price: p, source: 'meta' };
  }

  // Strategy 4: bare "salePrice":"73499" or "currentPrice":73499
  const salePriceM = html.match(/"(?:salePrice|currentPrice|discountPrice|sellPrice)"\s*:\s*"?([\d.]+)"?/i);
  if (salePriceM) {
    const p = parseFloat(salePriceM[1]);
    if (p > 0) return { price: p, source: 'salePrice-attr' };
  }

  return null;
}

function parseOriginalPriceFromHtml(html) {
  // JSON-LD offers/price without discount → look for "originalPrice" or "listPrice"
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

// ── Fetch a single product page and extract price ─────────────────────────
async function fetchProductPrice(fav) {
  const url = fav.url;
  if (!url || !url.includes('daraz')) return null;

  // Cross-platform abort signal (AbortSignal.timeout not available on all Chrome versions)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('[DarazBG] HTTP', response.status, 'for', url);
      return null;
    }

    const html = await response.text();
    const result = parsePriceFromHtml(html);
    const origPrice = parseOriginalPriceFromHtml(html);

    if (result) {
      return {
        price: result.price,
        originalPrice: origPrice || result.price,
        source: result.source
      };
    }
    return null;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.warn('[DarazBG] Fetch timed out for', url);
    } else {
      console.warn('[DarazBG] Fetch error for', url, ':', err.message);
    }
    return null;
  }
}

// ── Main refresh loop ─────────────────────────────────────────────────────
async function refreshAllFavorites() {
  const data = await new Promise(res => chrome.storage.local.get('favorites', res));
  const favorites = data.favorites || {};
  const keys = Object.keys(favorites);

  if (keys.length === 0) {
    console.log('[DarazBG] No favorites to refresh');
    return;
  }

  console.log('[DarazBG] Refreshing', keys.length, 'favorite(s)...');

  let updatedCount = 0;
  let priceDropCount = 0;

  for (const key of keys) {
    const fav = favorites[key];

    // Stagger requests by 3 seconds each to avoid rate-limiting
    if (keys.indexOf(key) > 0) {
      await new Promise(r => setTimeout(r, 3000));
    }

    const result = await fetchProductPrice(fav);
    if (!result) {
      console.log('[DarazBG] Could not fetch price for:', fav.title);
      continue;
    }

    const newPrice = result.price;
    const oldPrice = fav.currentPrice || fav.price;
    const now = Date.now();

    // Always update currentPrice + timestamp
    fav.lastUpdated = now;
    fav.currentPrice = newPrice;
    fav.price = newPrice;
    if (result.originalPrice) fav.originalPrice = result.originalPrice;

    // Update stats
    fav.lowestPrice  = Math.min(fav.lowestPrice  || newPrice, newPrice);
    fav.highestPrice = Math.max(fav.highestPrice || newPrice, newPrice);

    // Only record a price history entry if price actually changed
    if (newPrice !== oldPrice) {
      fav.priceHistory = fav.priceHistory || [];
      fav.priceHistory.push({ price: newPrice, ts: now });
      updatedCount++;

      if (newPrice < oldPrice) {
        priceDropCount++;
        console.log('[DarazBG] Price DROP:', fav.title, oldPrice, '→', newPrice);

        // Show a Chrome notification for each price drop
        chrome.notifications.create(`drop_${key}_${now}`, {
          type: 'basic',
          iconUrl: 'icon48.png',
          title: '📉 Price dropped on Daraz!',
          message: `${fav.title.slice(0, 60)}...\nRs. ${oldPrice.toLocaleString()} → Rs. ${newPrice.toLocaleString()}`,
          priority: 2
        });
      } else {
        console.log('[DarazBG] Price change:', fav.title, oldPrice, '→', newPrice);
      }
    } else {
      console.log('[DarazBG] Price unchanged:', fav.title, newPrice);
    }

    favorites[key] = fav;
  }

  // Save all updates back to storage
  await new Promise(res => chrome.storage.local.set({
    favorites,
    last_refresh_ts: Date.now()
  }, res));

  console.log('[DarazBG] Refresh complete.', updatedCount, 'price changes,', priceDropCount, 'drops.');
}
