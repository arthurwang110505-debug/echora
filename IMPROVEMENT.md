# Echora 改進建議

以目前 `packages/web` 的實際程式、產品定位（沉浸式歌詞舞台 PWA）與既有 ECH / REC 已完成範圍為準。下列項目**不是重做已完成的 UX 票**，而是下一階段真正能拉開產品差距的工作。

產品現況很清楚：未登入就能進舞台、YouTube 歌單與 Folia 視覺器都已能跑。接下來的瓶頸不在「再修一個按鈕」，而在**舞台是否真的跟音樂呼吸**。新手路徑維持「一鍵聽展示曲」；自己的歌走連接 YouTube，不要在第一次使用塞本機檔案。全螢幕維持精簡控制，把畫面留給歌詞。

---

## 總覽

| 優先 | 主題 | 為什麼現在做 |
|---|---|---|
| P0 | 讓舞台跟著音樂動 | 現在只是自己在擺，沒有真的聽歌 |
| P0 | 換上新 icon、收品牌 | 主畫面與頁首改用新的 E 波形標誌 |
| P0 | 全螢幕維持精簡控制 | 不要加音量／循環／隨機，以免擠壓歌詞 |
| P1 | 拆播放器巨石檔、拿掉 CustomEvent 匯流排 | `Player.tsx` 842 行，音訊控制靠 `window` 事件，難測也易回歸 |
| P1 | 持久化舞台偏好與歌詞偏移 | 每次進播放器都從 Classic／offset 0 開始 |
| P1 | 清理死碼與補 CI | `packages/mobile`、OBS／Navidrome 工具、無 GitHub Actions |
| P2 | iOS／PWA 真機、離線、無障礙 | 目前多半是 viewport 截圖驗收 |
| P2 | Spotify 要嘛接通，要嘛從行銷拿掉 | 鎖定來源仍佔 UI 與 README 篇幅 |
| P2 | 歌詞來源多樣化與每首歌校正記憶 | 目前幾乎只靠 LRCLib + 展示轉錄 |

建議節奏：**先讓舞台跟著音樂動，並把新 icon 換齊**，再做架構清理。不要同時開 Spotify SDK、雲端同步、本機檔匯入這類會讓新手變複雜的功能。

---

## P0｜先做這三件

講人話：第一次進來的人，按一下就能聽歌、看舞台。不要在這條路上加作業。

### 1. 讓舞台真的聽歌

現在舞台會動，但其實沒在聽音樂，只是自己按時間擺動。暫停了，光暈可能還在晃；鼓點來了，畫面也不一定有反應。

**要做的事：** 播展示曲時，讓畫面跟著音量、鼓點走。暫停就該安靜。

YouTube 那關做不到真的聽原聲（瀏覽器限制），歌詞對時就好，不要假裝它聽得到。

做完長這樣：播展示曲時，重拍一聲，舞台就亮一下。

---

### 2. 換上新 icon，品牌看起來是同一個產品

新標誌是發光的 E，左右帶波形。主畫面、瀏覽器分頁、加到手機桌面、頁首都該用同一張圖。播放器不要再出現舊專案的 `F`。

音樂庫若突然冒出英文小標，改成中文。Spotify 還沒開通，介紹裡就先別講得像已經能用。

---

### 3. 全螢幕維持精簡，不要加音量／循環／隨機

這不是漏做，是故意的。沉浸舞台要把畫面留給歌詞；再塞音量、循環、隨機，會壓縮歌詞、也會讓底部控制列變胖。

全螢幕維持現在這樣即可：返回歌單、上一首、播放／暫停、下一首、設定。

若以後真的要音量或循環，只放在「普通播放器」或設定頁，**永遠不要進全螢幕**。

新手要聽自己的歌：連接 YouTube Music，不要做「從這台裝置選檔案」。本機匯入對第一次使用太像功課，移出 P0。

---

## P1｜架構與可維護性

### 5. 拆開 `Player.tsx`，取代 `window` 事件匯流排

`Player.tsx`（842 行）同時負責：路由水合、OAuth modal、歌單 drawer、沉浸 Stage、進度條、歌詞校正、視覺器狀態、YouTube／本機分流。

音訊控制路徑是：

```text
playerStore.play() → window.dispatchEvent('echora:local-load')
                  → LocalAudioController 監聽 → HTMLAudioElement
```

這讓測試必須模擬 DOM 事件，Route 切換時也容易漏 unsubscribe。

**建議模組切分**

```text
pages/Player.tsx                  組裝
components/player/PlayerHeader.tsx
components/player/QueueDrawer.tsx
components/player/TransportBar.tsx
components/player/ImmersiveChrome.tsx
components/player/ConnectModal.tsx
playback/localAudioEngine.ts      Audio element + Analyser，單一模組
playback/youtubeBridge.ts         取代 youtube-* CustomEvent
```

Store 只發「意圖」（play / pause / seek），engine 訂閱 store 或透過 `PlayerContext` 注入，不要經過 `window`。

---

### 6. 把舞台偏好寫進 Zustand

現在這些都是 `Player` 的 `useState`，重整即消失：

- `activeVisualizer`、`backgroundMode`、`visualizerTunings`
- `lyricsOffsetSeconds`（切歌還會重設為 0）
- `autoVisualizer`、`displayMode`（`displayMode` 有進 store，視覺器沒有）

**建議**

- 全域記住：預設舞台、背景、音量、循環、reduced-motion（motion 已有）。
- 每首歌記住：歌詞 offset。key = `${source}:${id}`。
- CONTINUE.md 寫的「用 `VisPlaygroundSettingsPanel` 取代自製 tuning overlay」仍值得做，但排在頻譜與傳輸控制之後。

---

### 7. 清理倉庫，補上品質閘道

**死碼／重複**

- `packages/mobile`：完整 Expo app + 第二份 Folia visualizers，但 `pnpm-workspace.yaml` 已不包含它。要嘛刪除，要嘛移出 repo。現在它只會讓人以為還有原生 App。
- `packages/web/src/utils` 大量未接線模組：`navidromeScrobble`、`obsUrl`、`obsBrowserSource`、`audioEqualizer`、`chorusDetector`、`playerCap*`。若短期不用，移到 `packages/web/src/vendor/folia-unused/` 或刪除，避免之後誤接到半成品。
- `packages/web/types.ts` 與 `packages/web/src/types.ts` 各 1145 行，內容重複。

**CI（目前沒有 `.github/`）**

```yaml
# 建議最小 workflow
- pnpm install --frozen-lockfile
- pnpm --filter=@echora/web lint
- pnpm --filter=@echora/web exec tsc --noEmit
- pnpm --filter=@echora/web test
- pnpm --filter=@echora/web build
```

`turbo.json` 的 `test.dependsOn: ["build"]` 讓單測必須先 production build，本機與 CI 都會變慢。單測應獨立。

**PWA 快取**

- `vite.config.ts` 仍快取 `https://api.echora.example.com`，這個網域不存在。
- 展示 MP3／封面不在 precache，離線「開始體驗」會沒聲音。至少 CacheFirst 封面與展示音檔。

---

### 8. 歌詞管線

現況可用，但有明顯上限：

1. YouTube 曲目只打 LRCLib；失敗就 Soundscape。可加「上傳 LRC」當逃生門，比再接一個不穩定歌詞 API 安全。
2. `parseVTT` 假設 `mm:ss.mmm`，沒處理 `HH:MM:SS` 與 cue identifier。
3. `parseLRC` 忽略增強型逐字 LRC（`<mm:ss.xx>word`），Folia 舞台最需要的卻是逐字。
4. 展示日文轉錄在句中切開（例如 Blue Knot 的「遠迴りばかりして / 。ため息を…」），舞台會出現孤立標點。應以標點為界重切，而不是固定字數。
5. 歌詞 offset 不做 per-track 記憶，使用者每次都要重校。

LRCLib 請加超時、429 退避，以及「這次結果來自 LRCLib／本機檔／展示轉錄」的可見來源標記（本機展示已有，YouTube 還沒有）。

---

## P2｜平台、合規、成長

### 9. 真機與 PWA

文件已多次註記「未用真機」。下一輪請在實體裝置上只驗這幾條：

- iPhone Safari：加入主畫面、`start_url=/app`、背景切回後本機音檔仍能暫停。
- iOS 靜音鍵／Lock Screen：Media Session 的播放、暫停、切歌。
- YouTube：第一次播放必須由使用者手勢觸發（不要用自動化偽造）。
- VoiceOver：沉浸模式只有 5 個可聚焦控制（程式已朝這方向做，缺真機）。
- Android Chrome PWA：安裝提示、返回鍵關閉 drawer 而不是離開 `/player`。

PWA icon、180 PNG apple-touch-icon 與頁首 BrandMark 已改為新的 E 波形標誌。真機請再確認加到主畫面後的裁切。

### 10. Spotify 策略

程式已有 PKCE、playlist、Remote Play。未設 `VITE_SPOTIFY_CLIENT_ID` 時來源是鎖定卡，這點是對的。

問題在產品敘事仍把 Spotify 當現有功能。選一條：

- **A. 接通**：Dashboard 設 Redirect URI、Premium Web Playback SDK 做瀏覽器內播放（Remote Play 沒有裝置時使用者會以為壞了）。
- **B. 隱藏**：Landing、README、播放器來源列在未設定時不渲染 Spotify。保留程式，不當賣點。

在 A 完成前建議走 B。

### 11. 法務與 AGPL

- 上游是 AGPL-3.0。網路上提供服務時，使用者必須能取得**正在跑的那一版**完整對應原始碼。請在設定頁或頁尾放「原始碼」連到 GitHub 該 commit，不要只放 repo 首頁。
- `UPSTREAM_NOTICE.md` 指向 `../folia-major-main/.../LICENSE`，此 repo 裡沒有那條路徑，請改指根目錄 `LICENSE`。
- 展示轉錄歌詞需繼續標示非官方；若公開營運，最好換成作者授權的 LRC 或純音樂展示。
- OAuth 上線需要隱私權說明：存什麼 token、存在哪、登出清什麼。現在沒有。

### 12. 可觀測性

本機診斷 UI 已從設定頁拿掉。至少：

- 正式環境接 Sentry／類似服務，且**不要**把 token、歌詞全文、歌單名稱當 PII 送出。
- 自己看 Core Web Vitals（LCP／INP），不要再用「桌面截圖沒破版」當效能證據。
- `playerStore.subscribe → writePlaybackSnapshot` 在每次 `timeupdate` 都會 `localStorage.setItem`。改為 throttle（例如 2 秒）或 `visibilitychange`／`pause` 時寫入，減少主執行緒與閃存壓力。

---

## P3｜有餘力再做

- 本機檔 + 歌詞匯入：給想播自己 MP3 的人，藏在設定或音樂庫進階入口，**不要出現在新手首屏**。
- 音量／循環／隨機：若要加，只放普通播放器或設定，永不進全螢幕。
- 佇列：下一首插入、拖曳排序、從收藏加到目前佇列。
- 等化器 UI（`audioEqualizer.ts` 已有模型，接本機 Web Audio graph）。
- 鍵盤：`←/→` seek、`↑/↓` 音量、`F` 沉浸、`L` 循環。現在只有 Space。
- 可分享的舞台連結（歌曲 + 視覺器 + 主題），本機檔除外。
- `i18next` 已在依賴裡，App 文案卻寫死。若要英文使用者，抽 `zh-TW`／`en`，不要繼續中英混雜。
- 搜尋：來源切換已清 query，但收藏／最近播放沒有過濾。
- 把 `packages/core` 的 parser 與 `packages/web/src/utils/lrcParser.ts` 收斂成單一實作。

---

## 建議的 30 天順序

**第 1–2 週：讓舞台聽話、品牌一致**

1. 本機 `AudioContext` 頻譜 → Folia `audioBands`
2. 新 icon 用於 PWA、favicon、頁首（已接上）
3. snapshot 寫入改 throttle

**第 3 週：記住使用者的舞台**

4. 記住預設視覺器、背景、每首歌的歌詞校正
5. 展示 MP3 不要綁在單一第三方 CDN（可靠性，不是新功能）

**第 4 週：衛生**

6. 拆 `Player.tsx`，本機／YouTube 控制不再走 `window` 事件
7. 刪或隔離 `packages/mobile` 與未使用 utils
8. GitHub Actions 品質閘道
9. 修正 AGPL 原始碼入口與 Spotify 文案策略

---

## 刻意不做（除非產品方向改）

- 重寫 Folia 視覺器或再加第 12 種舞台。11 種已經夠，缺的是驅動它們的音訊。
- 非官方 YouTube 下載／Piped／Invidious。現有 companion 策略是對的。
- 收藏雲端同步。沒有帳號系統就不要做半套。
- Expo／React Native。README 已寫「不需要原生環境」，`packages/mobile` 不該復活。
- 在自動化環境假裝完成 YouTube 手勢播放。那是瀏覽器政策，不是 bug。

---

## 成功長什麼樣子

一個沒登入的人：加入自己的一首 MP3（或內建展示曲）→ 舞台的光暈跟著鼓點走 → 音量與循環都找得到 → 重整後還在同一首歌、同一個視覺器、同一段歌詞校正。

YouTube 使用者：歌單同步與歌詞舞台維持現況，且不會再被尚未啟用的 Spotify 干擾。

做到這三句，Echora 會從「Folia 的精美 demo」變成「可以天天用的歌詞舞台」。
