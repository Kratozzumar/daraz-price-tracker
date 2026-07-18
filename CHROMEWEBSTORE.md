# Chrome Web Store Listing — Daraz Price Tracker

> Last Updated: 2026-07-07

## Store Listing

**Extension Name**
Daraz Price Tracker

**Short Description**
Track price drops and see historical price charts for items on Daraz.

**Detailed Description**
Daraz Price Tracker is a sleek, helper extension that helps you save money on your favorite e-commerce platforms under the Daraz brand (available in Pakistan, Bangladesh, Nepal, and Sri Lanka). 

Key Features:
- Track any product with one click on the Daraz product page.
- View price histories inside a premium popup dashboard complete with smooth SVG sparkline graphs.
- Set custom target price alert thresholds.
- Receive instant Chrome push notifications when a tracked product's price drops to or below your target price.
- Dynamic price drop logs show you the best deals captured over time.
- Offline-first design: All tracked product data is stored locally in your browser storage. No external accounts or APIs are required.

How to use it:
1. Pin the Daraz Price Tracker extension.
2. Visit any Daraz product page (e.g. daraz.pk, daraz.com.bd).
3. Click on the extension icon to reveal the tracking console.
4. Click "Track Price History".
5. Set your custom target price drop alert!
6. Click the extension icon anytime to view all your tracked items and visual price charts.

Privacy/permissions note:
We respect your privacy. All price data, tracking history, and notification logs are kept locally in your Chrome storage. No tracking data is sent to external servers or third parties.

Support/feedback info:
For support, feedback, or bugs, please contact our support team.

**Category**
Shopping

**Single Purpose**
Tracks prices and notifies users of price drops for items on Daraz domains.

**Primary Language**
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ⬜ Not created | |
| Screenshot 1 | 1280×800 | ⬜ Not created | |
| Screenshot 2 | 1280×800 | ⬜ Not created | |
| Small Promo Tile | 440×280 | ⬜ Not created | |

### Screenshot Notes
- **Screenshot 1**: Shows the active tracking card inside the popup on a Daraz product page, illustrating the "Track Price History" and "Target Price Drop Alert" slider.
- **Screenshot 2**: Shows the tracked items list with visual sparklines indicating price history trends over time.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Required to store tracked items, target prices, and historical price records locally in the browser. |
| `alarms` | permissions | Required to schedule a periodic background task (every 6 hours) to check for price updates in the background. |
| `notifications` | permissions | Required to send desktop alerts when a tracked product's price drops to or below the user-defined threshold. |
| `activeTab` | permissions | Required to verify if the user's active page is a Daraz product page and initiate on-page data extraction. |
| `https://*.daraz.pk/*` | host_permissions | Allows background fetches from the service worker to PKR Daraz domain to refresh item prices in the background. |
| `https://*.daraz.com.bd/*` | host_permissions | Allows background fetches from the service worker to BDT Daraz domain to refresh item prices in the background. |
| `https://*.daraz.com.np/*` | host_permissions | Allows background fetches from the service worker to NPR Daraz domain to refresh item prices in the background. |
| `https://*.daraz.lk/*` | host_permissions | Allows background fetches from the service worker to LKR Daraz domain to refresh item prices in the background. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL**
Not applicable (all data is stored strictly on the user's device).

## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free

## Developer Info

**Publisher Name**
Umar

**Contact Email**
umar.dev@example.com

**Homepage URL**
https://github.com/umar/daraz-price-tracker

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-07-07 | Initial release. Added DOM/PageData scraping, alarm-based background pricing checks, push alerts, and sparkline popup. | Draft |

## Review Notes

### Known Issues / Limitations
- Price updates are done client-side and rely on the browser being active or triggering alarms.
- The extension does not run background checks if the device is shut down; checks resume when Chrome is launched.
