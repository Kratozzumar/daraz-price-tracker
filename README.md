# Daraz Price Tracker 🏷️📉

> **Track Daraz product prices privately — 100% offline, zero cloud, all data stays on your machine.**

A lightweight Chrome extension that automatically tracks prices when you browse [Daraz](https://www.daraz.lk) (Sri Lanka, Pakistan, Bangladesh, Nepal). Get notified when prices drop, view price history charts, and manage your favorite items — all without sending a single byte to any server.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen)
![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local-10b981)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Mac%20%7C%20Linux-blue)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔍 **Auto-tracking** | Prices captured automatically when you visit any Daraz product page |
| ⭐ **Favorites** | Star items to track them long-term with full price history |
| 📊 **Price Charts** | Interactive SVG charts showing price trends over time |
| 🔔 **Price Drop Alerts** | Chrome notifications when a favorited item's price drops |
| 🔄 **Background Refresh** | Automatically checks prices on favorites even when you're not on Daraz |
| ⚙️ **Configurable** | Set refresh interval (1h–24h), history limit (10–100 items), toggle notifications |
| 🔒 **100% Private** | All data stored in `chrome.storage.local` — nothing leaves your machine |
| 🌍 **Multi-region** | Supports Daraz Sri Lanka (.lk), Pakistan (.pk), Bangladesh (.com.bd), Nepal (.com.np) |
| 💻 **Cross-platform** | Works on Windows, macOS, and Linux |

---

## 📸 Screenshots

### Dashboard — History & Favorites
The main popup shows two tabs: **History** (recently visited items) and **Favorites** (starred items with price tracking).

### Price Detail View
Click any favorited item to see a detailed price chart with lowest/highest stats and an interactive timeline.

### Settings
Configure refresh intervals, history limits, notification preferences, and clear data — all from the settings panel.

---

## 🚀 Installation

### Method 1: Load as Unpacked Extension (Developer Mode)

1. **Download the code**
   ```bash
   git clone https://github.com/YOUR_USERNAME/daraz-price-tracker.git
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

### Favorites & Price Alerts
1. Click the **⭐ star** on any item to add it to Favorites
2. Switch to the **Favorites** tab to see all starred items
3. The extension automatically checks prices in the background
4. You'll get a **Chrome notification** when a price drops 📉

### Price History Charts
1. Go to **Favorites** tab
2. Click any item to open the **detail view**
3. See the interactive price chart, lowest/highest stats
4. Hover over data points for exact prices and dates

### Settings
Click the **⚙️ gear icon** in the top-right to configure:
- **Refresh Interval** — How often to check prices (1h, 3h, 6h, 12h, 24h)
- **History Limit** — Max items in browsing history (10, 20, 50, 100)
- **Price Drop Alerts** — Toggle Chrome notifications on/off
- **Manual Refresh** — Force an immediate price check
- **Clear Data** — Reset all tracked data

---

## 🏗️ Architecture

```
daraz-price-tracker/
├── manifest.json      # Extension config (Manifest V3)
├── content.js         # Runs on Daraz pages — scrapes prices from DOM
├── background.js      # Service worker — alarms, notifications, background refresh
├── popup.html         # Extension popup UI structure
├── popup.css          # Styling — dark theme, glassmorphism, animations
├── popup.js           # Popup logic — views, charts, settings, state management
└── icon48.png         # Extension icon
```

### How It Works

```
You visit a Daraz product page
        ↓
content.js extracts price from DOM
  (4 strategies: JSON-LD → pageData JS → meta tags → sale attributes)
        ↓
Saves to chrome.storage.local
        ↓
background.js runs periodic alarms
  → Fetches HTML for each favorite
  → Parses price from raw HTML
  → Detects price changes
  → Sends Chrome notification on price drops
        ↓
popup.js renders the UI
  → History list, Favorites list
  → Price detail view with SVG chart
  → Settings panel
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
- **SVG Charts** — Custom-built price history visualization
- **Chrome APIs** — `storage.local`, `alarms`, `notifications`, `tabs`, `scripting`
- **CSS3** — Dark theme with glassmorphism, CSS variables, and micro-animations

---

## 📋 Permissions Explained

| Permission | Why it's needed |
|---|---|
| `storage` | Save tracked prices, favorites, and settings locally |
| `tabs` | Detect when you're on a Daraz page and show badge |
| `alarms` | Schedule periodic background price checks |
| `notifications` | Alert you when a price drops |
| `scripting` | Inject the price scraper on Daraz pages |
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
