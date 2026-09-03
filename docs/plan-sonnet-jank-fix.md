# Sonnet 動畫卡頓修復方案（Plan）

> 範圍：`packages/web/src/original-folia-visualizers/sonnet/`（PixiJS v8.19 渲染器）
> 目標：消除段落切換 / 調參 / 視窗變化時的掉幀尖峰，並讓手機端穩定 60fps；不改動使用者在設定面板選定的畫面構成。

> **實作狀態（2026-09）**：Phase 1、2、4、5 已完成，且全部為**零視覺變化**的調度/生命週期最佳化：
> - Phase 1：場景建構拆成增量步驟（`startSceneBuild`/`stepSceneBuild`/`completeSceneBuild`），
>   ticker 以每幀 ≤4ms 時間配額在背景預建未來 15 秒的段落（`sonnetSceneSchedule.ts`），
>   seek/開播才走同步建構；每個 shot 建好後立即離屏 render 預熱文字 GPU texture（逐 shot 分攤）。
> - Phase 2：runtime 新增 `setTuning()` / `setVisualInputs()` 熱更新，React 端不再因調參/換主題銷毀
>   runtime；結構性變更改為背景增量重建（舊場景留著顯示直到新場景就緒，不會閃斷），滑桿拖動 120ms debounce。
> - Phase 4：resize 150ms debounce + 短邊 8px 門檻、分頁隱藏自動暫停 ticker。
> - Phase 5：已 settle 且無視差深度的字元跳過每幀 transform/alpha 寫入（tuning 變更時自動失效一次）。
> - Phase 3（compact 層級 / fps 自適應降載）**刻意未做**：它會在低幀時關閉色差/ghost 等裝飾、改變畫面，
>   依專案「行動端保留完整構成」原則保留為選配，待實機測量後再決定。
> 測試：新增 `sonnetSceneSchedule.test.ts`（6 個排程測試），全部 102 個單元測試通過，typecheck/lint/build 綠燈。

---

## 一、卡頓成因診斷（依影響排序）

### P0-1 場景建構同步發生在 ticker 內 —— 每次換段必卡
`createSonnetPixiRuntime.ts` 的 `renderFrame` 在 ticker 回呼中，於 `paragraphIndex` 變化時**同步**呼叫 `ensureScene()` → `buildSonnetScene()`：

- 每個 scene 為所有 shots 建立 Text／Graphics：**每個字元一個 `Text`**，且正文還附加 `caCyan`、`caRed` 兩個色差副本（各持一份 GPU texture），半英雄字再加 ghosts；
- 同時配置 halo BlurFilter、transition Blur／Glitch filter、post-process filter 與大量 AnimatedGraphics 指令；
- 換段當下新 scene 首次顯示，所有 Text 的 canvas texture **同時首次上傳 GPU**。

結果：段落進場轉場（使用者最注意畫面的時刻）正好撞上一幀 100～300ms+ 的主執行緒尖峰 → 肉眼可見的「頓一下」。
（`pruneScenes` 只保留 ±1 個段落，預建的 `paragraphIndex+1` 雖在建構當下存在，但首次渲染的 texture 上傳仍在顯示當下發生，且整段建構成本只提前一個區間。）

### P0-2 runtime 被 React effect 反覆銷毀重建
`VisualizerSonnet.tsx` 的建構 effect 依賴 `[currentTime, lyricsFontScale, program, effectiveSonnetTuning, staticMode, theme]`：

- `effectiveSonnetTuning` 是新物件（每次調整滑桿都變），`theme` 物件切換時也是 → **整個 Pixi Application destroy + re-init + 重建所有場景**，動畫瞬間閃斷；
- 事實上 runtime 每幀讀的都是 `this.options.*`，多數 tuning（強度、開關、post-process 滑桿）**根本不需要重建 runtime**，換引用即可。

### P1-3 手機 compact 性能層級是死碼
- runtime 已實作 `performanceTier: 'compact'`（停用 halo 色差／ghosts 等裝飾），但 `VisualizerSonnet.tsx` 寫死 `performanceTier: 'full'`；
- Diorama 正確寫了 `performanceTier={isCompactStage ? 'compact' : 'full'}`，Sonnet 沒接上；
- 沒有任何依據「實測 fps」自動降載的機制。

### P1-4 resize 整個場景快取全清
`resizeToHost()` 每次觸發都 `clearScenes()`（所有 scene 銷毀）再重建；手機上網址列收合、鍵盤彈出會連續觸發 ResizeObserver → 連續重建卡頓。

### P2-5 渲染管線固定成本偏高
- `antialias: true` + `textureResolution` 預設 1.5（桌面 4K 視窗 ≈ 1200 萬像素填充率）；
- halo 層每個 shot 常駐一個螢幕大小的 BlurFilter（offscreen pass）；
- 沒有 `document.visibilitychange` 暫停、沒有 fps 上限。

### P2-6 每幀熱點的小幅浪費
- `updateShot` 每幀對**已 settle 的所有字元**重算 alpha／scale／position／rotation（顯示期間值恆定）；
- 每幀新建閉包 `resolveFocusAtTime`、過濾陣列、`Math.max(...)` spread；
- 非可見 shot 雖已 early-return（OK），但 active shot 內全部 segment／glyph 都走完整分支。

---

## 二、修復方案（分階段，可獨立驗證與回滾）

### Phase 1｜場景建構移出 frame critical path（解決 P0-1，核心修復）

**1a. ticker 內禁止同步建場景，改為非同步預建佇列**
- `renderFrame` 偵測到段落變化時，只保證「當下要顯示的 scene 已存在」；不存在則沿用「上一個可見 scene」多顯示 1～2 幀（或顯示已快取的段落），不在 ticker 裡建構。
- 新增 `sceneBuildQueue`：每幀（ticker 開頭或 `requestIdleCallback`）以**時間配額（≤ 4ms/幀）**推進建構；建構本身拆成增量步驟：
  1. 建立 container／layer 骨架；
  2. 逐 shot 建立 MG（AnimatedGraphics 指令）；
  3. 逐 segment／glyph 建立 Text；
  4. 配置 filters。
- 提前量從「±1 段」放寬為「依時間前瞻」：播放中持續在背景預建**接下來 N 秒**（預設 12s，可調）會用到的段落，並在 seek 時清空佇列、以高優先級重建目標段落。
- 對 seek／開播等「必須立刻有畫面」的路徑，保留同步 fallback（才不會空白），但用 1b 把它的成本壓低。

**1b. 消除首次顯示的 GPU texture 上傳風暴**
- 場景背景預建完成後、進入可見視窗前，對其 Text 執行 warm-up：Pixi v8 中 `text.updateText(true)`（或對 container 做一次離屏 `renderer.render`）會先把字形光柵化並上傳 texture，讓真正顯示時零上傳。
- 色差副本 `caCyan/caRed` 與主文共用字形：評估改為**單一 Text + 兩個 tinted Sprite 複用同一 texture**（或 RenderTexture 烘焙一次），把字元 texture 數量從 3 倍降到 1 倍。

**驗證**：DevTools Performance 錄製換段時刻，主執行緒長任務（>50ms）應消失；換段 fps 曲線不掉幀。

### Phase 2｜tuning／theme 熱更新，停止銷毀 runtime（解決 P0-2）

- Runtime 新增 `updateOptions(patch)`：
  - `setTuning(tuning)`：直接換 `this.options.tuning` 引用。可見性類開關（showGuide／showFixedGeo…）目前已在每幀／建構時讀取——把「建構時決定可見性」的欄位移到每幀判斷（或在 setTuning 時只對**已快取 scene** 逐層調 visible，不重建）；
  - `setTheme(theme)`／`setFontScale()`：標記 scene 快取為 stale，**延遲到下次 idle／段落邊界**再逐場重建（搭配 Phase 1 的佇列），而不是當下銷毀整個 app；
  - `textureResolution` 變更才需要 renderer 層級處理（resize 時套用）。
- `VisualizerSonnet.tsx`：
  - effect 依賴移除 `effectiveSonnetTuning`、`theme`、`lyricsFontScale`、`staticMode`，改為獨立 effect 呼叫 `runtimeRef.current?.updateOptions(...)`；
  - runtime 建立依賴只剩 `program`（歌詞內容真正變化）與 host；
  - 設定面板滑桿拖動期間加 debounce（約 120ms）commit，進一步避免逐 tick 標記 stale。

### Phase 3｜接上 compact 層級 + 自適應品質（解決 P1-3）

- `VisualizerSonnet.tsx` 比照 Diorama：`performanceTier: isCompactStage ? 'compact' : 'full'`。
- compact 層級在 runtime 內落實（保留構成、降裝飾成本）：關閉 caCyan／caRed、ghosts、halo Blur 的 quality 調降、post-process filter 跳過。
- 新增**自適應降載**（沿用現有 `sonnetDebugState` 擴充一個輕量 fps 觀測器，ticker 內計算滑動均幀時間）：
  - 連續 ~1.5s 低於 50fps → 依序降：halo blur resolution/quality → 關色差副本 → `app.ticker.maxFPS = 30`（省電並穩定幀間距）；
  - 連續 ~5s 高於 58fps → 逐步恢復；
  - 降載狀態寫入 debug overlay，方便回報。

### Phase 4｜resize 與生命週期治理（解決 P1-4、P2-5）

- `resizeToHost` 加 debounce（~150ms）＋ 尺寸門檻（短邊變化 < 8px 忽略）；重建走 Phase 1 的增量佇列，而非當下 `clearScenes()`。
- `document.visibilitychange`：分頁隱藏時 `app.stop()`（目前只處理 `paused`），回到前景 `renderOnce()` 再 `start()`。
- 渲染設定：
  - 解析度沿用 `resolveFumeCanvasDpr` 的概念——Sonnet 也對 `textureResolution` 設上限（compact 裝置 1.25、桌面 1.5～2），大視窗不再 1.5x 爆填充率；
  - compact 層級預設 `antialias: false`（filter 已有 `antialias:'on'` 顧文字邊緣）。

### Phase 5｜每幀熱點瘦身（解決 P2-6，低風險微最佳化）

- `updateShot`：glyph 進入 `settleTime` 後（`glyphProgress >= 1` 且非 decoration、無持續動畫）**跳過** transform/alpha 寫入——僅在進入 settled 的那一幀寫一次最終值；decoration／有 `updateAnimation` 的字元照常更新。
- 迴圈不變數外提（`motion`、`camera`、tuning 布林開關），`resolveFocusAtTime` 閉包改為可重用函式＋參數，避免每幀配置。
- `trackSegments` 的 filter 結果在 scene 建好後快取到 `ShotView`，不每幀重算。

---

## 三、實作順序與風險

| 階段 | 檔案 | 預估收益 | 風險 |
|---|---|---|---|
| Phase 1 | `createSonnetPixiRuntime.ts`、`sonnetSceneBuilder.ts`（拆分 build 步驟）、`sonnetTextViewBuilder.ts`（texture 共用） | 換段卡頓消除（最大宗） | 中：seek／開播路徑需保留同步 fallback |
| Phase 2 | `VisualizerSonnet.tsx`、`createSonnetPixiRuntime.ts` | 調參／換主題不再閃斷 | 低～中：需確認每個 tuning 欄位的熱更新語意 |
| Phase 3 | `VisualizerSonnet.tsx`、`createSonnetPixiRuntime.ts` | 手機穩 60fps | 低 |
| Phase 4 | `createSonnetPixiRuntime.ts` | 手機網址列／分頁切換卡頓 | 低 |
| Phase 5 | `createSonnetPixiRuntime.ts`、`sonnetShotMg.ts` | 每幀 CPU 小幅下降 | 低 |

## 四、測試計畫

1. **單元測試**（擴充 `sonnetMotion.test.ts` 模式）：
   - 場景預建佇列：給定時間軸，斷言「可見時刻到來前 scene 就緒」、seek 後佇列重排優先級正確；
   - `updateOptions`：換 tuning 引用後 runtime 不重建（spy 驗證 builder 未被呼叫）、可見性開關生效；
   - fps 自適應降載狀態機的升降級門檻。
2. **Playwright e2e**（沿用 `e2e/`）：播放含 Sonnet 的曲目，用 CDP 收集長任務數量／丟幀數，斷言換段時刻無 >100ms 長任務。
3. **手動驗證**：手機（compact profile）實機播放 3 分鐘、拖動設定滑桿、切換主題、seek、旋轉裝置／收合網址列、切分頁再回來。
4. 現有測試（`sonnetMotion.test.ts`、`stagePerformance.test.ts` 等）須全數綠燈。

## 五、不做的事

- 不刪減任何視覺圖層（`resolveCompactSonnetTuning` 維持現狀的設計原則：行動端保留完整構成，效能靠排程與層級開關）。
- 不重寫 MG／排版演算法。
