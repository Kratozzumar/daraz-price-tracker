// Daraz Price Tracker - Content Script
// Runs on every Daraz page and saves product data to local storage

(function () {
  'use strict';

  // Only run on product pages
  if (!window.location.href.includes('/products/')) return;

  function parsePrice(str) {
    if (!str) return 0;
    // Remove leading non-digit prefix (currency symbols, letters, spaces, dots)
    let s = str.trim().replace(/^[^\d]+/, '');
    // Remove thousand separators (commas)
    s = s.replace(/,/g, '');
    return parseFloat(s) || 0;
  }

  function extractFromDOM() {
    // ── Title ──
    const titleEl =
      document.querySelector('.pdp-mod-product-title') ||
      document.querySelector('[class*="product-title"]') ||
      document.querySelector('.title--wrap--aPXFJRt') ||
      document.querySelector('h1[class*="title"]') ||
      document.querySelector('h1');
    const title = titleEl ? titleEl.innerText.trim() : document.title.split(' |')[0].trim();

    // ── Current / discounted price (the main big price shown) ──
    const priceEl =
      document.querySelector('.pdp-price_color_orange') ||
      document.querySelector('[class*="pdp-price"][class*="color_orange"]') ||
      document.querySelector('[class*="pdp-price"]:not([class*="deleted"])') ||
      document.querySelector('.notranslate') ||
      document.querySelector('[class*="price_current"]') ||
      document.querySelector('[class*="current-price"]');
    const priceStr = priceEl ? priceEl.innerText.trim() : '';
    const price = parsePrice(priceStr);

    // ── Original / crossed-out price ──
    const origEl =
      document.querySelector('.pdp-price_type_deleted') ||
      document.querySelector('[class*="price_type_deleted"]') ||
      document.querySelector('[class*="price-deleted"]') ||
      document.querySelector('[class*="origin-block-price"]') ||
      document.querySelector('del');
    const origStr = origEl ? origEl.innerText.trim() : '';
    const originalPrice = parsePrice(origStr) || price;

    // ── Image ──
    const imgEl =
      document.querySelector('.gallery-preview-panel__image') ||
      document.querySelector('.pdp-common-image') ||
      document.querySelector('.item-gallery__image img') ||
      document.querySelector('[class*="gallery"] img') ||
      document.querySelector('.pdp-block img');
    let imageUrl = imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || '') : '';
    if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;

    return { title, price, originalPrice, priceStr, imageUrl };
  }

  function getItemId() {
    const url = window.location.href;
    const m = url.match(/-i(\d+)-s(\d+)/) || url.match(/-i(\d+)/);
    if (!m) return null;
    return { itemId: m[1], skuId: m[2] || '0' };
  }

  async function saveProduct(product) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['recently_viewed', 'favorites', 'settings'], (data) => {
        let history = data.recently_viewed || [];
        const favorites = data.favorites || {};
        const settings = data.settings || {};
        const limit = settings.historyLimit || 20;
        const key = `${product.itemId}_${product.skuId}`;

        // Remove existing entry for this item and add fresh at top
        history = history.filter(i => i.key !== key);
        history.unshift(product);
        // Keep to user-configured limit
        history = history.slice(0, limit);

        // If it's a favorite, update price there too
        if (favorites[key]) {
          const fav = favorites[key];
          const oldPrice = fav.currentPrice;
          fav.currentPrice = product.price;
          fav.originalPrice = product.originalPrice;
          fav.imageUrl = product.imageUrl;
          fav.lastUpdated = product.lastUpdated;
          // Append to price history if price changed
          if (product.price !== oldPrice) {
            fav.priceHistory = fav.priceHistory || [];
            fav.priceHistory.push({ price: product.price, ts: product.lastUpdated });
            fav.lowestPrice = Math.min(fav.lowestPrice || product.price, product.price);
            fav.highestPrice = Math.max(fav.highestPrice || product.price, product.price);
          }
          favorites[key] = fav;
        }

        chrome.storage.local.set({
          recently_viewed: history,
          favorites: favorites,
          current_page_product: product
        }, () => {
          console.log('[DarazTracker] Saved:', product.title, product.price);
          resolve(product);
        });
      });
    });
  }

  async function run() {
    const ids = getItemId();
    if (!ids) {
      console.log('[DarazTracker] Not a product page (no item ID in URL)');
      return;
    }

    // Try multiple times while page loads
    let attempts = 0;
    const maxAttempts = 20;

    const tryExtract = async () => {
      attempts++;
      const dom = extractFromDOM();

      if (dom.price > 0) {
        // Success — build product object and save
        const product = {
          key: `${ids.itemId}_${ids.skuId}`,
          itemId: ids.itemId,
          skuId: ids.skuId,
          title: dom.title,
          price: dom.price,
          originalPrice: dom.originalPrice,
          currency: 'Rs.',
          imageUrl: dom.imageUrl,
          url: window.location.href.split('?')[0],
          lastUpdated: Date.now()
        };

        await saveProduct(product);

        // Tell background to show green tick on icon
        chrome.runtime.sendMessage({ action: 'set_badge', tabId: null }, () => {});
        return;
      }

      if (attempts < maxAttempts) {
        setTimeout(tryExtract, 500);
      } else {
        console.log('[DarazTracker] Could not extract price after', maxAttempts, 'attempts');
      }
    };

    setTimeout(tryExtract, 800); // Small initial delay to let page render
  }

  run();

  // Re-run if URL changes (SPA navigation)
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      run();
    }
  }, 1500);

  // Listen for popup asking for current page data
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg.action === 'get_current_product') {
      chrome.storage.local.get('current_page_product', (d) => {
        reply({ product: d.current_page_product || null });
      });
      return true;
    }
  });
})();
