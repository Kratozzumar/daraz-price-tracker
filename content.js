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

  // Some Daraz listings bake marketing text right into the title, e.g.
  // "【Buy 2 for 12999: UK Plug+1.5M C-L Cable】 UGREEN ..." or a stray
  // leading quote character. Strip that noise so only the product name shows.
  function cleanTitle(raw) {
    if (!raw) return raw;
    let t = String(raw).trim();
    t = t.replace(/^[【\[][^】\]]{0,120}[】\]]\s*/, '');
    t = t.replace(/^["'“”‘’]+/, '').replace(/["'“”‘’]+$/, '');
    t = t.trim();
    return t || String(raw).trim();
  }

  function extractPromotions() {
    const promos = [];
    const elements = document.querySelectorAll('.voucher-text, [class*="voucher"], [class*="coupon"], .promotion-label, [class*="promotion"], [class*="flash-sale"]');
    elements.forEach(el => {
      const text = el.innerText.trim();
      if (text && text.length > 2 && text.length < 50 && !promos.includes(text)) {
        promos.push(text);
      }
    });
    const html = document.body.innerText.toLowerCase();
    if (html.includes('free shipping') && !promos.includes('Free Shipping')) {
      promos.push('Free Shipping');
    }
    return promos;
  }

  function extractFromDOM() {
    // ── Title ──
    const titleEl =
      document.querySelector('.pdp-mod-product-title') ||
      document.querySelector('[class*="product-title"]') ||
      document.querySelector('.title--wrap--aPXFJRt') ||
      document.querySelector('h1[class*="title"]') ||
      document.querySelector('h1');
    const title = cleanTitle(titleEl ? titleEl.innerText.trim() : document.title.split(' |')[0].trim());

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

    const inStock = !document.querySelector('.pdp-mod-soldOut') && 
                    !document.querySelector('button[disabled][class*="add-to-cart"]') &&
                    !document.body.innerText.match(/Currently Unavailable|Out of Stock|Sold Out/i);
    
    const promotions = extractPromotions();

    return { title, price, originalPrice, priceStr, imageUrl, inStock, promotions };
  }

  // ── Multi-currency: detect Daraz region from hostname ──
  function detectCurrency() {
    const host = window.location.hostname;
    if (host.includes('daraz.com.bd')) return 'BDT';
    if (host.includes('daraz.com.np')) return 'NPR';
    if (host.includes('daraz.lk')) return 'LKR';
    if (host.includes('daraz.pk')) return 'PKR';
    return 'Rs.';
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
          const oldPrice = fav.currentPrice || fav.price;
          fav.currency = product.currency;
          fav.currentPrice = product.price;
          fav.price = product.price;
          fav.originalPrice = product.originalPrice;
          fav.imageUrl = product.imageUrl;
          fav.inStock = product.inStock;
          fav.promotions = product.promotions;
          fav.lastUpdated = product.lastUpdated;
          // Append to price history if price changed
          if (product.price !== oldPrice) {
            fav.priceHistory = fav.priceHistory || [];
            fav.priceHistory.push({ price: product.price, ts: product.lastUpdated });
            fav.lowestPrice = Math.min(fav.lowestPrice || product.price, product.price);
            fav.highestPrice = Math.max(fav.highestPrice || product.price, product.price);

            // A price drop noticed just from browsing (not a manual/scheduled
            // refresh) should still trigger a Chrome notification. Content
            // scripts can't call chrome.notifications directly, so ask the
            // background service worker to do it.
            if (product.price < oldPrice) {
              chrome.runtime.sendMessage({
                action: 'price_drop_detected',
                key,
                title: fav.title,
                currency: fav.currency,
                oldPrice,
                newPrice: product.price,
                targetPrice: fav.targetPrice || 0
              }, () => {});
            }
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
          currency: detectCurrency(),
          imageUrl: dom.imageUrl,
          url: window.location.href.split('?')[0],
          lastUpdated: Date.now(),
          inStock: dom.inStock,
          promotions: dom.promotions
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

  // Watch for price changes in DOM (variant/color switches)
  let priceChangeTimer = null;
  let lastSeenPrice = '';
  const priceObserver = new MutationObserver(() => {
    const priceEl =
      document.querySelector('.pdp-price_color_orange') ||
      document.querySelector('[class*="pdp-price"]:not([class*="deleted"])') ||
      document.querySelector('.notranslate') ||
      document.querySelector('[class*="price_current"]') ||
      document.querySelector('[class*="current-price"]');
    if (!priceEl) return;
    const currentText = priceEl.innerText.trim();
    if (currentText && currentText !== lastSeenPrice) {
      lastSeenPrice = currentText;
      clearTimeout(priceChangeTimer);
      priceChangeTimer = setTimeout(() => {
        console.log('[DarazTracker] Price change detected in DOM:', currentText);
        run();
      }, 1000);
    }
  });
  // Start observing the product detail area for changes
  const targetNode = document.querySelector('.pdp-mod-product-badge-wrapper') ||
                     document.querySelector('[class*="pdp-mod-product"]') ||
                     document.querySelector('#module_product_detail') ||
                     document.body;
  priceObserver.observe(targetNode, { childList: true, subtree: true, characterData: true });

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
