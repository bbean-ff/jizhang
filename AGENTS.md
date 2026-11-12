# 賬本Ledger — AI 維護交接文件

> 給任何接手維護此專案的 AI 或開發者。開始改動前請先讀完本文件。
> 用戶面向的介紹在 [README.md](README.md)；本文件講的是**怎樣安全地改它**。

## 0. 與擁有者溝通

- 用**繁體中文書面語**回覆，不要用廣東話口語。
- 擁有者不是工程師：解釋改動時講「用戶會看到甚麼變化」，少講程式細節。
- 有疑問時先提出建議再請擁有者決定；不要擅自改變已確立的記賬規則（見第 5 節）。

## 1. 專案概覽

- 個人記賬 PWA，主要在 iPhone／iPad 上「加入主畫面」使用，可離線。
- **純靜態檔案**：HTML + CSS + 原生 JavaScript。沒有框架、沒有 npm、沒有編譯步驟、沒有依賴套件。
- 沒有伺服器、沒有帳號：所有資料存在裝置瀏覽器的 `localStorage`（鍵名 `jizhang.v1`）。
- 線上版本：<https://bbean-ff.github.io/jizhang/>
- 原始碼：<https://github.com/bbean-ff/jizhang>（分支 `main`，GitHub Pages 由 `main` 的根目錄部署）
- 授權：MIT

## 2. 檔案結構

| 檔案 | 內容 |
|---|---|
| `index.html` | 五個頁面（首頁、記賬、紀錄、統計、設定）的骨架、底部面板、提示框 |
| `styles.css` | 全部樣式。顏色以 CSS 變數定義在 `:root`，深色模式在 `@media (prefers-color-scheme: dark)` 及 `[data-theme="dark"]` |
| `core.js` | **純邏輯，不碰畫面**：帳戶、金額格式、交易效果、重新計算餘額、統計、文字輸入解析。匯出為 `window.Core` |
| `app.js` | **全部介面**：載入／儲存、各頁渲染、表單、撤銷、匯入匯出。整個檔案包在一個 IIFE 內 |
| `i18n.js` | 繁→简（逐字對照）及繁→English（詞組對照）。匯出為 `window.I18N` |
| `sw.js` | Service Worker：網絡優先、離線時用快取。**每次改動都要把 `VERSION` 加一** |
| `manifest.webmanifest`、`icons/` | 主畫面名稱及圖示 |

載入次序（`index.html` 底部）：`core.js` → `i18n.js` → `app.js`。

## 3. 資料模型

### 3.1 金額

**一律以「仙」為單位的整數保存**（$1 = 100），避免小數誤差。顯示時用 `Core.fmt()`，解析用 `Core.toCents()`。不要在任何地方用浮點數保存金額。

### 3.2 State（存在 `localStorage['jizhang.v1']` 的 JSON）

```js
{
  version: 1,
  initial: { cash: 0, alipay: 0, change: 0, jar: 0, 'acc-xxx': 0 }, // 各帳戶初始餘額（仙）
  accounts: [{ id: 'acc-xxx', name: '八達通', kind: 'asset' | 'credit', color: '#0f9aa8' }], // 自訂付款方式
  txs: [ /* 交易，見下 */ ],
  seq: 0,              // 交易編號計數器
  settings: {
    quickAmounts: [10000, 5000, ...], // 快捷金額（仙）
    inputMode: 'add' | 'set',         // 快捷金額累加或直接設定
    theme: 'auto' | 'light' | 'dark',
    resetAfter: true,                 // 記賬後重設為現金支出
    shortcuts: [{ id, name, type: 'expense'|'income', account, amount }],
    shortcutDirect: false,            // 有金額的捷徑一按即記
    currency: 'HKD',                  // 只改顯示符號，不換算
    autoBack: true,                   // 港幣／澳門幣現金找續
    offAcc: ['alipay'],               // 已停用的可選帳戶
    lang: 'zh-Hant' | 'zh-Hans' | 'en',
  },
  meta: { createdAt, lastExport },
}
```

預設值在 `core.js` 的 `defaultState()`；舊資料由 `app.js` 的 `migrate()` 補齊。

### 3.3 交易（`txs` 的每一項）

| 欄位 | 說明 |
|---|---|
| `id` | 唯一字串 |
| `no` | 遞增編號，同一時間的交易以此排序 |
| `time` | 毫秒時間戳，決定排序 |
| `type` | `expense` 支出、`income` 收入、`transfer` 轉帳、`adjust` 餘額調整 |
| `item`、`note` | 項目名稱、備註 |
| `account` | 支出／收入／調整的帳戶 |
| `amount` | 支出：主帳戶支付部分；收入、轉帳：金額 |
| `change` | 支出：以零錢支付的部分 |
| `back` | 支出：現金找續存入零錢的金額（只在建立時計算並保存） |
| `from`、`to` | 轉帳的轉出、轉入帳戶 |
| `target` | 調整：設定成的**絕對餘額** |
| `createdAt`、`updatedAt` | 建立、修改時間 |

### 3.4 最重要的設計原則：餘額不儲存

帳戶餘額**從不直接保存**。`Core.compute(state)` 每次都由「初始餘額 + 按 `(time, no)` 排序的全部交易」重新計算。因此：

- 修改、刪除、插入舊交易後，所有之後的餘額和統計自動正確。
- 調整交易保存的是目標餘額 `target`，差額在重新計算時才得出。
- 支出的帳戶效果：主帳戶 −(`amount` + `back`)，零錢 −`change` +`back`。**計入支出的是 `amount + change`**，找續不是支出。
- 核對公式：總資產 = 初始總資產 + 累計收入 − 累計支出 ± 調整淨額（統計頁及設定頁會顯示是否一致）。

## 4. 帳戶

- 內建帳戶 id：`cash` 現金、`alipay` Alipay（**可選**，可在設定啟用／停用）、`change` 零錢、`jar` 零錢筒。
- 自訂帳戶 id 為 `acc-` 開頭；`kind: 'credit'` 為信用卡，餘額可為負數（欠款）。
- `Core.setAccounts(custom, offAcc)` 會**就地更新** `ACCOUNTS`、`ACC_IDS`、`NAME`、`ACC`；載入、匯入或改帳戶後要呼叫 `app.js` 的 `applyEnv()`。
- 已停用的帳戶只是不再出現在選項中，舊紀錄保留；仍有餘額時不可停用。
- 有交易紀錄的自訂帳戶不可刪除。

## 5. 已確立的記賬規則（未經擁有者同意不要改）

1. **普通支出一律用現金**；只有明確指定（`早餐30+5` 或按「＋」）才用零錢。
2. **零錢及零錢筒絕不可透支**（硬性阻止）；其他帳戶不足時要求確認；信用卡可為負數。
3. 「將零錢全部轉入零錢筒」**完全手動**，不自動轉。
4. **港幣找續**：現金支出以整十元支付，例如 $82 當作付 $90，找續 $8 存入零錢。
   - 只在貨幣為 `HKD` 或 `MOP` 時生效，其他貨幣不找續（設定開關保留，轉回後自動恢復）。
   - 只在**建立新交易**時計算並存入 `back`，已記錄的舊交易不受影響。
   - 要用零錢付款須輸入 `80+2`。
5. **Alipay**：新用戶預設停用；更新前已在使用的舊用戶保持啟用（見 `migrate()` 對 `offAcc` 的處理）。
6. 初始餘額預設全部為 0。
7. 貨幣設定只改顯示符號，**不換算金額**。

## 6. 文字快速輸入（`core.js` 的 `parse()`）

依次嘗試以下規則，先配對到的為準：

| 例子 | 意思 |
|---|---|
| `現金設成100`、`A設成1.48` | 調整餘額為指定值（信用卡輸入的是欠款，存為負數） |
| `現金+350`、`A+100`、`+50` | 收入（省略帳戶即現金） |
| `現金轉零錢10`、`現金->八達通 50` | 轉帳 |
| `早餐25` | 現金支出 |
| `糖A10` | Alipay 支出（Alipay 停用時，`A` 當作項目名稱的一部分） |
| `早餐30+5` | 現金 $30 ＋ 零錢 $5 |
| `早餐八達通25` | 項目後接付款方式名稱，即用該方式支付 |

會拒絕的輸入：沒有項目名稱（`25`）、負數、超過兩位小數。支援全形數字、貨幣符號、`元／蚊／塊`、千位分隔符。

改解析器時，請用第 8 節的方法逐條測試上表所有例子。

## 7. 多語言（`i18n.js`）

- **原文是繁體中文**，直接寫在 `index.html`、`app.js`、`core.js` 中。
- 非繁體時，`MutationObserver` 會自動翻譯畫面上所有文字節點及 `placeholder`／`aria-label`／`title`；`alert`／`confirm` 亦會被包裝翻譯。
- 用戶輸入的內容（項目名、自訂帳戶名、捷徑名）元素要加 `data-notr` 屬性，避免被翻譯。
- **新增介面文字時**：
  - English：在 `EN` 對照表加入完整句子（或可重用的詞組）。查不到的部分會保留中文。
  - 简体：逐字轉換。若新文字含有 `T` 字串中沒有的繁體字，要同時在 `T`（繁）及 `S`（简）**相同位置**加入該字；整詞不同的（例如 帳戶→账户）加入 `HANS_PHRASE`。

## 8. 本機測試

沒有自動化測試，也不需要安裝任何東西（只需要 Python 或任何靜態伺服器）：

```bash
python -m http.server 8765
```

打開 <http://localhost:8765>，在瀏覽器主控台測試：

```js
Core.parse('早餐82')          // 測試文字解析
__jz.state                    // 目前資料
__jz.comp.balances            // 目前各帳戶餘額
localStorage.clear(); location.reload()  // 清空測試資料（只限本機測試網址！）
```

**每次改動後最少要測試**：記一筆支出、收入、轉帳、餘額調整；撤銷；編輯及刪除舊交易後餘額是否正確；統計頁「資產核對」是否一致；切換到 English 看新文字有沒有翻譯。

注意：localhost 與線上版本的資料是分開的，在本機清空資料不會影響擁有者的真實紀錄。

## 9. 部署

1. 修改檔案。
2. 把 `sw.js` 的 `VERSION` 加一（例如 `jizhang-v11` → `jizhang-v12`）。**忘記這一步，已安裝的 App 可能一直顯示舊版。** 若新增了檔案，也要加入 `ASSETS` 清單。
3. 提交到 `main`，訊息用繁體中文，第一行概括改動。
4. `git push origin main`。GitHub Pages 約一分鐘內自動更新。
5. 驗證：打開 <https://bbean-ff.github.io/jizhang/sw.js>，確認 `VERSION` 已是新值。
6. 告訴擁有者：手機上要把 App 完全關閉再開一至兩次才會載入新版本。

注意事項：

- 推送需要擁有者的 GitHub 登入。若在背景執行 `git push` 時卡在登入視窗，請改在擁有者看得到的終端機執行，或請擁有者自行執行。
- 電腦上可能沒有設定 Git 身分；提交前用 `git config user.name` 檢查，沒有的話先請擁有者設定。

## 10. 擁有者的記賬資料不在這個儲存庫

程式碼在 GitHub，但**記賬紀錄只在擁有者手機的瀏覽器裡**。改動前後都要保證：

- **向後相容**：舊版存下的資料必須能被新版讀取。新增設定欄位時在 `defaultState()` 給預設值；若舊用戶的預設應與新用戶不同，在 `migrate()` 處理（參考 `offAcc`）。
- 永遠不要改 `localStorage` 鍵名 `jizhang.v1`，不要改變已有欄位的意思。
- 匯入、匯出格式（設定頁的 JSON 備份）必須保持可用：舊備份檔要能匯入新版。
- 提醒擁有者定期用「設定 → 匯出 JSON 備份」，並把檔案存到 iCloud 或其他地方。

## 11. 從備份還原專案

**方法一：從 GitHub（最簡單）**

```bash
git clone https://github.com/bbean-ff/jizhang.git
```

**方法二：從備份壓縮檔**（GitHub 無法使用時）

壓縮檔內有完整原始碼及 `jizhang.bundle`（含全部 Git 歷史）：

```bash
git clone jizhang.bundle jizhang
cd jizhang
git remote set-url origin https://github.com/bbean-ff/jizhang.git
```

若 GitHub 帳號已無法使用：建立新的儲存庫並推送，再在該儲存庫的「Settings → Pages」由 `main` 分支根目錄部署；或把全部檔案上傳到任何支援 HTTPS 的靜態網站空間（Netlify、Cloudflare Pages 等）。**網址改變後，舊網址主畫面 App 內的資料不會自動帶過去**，擁有者需要先在舊 App 匯出 JSON，再在新網址匯入。

## 12. 程式風格

- 註解及介面文字用繁體中文（香港用字，例如「帳戶」「找續」「八達通」）。
- `core.js` 保持純函數、不碰 DOM；畫面相關的放 `app.js`。
- HTML 字串拼接時，所有用戶內容必須經 `esc()` 轉義。
- 保持零依賴：不要引入框架、npm 套件或編譯步驟，除非擁有者同意。
- 改動盡量小而集中，一次提交做一件事。
