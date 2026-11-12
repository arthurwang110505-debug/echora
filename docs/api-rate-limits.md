# API 額度與濫用防護

這份文件說明 `/api/*` 的四個端點各自被什麼保護，以及**還缺哪一層需要你在 Vercel 後台手動開啟**。

## 為什麼程式碼裡的上限不夠

`api/_lib/limits.ts` 裡的限流與每日上限都住在**單一 serverless 實例的記憶體**裡。Vercel 會依流量開很多實例，冷啟動時計數器歸零。所以：

- 限流擋得住「一個瀏覽器在一個實例上狂點」，擋不住有心人。
- 每日上限的真實值不是 `300`，而是 `活著的實例數 × 300`。

這是刻意接受的取捨：共用計數器要 Redis / Vercel KV，那是一個新依賴加一筆費用，而這裡要防的問題本質是「免費額度很小」。真正的防線是下面那層。

## 你需要在 Vercel 後台做的（一次，約 5 分鐘）

**Project → Firewall → Rate Limit**，新增一條規則：

| 欄位 | 值 |
|---|---|
| Path | `/api/*` |
| Requests | 60 |
| Window | 1 minute |
| Action | Rate limit（回 429） |

這條規則在 CDN 邊緣執行，**跨所有實例共用計數**，是程式碼做不到的事。它才是真正的防線。

同一個頁面也可以開 **Bot Management**（Vercel 免費方案有基本防護）。

## 環境變數

| 變數 | 用途 | 沒設會怎樣 |
|---|---|---|
| `ECHORA_ALLOWED_ORIGINS` | 額外允許的來源，逗號分隔（`https://echora.app,https://staging.echora.app`） | 只用 `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL` 推導出的自家網域 |
| `VERCEL_PROJECT_PRODUCTION_URL` | Vercel 自動注入的正式網域 | Vercel 會自動設，通常不用管 |
| `VERCEL_URL` | Vercel 自動注入的本次部署網域（含 preview） | 同上 |
| `ECHORA_ALLOW_LOCALHOST` | 設 `1` 時額外允許 localhost（正式環境用） | 只有 `NODE_ENV=development` / `test` 時才允許 |

`NODE_ENV=development` 時 localhost 一律允許，否則 `vite dev` 會把真實 handler 掛起來（見 `packages/web/vite-plugins/devApiFunctions.ts`）卻每個 AI 請求都 403。

## 各端點的上限

| 端點 | 每分鐘 / 每 client | 每日上游上限 | 來源檢查 |
|---|---|---|---|
| `/api/ai/theme` | 10 | 300 次生成 | 必須有 Origin，且是自己的網域 |
| `/api/ai/segment` | 8 | 500 次生成 | 同上 |
| `/api/youtube/search` | 20 | 60 次 `search.list` | 允許無 Origin（公開資料），但別站的頁面會被拒 |
| `/api/lyrics/amll` | 60 | —（無付費上游） | 同上 |

每日上限只計算**快取未命中**，所以同一首歌重複要求不會消耗額度——這是刻意的，快取存在的目的就是讓重複的請求免費。

## 已修掉的一個嚴重問題

在這次修正之前，`isAllowedOrigin` 的預設規則是 `/(^|\.)vercel\.app$/`，也就是**任何**部署在 Vercel 上的網站都能從瀏覽器呼叫這些付費端點。而且沒有 `Origin` 標頭時一律放行。

現在改成：只允許 `ECHORA_ALLOWED_ORIGINS` 與 Vercel 注入的自家網域，加上「同源」判定；沒有 Origin 的請求只有公開資料端點放行。回歸測試在 `packages/web/src/api/origin.test.ts`。

## `vercel.json` 的設定說明

Vercel 的 schema **不接受註解欄位**，所以理由寫在這裡。

**rewrites** — SPA fallback 排除了 `api/`、`assets/` 與任何帶副檔名的路徑：

```
/((?!api/|assets/|.*\..*).*)
```

沒有這個負向先行斷言時，打錯的 `/api/xxx` 會回傳 HTTP 200 加一份 HTML，對所有用戶端與
Search Console 都是「軟 404」。缺一個 `.js` 也會拿到 index.html，只是內容型別是 JavaScript。

**headers** — 三組：

| 路徑 | 用意 |
|---|---|
| `/assets/*` | 檔名帶內容雜湊，可以永久快取 |
| `index.html`、`sw.js`、`registerSW.js`、`manifest.webmanifest` | 絕不瀏覽器快取，否則部署在使用者清快取前都看不到；`sw.js` 更是發現新版的入口 |
| 全部 | `nosniff`、`Referrer-Policy`、`Permissions-Policy` |

**刻意沒有加的兩個**：

- **CSP** — 這個 app 需要 `fonts.googleapis.com`、YouTube iframe 與 blob worker。沒實測就寫的政策
  會直接弄壞播放，所以等有瀏覽器可測時再加。
- **`X-Frame-Options`** — `/obs` 疊層本來就是要被嵌入到 OBS 的，加上去會讓它失效。
