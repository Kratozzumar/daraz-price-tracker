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

    const soldOutEl = document.querySelector('.pdp-mod-soldOut') ||
                       document.querySelector('[class*="soldout"]') ||
                       document.querySelector('[class*="sold-out"]');
    const buyBtn = document.querySelector('.pdp-button_theme_orange') ||
                   document.querySelector('button[data-spm-anchor-id*="add_to_cart"]') ||
                   document.querySelector('button.add-to-cart-buy-now-btn');
    const buyBtnDisabled = buyBtn ? buyBtn.disabled : false;
    // Only check specific unavailable labels — NOT body text (avoids 'Almost sold out' false positive)
    const unavailLabel = document.querySelector('.pdp-mod-product-unavailable') ||
                         document.querySelector('[class*="currently-unavailable"]');
    const inStock = !soldOutEl && !buyBtnDisabled && !unavailLabel;
    
    const promotions = extractPromotions();

    // ── Shipping Fee ──
    const shippingEl = document.querySelector('.delivery-option-item__shipping-fee') ||
                       document.querySelector('[class*="shipping-fee"]');
    const shippingStr = shippingEl ? shippingEl.innerText.trim() : '';
    const shippingFee = shippingStr.toLowerCase().includes('free') ? 0 : parsePrice(shippingStr);

    // ── Seller Info ──
    const sellerNameEl = document.querySelector('.pdp-seller-info-pc__seller-name') ||
                         document.querySelector('.seller-name__detail') ||
                         document.querySelector('[class*="seller-name"]');
    const sellerRatingEl = document.querySelector('.seller-info-value') ||
                           document.querySelector('.pdp-seller-info-pc__seller-rating') ||
                           document.querySelector('[class*="seller-rating"]');
    
    let seller = null;
    if (sellerNameEl) {
      seller = {
        name: sellerNameEl.innerText.trim(),
        rating: sellerRatingEl ? sellerRatingEl.innerText.trim() : 'New',
        url: sellerNameEl.href || ''
      };
    }

    return { title, price, originalPrice, priceStr, imageUrl, inStock, promotions, shippingFee, seller };
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
    const m = url.match(/[/-]i(\d+)-s(\d+)/) || url.match(/[/-]i(\d+)/);
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
          
          // ── Fake Discount Detector ──
          if (fav.originalPrice && product.originalPrice > fav.originalPrice) {
            fav.fakeDiscountWarning = true;
          }
          fav.originalPrice = product.originalPrice;
          
          fav.imageUrl = product.imageUrl;
          fav.inStock = product.inStock;
          fav.promotions = product.promotions;
          fav.shippingFee = product.shippingFee;
          fav.seller = product.seller;
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
          promotions: dom.promotions,
          shippingFee: dom.shippingFee,
          seller: dom.seller
        };

        await saveProduct(product);

        // Feature 3: Better Alternatives
        findCheaperAlternatives(product);

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

  // ── Feature 3: Better Alternatives (Price Match) ──
  async function findCheaperAlternatives(product) {
    if (!product.title) return;
    // Skip if running in a hidden/background tab (e.g. the Ghost Window scraper)
    if (document.hidden || document.visibilityState === 'hidden') return;
    
    // Check if we already showed a banner to avoid spamming
    if (document.getElementById('daraz-tracker-alt-banner')) return;

    try {
      // Use Daraz catalog search endpoint
      const searchUrl = `/catalog/?q=${encodeURIComponent(product.title.substring(0, 50))}&ajax=true`;
      const res = await fetch(searchUrl);
      if (!res.ok) return;
      const data = await res.json();
      
      let alternatives = [];
      if (data && data.mods && data.mods.listItems) {
        // Filter out the current item and find cheaper ones
        alternatives = data.mods.listItems.filter(item => 
          item.itemId !== product.itemId && 
          parseFloat(item.price) < product.price
        );
      }
      
      if (alternatives.length > 0) {
        // Find the absolute cheapest
        alternatives.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
        const bestAlt = alternatives[0];
        const count = alternatives.length;
        
        injectAlternativeBanner(count, bestAlt, product.currency);
      }
    } catch (e) {
      // Silently ignore network errors in background contexts
      if (document.visibilityState !== 'hidden') {
        console.warn('[DarazTracker] Alt search failed', e);
      }
    }
  }

  function injectAlternativeBanner(count, bestAlt, currency) {
    const banner = document.createElement('div');
    banner.id = 'daraz-tracker-alt-banner';
    banner.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(8px);
      color: #fff;
      padding: 12px 20px;
      border-radius: 12px;
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      border: 1px solid rgba(255,255,255,0.1);
      font-size: 14px;
      animation: slideDown 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    
    // Add keyframes
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideDown { from { transform: translate(-50%, -20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
      .daraz-tracker-btn:hover { background: #ff5500 !important; }
    `;
    document.head.appendChild(style);

    banner.innerHTML = `
      <div style="font-size: 18px;">✨</div>
      <div style="flex: 1;">
        We found <b>${count}</b> other seller${count > 1 ? 's' : ''} with similar items for cheaper 
        (Starting at <b style="color: #10b981;">${currency} ${parseFloat(bestAlt.price).toLocaleString()}</b>).
      </div>
      <a href="${bestAlt.itemUrl}" target="_blank" class="daraz-tracker-btn" style="
        background: #f85606;
        color: white;
        text-decoration: none;
        padding: 6px 12px;
        border-radius: 6px;
        font-weight: 600;
        transition: background 0.2s;
      ">View Cheapest</a>
      <button id="daraz-tracker-close-alt" style="
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 18px;
        padding: 0 4px;
      ">×</button>
    `;

    document.body.appendChild(banner);
    
    document.getElementById('daraz-tracker-close-alt').addEventListener('click', () => {
      banner.remove();
    });
  }

})();
