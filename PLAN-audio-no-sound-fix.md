## 狀態：已實作（選定方案＝雲端 jsDelivr + 完整修復）

# Echora「網頁沒聲音」完整修復計畫

> **實作狀態（2026-09-11）**：P0–P3 已全部完成於 `arena/01a09018-echora`。
> 來源方案選 **雲端 jsDelivr**（`cdn.jsdelivr.net/gh/arthurwang110505-debug/video@main/*.mp3`，
> 該網域已列為 CORS 白名單 → 聲音與真實頻譜同時成立）。
> 驗證：`pnpm test` 33 files / 137 tests 全綠、`pnpm lint` 0 error、`tsc --noEmit` clean、
> `pnpm build` + `check-bundle-size.mjs` 通過。新增 `e2e/audio.spec.ts`（本沙箱無 chromium，交由 CI 跑）。
> 未做：音檔不進 repo（因此沒有 commit 授權問題）；`demo-audio-cache` 的 SW 快取改為移除並在啟動時清掉。

> 目標：聲音一定要出來、頻譜要真的跟著音樂動，並一併修掉 dev 模式、手機暫停、靜音音量三個坑。
> 限制：**全螢幕 stage 裡絕對不能出現音量鍵**。

---

## 0. 先回答那個問題：把音樂檔放進 repo 一起 push，是不是就沒這個問題？

**技術上：是。** 同網域之後瀏覽器就不會把它標成「跨網域髒資料」，`createMediaElementSource` 就不會靜音，真實頻譜也量得到。順便把「Manus 暫存 CDN 有一天會消失」的風險一起移除（實測 `new Audio(url).play()` 有聲音 → 檔還在，所以目前的靜音 100% 是接管問題，不是檔案問題）。

**但有三個但書：**

1. **光放進去還不夠。** 下面 §2 的「坑 1（dev 模式）」在**同網域也會發生**：React StrictMode 讓 `LocalAudioController` 的 effect 跑兩次，第二次 `createMediaElementSource` 會丟 `InvalidStateError`，而元素已經被綁在**已經被 `close()` 掉的** AudioContext 上 → 永久無聲。所以 §2 的三個程式修復是必要條件，放檔只是「讓真實頻譜變成可能」的充分條件。
2. **授權。** 這 5 首曲子來自 Pixabay，`localDemoSongs.ts` 的 `attribution` 就寫著。Pixabay Content License 明文禁止「把原始檔案以 standalone 方式散布」（Cannot sell or distribute Content on a Standalone basis；把未修改的內容搬到别的平台讓人下載是不允許的）[picdefense][thewavevideomarketing]。現在的做法（在部署的 app 裡播放）屬於「使用」，没问题；但把 `.mp3` 原檔 commit 進公開 repo，等於提供下載，**踩線**。
3. **體積與部署細節。**
   - 5 首約 120k–290k 秒 × 音質 → 粗估 15–25 MB；GitHub 單檔 100MB 硬上限不會撞到，但 repo clone 會明顯變重，且 commit 過的二进制**永遠留在 history**（要 LFS 才能救，本 sandbox 目前沒裝 `git lfs`）。
   - `vercel.json` 現有 `{"source": "/(.*)", "destination": "/index.html"}`：Vercel 先查檔案系統再套 rewrite，所以 `dist/audio/*.mp3` 實體檔不會被吃掉（現有 `/api/*` 函式同樣活著，可作為佐證）。
   - 要注意 **HTTP Range**：Vercel 靜態資源支援 Range seek，但**不支援把 `/api` serverless 函式當串流來源**（Hobby/Pro 函式回應上限約 4.5 MB）。→ 所以「用 `api/media` 自己做同網域 proxy」這條路**不建議**，長歌曲會撞上限、拖條也難。
   - PWA：`vite.config.ts` 的 `globPatterns` 千萬不要把 `audio/*.mp3` 加進 precache，否則安裝時要先抓 20MB。

### 音樂來源 4 個選項（要選 1 個）

| 代號 | 做法 | 聲音 | 真實頻譜 | repo 體積 | 授權 | 外部 CDN 掛掉風險 |
|---|---|---|---|---|---|---|
| **0** | 檔維持遠端，只補 `crossOrigin="anonymous"` | OK | **僅當 CDN 回 `Access-Control-Allow-Origin`** | 0 | 不變（现状） | 仍有 |
| **A** | 5 個 mp3 原檔 commit 進 `packages/web/public/audio/` | OK | OK | +15~25MB | ⚠️ 踩 Pixabay「standalone 散布」線 | 移除 |
| **B** | A + 換成**可自由再散布**的素材（自製/CC0，例：用指令碼 render 的 30–60 秒 demo） | OK | OK | +2~6MB（可壓小） | ✅ 乾淨 | 移除 |
| **C** | 檔放本地但**不進 git**（`public/audio/` 加 `.gitignore`），用 `scripts/fetch-demo-audio.mjs` 在 `postinstall`/`prebuild` 抓下來 | OK | OK | 0 | 灰色（部署站仍是散布源頭） | 建置需要網路 |
| **D** | 走 `/api` 同網域 proxy | OK | 可 | 0 | 不變 | 移除，但 ⚠️ 撞 Vercel 4.5MB 上限 |

**我的建議：B（自製可再散布的 demo 檔）> 0（若 CDN 有 ACAO，一行就夠）> A（若 Pixabay 作者同意或你想先求能用）> C > D。**

先做這個 5 秒檢查來決定要不要 0：DevTools → Network → 點那個 mp3 → Response Headers 有沒有 `access-control-allow-origin: *`。

- 有 → 選 0 立刻有聲 + 有真實頻譜，零體積成本（之後再決定要不要 B）。
- 沒有 / 看不懂 → 直接走 B 或 A。

---

## 1. 診斷結論（已完成，供修復對照）

| # | 位置 | 問題 | 影響 |
|---|---|---|---|
| 根因 | `playback/localAudioAnalyser.ts:36`、`components/LocalAudioController.tsx:163`（`<audio>` 沒有 `crossOrigin`） | 跨網域來源被 Web Audio 接管 → 依規格 `MediaElementAudioSourceNode` 對 CORS-cross-origin 資源**必須輸出靜音**，且元素輸出「只走圖」 | 全部 5 首展示曲無聲 |
| 坑 1 | `LocalAudioController.tsx:19-23/85` + `main.tsx:11` | mount 就建 context 並接管元素；cleanup `close()` context；StrictMode 雙次執行 → 第二次接管拋 `InvalidStateError` 被 `catch {}` 吞掉 → 元素綁在已關閉的 context，永久無聲 | `pnpm dev`（連 blob 也死） |
| 坑 2 | `localAudioAnalyser.ts:57-61` | context 在無手勢的 mount 階段建立（`suspended`）；只在 `localCommand` play 路徑 resume；只認 `'suspended'`，不認 iOS 的 `'interrupted'` | 手機/首次播放 |
| 坑 3 | `store/playerStore.ts:404-409` + `writePlaybackSnapshot`(:88-97) | `toggleMute()` 把 `volume` 寫成 0 且永不還原；snapshot 只持久化 `volume`、不存 `isMuted` → 重整後「音量 0 + 圖示顯示未靜音」；且**全站沒有任何音量 UI**（`setVolume`/`toggleMute` 沒有被任何元件呼叫） → 使用者無法自救 | 踩到就永久靜音 |
| 掩護 | `playback/audioBands.ts` `placeholderAudioBands()` + `resolveStageAudioBands()` | 量不到資料時改用正弦假脈衝 → 畫面照動、進度照跑 → 「看起來正常但就是沒聲」，讓 bug 難被發現 | 診斷干擾 |

---

## 2. 修復設計

### 2.1 音訊圖生命週期（修根因 + 坑 1）

`playback/localAudioAnalyser.ts` 重寫為「一個 context、一個 graph、永不 close」：

- 模組級 singleton `AudioContext`；**任何情況下都不呼叫 `close()`**（`detachLocalAudioAnalyser` 改為只把 `analyser` 從 destination 摘掉？→ **不行**，那也會靜音。正確做法：`source → analyser → destination` **常駐**，analyser 是 pass-through，不影響音質；「解除附著」只是把 module 內的指標清掉、停止取樣）。
- `WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>`：同一個元素只允許接管一次；重複 `attach` 直接回快取的來源 → 從根上消滅 `InvalidStateError` 與 StrictMode 双掛載問題。
- `attach` 冪等：`attachLocalAudioAnalyser(audio)` 可以被叫無限多次。
- 新增 `shouldRouteThroughAnalyser(url, locationOrigin)`（**純函數**，為了能在 vitest `environment: 'node'` 下測）：
  - `blob:` / `data:` / same-origin → `route`
  - 跨網域且 `allowCors === true` → `route` + 必須在設 `src` **之前**寫 `audio.crossOrigin = 'anonymous'`
  - 跨網域且不允許 CORS → `direct`（不接管，走合成脈衝，但**聲音一定出得来**）
  - `file:` / `http(s)` on iOS 限制等邊界一律回 `direct`（寧可沒頻譜，不可沒聲音）
- `resumeLocalAudioAnalyser()`：條件放寬成 `state !== 'running'`（涵蓋 `suspended`、`interrupted`、`closed` 保護），並在下列時機都呼叫：play command、`seek`、`document` 第一次 `pointerdown`（一組 `{ once: true }` 手勢鎖）、`visibilitychange → visible`、`audio` 的 `play` 事件。
- 失敗自癒：若 `attach` 後 `sampleLocalAudioBands()` 連續 N 幀（例 30）都是零，而 `audio.currentTime` 有在推進 → 自動標記 `spectrumUnavailable`，切到合成脈衝並在 dev 只 `console.warn` 一次（不 toast、不打斷使用者）。

### 2.2 LocalAudioController（`components/LocalAudioController.tsx`）

- `<audio ref={audioRef} preload="auto" className="hidden" aria-hidden="true" />` → 由 script 依策略決定 `crossOrigin`（**必須在 `audio.src=` 之前**，順序錯了 CORS 快取會錯）。
- 監聽 `error`：若錯誤发生在「CORS 模式的接管」之後（`el.error?.code === 4` 且我們有設 `crossOrigin`）→ 清掉 `crossOrigin`、改 `direct` 策略、重設同一個 `src` 重播一次（只重試一次，避免迴圈）→ 保证「有聲音但沒頻譜」永遠優於「什麼都沒有」。
- 移除 unmount 裡的 `detachLocalAudioAnalyser()` + `audio.pause()` 組合中的破壞性部分（不 `removeAttribute('src')` 之後又 `load()` 到已接管的元素上；見 §2.1 常駐 graph）。
- 保留現有的 `visibilitychange`/`pageshow` 狀態同步，並在裡面補 `resume`。
- 現行第 137–141 行那段「`audio` 沒暫停就把 store 設成 playing」的樂觀同步，改成只在 `!audio.paused` 且 `readyState >= 2` 時標記，避免「UI 說在播、其實被靜音策略擋住」的誤導。

### 2.3 音量／靜音（坑 3）+「stage 裡不能出現音量鍵」

`store/playerStore.ts`：

- 狀態拆乾淨：`volume`（**永遠是最後的非零音量**）+ `isMuted`，實際輸出音量 = `derivePlaybackVolume(volume, isMuted)`（純函數，可單測）。
- `setVolume(v)`：`v > 0` 時存 `volume = v, isMuted = false`；`v === 0` 時只標 `isMuted = true`，**不覆寫 `volume`**。
- `toggleMute()`：反轉 `isMuted`，`volume` 永遠不動（修掉「取消靜音後還是 0」）。
- 另加 `nudgeVolume(delta)` 之類給鍵盤／設定頁用。
- 持久化：snapshot 增加 `isMuted`，`volume` 寫入時做 `sanitizeRestoredVolume()` — 讀到 `<= 0`/`NaN`/`undefined`（正是舊版被污染的资料）→ 回 `DEFAULT_VOLUME = 0.8`。這樣已經踩到坑的使用者一升級就有聲音（自我救贖，不用叫使用者清 localStorage）。
- YouTube：`YouTubePlayer.tsx:126` 的 `Math.round((volume || 0) * 100)` 改用 derive 後的實際音量，否則靜音時 YT 體積對不上。

UI 位置（**硬性要求**）：

- `/app`（AppHome）與 `/settings`：可以放音量滑桿／靜音鍵。
- `/player` 的 **非** stage 模式（`displayMode === 'full'`）：放一個小的靜音＋滑桿在 `TransportBar` 右側即可（要不要做由你決定，我預設做）。
- `displayMode === 'stage'`（全螢幕沉浸舞台）：**零音量 UI** — 不动 `ImmersiveChrome`、不在 `Player.tsx` stage 分支插任何元件；並加一道防呆測試：`grep`／靜態斷言確保 stage 專有元件裡不出現 `Volume` 圖示或 `setVolume`。
- 舞台內若要調音量，只用鍵盤 `↑/↓`（不顯示任何東西）＋ Media Session；這樣既可用又不污染舞台。

### 2.4 展示曲來源（依 §0 選的方案落地）

以 **B**（自製可再散布素材）為例：

- 新增 `scripts/render-demo-audio.mjs`：純 Node 寫 WAV（無 ffmpeg 依賴）產生 5 段 30–60 秒、含明显鼓點/低频的示範音，輸出到 `packages/web/public/audio/*.wav`；或你手動丟 5 個檔進 `packages/web/public/audio/`（檔名對齊 song id），我就只用你給的檔。
- `store/localDemoSongs.ts`：`audioUrl` 改為 `/audio/<id>.wav`（同網域）；保留 `attribution` 欄位但換成自製素材的來源說明。
- `store/localDemoSongs.test.ts:8` 那條 `expect(...startsWith('https://files.manuscdn.com/'))` 必須同步改（改成斷言 same-origin `/audio/`），否則 CI 紅燈。
- `vite.config.ts`：`runtimeCaching` 裡那條 `files.manuscdn.com` 的 `CacheFirst` 移除或改寫；`globPatterns` 不要加音檔（避免安裝時抓 20MB）。
- 若選 **A**：步驟相同，只是檔直接 commit（我會在 README 加一段授權警訊，請你確認 Pixabay 條文/或取得同意再 push）。
- 若選 **0**：不動來源，只做 §2.1–2.3，策略函數會回 `route + cors`。

### 2.5 可觀察性（讓下次一分鐘就能定位）

- `lib/diagnostics.ts` 加兩個事件：`audio_routing`（`route` / `direct` + 原因）、`audio_context_state`（`suspended` → `running` 的時間點）。
- Settings 頁（不是舞台）顯示一行純文字診斷：`音訊路徑：同網域接管（真實頻譜）`／`音訊路徑：外部來源，已改用非接管模式`，並把 `localStorage` 裡的音量值顯示出來 → 使用者自己就能看出是不是被靜音卡住。

---

## 3. 測試計畫

本 sandbox 無法跑瀏覽器（Playwright CDN 被封、無 chromium），但可以：`npm i -g pnpm@9` → `pnpm install --frozen-lockfile`（registry 打得通）→ 跑 `pnpm lint`、`pnpm test`（vitest，`environment: 'node'`）、`pnpm build`、`node scripts/check-bundle-size.mjs`。Playwright e2e 交給 CI（`playwright.config.ts` 已支援 `CHROME_PATH`）。

因此新增邏輯一律写成**可純測**的形式：

1. `playback/audioRouting.test.ts`（新）
   - same-origin / `blob:` / `data:` → `route`
   - 跨網域 + `allowCors` → `route` 且要求 `crossOrigin=anonymous`
   - 跨網域 + 不允許 CORS → `direct`
   - 垃圾輸入（`''`、`undefined`、`'not a url'`、`file://`）→ `direct`，不拋錯
2. `playback/localAudioAnalyser.test.ts`（擴充現有檔）
   - `attach` 冪等：以 fake context/元素注入呼叫 3 次 → `createMediaElementSource` 只被叫 1 次（這是 StrictMode 靜音 bug 的迴歸測試）
   - `detach` 之後再 `attach` → context 未被 `close()`（斷言 `close` 從未被呼叫）
   - `resume` 對 `suspended` 與 `interrupted` 都呼叫 `resume()`
   - 全部 guard 在無 `window` 環境下回 `null`／不拋錯（保住現有那條測試）
3. `store/playerStore.volume.test.ts`（新）
   - `toggleMute()` 兩次 → `volume` 不變、`isMuted` 回來 → **坑 3 的迴歸測試**
   - `setVolume(0)` → 標記靜音但保留原音量
   - snapshot：`{ volume: 0 }` + 無 `isMuted` → restore 後實際音量 = 0.8
   - snapshot 保留 `isMuted=true` 情境
   - 舊污染資料迁移：只驗 `derivePlaybackVolume` / `sanitizeRestoredVolume`
4. `components/StageVolumeUiGuard.test.ts`（新，靜態斷言）
   - 讀 `pages/Player.tsx` 的 stage 分支相關原始碼／組件輸出，斷言 `stage` 模式不含音量元件與 `Volume*` 圖示 → 把你那條「絕對不要出現在全螢幕 stage」變成 CI 規則
5. `localDemoSongs.test.ts`（修改）：`audioUrl` 為 same-origin `/audio/...`、`attribution` 欄位仍在
6. e2e（寫好、由 CI 跑）：`packages/web/e2e/audio.spec.ts`
   - `?demo=1` 按播放 → `document.querySelector('audio')` 的 `currentTime` 在 1.5 秒後推進且 `paused === false`
   - 斷言「音量不為 0 且元素未被靜音」：`el.volume > 0 && el.muted === false`
   - 若走接管：`AudioContext.state === 'running'`
   - 舞台模式下 `page.locator('[data-testid="volume-control"]')` 在 stage 內 count === 0（AppHome/settings 內 > 0）

驗收標準（全部要綠）：`pnpm lint && pnpm test && pnpm build && node scripts/check-bundle-size.mjs`；人工驗收：展示曲 + 使用者本機檔案（blob）+ YouTube 三條路徑都有聲、切歌/拖條/暫停後重播都有聲、iPhone 來電後恢復有聲、靜音再取消有聲、stage 裡看不到音量鍵。

---

## 4. 執行順序

1. **P0 保命**（獨立可上線，不含任何素材變動）：§2.1 graph 常駐 + resume 補強、§2.2 策略與 CORS 回退 → 「一定聽得到」+ 修 dev 模式。（改 4 檔、加 2 檔測試）
2. **P1 音量**：§2.3 拆 `volume`/`isMuted` + 污染資料自救迁移 + 只在 AppHome/Settings（stage 零 UI）+ 鍵盤 `↑/↓`。（改 5 檔、加 2 檔測試）
3. **P2 素材**：依你在 §0 選的 0/A/B/C 落地，讓真實頻譜可用（同網域或 CORS）+ 動 `vite.config.ts` 快取 + 更新 `localDemoSongs.test.ts`。
4. **P3 收尾**：§2.5 診斷、README/QUICKSTART 補「為何同網域」與授權說明、e2e `audio.spec.ts`。

## 5. 明確不做

- 不做 `/api` 音檔 proxy（Vercel 函式回應上限 4.5MB，長歌會炸）。
- 不在 `/player` 的 stage 分支加任何音量 UI（你的紅線；並用測試鎖住）。
- 不把音檔加進 PWA precache `globPatterns`。
- 不動 Spotify/YouTube 的播放路徑（只共用音量 derive 函數）。
- 不引入 ffmpeg／新執行期依賴。

## 6. 需要你拍板的 3 件事

1. 素材方案選 **0 / A / B / C**？（我推 B；若你先要能聽就 0 → A）
2. `/player` 非舞台模式（full 模式）**要不要**在播放列放音量？（stage 一定不放）
3. 若選 A/B：我 sandbox 連不到 `files.manuscdn.com`（只有 npm registry 通），**抓不到那 5 個 mp3**。你要 (a) 自己把檔丟進 `packages/web/public/audio/` 後告訴我，還是 (b) 我用指令碼自己合成示範音（可再散布、體積小、頻率内容可控）？
