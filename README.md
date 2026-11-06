<p align="center"><img src="icons/icon-192.png" width="96" alt="賬本Ledger icon"></p>

<h1 align="center">賬本Ledger</h1>

<p align="center">
A simple, fast, private expense tracker for iPhone & iPad — works offline, no account, no server.<br>
簡單、快速、注重私隱的記賬 App，適用於 iPhone 及 iPad — 可離線使用，無需註冊，沒有伺服器。
</p>

<p align="center"><b>👉 <a href="https://bbean-ff.github.io/jizhang/">Open the app / 打開 App</a></b></p>

<p align="center"><a href="#english">English</a> · <a href="#中文">中文</a></p>

---

<a id="english"></a>

## English

### What is it?

賬本Ledger is a personal bookkeeping web app (PWA). Open it in Safari, add it to your Home Screen, and it runs like a native app — even without internet. All your data stays **on your own device**; nothing is uploaded anywhere.

### Features

- **Quick entry** — tap quick-amount buttons (HK$100, 50, 20, 10, 5, 2, 1, 0.50 — customisable), add up or set directly, then tap *Record*.
- **Type it in one line** — `早餐25` (breakfast $25, cash), `糖A10` (paid by Alipay), `早餐30+5` (cash $30 + loose change $5), `現金+350` (cash income), `A設成1.48` (set Alipay balance to 1.48).
- **Shortcuts** — one-tap presets for things you buy often (breakfast, lunch, water, transport…) and regular income (salary, pocket money). Add your own, with or without a preset amount.
- **Accounts & payment methods** — built-in Cash, Alipay, Change and Coin jar, plus your own: Octopus, bank card, WeChat Pay, PayMe… **Credit cards** track debt (negative balance) and are repaid with a transfer.
- **Income, expense, transfer, balance adjustment** — every change is recorded with before/after balances.
- **Records** — filter by date, account and type; edit, delete or undo any transaction. All balances and totals are recalculated automatically.
- **Statistics** — daily/monthly spending, monthly income vs expense charts, spending by item, account changes, and a reconciliation check (`total = opening + income − expense ± adjustments`).
- **Backup** — export JSON (full restore) or CSV (Excel / Numbers), and import to restore.
- **Languages** — 繁體中文, 简体中文, English (auto-detected on first launch).
- **Currencies** — HK$, MOP$, ¥, NT$, US$, JP¥, €, £, S$, RM, ₩ (display symbol only; no conversion).
- Dark & light mode, iPhone and iPad layouts, works offline.

### Install on iPhone / iPad

1. Open **<https://bbean-ff.github.io/jizhang/>** in **Safari**.
2. Tap the **Share** button ⬆︎ → **Add to Home Screen** → **Add**.
3. Always open it from the Home Screen icon.

> ⚠️ Your data is stored only on your device. Safari and the Home Screen app keep **separate** data, and deleting the Home Screen icon deletes its data. Use **Settings → Export JSON backup** regularly and save it to the Files app.

### Host your own copy

The app is plain static files (HTML, CSS, JavaScript) — no build step, no dependencies.

- **GitHub Pages**: fork this repository → *Settings → Pages* → deploy from branch `main`, folder `/ (root)`.
- **Any static host** (Netlify, Cloudflare Pages, your own server): upload all files. HTTPS is required for offline use and Add to Home Screen.
- **Locally**: `python -m http.server 8765`, then open <http://localhost:8765>.

After changing files, bump `VERSION` in `sw.js` so installed apps pick up the update.

### Files

| File | Purpose |
|---|---|
| `index.html` | Page layout |
| `styles.css` | Styles (dark/light, phone/tablet) |
| `core.js` | Calculations, statistics, text-entry parser |
| `app.js` | User interface |
| `i18n.js` | Simplified Chinese and English translations |
| `sw.js` | Service worker (offline support) |
| `manifest.webmanifest`, `icons/` | Home Screen name and icons |

### Privacy

No accounts, no analytics, no tracking, no server. Everything is saved in your browser's local storage on your own device.

### License

[MIT](LICENSE) — free to use, copy, modify and share.

---

<a id="中文"></a>

## 中文

### 簡介

賬本Ledger 是一個個人記賬網頁 App（PWA）。用 Safari 打開並加入主畫面後，就可以像一般 App 一樣使用，沒有網絡也可以。所有資料只保存在**你自己的裝置**上，不會上傳到任何地方。

### 功能

- **快速記賬**：點快捷金額（HK$100、50、20、10、5、2、1、0.50，可自訂），支援累加或直接設定，然後按「記賬」。
- **一行文字記賬**：`早餐25`（現金）、`糖A10`（Alipay 支付）、`早餐30+5`（現金 30 ＋ 零錢 5）、`現金+350`（現金收入）、`A+100`（Alipay 收入）、`A設成1.48`（直接設定 Alipay 餘額）。
- **常用捷徑**：早餐、午餐、晚餐、買水、交通、零用錢、薪金等，一按即填入；可自行新增、編輯、排序，並可設定預設金額。
- **帳戶及付款方式**：內建現金、Alipay（支付寶）、零錢、零錢筒，另可自行新增八達通、銀行卡、微信支付、PayMe 等；**信用卡**會記錄欠款，以轉帳還款。
- **零錢規則**：普通支出一律用現金，只有明確指定（例如 `早餐30+5` 或按「＋」）才使用零錢；零錢及零錢筒不可透支；「將零錢全部轉入零錢筒」完全手動。
- **收入、支出、轉帳、餘額調整**：每筆交易都保存交易前後餘額。
- **交易紀錄**：按日期、帳戶、類型篩選；可編輯、刪除、撤銷，所有餘額及統計會自動重新計算。
- **統計**：每日／每月支出、每月收入與支出圖表、支出分類、各帳戶資金變化、資產核對（總資產 = 初始總資產 ＋ 累計收入 − 累計支出 ± 調整）。
- **備份**：匯出 JSON（可完整恢復）或 CSV（Excel／Numbers），亦可匯入恢復。
- **語言**：繁體中文、简体中文、English（第一次打開時按裝置語言自動選擇）。
- **貨幣**：HK$、MOP$、¥、NT$、US$、JP¥、€、£、S$、RM、₩（只改變顯示符號，不換算金額）。
- 支援深色／淺色模式、iPhone 及 iPad 版面、離線使用。

### 安裝到 iPhone／iPad

1. 用 **Safari** 打開 **<https://bbean-ff.github.io/jizhang/>**。
2. 按「分享」⬆︎ →「加入主畫面」→「加入」。
3. 之後請固定由主畫面圖示打開。

> ⚠️ 資料只保存在你的裝置上。Safari 網頁與主畫面 App 的資料是**分開**的；刪除主畫面圖示會一併刪除資料。請定期到「設定 → 匯出 JSON 備份」，並儲存到「檔案」App。

### 自行架設

全部都是靜態檔案（HTML、CSS、JavaScript），不需要編譯，也沒有任何依賴套件。

- **GitHub Pages**：Fork 此儲存庫 →「Settings → Pages」→ 由 `main` 分支、`/ (root)` 部署。
- **其他靜態網站空間**（Netlify、Cloudflare Pages、自己的伺服器）：上傳所有檔案即可。離線使用及加入主畫面需要 HTTPS。
- **本機測試**：執行 `python -m http.server 8765`，再打開 <http://localhost:8765>。

修改檔案後，請把 `sw.js` 裡的 `VERSION` 加一，已安裝的 App 才會載入新版本。

### 私隱

沒有帳號、沒有分析追蹤、沒有伺服器。所有資料只保存在你裝置上瀏覽器的本機儲存空間。

### 授權

[MIT](LICENSE) — 可自由使用、複製、修改及分享。
