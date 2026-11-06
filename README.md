# Daraz Price Tracker 🏷️📉

> **Track Daraz product prices privately — 100% offline, zero cloud, all data stays on your machine.**

A feature-rich Chrome extension that automatically tracks prices when you browse [Daraz](https://www.daraz.lk) (Sri Lanka, Pakistan, Bangladesh, Nepal). Set price targets, compare products, get drop alerts, view rich charts, export data — all without sending a single byte to any server.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen)
![Version](https://img.shields.io/badge/Version-5.0.0-orange)
![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local-10b981)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Mac%20%7C%20Linux-blue)

---

## ✨ Features

### 🔥 Core Tracking
| Feature | Description |
|---|---|
| 🔍 **Auto Price Capture** | Prices captured automatically when you visit any Daraz product page |
| ⭐ **Favorites** | Star items to track them long-term with full price history |
| 🔄 **Auto Background Refresh** | Silently checks prices on a schedule (every 6 hours by default, configurable) |
| ⚡ **Force Sync** | Shift+Click the refresh button to instantly re-check all items, bypassing cache |
| 🔔 **Price Drop Alerts** | Chrome notifications when a favorited item's price drops |
| 🌍 **Multi-Region & Currency** | Supports Daraz LK, PK, BD, NP — auto-detects currency (Rs./৳/NPR) |

### 🎯 Smart Price Intelligence
| Feature | Description |
|---|---|
| 🎯 **Price Drop Target** | Set a target price for any favorite — get a special notification when price hits your goal |
| 📈 **Trend Prediction** | See trending indicators (📈📉➡️) based on recent price movement |
| 🟢 **Best Time to Buy** | Smart badges: "Great Deal", "Fair Price", or "Wait for Drop" based on price position vs. historical range |
| 📦 **Stock Alerts** | Detects out-of-stock products and notifies you when they're back in stock |
| 🏷️ **Sale & Coupon Detection** | Scrapes vouchers, promotions, and flash sale labels from product pages |
| 💡 **Cheaper Alternatives** | Automatically searches for similar items at lower prices while you browse |

### ⚡ Smart Refresh Engine
| Feature | Description |
|---|---|
| 🚀 **Parallel HTTP Fetch** | All items fetched simultaneously via raw HTTP — extremely fast with zero browser tabs |
| 🖥️ **Single-Tab DOM Scraper** | For Flash Sale / JS-rendered prices, one invisible minimized window cycles through all items — never opens visible tabs |
| ⏱️ **Smart Polling** | Instead of a fixed wait time, checks for the price every 200ms — stops the moment it appears (up to 6s max) |
| 🧠 **Smart Caching** | Items refreshed within 2 hours are skipped during auto-refresh — only Force Sync bypasses this |
| 📊 **Live Progress Banner** | Animated indigo progress bar with live item counter ("Syncing 8 of 15…") visible in the popup during Force Sync |

### 📊 Charts & Analysis
| Feature | Description |
|---|---|
| 📊 **Interactive Price Charts** | SVG charts with min/max reference lines, target price line, and hover tooltips |
| 📉 **% Change Badge** | Shows percentage change between first and latest tracked price |
| 🔀 **Price Comparison** | Side-by-side comparison of up to 3 favorited products |

### 🛠️ Data & Organization
| Feature | Description |
|---|---|
| 🔎 **Search & Filter** | Real-time search across history and favorites by product name |
| 📑 **Sort Options** | Sort favorites by price, discount %, name, or most recent |
| 🏷️ **Category Tags** | Tag favorites with custom labels (Electronics, Kitchen, etc.) for organized tracking |
| 💾 **Export / Import** | Backup & restore data as JSON. Export favorites as CSV spreadsheet |
| 📋 **Wishlist Sharing** | Copy a formatted wishlist with prices and links to clipboard |
| 🌗 **Dark / Light Theme** | Toggle between dark and light mode in settings |

### 🔒 Privacy
| Feature | Description |
|---|---|
| 🔒 **100% Private** | All data stored in `chrome.storage.local` — nothing leaves your machine |
| ❌ **No Cloud** | Zero analytics, zero telemetry, no accounts, no external APIs |
| 🔓 **Open Source** | Fully transparent — audit every line of code |

---

## 🚀 Installation

### Method 1: Load as Unpacked Extension (Developer Mode)

1. **Download the code**
   ```bash
   git clone https://github.com/Kratozzumar/daraz-price-tracker.git
   ```

2. **Open Chrome Extensions page**
   - Navigate to `chrome://extensions/`
   - Or go to **⋮ Menu → Extensions → Manage Extensions**

3. **Enable Developer Mode**
   - Toggle the **"Developer mode"** switch in the top-right corner

4. **Load the extension**
   - Click **"Load unpacked"** button (top-left)
   - Select the `daraz-price-tracker` folder you downloaded
   - The extension icon will appear in your toolbar

5. **Pin it (recommended)**
   - Click the puzzle piece icon (🧩) in Chrome's toolbar
   - Find "Daraz Price Tracker" and click the 📌 pin icon

### Method 2: Download ZIP

1. Click the green **"Code"** button above → **"Download ZIP"**
2. Extract the ZIP file
3. Follow steps 2–5 above, selecting the extracted folder

---

## 🎯 How to Use

### Automatic Price Tracking
1. Browse any product on [Daraz](https://www.daraz.lk)
2. The extension icon shows a **green ✓** when a price is captured
3. Open the extension popup to see your browsing history
4. Prices auto-update when you switch product variants or colors

### Favorites & Price Alerts
1. Click the **⭐ star** on any item to add it to Favorites
2. Switch to the **Favorites** tab to see all starred items
3. The extension automatically checks prices in the background every 6 hours
4. You'll get a **Chrome notification** when a price drops 📉

### Manual Refresh & Force Sync
- **Regular refresh** — Click the ↻ button to refresh items older than 2 hours
- **Force Sync** — **Shift+Click** the ↻ button to force-refresh ALL items immediately, ignoring cache
- A **live progress banner** appears during sync: `Syncing 3 of 15…` with an animated progress bar
- All refreshes happen **completely in the background** — no visible tabs ever open

### Flash Sale Prices
The extension correctly captures Flash Sale discounted prices. When Force Syncing:
1. Items with standard pricing are fetched instantly via HTTP (no tabs)
2. Items with Flash Sale / JS-rendered prices are loaded in a **single invisible minimized window** that navigates through each item one by one — you will never see any tabs popping up

### Price Targets
1. Open any favorited item's **detail view**
2. Enter your desired price in the **"Set target price"** field
3. When the price drops to or below your target → 🎯 **special notification**

### Price Comparison
1. Click the **compare icon** in the header to enter compare mode
2. Select 2–3 items from your favorites
3. View a side-by-side comparison table highlighting the best deal

### Search, Sort & Tags
- **Search**: Use the search bar to filter products by name
- **Sort**: Use the dropdown to sort by price, discount, name, or date
- **Tags**: Add custom tags in detail view, then filter favorites by tag

### Export & Import
1. Go to **Settings** → **Export & Import**
2. **Export JSON** — full backup of all data
3. **Export CSV** — spreadsheet-friendly favorites list
4. **Import** — restore from a JSON backup file

### Theme
- Toggle between **Dark** and **Light** mode in Settings

---

## 🏗️ Architecture

```
daraz-price-tracker/
├── manifest.json      # Extension config (Manifest V3, v5.0.0)
├── content.js         # Runs on Daraz pages — scrapes prices, promos, stock status
├── background.js      # Service worker — alarms, notifications, smart refresh engine
├── dashboard.html     # Full-page dashboard (opens in a tab from the toolbar icon)
├── dashboard.css      # Dashboard styling — dark/light themes, product grid
├── dashboard.js       # Dashboard logic — grid, detail chart, compare, settings, live updates
├── icon48.png         # Toolbar icon (48×48)
└── icon128.png        # Extension page icon (128×128)
```

### How It Works

```
You visit a Daraz product page
        ↓
content.js extracts price, stock status, promotions from DOM
  (MutationObserver detects variant/color switches automatically)
  (Skips processing in hidden/background tabs — avoids Ghost Window interference)
        ↓
Saves to chrome.storage.local
        ↓
── Auto Refresh (every 6 hours, silent) ──────────────────────────────
background.js alarm fires
  → Skips items updated within last 2 hours (smart cache)
  → Fetches raw HTML via HTTP for remaining items (parallel, no tabs)
  → Parses price using JSON-LD → __moduleData__ → JS data fallback chain
  → Detects price changes & stock status changes
  → Checks against target prices
  → Sends Chrome notifications for drops / back-in-stock / target hit

── Force Sync (manual) ────────────────────────────────────────────────
  → Ignores cache — refreshes everything
  → Favorites are always processed first (so they're updated even if Daraz cuts off the sync)
  → Phase 1: HTTP fetches run 3 at a time with random gaps (polite concurrency)
             Results are streamed to storage in rolling batches as they come in
  → Phase 2: Items with JS-rendered prices (Flash Sales) loaded one by one
             in a single invisible minimized popup window using chrome.tabs.update
             (navigates the same tab through each URL — never creates new tabs)
  → Smart polling: checks for price every 200ms, stops when found (max 6s)
  → Rate-limit detection: if Daraz returns 429/403 or a captcha page, sync stops
                           immediately and is paused for 1 hour (sync_blocked_until)
  → Timing stats saved to storage (last_sync_stats) for diagnostics in Settings
  → Live progress bar in dashboard: "Syncing 8 of 15…" with animated bar
  → Ghost window destroyed in finally-block — always cleaned up even if scraping fails
  → Progress bar reaches 100% and refreshes the product grid automatically

── Dashboard UI ──────────────────────────────────────────────────────
Clicking the toolbar icon opens dashboard.html as a full browser tab
  (If the tab is already open, it is focused instead of duplicated)
  → Product grid with sparklines, deal badges, trend indicators
  → Detail modal with enhanced SVG price-history chart
  → Price comparison table (up to 3 items side-by-side)
  → Settings: theme, export/import, sync stats, tag filter
  → Live sync progress bar (listens for sync_progress messages from background)
  → Live updates via storage.onChanged — no polling needed
```

---

## 🔒 Privacy

This extension is built with **privacy-first** principles:

- ✅ **No cloud storage** — all data lives in `chrome.storage.local`
- ✅ **No analytics** — zero tracking, no telemetry
- ✅ **No external APIs** — only connects to Daraz domains for price checks
- ✅ **No account required** — works immediately after install
- ✅ **Open source** — audit the code yourself
- ✅ **No visible tabs** — all background refreshes happen completely silently

---

## 🌐 Supported Regions

| Region | Domain | Currency |
|---|---|---|
| 🇱🇰 Sri Lanka | `daraz.lk` | LKR (Rs.) |
| 🇵🇰 Pakistan | `daraz.pk` | PKR (Rs.) |
| 🇧🇩 Bangladesh | `daraz.com.bd` | BDT (৳) |
| 🇳🇵 Nepal | `daraz.com.np` | NPR (Rs.) |

---

## 🛠️ Tech Stack

- **Manifest V3** — Latest Chrome extension platform
- **Vanilla JS** — No frameworks, no build step, no dependencies
- **SVG Charts** — Custom-built interactive price history visualization
- **Chrome APIs** — `storage.local`, `alarms`, `notifications`, `tabs`, `scripting`, `windows`, `downloads`
- **CSS3** — Dark/light themes with glassmorphism, CSS variables, and micro-animations

---

## 📋 Permissions Explained

| Permission | Why it's needed |
|---|---|
| `storage` | Save tracked prices, favorites, tags, and settings locally |
| `tabs` | Detect when you're on a Daraz page and show badge |
| `alarms` | Schedule periodic background price checks |
| `notifications` | Alert you when a price drops or hits your target |
| `scripting` | Inject the price scraper on Daraz pages; extract prices from the invisible sync window |
| `downloads` | Export data as JSON/CSV files |
| `windows` | Create the single invisible minimized window used for Force Sync DOM scraping |
| `host_permissions` (daraz.*) | Access Daraz pages to read prices |

---

## 🔄 Changelog

### v5.1.0 — Smarter Sync Engine
- 🌊 **Streaming saves** — prices written to storage in rolling batches as they arrive (not all at the end), so progress is visible immediately and no data is lost if sync is interrupted
- 📊 **Sync diagnostics** — timing stats (HTTP phase ms, hidden-tab phase ms, items failed) saved as `last_sync_stats` and shown in Settings
- 🛡️ **Resilient hidden-tab fallback** — DOM scraping phase wrapped in try/catch/finally; a scraping crash can no longer discard prices already fetched in Phase 1
- ⚡ **Instant rate-limit bail-out** — `blocked` flag gates both phases; stops mid-gap without waiting for random delay to expire

### v5.0.0 — Full-Page Dashboard
- 🖥️ **Full-page dashboard** replaces the small popup — toolbar icon opens `dashboard.html` as a proper browser tab
- 🔁 **Smart tab reuse** — if dashboard is already open, clicking the icon focuses it instead of opening a duplicate
- 🃏 **Product grid UI** — card-based layout with inline sparklines, deal badges, trend arrows and discount pills
- ⚡ **Live storage updates** — dashboard listens to `chrome.storage.onChanged`, no polling required
- 🚫 **Rate-limit backoff** — detects 429 / 403 / captcha; pauses all syncs for 1 hour automatically
- 🤝 **Polite concurrency** — HTTP fetches capped at 3 simultaneous with random gaps between requests
- 🏆 **Favorites-first ordering** — favorites are always synced before history items

### v4.0.0 — Smart Refresh Engine
- ⚡ **Force Sync** (Shift+Click refresh) — bypasses cache and re-fetches all items immediately
- 🖥️ **Single-Tab Ghost Window** — Flash Sale prices correctly captured without opening visible tabs
- ⏱️ **Smart Polling** — 200ms polling replaces fixed waits; stops the moment price is found
- 📊 **Live Progress Banner** — animated indigo bar + item counter visible during Force Sync
- 🧠 **Smart Cache** — 2-hour cooldown prevents redundant auto-refresh calls
- 🛡️ **Background Tab Guard** — content.js skips expensive operations in invisible scraper tabs

### v3.0.0 — Major Feature Upgrade
- 14 new features: price targets, trend prediction, deal badges, tags, export/import, dark/light mode, search, sort, stock alerts, comparison view, sale detection, cheaper alternatives, wishlist sharing, % change badge

### v2.0.0 — Foundation
- Core tracking, favorites, background refresh, price history charts, multi-region support

---

## 🤝 Contributing

Contributions are welcome! Feel free to:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## ⚠️ Disclaimer

This extension is an independent project and is **not affiliated with, endorsed by, or connected to Daraz** or any of its parent companies. It simply reads publicly visible price information from product pages.

---

<p align="center">
  <b>Made with ❤️ for smart shoppers</b><br>
  <sub>Track prices. Save money. Stay private.</sub>
</p>
