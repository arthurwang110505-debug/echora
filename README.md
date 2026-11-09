# Echora PWA

## License and upstream attribution

Echora is an AGPL-3.0 covered derivative work that incorporates UI and
visualizer work from [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major).
See [UPSTREAM_NOTICE.md](./UPSTREAM_NOTICE.md) for the source-availability and
attribution requirements.

以 Web 為核心的沉浸式歌詞播放器，能安裝到手機、iPad 與電腦主畫面。

## 架構

- **Single Web app**: Vite + React + PWA
- **Core**: 共用歌詞解析、視覺模式、AI 主題與 provider 邏輯
- **Responsive**: 同一套介面適配手機、iPad 與桌面瀏覽器

## 網站結構：兩個入口、同一個網站

```text
/                  → Landing Page（新訪客、行銷、產品介紹）
/welcome           → 同 Landing Page 的別名
/app               → App shell／歌單選擇（產品本體）
/app?demo=1        → 展示體驗（Landing「開始體驗」的目標）
/player            → 沉浸式播放器
/library           → 我的音樂庫（歌單選擇）
/settings          → 設定
```

- PWA 的 `start_url` 是 **`/app`**：從主畫面開啟直接進入歌單選擇，不會先看到 Landing Page。
- Landing Page 的主要 CTA「開始體驗」連到 `/app?demo=1`；低調的「開啟播放器」入口連到 `/app`。
- `localStorage`（最近播放、播放快照、服務工作階段）只作為輔助，用來在 `/app` 恢復上次的歌單或播放狀態；即使被清除，`/app` 仍會顯示展示歌單選擇。

## 快速開始

```bash
pnpm install
pnpm dev
```

建構與預覽 production PWA：

```bash
pnpm build
pnpm --filter=@echora/web preview
```

## 部署到 Vercel

將此 repository 匯入 Vercel 即可。專案根目錄保持 repository root，`vercel.json` 已設定 workspace build 與 React Router rewrite。

在 Vercel Project Settings → Environment Variables 加入：

```text
VITE_SPOTIFY_CLIENT_ID
VITE_SPOTIFY_REDIRECT_URI=https://你的-vercel-domain.vercel.app/app
VITE_GOOGLE_CLIENT_ID（YouTube Music 登入用；origin 需加入 OAuth 用戶端的「已授權的 JavaScript 來源」）
VITE_SITE_URL=https://你的-vercel-domain.vercel.app（選填；canonical / OG / sitemap 用）
VITE_GOOGLE_SITE_VERIFICATION（選填；Google Search Console “HTML 標記”驗證用）
YOUTUBE_API_KEY（伺服器端可選，用於公開歌曲搜尋；不要使用 VITE_ 前綴）
AGNES_API_KEY（伺服器端必要；不要使用 VITE_ 前綴）
```

## Google OAuth 品牌驗證 / Search Console 網域驗證

OAuth 品牌驗證要求「首頁說明 App 功能 + 連到同網域的隱私權政策 + 網域已在 Search Console 完成驗證」。
首頁靜態摘要、`/privacy`、`/terms`、robots.txt / sitemap.xml 與驗證 meta 標籤的注入都已經在這個
repo 裡處理好；需要你自己操作的部分（Search Console 驗證、Branding 欄位、敏感範圍驗證與示範影片）
整理在 [`docs/google-oauth-brand-verification.md`](./docs/google-oauth-brand-verification.md)。

驗證用的指令：

```bash
# HTML 標記法（把 token 設成 Vercel 環境變數，重新部署即可）
node scripts/google-search-console-verify.mjs meta <驗證內容或整段 meta 標籤>

# HTML 檔案法（會寫入 packages/web/public/，commit + push 後自動部署）
node scripts/google-search-console-verify.mjs file google1a2b3c4d5e6f.html
```

`AGNES_API_KEY` 必須設定在 Vercel Project Settings → Environment Variables，並套用到需要的 deployment environment。它只會由 `/api/ai/theme` serverless proxy 讀取；瀏覽器 Settings 不再要求使用者貼上 Gemini／OpenAI 金鑰。Agnes 使用 OpenAI-compatible API，proxy 呼叫 `https://apihub.agnes-ai.com/v1/chat/completions`，並以 `Authorization: Bearer` 驗證。

同時將相同的 HTTPS 網址加入 Spotify Developer Dashboard 的 Redirect URI，然後重新部署。

開啟 `http://localhost:3000` 後，可以在支援的瀏覽器中選擇「加入主畫面」。不需要 Expo 或原生 app 開發環境。

## 音樂服務連線

自己的歌請連接 **YouTube Music**（官方 OAuth）。Spotify 需要一組 Client ID（設定頁或 `VITE_SPOTIFY_CLIENT_ID`）；兩者都沒有時，介面不會把 Spotify 當成現有功能。

YouTube Music 使用官方 Data API 讀取私人歌單，歌曲以嵌入播放器播放。官方沒有提供可讓第三方 PWA 讀取個人 YouTube Music 播放狀態的公開 API，因此 Echora 不會依賴 Piped／Invidious 這類不穩定的非官方鏡像。

### YouTube Music OAuth 設定清單

1. 在 [Google Cloud Console](https://console.cloud.google.com/) 建立專案，到「API 和服務 → 媒體庫」**啟用 YouTube Data API v3**（未啟用時可完成 Google 登入，但讀取頻道／歌單會回 403）。
2. 「API 和服務 → 憑證」建立 **OAuth 用戶端 ID（Web 應用程式）」，「已授權的 JavaScript 來源」加入部署網址 origin：本機 `http://localhost:3000`、正式環境 `https://你的網域.vercel.app`（登入使用 Google Identity Services 權杖模式的彈出視窗，不會把頁面導轉出去，所以只需要 JavaScript 來源，**不需要**「已授權的重新導向 URI」）。
3. 「OAuth 同意畫面」新增 `https://www.googleapis.com/auth/youtube` scope（讀寫，含把歌曲存進自己的歌單）；若發布狀態為「測試中」，請把要登入的 Google 帳號**加入測試使用者**（正式版則不用）。
4. 把用戶端 ID 填入 `packages/web/.env` 的 `VITE_GOOGLE_CLIENT_ID`，重新啟動／重新部署。

連線後若顯示「YouTube API 拒絕存取（403 …）」，錯誤訊息會標明原因：`accessNotConfigured` 表示專案未啟用 YouTube Data API v3；`quotaExceeded` 表示每日配額用盡；`forbidden` 通常代表該帳號（如 Workspace 帳號）無法使用 YouTube Data API。

Spotify 程式仍保留，但在 Client ID 設定完成前不會出現在 Landing、來源列或 README 賣點。

### 關於「靈動詞島」

第 14 個舞台模式（`island`）參考了 [Lyricify](https://github.com/WXRIW/Lyricify-App) 的**靈動詞島 / Dynamic Lyrics Island**（首創於 2022.09）。原創概念由 Lyricify 作者 WXRIW（XY Wang）提出，以 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 授權。

Echora 的實作是獨立重寫的（Lyricify 是 WPF，這裡是 React + DOM），並非程式碼移植：共用的只有「一小條常駐歌詞讀數」這個設計概念。同一個元件提供兩種用法——舞台模式，以及播放頁的常駐小元件（面板右上角星形按鈕開關，偏好存在 `echora.stage-prefs`）。

### Spotify：每位使用者帶自己的 Client ID

Spotify 自 2026 年 3 月起，開發模式的 app 只允許 **5 位已授權使用者**，而且 Extended Quota Mode 只接受組織申請（需 25 萬 MAU），個人拿不到。因此一個共用的 app 無法服務一群人。

解法與 [Lyricify](https://github.com/WXRIW/Lyricify-App) 相同：**每位使用者自己建一個 app**。限制是「每個 app 5 人」，不是「每個人 5 人」，所以一萬個人就是各自 1 人，全部合法。app 擁有者的 Spotify 帳號需要有 Premium。

Echora 的 Client ID 因此可以在執行期設定，不必重新部署：

1. 使用者開啟 **設定 → Spotify 連線**，頁面會顯示自己該填的 Redirect URI（預設 `<origin>/app`）。
2. 到 [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) 建立 app，把該 Redirect URI 加進去。**必須是 `127.0.0.1` 或 `https` 網址**，Spotify 已不接受 `localhost`。
3. 複製 Client ID 貼回設定頁即可，**不需要 Client Secret**（本專案使用 PKCE，secret 永遠不會離開使用者的 Dashboard）。

Client ID 存放於 `localStorage['echora.spotify.client-id']`。沒填時會退回建置期的 `VITE_SPOTIFY_CLIENT_ID`，所以單人自架仍可用環境變數一勞永逸：

1. 在 Spotify Developer Dashboard 建立一個 app。
2. 本機請將 `http://127.0.0.1:3000/app` 加入 Redirect URI（正式環境使用 HTTPS 網址）。
3. 複製 `packages/web/.env.example` 為 `packages/web/.env`，填入 `VITE_SPOTIFY_CLIENT_ID`。
4. 重新啟動 `pnpm dev`。

授權工作階段會記錄發給它的 Client ID：換一個 Client ID 等同換一個 app，必須重新授權，舊的 refresh token 不會被誤用。

**搜尋與歌單連結**：連接後，探索頁的搜尋框會直接查 Spotify 目錄（按 Enter 送出，避免每次按鍵都消耗 rate limit）。同一頁可貼上歌單連結（`open.spotify.com/playlist/…`、`spotify:playlist:…` 或純 ID），自己的或共同編輯的歌單會直接載入播放。

**已知限制（Spotify 2026 年改制）**：Web API 現在只提供「自己的」或「共同編輯」歌單的曲目內容，別人的公開歌單只回傳中繼資料。Echora 開啟這類歌單時會顯示原因，而不是留一個空佇列。搜尋每頁上限也從 50 降為 10，程式已自動套用。

## 疑難排解：畫面在動但沒聲音

播放器的 `<audio>` 是否要繞經 Web Audio（給頻譜視覺化取樣）取決於音檔來源，規則寫在
`packages/web/src/playback/audioRouting.ts`：

- 同網域、`blob:`（使用者本機檔案）→ 直接接管，聲音與真實頻譜都有。
- 跨網域 → 必須同時滿足「元素設定 `crossorigin="anonymous"`」與「主機回 `Access-Control-Allow-Origin`」，
  否則依 Web Audio 規格，被標記為 CORS-cross-origin 的媒體經 `createMediaElementSource()` 後**必須輸出靜音**。
  因此未通過檢查的來源會保留原生輸出（有聲音、畫面改用節奏脈衝），不會再出現「看似播放、其實無聲」。
- 展示曲放在 `https://cdn.jsdelivr.net/gh/<owner>/<repo>@main/*.mp3`：jsDelivr 回 `Access-Control-Allow-Origin: *`
  且支援 Range（拖條可用），所以聲音與真實頻譜都正常。更換來源只需改 `store/localDemoSongs.ts` 的 `DEMO_AUDIO_BASE`。
- Service Worker 刻意**不**快取音檔（declarative CacheFirst 會用整份快取回應 Range 需求而破壞拖條）；
  舊版殘留的 `demo-audio-cache` 由 `utils/staleCacheCleanup.ts` 在啟動時清掉。
- 音量：`volume` 只保存「最後可聽音量」，靜音是獨立的 `isMuted` 旗標，兩者都會寫進播放快照。
  舊版把靜音寫成 `volume: 0` 且不保存靜音旗標，重整後就是「圖示顯示未靜音、實際無聲」，
  `sanitizeStoredVolume()` 會在還原時把這種 0 修正回預設值。
- 音量控制只在一般播放頁與設定頁出現；**全螢幕 stage 不放置任何音量元件**（由
  `components/player/stageVolumeGuard.test.ts` 守住），舞台內改用鍵盤 `↑` / `↓` 調整、`M` 靜音。
- 開發模式下可在 Console 執行 `__echoraAnalyserHealth()`，會同時回報路由決策、
  `AudioContext.state` 與 `<audio>` 元素狀態。

## 功能

- 14 種歌詞視覺舞台，本機展示曲會跟著真實頻譜動
- AI 主題生成
- YouTube Music 官方歌單連線
- Responsive 歌詞舞台
- PWA 安裝與離線 app shell
