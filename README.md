# Daraz Price Tracker 🏷️📉

> **Track Daraz product prices privately — 100% offline, zero cloud, all data stays on your machine.**

A feature-rich Chrome extension that automatically tracks prices when you browse [Daraz](https://www.daraz.lk) (Sri Lanka, Pakistan, Bangladesh, Nepal). Set price targets, compare products, get drop alerts, view rich charts, export data — all without sending a single byte to any server.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen)
![Version](https://img.shields.io/badge/Version-3.0.0-orange)
![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local-10b981)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Mac%20%7C%20Linux-blue)

---

## ✨ Features

### 🔥 Core Tracking
| Feature | Description |
|---|---|
| 🔍 **Auto Price Capture** | Prices captured automatically when you visit any Daraz product page |
| ⭐ **Favorites** | Star items to track them long-term with full price history |
| 🔄 **Background Refresh** | Automatically checks prices on favorites even when you're not browsing Daraz |
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
3. The extension automatically checks prices in the background
4. You'll get a **Chrome notification** when a price drops 📉

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
├── manifest.json      # Extension config (Manifest V3)
├── content.js         # Runs on Daraz pages — scrapes prices, promos, stock status
├── background.js      # Service worker — alarms, notifications, background refresh
├── popup.html         # Extension popup UI structure
├── popup.css          # Styling — dark/light themes, glassmorphism, animations
├── popup.js           # Popup logic — views, charts, comparison, settings
├── icon48.png         # Toolbar icon (48×48)
└── icon128.png        # Extension page icon (128×128)
```

### How It Works

```
You visit a Daraz product page
        ↓
content.js extracts price, stock status, promotions from DOM
  (MutationObserver detects variant/color switches automatically)
        ↓
Saves to chrome.storage.local
        ↓
background.js runs periodic alarms
  → Fetches HTML for each favorite
  → Parses price with 4 fallback strategies
  → Detects price changes & stock status changes
  → Checks against target prices
  → Sends Chrome notifications
        ↓
popup.js renders the UI
  → History & Favorites lists with search/sort/filter
  → Price detail view with enhanced SVG charts
  → Price comparison table
  → Settings with theme, export/import, tags
```

---

## 🔒 Privacy

This extension is built with **privacy-first** principles:

- ✅ **No cloud storage** — all data lives in `chrome.storage.local`
- ✅ **No analytics** — zero tracking, no telemetry
- ✅ **No external APIs** — only connects to Daraz domains for price checks
- ✅ **No account required** — works immediately after install
- ✅ **Open source** — audit the code yourself

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
- **Chrome APIs** — `storage.local`, `alarms`, `notifications`, `tabs`, `scripting`, `downloads`
- **CSS3** — Dark/light themes with glassmorphism, CSS variables, and micro-animations

---

## 📋 Permissions Explained

| Permission | Why it's needed |
|---|---|
| `storage` | Save tracked prices, favorites, tags, and settings locally |
| `tabs` | Detect when you're on a Daraz page and show badge |
| `alarms` | Schedule periodic background price checks |
| `notifications` | Alert you when a price drops or hits your target |
| `scripting` | Inject the price scraper on Daraz pages |
| `downloads` | Export data as JSON/CSV files |
| `host_permissions` (daraz.*) | Access Daraz pages to read prices |

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
