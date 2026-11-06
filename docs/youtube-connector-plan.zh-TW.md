# YouTube 連接器改善計畫

> 狀態：**計畫，尚未實作。** 這份文件只描述「現在有什麼問題、要怎麼改、改的順序、風險」，
> 等確認要做的範圍之後才動程式碼。
>
> 量測基準：`master@1b0c338` + 工作分支 `arena/2ab6bf3f-echora`（HEAD `f82eae9`），
> 測試 494/494 通過、`tsc --noEmit` 0 錯誤、`pnpm lint` 0 error / 24 warning。

---

## 0. 一句話結論

YouTube 連接器現在**能跑，但每一個失敗路徑都會讓使用者「安靜地失去連線」**：
授權 1 小時後無聲登出、開歌單失敗沒有任何提示、搜尋是全站共用每日 100 次的配額、
播放結束不會前進下一首。這些都不是「功能不夠」，而是**資料層與錯誤處理沒有分層**造成的。
所以計畫的核心不是加功能，是先把 access token 生命週期與請求層做對，再談功能。

追加一項（§W6）：使用者提到的「線上歌詞匹配」**程式碼其實已經在 repo 裡** ——
`src/utils/lyrics/` 有 45 個檔、folia 的整套多來源匹配流程，但 **0 個 import、編譯不過、
需要的 `/api/lyric-proxy` 也不存在**。它不是「要抄」，是「要接」，而且只值得接一半。

---

## 1. 現況盤點（實測）

### 1.1 涉及的檔案

| 檔案 | 行數 | 角色 |
|---|---|---|
| `packages/web/src/integrations/youtubeAuth.ts` | 154 | OAuth（implicit）、token 儲存、revoke |
| `packages/core/src/providers/ytmusic.ts` | 208 | Data API 存取（playlists / items / videos / search） |
| `api/youtube/search.ts` | 81 | 公開搜尋的 serverless proxy（持有 `YOUTUBE_API_KEY`） |
| `packages/web/src/store/playerStore.ts` | — | 連線狀態機、錯誤字串對照、歌單載入 |
| `packages/web/src/components/YouTubePlayer.tsx` | 159 | IFrame Player 生命週期與指令匯流排 |
| `packages/web/src/utils/youtubePlayback.ts` | 11 | `music` / `video` 分流 |
| `packages/web/src/pages/YouTubeCallback.tsx` | 41 | OAuth 回跳 |
| `ConnectModal` / `AccountTab` / `AppHome` / `Library` | — | 顯示層 |

### 1.2 認證

- `youtubeAuth.ts:87` → `response_type: 'token'`，**implicit flow**。token 從 URL fragment 取出後
  寫進 `localStorage['echora.youtube.session']`，生命 1 小時，**沒有 refresh token**。
- `youtubeAuth.ts:66-75` `getStoredYouTubeSession()`：token 過期就 `localStorage.removeItem()`
  **直接刪掉**，回傳 `null`。
- `playerStore.ts:519` 讀不到 session → 狀態設成 `disconnected`、`youtubeError: null`。
  → **使用者看到的是「從沒連過」，不是「需要重新登入」。**
- `expired` 狀態其實是**死碼**：`playerStore.ts:534` 在 `expired` 時把
  `youtubeConnected` 設成 `false`，而唯一使用 `syncCopy` 的地方（`AppHome.tsx:493`）被
  `youtubeConnected &&` 包住，所以 `AppHome.tsx:207` 的 `expired` 分支永遠不會顯示。
  → 使用者沒有任何「重新登入」的入口。
- scope 只有 `youtube.readonly` + `openid`。**provider 沒有任何寫入方法**（不能建立/改名歌單、加曲）。

### 1.3 錯誤處理

- `ytmusic.ts:71-82` `authorized()`：`fetch` 裸呼叫，**無 timeout、無 AbortController、無重試**。
  失敗時只丟 `YouTube API failed: <status> (<reason>)`。
- `playerStore.ts:152-160` `getYouTubeErrorMessage()`：用 `.includes('401')` / `.includes('403')`
  對**字串**做正則比對。`playerStore.ts:657` 更是用 `message.includes('授權已失效')` 決定要不要
  **清掉使用者的 session**。→ 錯誤分類是靠文案，改一個字就壞。
- `playerStore.ts:530-536`：`restoreYouTubeSession` 的 `catch` **無條件** `clearYouTubeSession()`。
  一次網路抖動、一次 `quotaExceeded`，使用者就被登出。
- `Library.tsx:41-44` `openPlaylist()` 沒有 `try/catch`：載入失敗 → unhandled rejection
  （被 `observability.ts:68` 吞掉）→ **畫面完全沒反應、也不會換頁**。

### 1.4 請求效率與配額（已用官方 Quota Calculator 校正）

YouTube Data API 現行配額（2026-11-03 版文件）：

- `search.list`：**獨立桶，每日 100 次**，每次 1 單位。
- 其他 endpoint 共用每日 10,000 單位；`playlists.list` / `playlistItems.list` / `videos.list`
  **每個請求 1 單位**。

所以「配額會被歌單吃光」是錯的假設。實測一次典型 session（10 個歌單、第一個 200 首）：

```
playlists.list    1 次  →   1 單位
playlistItems     4 頁  →   4 單位
videos.list       4 批  →   4 單位
                             9 / 10,000 單位  (0.09%)
```

**真正的問題有兩個：**

1. **`search.list` 的 100 次/日是「全站共用」的。** `api/youtube/search.ts` 用的是伺服器端
   單一 `YOUTUBE_API_KEY`，所以**所有使用者加起來一天只有 100 次搜尋**。
   `playerStore.ts:332` 在示範曲沒有 `audioUrl` 時就會打一次，也就是說幾個訪客點幾下示範曲
   就能把當天的搜尋額度用完。沒有快取、沒有去重、沒有 rate limit。
2. **延遲是序列化的。** `ytmusic.ts:140-146` 的 `MAX_TRACK_PAGES = 100` 是**逐頁 await**
   的迴圈，最壞情況 = 100 次 playlistItems + 100 次 videos.list = **200 次序列往返**（約 20–40 秒），
   而且每次重新進入都會重跑，沒有快取。

### 1.5 搜尋

- `api/youtube/search.ts:62` 寫死 `type=video&videoCategoryId=10`（音樂分類）。
- `ytmusic.ts:195` 再把**每一筆結果**標成 `youtubeVideoKind: 'music'`。
  → 透過搜尋進來的項目**永遠不可能被判成 `video`**，即使 proxy 放寬分類也一樣。
- `youtubeVideoKind: 'music'` 會讓 `Player.tsx:153` 不再跳過歌詞（`isYouTubeVideo` 為 false）、改走音樂舞台，
  然後拿**原始 YouTube 標題**（例如 `YOASOBI - 夜に駆ける (Official Video)`）去查 LRCLIB。
  → 歌詞命中率低，而且錯得沒有痕跡。

### 1.6 播放器

- `YouTubePlayer.tsx:61`：`ENDED` 只設 `playbackState: 'ended'`，**沒有呼叫 `next()`**。
  本機音訊在 `LocalAudioController.tsx:197` 有接 `next()`，YouTube 沒有。
  → **一首歌播完就停住，歌單不會前進。** 這是目前最容易被使用者發現的缺陷。
- `YouTubePlayer.tsx:79-81`：用全域 `window.onYouTubeIframeAPIReady` 當載入完成訊號。
  Google 的 `iframe_api` 只會呼叫它**一次**；若腳本載入時該屬性剛好被清理函式設成 `undefined`
  （`YouTubePlayer.tsx:90`），player 就永遠不會建立。目前因為兩個 `<YouTubePlayer>` 是互斥的
  三元分支（`Player.tsx:553-563`）而很少踩到，但這是結構性風險。
- `YouTubePlayer.tsx:130-140`：每 100 ms 輪詢一次 `getCurrentTime()`，**不論是否播放中都在跑**。
- `playerVars` 沒有 `start` / `end`，也沒有 `playbackRate`。

### 1.7 開發環境

- `vite.config.ts` 只掛了 `devAiFunctionsPlugin`，涵蓋 `/api/ai/*`，**沒有掛 `/api/youtube/search`**。
  實測：`curl 'localhost:3000/api/youtube/search?q=test'` → **HTTP 200 `text/html`**（SPA fallback）。
  前端拿到 HTML → `data.items` 是 `undefined` → 回傳 `[]` → 使用者只看到「找不到可嵌入播放的影片」。
  **本機完全無法測搜尋，而且錯得沒有訊息。**

---

## 2. 問題排序（依使用者可見影響）

| # | 問題 | 影響 | 現況證據 |
|---|---|---|---|
| P0 | 歌播完不會下一首 | 每次聽歌都會遇到 | `YouTubePlayer.tsx:61` |
| P0 | token 過期 = 無聲登出、無提示、無 CTA | 每小時一次（有使用時） | `youtubeAuth.ts:66-75`、`playerStore.ts:519`、`AppHome.tsx:493` |
| P0 | 開歌單失敗沒有任何反應 | 點下去像壞掉 | `Library.tsx:41-44` |
| P1 | 網路抖動 / 403 就清掉 session | 一次失敗就得重新登入 | `playerStore.ts:530-536` |
| P1 | 錯誤分類靠字串比對 | 文案一改行為就變 | `playerStore.ts:152-160, 657` |
| P1 | 全站共用每日 100 次搜尋、無快取 | 額度用盡後全站搜索失效 | `api/youtube/search.ts:34,62` |
| P1 | 大歌單要 200 次序列往返、無快取 | 開歌單數十秒 | `ytmusic.ts:140-146` |
| P1 | **「線上歌詞匹配」按鈕按了沒用** | 使用者以為會多來源找，其實重打同一個 LRCLIB 精確查詢 | `LyricsTab.tsx:80` → `playerStore.ts:621` |
| P1 | **YouTube 髒標題導致歌詞幾乎抓不到** | `(Official Video)` / 頻道名進 `artist` → `/api/get` 必失敗、search 取第一筆不評分 | `playerStore.ts:612-625`、`lrclib.ts:46,56` |
| P2 | folia 的匹配程式碼是死碼（45 檔 / 15k 行） | 盤點時誤判「已經有這個功能」 | `tsconfig.json` exclude `src/utils` |
| P2 | 搜尋結果一律標成 music | 舞台分流錯 | `ytmusic.ts:195` |
| P2 | 本機開發搜尋永遠回空 | 無法開發／驗證 | `vite.config.ts` + 實測 curl |
| P2 | IFrame API 全域 callback 單次觸發 | 極少數情況 player 永不建立 | `YouTubePlayer.tsx:79-90` |
| P3 | 100 ms 輪詢、無 `start`/`end`/`playbackRate` | 耗電、podcast 無法切段 | `YouTubePlayer.tsx:130` |
| P3 | 沒有寫入能力（不能管理歌單） | 功能缺口 | scope 只有 `readonly` |

---

## 3. 工作流

每個工作流都可以獨立成一個 PR，且彼此不重疊。**W0 必須最先做**，其餘可平行。

### W0 — 請求層與錯誤型別（地基，無 UI 變化）

**檔案**：`packages/core/src/providers/ytmusic.ts`（+ 新增 `packages/core/src/providers/youtubeRequest.ts`）、
`packages/web/src/store/playerStore.ts`、`vite.config.ts`、`vite-plugins/devAiFunctions.ts`

1. 新增 `YouTubeApiError extends Error`，帶 `status: number`、`reason: string | null`、`retryable: boolean`。
   `reason` 直接來自 Google 的 `error.errors[0].reason`（現在已經在讀，只是丟進字串裡）。
2. 新增 `requestYouTube<T>(url, { token, signal })`：8 秒 timeout + `AbortController`；
   只對 `5xx` / `429` 做**一次**退避重試（400 ms）；`401`/`403` 不重試（那不是暫時性錯誤）。
3. `authorized()` 改為拋 `YouTubeApiError`；**保留 `message` 的既有格式**，讓現有測試與
   `getYouTubeErrorMessage` 在 W2 之前仍然可用（漸進遷移，不用一次改完）。
4. `getYouTubeErrorMessage` 改成 `switch (error.reason ?? error.status)`，字串比對只留給
   「不是 `YouTubeApiError` 的未知錯誤」。
5. `devAiFunctionsPlugin` → `devApiFunctionsPlugin`，路由改成 include `/api/youtube/search`。

**驗收**：`ytmusic.test.ts` 新增 4 個測試——timeout 會 abort、502 只重試一次、401 不重試、
`reason` 有被結構化取出。`curl localhost:3000/api/youtube/search?q=test` 回 **JSON**（503 或 200）。

**風險**：低。不動 OAuth、不動畫面。

---

### W1 — 連線生命週期（P0 的根）

**檔案**：`packages/web/src/integrations/youtubeAuth.ts`、`packages/web/src/store/playerStore.ts`、
`ConnectModal.tsx`、`AccountTab.tsx`、`AppHome.tsx`

1. **區分「授權失效」與「暫時失敗」**：只有 `401` / `invalid_grant` 才清 session；
   網路錯誤、timeout、`quotaExceeded`、`accessNotConfigured` **保留 session**，只設 `error` 狀態。
2. 新增 `youtubeConnectionState: 'expired'` 的**實際路徑**：token 過期不要刪 `localStorage`，
   改標成 `expired` 並記下 `expiredAt`。UI 在 `AppHome` / `ConnectModal` / `AccountTab` 顯示
   「需要重新登入」+ 一顆**一鍵重連**按鈕（走既有的 `connectYouTube`）。
3. 每次呼叫 API 前檢查 `expiresAt`（現在只有啟動時檢查），快過期就先標 `expired` 而不是等 401。
4. 移除 `playerStore.ts:657` 的 `message.includes('授權已失效')`，改用狀態機判斷。
5. **（需決策，見 §5）認證機制**：`implicit` → 擇一：
   - **A. Google Identity Services token model**（`google.accounts.oauth2.initTokenClient`）：
     彈窗、不離開頁面、token **只存在記憶體**（不落地 localStorage）。仍然 1 小時、仍需使用者手勢續期。
   - **B. Authorization Code + PKCE + 後端換 token**（新增 `api/youtube/token.ts`）：
     `access_type=offline` 取得 refresh token，access token 壽命內自動續期，refresh token
     存 **HttpOnly + SameSite=Lax cookie**。這才是「不用每小時重登」的真正解法。

**驗收**：`youtubeAuth.test.ts` 補「過期 token 不清除、狀態變 expired」與「網路錯誤不清除 session」
兩組測試；`playerStore.test.ts` 補 `restoreYouTubeSession` 在 403 時**保留** token 的測試。

**風險**：B 會改變「伺服器不接觸 Google 使用者資料」這個**已寫進隱私政策與 Google 驗證文件**的敘述
（`legal.*.json` 的 `googleUserDataItem3`、`docs/google-oauth-brand-verification.md`），
需要同步改文案，且可能影響已送出的敏感範圍驗證。A 沒有這個問題。

---

### W2 — 資料層（快取 + 增量 + 並行）

**檔案**：`packages/core/src/providers/ytmusic.ts`

1. 記憶體 TTL 快取：`getUserPlaylists` 60 秒、`getPlaylistTracks` 5 分鐘，key 帶 `accessToken` 的
   短雜湊，避免換帳號還吃到上一個人的資料。
2. `getPlaylistTracks` 加 `limit` 參數（預設 300），超過就只取前面幾頁並回傳 `hasMore`，
   不要一次抓 5,000 首。`MAX_TRACK_PAGES` 從 100 降到符合實務的值。
3. `videos.list` 的批次改成**有限併發**（3 個同時），現在是嚴格序列。
4. `getVideoMetadata` 失敗時保留 `unknown`（現有行為，**不要改**），但把錯誤記進 diagnostic。
5. 若 W1 選 A/B 之後有 refresh，順便把「token 變了就清快取」接上。

**驗收**：新增測試——第二次呼叫 `getUserPlaylists` 只發 1 次 fetch；換 token 後快取失效；
`limit` 會提前停止分頁。

**風險**：快取若沒有跟 `disconnectYouTube` 連動，換帳號會短暫看到舊歌單。這是驗收項，不是可選項。

---

### W3 — 搜尋（配額保護 + 分類正確）

**檔案**：`api/youtube/search.ts`、`packages/core/src/providers/ytmusic.ts`、`playerStore.ts`

1. proxy 加 **in-memory LRU + 60 秒 TTL**（同一 query 不重複打上游），並對同 IP 做簡單 rate limit。
   目標：把 100 次/日的全站額度留給真正不同的查詢。
2. 分類改成**參數化**：預設 `music`，但允許呼叫端要求 `all`。`getPlaylistTracks` 那條路本來就有
   真實 `categoryId`，維持不動；**搜尋結果的 `youtubeVideoKind` 不再硬寫 `'music'`**，
   改成「不確定就是 `unknown`」，並讓 `unknown` 走影片播放器（`youtubePlayback.ts` 已經是這個語意）。
3. 歌詞查詢前做標題清洗：移除 `(Official Video)`、`[MV]`、`【MV】`、`- Topic`、`feat.` 之後的雜訊，
   抽 `Artist - Title` 的兩段式。清洗邏輯放在 `packages/core`，可單獨測。
4. `playerStore.ts:332` 的 fallback 搜尋加「先查快取、失敗不擋播放」的保護。

**驗收**：proxy 測試（同 query 兩次只打一次上游）、標題清洗的 table test（至少 10 組真實標題）。

**風險**：標題清洗是啟發式，會誤殺。做法是**清洗後的字串只用於歌詞查詢**，不改顯示標題。

---

### W4 — 播放器（P0 的「不會下一首」+ 健壯性）

**檔案**：`packages/web/src/components/YouTubePlayer.tsx`、`playerStore.ts`

1. `ENDED` → 依 `loopMode` 決定 `seek(0)` + 重播，或 `next()`。**與本機音訊行為一致。**
2. IFrame API 改成**單例載入器**（`utils/youtubeIframeApi.ts`）：回傳 Promise，
   多個實例共用同一個載入 Promise，不再碰 `window.onYouTubeIframeAPIReady`。
3. 100 ms 輪詢改成**只在播放中**跑（`if (!isPlaying) return` 提前結束，或降頻到 250 ms）。
4. `playerVars` 支援 `start` / `end`（給 podcast / 段落重播用），並接上 `playbackRate`。
5. 影片錯誤（2/5/100/101/150）後提供「跳下一首」動作，而不是只留錯誤訊息。

**驗收**：`YouTubePlayer.test.ts`（現有 29 行）補 ENDED → 呼叫 `next()` 的測試；
單例載入器有「兩個實例只載入一次腳本」的測試。

**風險**：`Player.tsx:553` 的兩個實例是互斥三元分支，重構時**不要順手合併**，它們的 DOM 位置不同。

---

### W5 — UI 與文案

**檔案**：`ConnectModal.tsx`、`AccountTab.tsx`、`AppHome.tsx`、`Library.tsx`、
`i18n/locales/player.{zh-TW,en}.json`、`shell.*.json`

1. `ConnectModal` / `AccountTab` 顯示「已連線 / 已過期 / 同步中 / 錯誤」四態。
2. `Library.openPlaylist` 包 `try/catch`，失敗顯示 toast 並**不要**換頁。
3. 中文硬編碼字串（`playerStore.ts:331,338,341,508` 等）移到 i18n；`youtubeError` 改成
   `{ code, detail }` 由畫面組字。
4. 錯誤訊息縮短：現在的 403 文案是 100+ 字，行動裝置上讀不完。

**風險**：i18n 分區有 `localeBundles.test.ts` 守著「shell 用到的 key 不能放進 lazy bundle」，
新增 key 要放對檔案，否則測試會紅（這是好事）。

---

### W6 — 線上歌詞匹配（**新發現：程式碼已在 repo，但是死碼**）

這一節是追加的。原本的計畫只把歌詞當成「順手修」，實際盤點後發現 repo 裡**已經有一整套
folia 的線上歌詞匹配流程**，但它**從來沒有被接上、而且現在編譯不過**。

#### 6.1 現況：45 個檔、15,005 行，全部是 dead scaffold

`packages/web/src/utils/` 下有 115 個 `.ts`，共 **15,005 行**，而 `packages/web/tsconfig.json`
的 `exclude` 明文寫著 `"src/utils"` —— **這些檔案完全不參與型別檢查**。
抽出其中歌詞相關的 45 個檔：

| 檔案 | 行數 | 內容 |
|---|---|---|
| `autoMatchBestLyric.ts` | 529 | 主流程：NetEase → QQ → 酷狗 → AMLLDB，逐字歌詞，`AUTO_MATCH_MIN_SCORE = 75` |
| `matchScore.ts` | 218 | 評分：title 45 / artist 25 / album 30 + 時長倍率；含 romaji + 簡繁轉換正規化 |
| `searchQuery.ts` | 71 | 查詢字串組裝、去掉重複的 `artist - title` 前綴 |
| `lyricMatchSources.ts` | 166 | 另一條（較新）的來源探測 |
| `providers/qqLyricProvider.ts` | 210 | QQ 音樂（QRC 逐字，含 `qrcDecrypt` 399 行解密） |
| `providers/kugouLyricProvider.ts` | 376 | 酷狗（KRC 逐字，含 `krcDecrypt` 70 行） |
| `providers/amllDbProvider.ts` | 100 | AMLL TTML 資料庫 |

**但是**：全 repo 對 `autoMatchBestLyric`、`lyricMatchSources`、`matchResult`、`nowPlayingSource`、
`localSongMatchContext` 的 import 數 = **0**。沒有任何畫面、store 或 provider 用到它們。

#### 6.2 它現在跑不起來（實測）

我加了一個 `import { autoMatchBestLyric }` 的探針檔跑 `tsc --noEmit`，得到 4 個硬錯誤：

```
autoMatchBestLyric.ts(2,40): Cannot find module '../../services/onlineMusic/providerRegistry'
amllDbProvider.ts(15,19):   Property 'electron' does not exist on type 'Window'
ttmlConversion.ts(21,7):    'optionalArray' is declared but its value is never read
lyrics/types.ts(3,59):      Cannot find module '../../types/navidrome'
```

四個問題的性質完全不同：

1. **`providerRegistry` 整個目錄不存在**，連帶 `getOnlineMusicProvider('netease')` 也**沒有實作**。
   也就是說，這條鏈裡**優先度最高的來源（NetEase）根本是空的**，QQ / 酷狗的搜尋也走同一個 registry。
2. `window.electron` 是 **Electron 桌面版的 bridge**，PWA 沒有這個東西（`amllDbProvider` 有 fallback，
   但型別沒宣告）。
3. `types/navidrome` 不存在 —— 那是上游 Navidrome 音樂伺服器的型別。
4. `ttmlConversion.ts` 是上游 TTML 轉換模組，也沒接上。

#### 6.3 它需要的後端不存在

`qqLyricProvider` / `kugouLyricProvider` / `amllDbProvider` 全部把請求導到
**`/api/lyric-proxy?url=...`**（瀏覽器 CORS 打不到這些站）。這個端點 **repo 裡沒有**：

```
api/ai/segment.ts   api/ai/status.ts   api/ai/theme.ts   api/youtube/search.ts
```

只有這四支。所以就算把型別補齊，**執行時每一個請求都會 404**。

#### 6.4 架構不相容

那批檔案用的是 `SongResult`（`id` / `name` / `artists` / `album` / `durationMs` / `sourceRef`…），
Echora 用的是 `Song`（`id` / `title` / `artists` / `source` / `youtubeVideoKind`…）。是兩個不同 app 的型別。

好消息是 **`matchScore.ts` 只碰 5 個欄位**（`title` / `artist` / `durationMs` / `album` / `artists`），
而且它真正的相依只有 `duration.ts`（純函式）、`wanakana`、`opencc-js`（兩者都已在 `dependencies`）。
**這一段是可以低成本搬過來的。**

#### 6.5 Echora 現在實際做的歌詞匹配

`playerStore.ts:596-635` 的 `fetchLyrics`：

```
1. 上傳的歌詞（readUploadedLyrics）
2. 內建示範歌詞（getBundledDemoLyrics）
3. local → LOCAL_DEMO_LYRICS 查表
4. 其他（含 ytmusic）→ fetchLrcLibLyrics(song.title, artistName, album, duration)
```

`fetchLrcLibLyrics`（`packages/core/src/providers/lrclib.ts`）先打 `/api/get`（**精確匹配**），
失敗才打 `/api/search?q=...`，然後取 `searchResults.find(t => t.syncedLyrics) || searchResults[0]`
—— **完全沒有評分，第一個有逐字的就用**。

也就是說：`LyricsTab.tsx:80` 那顆寫著「線上歌詞匹配」的按鈕，按下去只是**重打一次一模一樣的 LRCLIB 請求**。

**這正是 YouTube 場景最痛的地方**：YouTube 標題是髒的。

```
夜に駆ける (Official Video)      ← /api/get 精確比對必然失敗
YOASOBI - 夜に駆ける (Official Video)  ← artist 欄位裡還塞了頻道名
```

#### 6.6 建議做法（分三層，可各自獨立）

| 層 | 做什麼 | 成本 | 需不需要新後端 |
|---|---|---|---|
| **L1. 標題清洗（最該先做）** | 把 `searchQuery.ts` 的 `normalizeSongTitleForLyricSearch` 與 `matchScore.ts` 的 `normalizeTitleForMatch` 搬到 `packages/core/src/lyrics/`，改吃 `Song`。移除 `(Official Video)` / `[MV]` / `【MV】` / `feat.` / `- Topic` / 版本標記，並優先從 `Artist - Title` 拆出兩段 | **S**（約 150 行 + table test） | ❌ |
| **L2. LRCLIB 改成「搜尋後評分」** | 把 `matchScore.ts` 搬進 core，`fetchLrcLibLyrics` 改成：先 `/api/search` 取 10 筆 → 用 title/artist/duration 打分 → 取最高分且 ≥ 門檻。取代現在的「第一個有逐字的就用」 | **S–M**（約 250 行 + 10 測試） | ❌ |
| **L3. 多來源（QQ / 酷狗 / AMLLDB）** | 補 `api/lyric-proxy`、補 NetEase provider、逐字 TTML/QRC/KRC 解碼接上 | **L**（3–4 個 PR） | ✅ 要，而且**有法務風險**（見下） |

> **我的建議：做 L1 + L2，L3 先不做。**
> L1 + L2 就解決使用者真正感受到的問題（「明明有這首歌卻抓不到歌詞」），而且**完全不需要新後端**，
> 而且能把「線上歌詞匹配」按鈕變得名副其實。L3 換來的是逐字歌詞（更好的 karaoke），但成本與風險都是數量級差異。

#### 6.7 L3 的三個阻礙（不是技術問題）

1. **法務／ToS**：QQ 音樂與酷狗的歌詞 API 是**非官方端點**，靠 `qrcDecrypt` / `krcDecrypt` 解密
   它們的私有格式。Echora 是可公開存取的 PWA，而且已經跑過 Google OAuth 驗證、有隱私權政策與服務條款。
   把這些端點接上去等於**在正式站上代理未經授權的商業服務內容**。folia 是桌面 App、單機執行，
   風險輪廓完全不同 —— 這不是「抄過來就好」的東西。
2. **`/api/lyric-proxy` 是一個 SSRF 風險面**：它接受任意 `url` 參數並代為請求。要安全的話必須
   做嚴格的白名單（只允許特定 host）、限制 scheme、禁止 redirect 到內網。（**絕對不要做成通用 proxy。**）
3. **維護成本**：這些是逆向出來的私有格式，QQ/酷狗改版就斷。目前 repo 沒有任何一個測試覆蓋
   `qrcDecrypt` / `krcDecrypt`。

#### 6.8 順序

L1 依賴 W3（標題清洗本來就在 W3 裡，這裡只是把它從「W3 的一個子項」升級成獨立可測的模組）。
所以插入順序是：

```
W0 → W4 → W1 → W2 → W3 →【L1 → L2】→ W5 → D4
```

L1 + L2 約等於一個 M 大小的 PR。

#### 6.9 順手要處理的兩件事

- **`src/utils` 不在 tsconfig 裡**這件事本身要修：把 15,005 行的死碼移出 `src/`（例如
  `src/utils/_upstream/`），或直接刪掉。留著只會讓下一次盤點再度誤判「這個功能已經有了」
  ——**這次就是這樣被騙到的**。
- `LyricsTab` 的按鈕文案：如果只做 L1+L2，按鈕應該說明「重新搜尋歌詞」，而不是聽起來像
  會去多個來源找。

---

---

## 4. 順序與大小

| 順序 | 工作流 | 大小 | 取決於 | 獨立 PR |
|---|---|---|---|---|
| 1 | W0 請求層 | S（約 250 行 + 4 測試） | — | ✅ |
| 2 | W1 連線生命週期 | M（約 400 行 + 10 測試） | 需決策 A/B | ✅ |
| 3 | W2 資料層 | S–M（約 200 行 + 4 測試） | W0 | ✅ |
| 4 | W4 播放器 | S（約 180 行 + 5 測試） | — | ✅ 可與 W2 平行 |
| 5 | W3 搜尋 | M（約 300 行 + 8 測試） | W0、W2 | ✅ |
| 6 | **L1 標題清洗**（W6） | S（約 150 行 + table test） | W3 | ✅ |
| 7 | **L2 LRCLIB 搜尋後評分**（W6） | S–M（約 250 行 + 10 測試） | L1 | ✅ |
| 8 | W5 UI/文案 | S（約 200 行 + 3 測試） | W1 | ✅ |
| — | L3 多來源（QQ/酷狗/AMLLDB） | **L**（3–4 個 PR + 新後端 + 法務風險） | L2 | ❌ 先不做 |

**如果要先止痛**：只做 **W4 的 ENDED + W1 的第 1、2 點 + Library 的 try/catch**，
就解決三個 P0，大約是半個 PR 的量。

**如果要先讓「歌詞抓不到」有感改善**：做 **L1 + L2**（不需要新後端，約一個 M 的 PR），
YouTube 那堆髒標題就吃得進 LRCLIB 了。

---

## 5. 已決定的方向

> 以下由使用者確認（2026-11-06）。這一節取代先前的「待決策」清單。

### D1 → **C：先做 GIS token model，後端 refresh token 留給之後的獨立 PR**

- 這一輪把 implicit flow（`response_type=token`）改成 **Google Identity Services token model**
  （`google.accounts.oauth2.initTokenClient`）：彈窗、不離開頁面、access token 只存在記憶體。
- `api/youtube/token.ts` + HttpOnly cookie + `access_type=offline` 的 refresh 流程**不在這一輪**。
- ⚠️ **連帶影響**：GIS 不回傳 `state`，改用 `TokenClient` 的 callback 綁定，所以
  `youtubeAuth.ts` 現在那套 `sessionStorage` 的 `oauth.state` CSRF 檢查會移除。
  同時 `YouTubeCallback.tsx`（`/oauth/youtube/callback`）在彈窗流程下**不再需要**。
  README 與 `docs/google-oauth-brand-verification.md` 裡「導回網址固定為
  `{origin}/oauth/youtube/callback`」的說明要一起改，OAuth 用戶端的「已授權的重新導向 URI」
  也可以只留 JavaScript 來源。

### D2 → **要：升級成讀寫 scope**（重新驗證的時程風險已確認可接受）

- scope 從 `youtube.readonly` 改成 `https://www.googleapis.com/auth/youtube`。
- 使用者確認（2026-11-06）：「認證覺得沒關係，因為我現在也沒認證」。
  同意畫面仍在「測試中」、用 test user 登入，所以**重新驗證不會擋住開發與自用**。
  §5.1 第 2 點的時程風險因此降級：只在使用者要把 App 公開給非 test user 時才成立。
- **實作順序不變**：仍建議 W1（GIS）先單獨上線，再開一個 PR 換 scope ——
  一次同時改認證機制與權限範圍，出問題時無法分辨是哪一個壞掉。

### D3 → **只搜音樂**

- `api/youtube/search.ts` 維持 `videoCategoryId=10`，**不參數化分類**。
- 修的是 `ytmusic.ts:195`：不要無條件標 `youtubeVideoKind: 'music'`。
  分類改由 `videos.list` 的 `snippet.categoryId` 判定（跟歌單那條路一致）；
  拿不到就 `unknown`，由 `youtubePlayback.ts` 的既有語意處理。
- `embeddable` 仍然讀出來（避免播放必失敗），但**不做分類放寬**。

### D4 → **要，但做成「多裝置連線進度同步」的地基；功能本體之後再做**

- 這一輪只做 **IndexedDB 快取歌單 + 播放進度**，讓重新整理／離線能秒開。
- **跨裝置同步**（真正的多裝置進度）需要後端，屬於之後的獨立專案，
  但它會需要**穩定、可預測的播放進度上報格式** —— 這一輪的資料模型要為它留位置，
  不要做出一個之後得重寫的形狀。
- 隱私政策要補一句（Google 使用者資料現在會多存一份在裝置上）。

### 5.1 D2 的連鎖後果（必須一起做，不能只改 scope 字串）

1. **權限邊界**：讀寫 scope 讓 provider 可以改動使用者的真實歌單。
   任何寫入都要有確認步驟，而且**不能有「自動整理」行為**。
2. **Google 重新驗證**：`youtube` 比 `youtube.readonly` 權限更大，屬敏感範圍變更。
   需要更新同意畫面的用途說明、重錄示範影片、重新送出驗證。
   在驗證通過前，公開站的新 scope 會被 Google 擋下或顯示未驗證警告。
3. **隱私政策／服務條款**：現在寫「只讀取」，要改成包含寫入；`legal.*.json` 與
   `docs/google-oauth-brand-verification.md` 的 `youtube.readonly` 敘述全部要改。

### D5 → 尚未回答

線上歌詞匹配要做到哪一層（L1+L2 或再加 L3）仍待確認。不影響 W0–W4 的動工。

## 6. 非目標（這次不做）

- 不用 Piped / Invidious 這類非官方鏡像（README 已明確排除）。
- 不做 YouTube Music 的播放狀態同步（官方沒有公開 API）。
- 不引入狀態管理或請求庫（TanStack Query、swr）；現有 zustand + 自寫 request layer 足夠。
- 不動 `.github/workflows/`（本 repo 的 GitHub App 沒有 `workflows` 權限，推不上去）。
- 不改 Spotify 那條路，即使 `spotifyAuth.ts` 的 PKCE 實作可以當 W1-B 的參考。

---

## 7. 驗證方式（每個 PR 都要跑）

```bash
pnpm --filter=@echora/web test      # 目前 494 通過 / 75 檔，只能增加不能減少
pnpm --filter=@echora/web exec tsc --noEmit
pnpm lint                            # 目前 0 error / 24 warning，不能增加
pnpm build                           # 含 check-shell-closure
node scripts/check-bundle-size.mjs
```

CI 另有 E2E（`e2e/smoke.spec.ts`，不碰 YouTube 網路）與 Vercel 部署。
**YouTube 的 E2E 不會做真的 OAuth**——所有 API 都用 mock，這是刻意的：在 CI 裡打真的 Google API
會消耗配額，而且無法穩定重現。
