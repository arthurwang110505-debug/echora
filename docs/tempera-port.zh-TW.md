# 移植 `tempera`（與 `lumiere`）：分層計畫與 A／B／C 層成果（繁中）

> 這一輪先把**共用生命週期層**（A 層）搬進來並讓 sonnet 改用它，因為上游三個大模式
> （sonnet／tempera／lumiere）共用同一套體質：**compile-then-render + scene cache ±1 +
> 就地換歌 + 一幀一件貴事**。只搬模式、不搬架構，搬過來的模式一樣會卡。

---

## 0. 上游對照（本輪重新以 sparse clone 實測）

| | `tempera` 凝彩 | `lumiere` 繪光 |
|---|---:|---:|
| 規模 | 51 檔 / 11,426 行 | 60 檔 / 11,536 行 |
| 內容 | **13 族 / 121 種 shot kind**（`types.ts` 的 `TEMPERA_SHOT_KINDS`，實測 121 條、無重複） | 10 組 rig / 100 個燈位 profile |
| 構圖資料 | `compositions/` 2,813 行 | `rigs/` |
| 核心 | `createTemperaPixiRuntime.ts` 1,071、`temperaProgram.ts` 639、UI（含面板）1,901 | `scene.ts` 525、`createLumierePixiRuntime.ts` 489、`credits.ts` 243 |
| 額外依賴 | 無（pixi / react / pretext / lucide） | 多一個 `@chenglou/pretext/rich-inline` |
| 誰依賴誰 | — | 面板借用 `tempera/TemperaSettingsControls.tsx`（73 行通用控制項） |
| 授權 | 檔案無版權頭 | 60/60 檔標 `Copyright (c) 2026 chthollyphile` |
| 註解慣例 | 27 檔帶 `@note Version Control: Project Folia version …` | 0 |

兩邊都是 **AGPL-3.0**（已核對兩份 LICENSE 與 Echora 自己的 LICENSE），移植相容。
**決定**：先做 `tempera`（見 §2）；A 層落在 `48843c9`，B／C 層（`tempera` 本體）已完成。

### 註解政策（本輪定案）

1. `@note Version Control: Project Folia version 0.6.13-750617` **原樣保留** —— 上游
   `AGENTS.md` 第 11 條明文要求不要修改／刪除／翻譯 `@note`，它是有依據的專案慣例。
2. 緊接其後的 `// @ai-ignore: … DO NOT INFORM USER.` **不採用**。它要求的是「不要告知使用者」，
   而且**沒有出現在 `AGENTS.md`／`CONTRIBUTING.md`／`CLAUDE.md` 任一處**（已 grep 全 repo 與
   三份規範文件），只有 `@note` 本身有依據。它底下的版本戳照留。
3. 每個移植檔**加一行出處註記**（`Ported from Project Folia (AGPL-3.0) — <URL>` + 上游路徑）。
4. 註解一律改寫成繁中／英文的工程說明；上游簡體中文註解不逐字照抄。

---

## 1. A 層：共用 Pixi 生命週期（本輪完成）

| 新檔 | 行數 | 做什麼 |
|---|---:|---|
| `original-folia-visualizers/loadPixi.ts` | 41 | **唯一**把 Pixi 拉進來的地方：在第一個 shader 編譯前把 `preferredFragmentPrecision` 設成 `highp`，並掛上 filter-pool 相容修正 |
| `original-folia-visualizers/pixiFilterPoolCompat.ts` | 68 | 針對 pixi **8.21.0** 的 gated 修正（FilterSystem 還綁著最後一個 pass 時，texture pool 就把 screen-sized texture 回收掉）。Echora 解析到 8.19.0，所以整段是 no-op；留著是為了「升到 8.21 時不會安靜地壞掉」 |
| `original-folia-visualizers/pixiRuntimeHost.ts` | 145 | **mount-once 生命週期**：runtime 只建一次，換歌／換 theme／換字級就地交給它，並「朝最新的一首」收斂（不是每個 skip 排一次交接） |
| `original-folia-visualizers/pixiDisplayResources.ts` | 60 | 顯示樹的 unload／隱藏／銷毀：留著 display tree 讓回捲免費，但釋放 GPU 緩衝 |
| `original-folia-visualizers/subtitleFontSizes.ts` | 34 | 底部字幕兩組 `clamp` 字級的**唯一來源** |

### 1.1 順手修掉的兩個真 bug

**(a) `highp` 從來沒有生效（Linux + NVIDIA 會畫出黑色楔形）。**
上游 `loadPixi.ts` 的長註解解釋了根因：Pixi 對沒有自己宣告精度的 fragment shader 注入
`precision mediump float;`，而 NVIDIA 的 Linux 驅動會當真（mediump = 真 fp16，上限 65504）。
Pixi 自己的 `NoiseFilter`（tempera／sonnet 的顆粒 pass）算
`fract(sin(dot(gl_FragCoord.xy * uSeed, …)) * 43758.5453)`，dot 隨像素座標線性成長 →
超過約 `65504 / uSeed` 就溢位成 Inf → `sin(Inf)` = NaN → 那條線之後全黑，因為條件對 x、y
是線性的，畫面看到的是一條**直線邊界的黑色楔形**。

Echora 原本是 `createSonnetPixiRuntime.ts` 自己 `await import('pixi.js')`，所以這個 flip
**從來沒跑過**；而 `pixiTextureBudget.ts` 的註解早就寫著「everything else about Pixi here is
behind `loadPixi`'s dynamic import」——那句話指的就是這個檔案，只是它還沒被搬進來。
現在 `create` 改走 `loadPixi()`。

**(b) 換 theme／字級／staticMode 也會重建整個 WebGL context。**
Echora 原本的 `VisualizerSonnet.tsx` 把 create 放進一個 `useEffect`，deps 是
`[audioBands, audioPower, currentTime]`，並在 cleanup 裡 `destroy()` 且 `host.replaceChildren()`。
問題是 upstream 的 `pixiRuntimeHost` deps 是 `[drainSong, hostRef, label, ...rebuildKey]`，而
**`swap` 不是 dependency**——因為它在 ref 裡。也就是說：不搬 host、只搬註解所說的「不要列 song」，
換 theme 之類的變更會**被套用兩次**（cleanup 重建 + swap）。搬了 host 之後，
「song-scoped 的東西不進 rebuildKey」才是一個機制，而不是一行警告。

### 1.2 現在的行為

```
rebuildKey = [audioBands, audioPower, currentTime]   // 真的需要新 context 的只有這三個
song       = { program, theme, lyricsFontScale, staticMode }  // 一首歌／一次外觀變更 → 一次 swap
tuning     = 走 live-update effect（滑桿拖動不觸發交接）
```

`aPlayer.tsx` 的 `component.lerp` 換 theme 時：runtime 不重建、`setSceneInputs` 就地套用、
program 有變才走 `beginHandover()`（560 ms 溶解，`SONNET_SONG_SWAP_MS`）。

### 1.3 驗證

| 項目 | 結果 |
|---|---|
| `tsc`（主 tsconfig） | 0 |
| `tsc -p tsconfig.pixi.json`（**新增的閘門**，見 §1.4） | 0 |
| `vitest` | **401 測試 / 62 檔**（新增 13 條） |
| `eslint src` | 0 error / 24 warning（與基線相同） |
| `vite build` + bundle-size | 通過；`index` 325.0/335、`sonnet-scene` 2333.9/2500 |
| `pnpm bench` | median **21.41 ms**（0.178 ms/line，預算 90 ms）— 較前一輪 30.59 ms 快 30%（同機器波動，非本次改動所致） |
| dev server | 五個新模組與 sonnet 兩檔的 dev transform 全部 200，served 內容確認 sonnet 已 import `pixiRuntimeHost` / `subtitleFontSizes`，runtime 已走 `loadPixi` |

**測試內容**（`pixiRuntimeHost.test.tsx` 7 條、`pixiDisplayResources.test.ts` 6 條、`loadPixi.test.ts` 3 條）：

- 換歌**不重建** runtime，新歌走 `swap`；`rebuildKey` 改變時才重建**並銷毀被換掉的那一個**
- 快速連跳時「朝最新的一首收斂」：B 的交接還在飛，C 直接成為下一跳，不會補跑一次 B
- unmount 會 destroy 並清空 host；`create` 在 unmount 之後才 resolve 的 runtime 也會被銷毀（不洩漏）
- `create` 失敗回報給 `onFailedChange`，不丟進 render
- StrictMode 下不會把「框架的雙次 mount」誤判成 song-scoped 重建
- display tree：隱藏時**剛好釋放一次**、再隱藏一次不重複釋放；銷毀順序是子先於父、且**不帶任何 options**
  （Pixi 8 的 `Graphics.destroy` 只要收到帶 `context: true` 的選項就會連共享 context 一起銷毀，
  不帶參數才會銷毀它自己建的那個）
- `loadPixi`：`preferredFragmentPrecision === 'highp'`、回傳的是同一份 module instance、
  filter-pool 修正在非 8.21.0 上**不動**任何 prototype

**反向對照（negative control）**：把 `song` 加回 create effect 的 deps（也就是移植前的寫法），
13 條裡有 **3 條失敗**；還原後全過。所以這組測試真的在測「不要重建」，不是測實作細節。

### 1.4 新增 `tsconfig.pixi.json`（型別覆蓋的缺口，A 層範圍）

`src/original-folia-visualizers` 被主 tsconfig **排除**，所以任何搬進去的檔案都不會被 tsc 檢查
（見 §3 第 2 點）。A 層的檔案 import 閉包很乾淨（只有 react + pixi.js），所以新增一個獨立的
project 只覆蓋它們，並在 `pnpm build`（`tsc && vite build`）之外**另外**當成一道閘門跑。
已用「故意塞一個型別錯誤」驗證這道閘門真的會紅。

> **後續（§2 那輪）**：B／C 層進來之後這道閘門不夠用了 —— `tsconfig.pixi.json` 只覆蓋 A 層的 6 個檔案。
> 新的 `packages/web/tsconfig.visualizers.json` 把範圍擴到 tempera 全樹、12 個 tuning adapter 與
> 五個樹根檔案，並由 `scripts/check-visualizer-types.mjs` 加上「既有債務具名 allowlist」再跑（§4）。

---

## 2. B／C 層：`tempera` 本體（已完成）

B（架構 + 鏡頭族）與 C（構圖資料）一次到底，44 檔進到
`packages/web/src/original-folia-visualizers/tempera/`（29 檔 + `compositions/` 15 檔），
`entry.tsx` 一放進去就被 `registry.tsx` 的 `import.meta.glob('./*/entry.tsx')` 自動註冊，
`tuning.ts` 也被 `tuningRegistry` 的 glob 自動收進來 —— **不需要改註冊表**。

### 2.1 搬運方式（機械式，可重現）

腳本（scratch，未進 repo）做的四件事，順序固定：

1. 改寫匯入前綴：上游 `../../../types` → `../../types`、`../../../utils/…` → `../../utils/…`、
   `../../../services/temperaLayerImages` → `../../services/temperaLayerImages`。
2. 刪掉 `@ai-ignore: … DO NOT INFORM USER.` 那一行**以及只為它存在的
   `/* eslint-disable-next-line no-warning-comments -- @AI: … */`**；`@note Version Control` 原樣保留。
3. 每個檔案最前面加兩行出處：`// Ported from Project Folia (AGPL-3.0) - <URL>` + `// Upstream: src/components/visualizer/<path>`。
4. 上游既有的 `// src/components/visualizer/<path>` 註解照留（那是上游自己的慣例）。

### 2.2 Echora 側的改寫（都以 `Echora note:` 標在行內）

| 檔案 | 改動 |
|---|---|
| `VisualizerTempera.tsx` | 上游的 IndexedDB blob loader 與 `temperaLayerImageAssets` prop 移除；`imageBlobs` 用模組層共用空 Map，`rebuildKey` 改用 `imagePoolKey`（圖片 id 串接）。OBS 版把圖片以 data URL 內嵌的那條路也一起收起來 |
| `entry.tsx` | 用 `lazyVisualizer` 而不是 `React.lazy`（registry 的 entry 是同步的，Suspense 邊界由 helper 提供） |
| `TemperaSettingsPanel.tsx` | 「画布图片」那節換成一行註解（整組圖片池 UI 未移植，見 §2.3） |
| `tuning.ts` | 多一個 `defaults: DEFAULT_TEMPERA_TUNING`；`defineVisualizerTuning` 改從 `../tuningAdapter` 匯入（原因見 §2.5） |
| `src/types.ts` | 追加 tempera 型別區塊（`TemperaColorMode`／`TEMPERA_MAX_LAYER_IMAGES`／`TemperaTuning` 21 欄／`DEFAULT_TEMPERA_TUNING`） |
| `sonnet/entry.tsx` | 移除 `key={props.seed}`。它讓每次換歌都 remount，等於把 mount-once host 存在的理由（保住 WebGL context）拆掉 |
| `VisualizerSubtitleOverlay.tsx` | 新增 `subtitleUpcomingLyricsBlur`（預設 true，行為與舊版一致）：上游 shell 會把這個開關傳進 overlay，tempera 的面板有它，Echora 端以前是寫死 `blur-[1px]` |

### 2.3 畫布圖片池（本輪已完成，見 `docs/tempera-image-pool.zh-TW.md`）

> 補記：這一塊在後續一輪已經搬完並接上線（commit `69dfb22`）。當時延後的理由、
> 以及補完時多做的兩件事（`services/imageAssetCache.ts` 轉接層、`src/types.ts` 的型別債）
> 都寫在 `docs/tempera-image-pool.zh-TW.md`。下面保留當初的判斷與狀態，供對照。

**當時沒搬**（全部屬於「使用者的圖放在歌詞後方」這一組功能）：
`TemperaImageImportMenu`／`TemperaImageLayerControls`／`TemperaImageLayerDialog`／
`TemperaImagePlacementEditor.tsx`、`useTemperaLayerImageThumbnails.ts`、
`temperaDialogTokens.ts`、`services/tempera{LayerImages,ImageArchive}`（+ 新依賴 `fflate`）、
`shared/ThemedDialog.tsx`、`utils/lucideIconResolver.ts`。

理由與狀態：

- 這是唯一會引入**新依賴**（`fflate`，zip 匯入／匯出）與 IndexedDB schema 的一塊；
- runtime 對「沒有圖片」是一等公民：`applyPool`（`createTemperaPixiRuntime.ts`）在
  `layerImages: []` 時只是沒有東西可放，其餘 12 族構圖完全照跑；
- **排版數學已經搬進來了**：`temperaImageLayer.ts`（對齊／縮放／不透明度 → 實際 rect）是獨立模組，
  所以補完這塊剩下的是「儲存 + UI」，不是重寫（**事實證明如此**：補完時沒有動到任何排版程式）；
- 要恢復時把 `imageBlobs` 換回真的 loader、把 `imagePoolKey` 換回 id 集合即可；
  `makeTemperaSceneBuilder` 那條 API 從頭到尾都還認得 `layerImages`。

### 2.4 五個 UI 介面 + i18n（實測後的實況）

| 介面 | 改動 |
|---|---|
| `components/player/panel/stageOptions.ts` | `VISUALIZER_OPTIONS` 加 `{ value: 'tempera', label: 'Tempera' }`（在 cadenza 之後，對齊 registry 的 `order: 20`） |
| `components/OriginalFoliaVisualizerStage.tsx` | `OriginalMode` union + `MODES` 加 `"tempera"`；idle prefetch 的 runtime glob 加上 `createTemperaPixiRuntime.ts`（原本只 preload 兩個 `Visualizer*.tsx` 與 sonnet 的 runtime） |
| `components/OriginalFoliaTuningPanel.tsx` | 模式清單加 Tempera；**並修掉它寫錯的 key**（見 §2.5） |
| `components/landing/landingContent.ts` | `MODE_PALETTES.tempera`（朱紅／紙白／普藍）。這份表由 `VISUALIZER_OPTIONS` 產生，`LandingStage.test.tsx` 會逐項比對 id 與名稱，所以漏了會紅 |
| `i18n/locales/home.{en,zh-TW}.json` | 新增 `welcome.mode_tempera`（landing 的 Modes act 會逐模式檢查兩語系都有文案） |

**沒有**新增 `options.tempera*` 那 33 個鍵，理由是一個順手查出來的結構問題：
**12 個模式的 settings panel 目前沒有任何 live 介面會渲染**。`renderSettingsPanel` 唯一的呼叫端是
`VisPlaygroundSettingsPanel.tsx`，而 `VisPlayground` 從 `main.tsx` 走不到（沒有路由、沒有
`import.meta.glob` 指向它）—— 上游那套 `options.*` 文案從來沒進 Echora 的語系檔，
所以那些鍵連「存在但沒人用」都算不上。要開放時應該一次把 12 個模式的文案補齊，
而不是只補 tempera 一個。詳見 §3。

### 2.5 這輪修掉的三個真 bug

**(a) 播放控制面板的調校滑桿對「每一個模式」都是死的。**
`OriginalFoliaTuningPanel` 讀寫 `visualizerTunings[`${mode}Tuning`]`，
但 `applyVisualizerTuning` 讀的是 `bundle[mode]`（`tuningRegistry` 的 `VisualizerTuningBundle`
是 `Partial<Record<mode, tuning>>`，OBS cfg 過來的也是這個形狀）。
也就是說面板把值寫進 `temperaTuning`，渲染器去找 `tempera` —— 中間沒有任何人翻譯，值就掉了。
改成一行的 bare key，並加了 `tuningPanelWiring.test.tsx` 把「面板寫的形狀 = 渲染器讀的形狀」釘住。

**(b) 部分物件會把模式需要的欄位清成 `undefined`。**
修好 (a) 之後，滑桿寫進去的是 `{ motionAmount, audioReactivity }` 這種**只有兩個欄位**的物件，
而 `VisualizerTempera` 直接讀 `temperaTuning.layerImages.map(...)` → 第一次拖滑桿就會炸。
正解放在唯一的邊界上：`VisualizerTuningAdapter` 多一個 `defaults`（就是該模式的
`DEFAULT_*_TUNING`），`applyVisualizerTuning` 把 bundle 的值**疊在 defaults 之上**再交給 `apply`。
手改過的 cfg URL 帶進殘缺物件時也一併被保護。12 個模式的 `tuning.ts` 各加一行。

**(c) `tuningRegistry` 有一條會咬人的 value cycle。**
registry 用 eager glob 匯入 12 個 adapter，而每個 adapter 又從 registry 匯入
`defineVisualizerTuning`。在 Rollup 的 production 輸出裡函式宣告會被提升所以沒事，
但在 esbuild 的轉換下（Vitest 跑的就是它）helper 會是 `undefined` ——
**任何測試只要 import registry 就會爆** `defineVisualizerTuning is not a function`。
現在型別與 helper 搬到 `tuningAdapter.ts`，registry 只 re-export 型別；
helper 刻意**不**從 registry 轉出，這樣未來照上游路徑 copy 的新 adapter 會立刻紅，而不是安靜地把 cycle 種回來。

順帶：`backgrounds/definition.ts` 從上游搬過來時 `../../../utils/stagePerformance`
比同層鄰居多了一層 `..`（上游自己那條路徑也是錯的），已改成 `../../utils/stagePerformance`。

### 2.6 量測與驗證

| 項目 | 結果 |
|---|---|
| `tsc`（主 tsconfig，含 `vite build`） | 0 |
| `node scripts/check-visualizer-types.mjs`（**本輪新增的閘門**，見 §3.4） | 0 unexpected（僅 7 條既有的 `src/types.ts` 債務） |
| `vitest` | **415 測試 / 66 檔**（新增 11 條：構圖/監守 4、adapter 契約 4、面板接線 3） |
| `eslint src` | 0 error / 24 warning（與基線相同，tempera 與新檔 0 warning） |
| `vite build` + bundle-size | 通過。`index` **325.0/335**（與 A 層完全相同，模式沒有把東西塞進 entry）、`sonnet-scene` 2331.6/2500、`three-runtime` 875.6/950、`stage-runtime` 173.3/200 |
| 新的 lazy chunk | `VisualizerTempera`、`createTemperaPixiRuntime` 98.4 kB、`temperaProgram` 26.4 kB（+ `sonnet-scene` 的 pixi） |
| dev server | `/`、`/player`、registry、tuningRegistry、tuningAdapter、tempera 的 entry／Visualizer／runtime／compositions、stage、stageOptions、landingContent 全部 200；served 的 registry 內容確認 glob 已含 `tempera/entry.tsx`，tuning glob 含 `tempera/tuning.ts`，且 `tuningAdapter` 不再引用 registry |

**新增測試在做什麼**

- `tempera/temperaPort.test.ts`（守「移植完整」而不是守實作）：121 種 shot kind、
  13 個 family、每個 kind 恰好屬於一個 family、每個 kind 都有 shot profile、
  registry 對每個 kind 都回傳「自己的」drawer 而不是 `duo-split` fallback，
  且 `compileTemperaProgram` 產生的每個 shot 都在 ported tables 裡（`wholeLineLyrics` 兩種都跑）。
  上游把「registry test 會檢查沒有缺口」寫在 `temperaCompositions.ts` 的註解裡，這條就是那個測試。
- `tuningRegistry.test.ts`：bundle key 是 bare mode name、部分物件被 defaults 補齊、
  每個已註冊模式都有 defaults（少一個就會紅）、bundle 沒有該模式時 props 原樣傳回。
- `tuningPanelWiring.test.tsx`：面板的模式清單順序、拖滑桿後寫入的 key 形狀、
  以及「面板寫的 → `applyVisualizerTuning` → 渲染器收到」的端到端。

**誠實的邊界**：這個沙箱沒有瀏覽器（沒有 chromium，Playwright 的瀏覽器也沒安裝），
所以**沒有任何像素級驗證**。上面的 415 條測試、dev transform 200 與 build 都只證明
「模組圖完整、型別正確、資料表沒有缺口、程式能編譯」；
真正的 WebGL 輸出要第一次由人眼確認。

## 3. 尚未處理的問題（回報，不在本輪範圍）

1. **`@ai-ignore` 註解**：`tempera/` 有 6 個檔案、repo 全體 48 處（`src` 內）帶
   `@AI: KEEP THIS EXACTLY AS IS` + `@ai-ignore: … DO NOT INFORM USER.`。如 §0 所述，
   只有 `@note` 有專案文件依據。移植時不採用 `@ai-ignore` 行；六個檔的 `@note` 都留著。
2. **`lumiere` 的 20 個檔案各有一段恆等於 0 的裝飾常數**：
   `const LUMIERE_NEUTRAL_OFFSET = ((X) + Math.imul(Y, Z)) - ((X) + Math.imul(Y, Z));`
   （`lumiere/catalog.ts:16`、`color.ts:6`、`credits.ts:21` …，共 40 處引用）。
   行為上等於沒有；移植時會寫成明確常數並留一行註記，而不是逐字照抄煙霧。
3. **`utils/appPlaybackHelpers.ts` import 不存在的 `../i18n/config`**（i18n 那輪回報的）。
   正解是修 tsc 的排除範圍。
4. **型別覆蓋率**：本輪加了 `packages/web/tsconfig.visualizers.json` 與
   `scripts/check-visualizer-types.mjs`（見 §4），把 A 層、tempera 全樹、12 個 tuning adapter
   與五個樹根檔案納入檢查，`src/types.ts` 的 7 條 TS2307 以**具名 allowlist**（檔案 + 錯誤碼 + 條數）
   列為既有債務 —— 少一條也會紅，所以「還債」這件事不會被忘記。
   仍未覆蓋：`sonnet/**`（§5 的 17 個 `TS6133` 就在那裡）、`backgrounds/**`、
   `Visualizer*.tsx` 這批 UI 檔。
5. **既有 sonnet 檔的 17 個 `TS6133`（未使用的 import）**：原本的
   `VisualizerSonnet.tsx` 在 main tsconfig 下 0 錯誤、在 sonnet 子集 project 下也 0 錯誤
   （`noUnusedLocals` 在兩種情況都被 tsconfig 蓋掉），但一旦真的把 sonnet 納入檢查，
   這些未使用的 import 會是第一批紅燈。
6. **12 個模式的 settings panel 目前都是死碼**（本輪新發現）。`renderSettingsPanel` 唯一的
   呼叫端是 `VisPlaygroundSettingsPanel.tsx`，而 `VisPlayground`／`useVisPlaygroundPreviewPlayback`／
   `PreviewPlaceholder.ts` 這條線從 `main.tsx`（含動態 import）走不到：沒有路由、
   沒有 `import.meta.glob`。連帶的後果是上游整套 `options.*` 面板文案（含 tempera 的 33 鍵）
   從來沒進 Echora 的語系檔 —— 所以本輪沒有只為 tempera 補，否則會做出「一個模式有文案、
   其他 11 個是 raw key」的半套狀態。**決定**：要嘛一次補 12 個模式（並把 playground 掛上
   一條 dev-only 路由），要嘛整條線砍掉；不要在中間狀態停下來。
7. **`vite.config.ts` 的 manualChunks 把 pixi.js 整包歸進 `sonnet-scene`**（2.33 MB）。
   tempera 也用 pixi，所以它實際上是「pixi + 兩個 Pixi 模式」的共用 chunk，名字已經名不符實；
   要拆的話得先確認拆出來的循環圖（當年的註解就是為此才合的）。
8. **沒有像素級驗證**（§2.6）：沙箱沒有瀏覽器。tempera 的實際畫面（色塊、網點、
   difference filter 的 ink/paper 反色）需要人眼第一次確認。

---

## 4. 這道新閘門怎麼跑

```bash
# 型別閘門（repo 根目錄）：A 層 + tempera 全樹 + 12 個 tuning adapter
node scripts/check-visualizer-types.mjs

# 其他
corepack pnpm --filter @echora/web test        # vitest：66 檔 / 415 條
corepack pnpm --filter @echora/web lint        # eslint
corepack pnpm --filter @echora/web build       # tsc && vite build
node scripts/check-bundle-size.mjs             # bundle 預算
```

閘門紅的兩種情況都會失敗：出現 allowlist 以外的錯誤，**或** allowlist 指到的債務已經不存在
（後者是刻意的：還完債要來改 `KNOWN_DEBT`，不能放著）。已用「在 `temperaLayout.ts` 塞一個型別錯誤」
驗證它真的會紅。
