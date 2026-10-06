# Echora 相對上游 Folia 缺什麼（繁中分析）

> 對照基準：`chthollyphile/folia-major` @ `master`（v0.7.13，2026-10-05）。
> Echora 現況：430 個檔案 / 約 77,000 行 TS·TSX；Folia：1,313 檔 / 256,765 行 → **Echora 約是上游的 30%**。
> 這份文件只談「缺口與優先順序」，上游本身的特色見 `docs/folia-upstream-specialities.md`。

---

## 0. 先講清楚 Echora 已經有的

避免把「缺」講得太誇張，以下是已經完成、而且品質不錯的部分：

- **11 / 14 個歌詞模式**：classic、cadenza、partita、fume、monet、cappella、pendolo、sonnet、claddagh、diorama、tilt。
- **6 / 6 種背景**：common、latent、monet、nomand、sora、url —— 與上游一致。
- **完整的共享層**：`VisualizerShell`、`runtime.ts`、`registry.tsx`、`settingsPanels`、`VisualizerHarmonyOverlay`、`VisualizerSubtitleOverlay`、`wordColoring`、`tuningRegistry`。
- **量測紀律的一部分**：`pixiTextureBudget.ts`（含測試）已移植。
- **AI 主題生成**：走 serverless proxy（`api/ai/theme.ts` + `services/agnesAi.ts`），金鑰留在伺服器端 —— 這點比上游要求桌面端設定金鑰更適合 PWA。
- **命令面板**：`components/player/CommandPalette.tsx` + `playerCommands.ts`，關鍵字同時含**繁中／簡中／拼音**，中文使用者友善度高。
- **歌詞來源**：lrclib、AMLL TTML 庫、QQ、酷狗（含 `qrcDecrypt` / `krcDecrypt` 逐字解密）。逐字格式這塊其實做得不錯。
- **播放體質**：`playback/audioRouting.ts` 對 CORS／blob 的音訊繞送規則有明確決策，避免「看起來在播但無聲」。
- **PWA**：安裝、離線 shell、Service Worker 快取策略（刻意不快取音檔以免破壞 Range/拖條）。

**結論：Echora 缺的不是「一堆功能」，而是三層結構性能力 + 幾個大型子系統。**

---

## 1. 導演級模式：缺 3 個模式 + 1 個圖層（約 23,000 行）

Folia 有 14 個模式，Echora 移植 11 個。缺的是：

| 缺的模式 | 規模 | 它是什麼 |
|---|---:|---|
| `tempera` 凝彩 | 11,426 行 / 50 檔（**核心已移植**，見 [`docs/tempera-port.zh-TW.md`](./tempera-port.zh-TW.md)；只差畫布圖片池） | 網點（screentone）MG 風 PV。**121 種 shot kind / 13 個家族**；用 difference filter 逐像素決定 ink/paper 反色；真的在色塊上挖洞露出背景層；≥1.2s 的間奏編譯成「bridge shot」讓器樂段一直在動；shot 之間沿 `flowAngle` 接力，切點讀起來是一個長鏡頭 |
| `lumiere` 繪光 | 11,536 行 / 60 檔 | 舞台燈光導演：體積光、煙霧、線稿「圖形組」、11 種燈架（astral／botany／caustic／optics／prism／stage／zenith…）；可把整首編譯成**單一無縫單元**（段落間走燈位交接，約 45–50 ms 建場景） |
| `still` 静止 | 115 行 | 極省資源的靜態模式（低階裝置／省電） |
| `videoLayer` | 1 個檔案 | 歌詞後方的影片圖層（搭配背景「完全空白」選項） |

### 但真正的缺口是「引擎架構」，不是這兩個模式

上游三個大模式（sonnet／tempera／lumiere）共用同一套體質：

1. **compile-then-render**：先把整首編譯成 shot program（段落／鏡頭／時間軸），渲染只讀絕對播放時間；— Echora **已有**（sonnet program）
2. **scene cache ±1**：只保留當前與相鄰段落；— Echora **已有**（sonnet scene cache）
3. **就地換歌**（`songHandover` + `pixiRuntimeHost`）：換歌不重建 WebGL；— **已完成** ✅
   （`pixiRuntimeHost` / `loadPixi` / `pixiDisplayResources` / `subtitleFontSizes` 已搬入，sonnet 已改用；
   `tempera` 本體（含 13 族 / 121 種 shot kind）也已移植並接上五個 UI 介面，
   見 [`docs/tempera-port.zh-TW.md`](./tempera-port.zh-TW.md)）
4. **一幀最多做一件貴的事**；— Echora **已有**

Echora 缺的正是這一層 —— 而這正是本次卡頓的根因（見 `docs/sonnet-diorama-stall-diagnosis.md`）。
**只搬模式、不搬架構，搬過來的模式一樣會卡。**

---

## 2. 舞台的「基礎設施化」：缺口最大，但 Echora 已有半套 scaffold

這是上游最被低估的價值：讓舞台可以被 OBS、直播、外部程式、剪輯軟體使用。

### 2.1 Stage API —— **上游有 7 端點；Echora 第一輪做了 7 個（少了點歌）**

上游（桌面端）在 `127.0.0.1:32107` 提供 Bearer token 的本機 HTTP API，共 7 個端點：

```
GET  /stage/health          GET  /stage/status
POST /stage/lyrics          POST /stage/session
POST /stage/player/search   POST /stage/player/play
GET  /stage/player/status
```

外部程式可推歌詞、推媒體 session、搜尋並點播；官方附一支 **B 站直播彈幕點歌**示範（`test/manual/bili-livesong/main.py`），以及一個 Quickshell／Waybar 狀態列歌詞外掛。

Echora 的狀況（**第一輪已完成**）：`packages/web/stage-server/`（無依賴 relay）+
`src/obs/`（overlay 端協定、傳輸、發布器）+ `/obs` 頁面 + 設定頁開關。
舊的 `utils/stageClientDemo.ts` 仍是無人使用的 scaffold —— 新的實作沒有沿用它的形狀
（它依賴數個從未被移植的模組，硬接會把壞掉的 import 拉進型別檢查範圍）。
端點少於上游：**沒有** `player/search` 與 `player/play`。

### 2.2 OBS 整合 —— **有整組 helper，但沒有頁面（dead scaffolding）**

Echora 內已存在這些檔案：

`utils/obsUrl.ts`、`utils/currentObsUrl.ts`、`utils/obsWebAppearance.ts`、`utils/obsCustomCss.ts`、`utils/webObsTarget.ts`、`utils/obsBrowserSource.ts`、`utils/playerCapMapping.ts`、`utils/playerCapSession.ts`、`types/obsBrowserSource.ts`

但是：

- 路由只有 `/`、`/welcome`、`/app`、`/player`、`/settings`、`/library`、`/privacy`、`/terms`、`/oauth/youtube/callback` —— **沒有 `/obs` 之類的頁面**；
- 只有單一 `index.html`（上游是 Vite 多入口，`ObsBrowserSourceApp` / `ObsNowPlayingSourceApp` / `ObsPlayerCapSourceApp` 各自有自己的 app）；
- `webObsTarget.ts`（「複製 OBS URL」按鈕的選源邏輯）**沒有任何 import 者**；
- `useSettingsUiStore` 甚至沒有 `enableNowPlayingStage` / `enablePlayerCapStage` / `playerCapHost` 這些欄位。

也就是說：**URL 產生器在、頁面不在、按鈕沒接線。**（第一輪補上了 `/obs` 頁面與設定頁接線；
新的 overlay 走 `src/obs/protocol.ts`，舊 helper 仍留著但**沒有被新程式碼引用** ——
要把 `src/utils` 併回型別檢查範圍時再一起處理。）
上游那個關鍵細節已經抄進來：OBS 頁面與主視窗不同源、讀不到它的 storage，
所以 overlay 能畫的東西必須**隨 config 一起下發**；`coverUrl` 例外，保留一般網址。

### 2.3 其他舞台輸出

- **透明 MOV 匯出**（alpha 通道，給剪輯軟體用；上游用一個 sample mod + main process 服務實作）—— 沒有。
- **Now Playing 服務整合**（`ws://localhost:9863/api/ws/lyric`）：Echora 的 `utils/nowPlayingSource.ts`、`utils/nowPlayingClock.ts` **0 個 import 者** —— 也是 dead scaffold。

---

## 3. 大型子系統（Echora 是 web-only，部分應該明確放棄）

| 子系統 | 上游規模 | Echora 現況 | 建議 |
|---|---|---|---|
| **Automix**（智慧過渡） | 26 檔 + 兩個 ONNX 模型（Beat This! 83 MB、htdemucs 108.6 MB） | 無 | **延後／放棄**。PWA 要下載近 200 MB 模型、還要 utility process 跑推論，成本與體驗都不合理 |
| **壁紙模式** | 三平台三套實作（Windows WorkerW + Rust helper、Linux wlr-layer-shell、macOS window level） | 無 | **放棄**。PWA 無法把視窗掛進桌面圖層，技術上不可行 |
| **Folium 模組系統** | 註冊表／事件匯流排／服務／internals、內容雜湊信任、官方簽名、模組市場 | 無 | **放棄或大幅簡化**。完整版需要 Electron 主程序權限；瀏覽器做不到「模組跑可信程式碼」 |
| **Sync server** | Cloudflare Workers／D1 + Docker + Node 三種部署 | `packages/core/src/sync/sync-client.ts` 存在，但檔案開頭就寫 **NOT YET WIRED INTO THE APP**、沒有後端 | **可做但優先度低**。scaffold 已留位置，補後端即可 |
| **本地音樂庫實體管理** | `localLibraryCatalogService`、entity repository／mutations、auto scan、folder ignore、V8 migration、playlist 檔 | 只有 `localLibraryIndex`、`localSongMetadata`、`localSongCover` 等基本讀取 | **中期**。目前能播本機檔案，但沒有「樂庫」層（實體合併／拆分、重掃、歌單檔） |
| **桌面端周邊** | 托盤、遙控窗、Discord presence、三個發布通道、AUR／Flatpak／Docker | 無 | **放棄**（非核心，且屬桌面殼層） |

---

## 4. 歌詞／資料 plumbing 的深度

- **詞級切分（明顯缺口）— 已完成第一輪** ✅：上游有 `wordSegmentation.ts`（`Intl.Segmenter` + 使用者為該首歌存過的細分詞），以及 **AI 切分**（`lyricSegmentation.ts` / `lyricSegmentationAi.ts` + `api/segment-lyrics`，桌面走 IPC、web 走自家端點，而且「幫我跑」與「給我 prompt 自己貼」共用同一個 prompt 模組）。
  Echora 原本 grep `wordSegmentation` = **0**，而且有**三份**各自為政的 `Intl.Segmenter` 呼叫（`sonnetSemantic.ts`、`cjkSemanticLayout.ts`、`localDemoSongs.ts`）—— 正是上游那個檔案開頭在講的狀況。
  現在：單一 `src/lyrics/wordSegmentation.ts`、per-song 的切分紀錄（AI／手動）、`api/ai/segment.ts` + 根目錄 `shared/segmentationPrompt.ts` 共用 prompt，以及掛在「歌詞資訊」面板上的 UI。
  實作與用法見 [`docs/lyric-segmentation.zh-TW.md`](./lyric-segmentation.zh-TW.md)。
- **線上來源覆蓋**：上游有 網易雲／QQ／酷狗／Navidrome／本地／波點(bodian)／Now Playing；Echora 有 Spotify／YouTube Music／lrclib／QQ／酷狗／AMLL。缺 **Navidrome** 與網易雲。
- **歌詞匯出**：上游有 `services/lyricExport`（含測試）；Echora grep `lyricExport` = **0**（有格式偵測與解析，但沒有匯出流程）。
- **逐字格式**：QQ(qrc)／酷狗(krc)／AMLL TTML 都有 —— 這塊 Echora 不缺。

---

## 5. 工程紀律（最容易被忽略，但決定「會不會再卡」）

| 項目 | 上游 | Echora |
|---|---|---|
| 單元測試檔 | **479** 個 | **47** 個（254 個測試） |
| 元件探針（/dev-probe.html） | **42** 個獨立 harness，一項難功能一個 | 0 |
| 量測 runner | `playwright.probe.config.ts`，**刻意單 worker**：「只有在機器不忙的時候，render count 才可歸因」 | 無 |
| 程式碼地圖 | `docs/CODEMAP.md` 由 TS 編譯器 + 模組圖**生成**、CI 比對；刻意只報**量級**（`512+`）避免每次檔案變動都產生無意義 commit；精確數字用 `ts-code-map` CLI／MCP 按需查 | 無 |
| AI 協作規範 | `AGENTS.md` + `skills/*/SKILL.md`（含 file-modularization、glossary 對齊、runtime guardrails） | 無 |
| 決策文件 | 每個模式一份「為什麼」的規格（`tempera/README.md` 幾乎是設計文件，含被否決的替代方案與接受的取捨） | `docs/` 5 份 |
| i18n 分區載入 | — | **已完成** ✅：原本兩個語系的全部文案都進 app shell（曾因此三次調升 `index` 預算：360 → 390 → 394 → 397 KiB）。現在 shell 只留自己會渲染的 41 條字串，其餘依路由分成 5 個 bundle 隨頁面載入，`index` 由 394.5 → **325.0 KiB**（預算下調 397 → 335 KiB）。見 [`docs/i18n-bundles.zh-TW.md`](./i18n-bundles.zh-TW.md) |

---

## 建議的優先順序

1. **引擎化 + 量測紀律**（體質，與模式數量無關）— **已完成第一輪** ✅
   compile-then-render、scene cache ±1、就地換歌（含 560 ms 溶解）、一幀一件貴事；加上可在真機
   開啟的 stage probe 與 `pnpm bench` 基準。
   實作與用法見 [`docs/stage-measurement.zh-TW.md`](./stage-measurement.zh-TW.md)。

2. **Stage API + OBS 頁面**（投報率最高）— **已完成第一輪** ✅
   relay（7 端點 + token + SSE）與 `/obs` overlay 頁面都在，
   傳輸有 relay 與同瀏覽器 channel 兩種，設定頁可開關並複製 overlay URL。
   架構與用法見 [`docs/stage-api.zh-TW.md`](./stage-api.zh-TW.md)。
   與上游的差異：**沒有** `player/search`、`player/play`（點歌需要回播放器的控制通道，尚未做），
   也**沒有**透明 MOV 匯出（上游靠 Electron 主程序）。

3. **詞切分（含 AI）+ 歌詞品質**（使用者最有感、工程量小）— **已完成第一輪** ✅
   單一 segmenter、per-song 切分紀錄、AI 切分（共用 prompt 模組）、面板 UI；
   sonnet／classic／partita 三個渲染路徑都會讀使用者的切分。
   尚未做：逐行編輯器（目前是文字列格式）、上游的 `lyricExport`。

4. **`lumiere`**（`tempera` 已完成：核心 + 構圖 + 面板 + 接線；`lumiere` 面板會借用
   `tempera/TemperaSettingsControls.tsx`，那 73 行已經在原位）
   兩者加起來 23,000 行，是上游「歌詞 PV 引擎」的真正核心。

5. **明確放棄**：壁紙模式、Folium、Discord／托盤（PWA 不可行或非核心）、Automix（模型體積與推論環境不合理）。

---

## 一句話總結

Echora 缺的不是功能數量，而是三件事：**（a）把渲染器當引擎而不是當元件**、**（b）把舞台當基礎設施而不是當頁面**、**（c）把效能決策當量測而不是當直覺**。
目前 Echora 已經有 13 個模式、6 種背景與一批相當完整的 helper —— 缺的是把它們串成上游那種「可以給別人用」的產品。
第 1、2、3 項（引擎化＋量測、Stage API＋OBS 輸出、詞切分＋AI）都已完成第一輪：
舞台現在**可以被外部工具用**、它的效能有數字可以查，而且**CJK 的排版切分可以由使用者或模型決定**。
第 4 項的兩個大模式也都進來了：`tempera`（13 族 / 121 種 shot kind，`f1f7f8b`）與
`lumiere`（100 個燈位 / 10 族，見 `docs/lumiere-port.zh-TW.md`）。
下一步是 `tempera` 刻意延後的那一塊：**畫布圖片池**（4 個編輯器／對話框 + `services/temperaLayerImages` + IDB + `fflate`）——
渲染端 `temperaImageLayer.ts` 已經在，缺的只有儲存與 UI。
