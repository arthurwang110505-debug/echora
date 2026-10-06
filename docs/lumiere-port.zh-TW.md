# 移植 `lumiere`（繪光）：60 檔全量搬運與量測（繁中）

> 一句話：`lumiere` 是上游三個大模式裡最複雜的一個（60 檔 / 11,536 行，10 族 × 10 個燈位），
> 這一輪把它**全量**搬進 Echora 並接上舞台。搬運不是手抄，而是**腳本化重寫 + token 級比對**：
> 註解與字串剝掉之後，每個檔案的 token 流與上游逐字相同，這件事有工具可以重跑驗證。
>
> `tempera` 已於 `f1f7f8b` 完成（13 族 / 121 種 shot kind），本文補完同一個計畫的第二個模式。
> `tempera` 的 A／B／C 層與三個真 bug 記在 `docs/tempera-port.zh-TW.md`。

---

## 0. 結果摘要

| 項目 | 結果 |
|---|---|
| 移植規模 | **60 檔 / 11,871 行**（上游 60 檔 / 11,536 行；+335 行是出處註記與 `Echora note:`） |
| 資料 | `LUMIERE_PROFILES` **100 個**（10 族 × 10 燈位）、`LUMIERE_KINDS` 100 個不重複 |
| 轉場 | 3 種（`lights-out` 熄燈 / `flare-cut` 閃白 / `focus-pull` 拉焦），各有 `resolveFrame` 與 `enterClamp` |
| 上游依賴 | pixi.js、react、`@chenglou/pretext`（`rich-inline`）、lucide — **沒有新增任何依賴** |
| 授權 | AGPL-3.0，60/60 檔帶 `Copyright (c) 2026 chthollyphile`，每檔加一行出處註記 |
| 註冊 | `mode: 'lumiere'`、**`order: 25`**（緊接 tempera 的 20）、`labelKey: 'ui.visualizerLumiere'`、預設字「繪光」、`usesWordSegmentation: true` |
| 閘門 | 型別閘門 passed（7 條既有 `src/types.ts` 債務）、**68 檔 / 427 測試**、eslint 0 error、build + bundle-size 通過 |

---

## 1. 檔案組成

| 目錄 | 檔數 / 行數 | 內容 |
|---|---:|---|
| `light/` | 7 / 1,692 | 光束（`rig.ts`）、十字爆閃、bloom filter、螢塵、光雪、光場 shader |
| `rigs/` | 11 / 1,961 | 10 族燈位 + `base.ts`：天光、窗隙、稜鏡、焦散、光路、衍射、葉脈、星象、追光、螢塵 |
| `lineart/` | 5 / 1,695 | 線稿（`lineArt.ts`）、圖解、lucide 圖示路徑、圖示配方、主題圖示 |
| `text/` | 9 / 2,581 | 文字視圖：`glyphLine`、`keywordColors`、`lineClearance`、`lineWrap`、`lyricEcho`、`lyricWindow`、`reveal`、`windowLines`、`wordStyle` |
| 樹根 | 29 | 執行期（`createLumierePixiRuntime.ts`）、`program.ts`、`scene.ts`、轉場、credits、設定面板、`entry.tsx`、`types.ts` |

`scene.ts` 的段落 → 鏡頭（shot）編譯、`program.ts` 的時間軸鋪法、`createLumierePixiRuntime.ts`
的方法面（`swapSong` / `setTuning` / `setShowText` / `setStaticMode` / `setAudioSources` /
`setSongMetadata` / `setPaused` / `renderOnce` / `destroy`）都與上游一致 ——
Echora 端的 `pixiRuntimeHost.ts`（A 層）就是照這個介面寫的，所以兩個模式共用同一條生命週期。

---

## 2. 搬運方式：腳本化，可驗證

手抄 60 檔會漂；所以 `lumiere` 是用一支腳本（`port-lumiere.mjs`）重寫出來的，每一步都可重跑：

1. 走訪上游 `src/components/visualizer/lumiere/**`；
2. **重寫 import 路徑**：把 specifier 對上游佈局解析成絕對目標，再映射到 Echora 的位置
   （`src/types`、`src/utils/**` 留在原地；`src/utils/lyrics/wordSegmentation` → `src/lyrics/…`；
   其他 `components/visualizer/**` → `original-folia-visualizers/`），最後重新輸出相對路徑
   **並斷言目標檔存在**（在移植樹內的目標例外，因為它們由同一趟寫出來）；
3. **去掉死運算式**（見 §3.2）；
4. **簡轉繁**（只碰註解與字串，見 §4）；
5. 寫檔，開頭固定加出處註記。

執行結果：`ported 60 files, 269 imports, 20 identity constants`。

### 2.1 這支腳本自己踩到的三個坑

| 坑 | 症狀 | 修法 |
|---|---|---|
| **用檔案深度推算 `../` 前綴** | 固定改寫（`../../../types` → `../../types`）只對 32 個頂層檔正確；改成用深度算（`SRC_LEVEL ? 2 : 1`）又把子目錄弄壞：`light/crossBurst.ts` 指向 `../../lumiereRandom` | 只能**語意化**：解析絕對目標 → 映射 → 重算相對路徑 → 斷言存在。已寫進腳本，重跑會自己檢查 |
| **路徑映射多補一個斜線** | `lumiere//createLumierePixiRuntime`：對已經在 `lumiere/` 內的目標又接了 `/`，存在性檢查直接失敗 | 映射改用 `resolve()` 後 `replace(/\/+/g,'/')`，並對樹內目標跳過存在性檢查 |
| **改寫器重建分隔符號** | 用 `push`/`flush` 狀態機重建程式碼，把 `//` 變成 `/`、引號整個掉光 | **分隔符號一律原樣附加**，不用重建。這個坑的代價是：任何批次改寫都要先 diff 樣本檔、再 diff 全樹 |

### 2.2 驗證：token 級比對

`verify-structure.mjs` 把上游與移植檔的註解／字串剝掉之後比對 token 流，結果是
**「code token streams identical for every file」**。這是「搬運沒有走味」的證據；
所有 Echora 的改動都必須是**能被這支工具容忍的形式**（新增註解、改字串內容、替換死運算式），
而不是改邏輯。另一支 `diff-literals.mjs` 逐字串列出差異，用來確認改的都是預期的那幾個。

---

## 3. Echora 側刻意改掉的三件上游事

### 3.1 20 個檔案裡的恆等於 0「裝飾常數」

上游 20 個檔案開頭都有這段（以 `overlay.ts` 為例）：

```ts
// 画框线段的尺度参考。
const lumiereScaleMask = globalThis.devicePixelRatio | 0;
const LUMIERE_NEUTRAL_OFFSET = ((0x8f259e5f ^ lumiereScaleMask) + Math.imul(0xe562ea44 ^ lumiereScaleMask, 523 ^ lumiereScaleMask))
    - ((0x8f259e5f ^ lumiereScaleMask) + Math.imul(0xe562ea44 ^ lumiereScaleMask, 523 ^ lumiereScaleMask));
```

`X - X` **恆等於 0**，而 `lumiereScaleMask` 只餵給它 —— 也就是說這段讀了
`devicePixelRatio` 卻不影響任何輸出，下游用到的永遠是 `0`（`catalog.ts` 的
`LUMIERE_PROFILES[0 + LUMIERE_NEUTRAL_OFFSET]`、`color.ts`、`credits.ts` …）。

移植時**整段換成下面兩行**，並在行內留一段 `Echora note:` 說明為什麼可以這樣做：

```ts
const LUMIERE_NEUTRAL_OFFSET = 0;
```

腳本同時**硬性斷言** `lumiereScaleMask` 沒有在別處被引用（`throw`），
所以「其實有別的地方在用」這種事不會安靜地發生。共 20 處。

### 3.2 `text/lyricWindow.ts` 的兩個未使用型別 import

上游在該檔 import 了 `Graphics` 與 `Sprite` 兩個 **型別**卻沒用到（實際都走
`pixi.Graphics` / 子節點的 sprite）。Echora 的閘門開了 `noUnusedLocals`，
所以拿掉並留註記；**沒有任何執行期差異**。

### 3.3 `React.lazy` → `lazyVisualizer`

上游 `entry.tsx` 直接 `React.lazy(() => import('./VisualizerLumiere'))`；
Echora 的模式一律走 `lazyVisualizer`，它補上 registry 需要的 Suspense 邊界
（registry 的 `render` 維持同步）。這是唯一一處影響模組圖的改動。

---

## 4. 簡繁政策：量測而不是推測

上游全是簡體中文。Echora 是 zh-TW，所以註解與字串要走一次 cn → tw，但**轉換不能碰資料表**。

| | 數字 |
|---|---:|
| 上游會被 cn→tw 改到的**註解行**（`//` 445 + 區塊註解 750） | **1,195** |
| 上游會被 cn→tw 改到的**字串實字** | **59**（大部分是 100 個燈位 profile 的 `label` 與族名／族說明） |
| 重寫的 import specifier | **53** |
| 移植後**整棵樹**再跑一次 cn→tw 還會變的行 | **2**（下面兩條，都是刻意留的） |

兩條刻意不轉的：

1. `text/glyphLine.ts:49` 的 **CJK 碼位範圍 regex 實字**（`UPRIGHT`）。轉換器**從不進入 regex 實字**
   —— 改了會直接改變「哪些字算直排 CJK」的判定，也就是排版結果。
2. `text/wordStyle.ts` 的 `FUNCTION_WORDS`（哪些單字要縮小）。這是一張**單字**表，
   而 cn → tw 對單字是**新增**不是取代：直接轉會讓 `它们` 變成 `它们們`，
   同一個詞的兩種寫法都留在集合裡。所以改成**明列兩套字**並留註記：

   ```ts
   const FUNCTION_WORDS = new Set(Array.from(
       '的了在把是我你他她它们們和与與也就都着著过過吗嗎呢吧啊呀哦被让讓给給从從向到这這那之而又很'
   ));
   ```

   理由：歌詞可能以任一種字型被標註；只留一套會在另一套上**安靜地不再縮字**。
   腳本對此有硬性檢查：它必須看到「轉換後的上游字串」，否則 `throw`。

> 這裡要更正一個先前的假設：原本以為要**保留** 20 個燈位 `label` 與
> `lumiereTransitions.ts` 的 `LABELS`（熄燈／閃白／拉焦）為簡體，實際上**全部都轉成繁體了**
> （例：`波叠`→`波疊`、`圣环`→`聖環`、`余烬`→`餘燼`），整個移植樹只剩上面那兩行是刻意的例外。
> 資料表沒有轉的只有 `FUNCTION_WORDS`（改成雙字集），以及結構性的 CJK 判斷 regex。
> 另外註解裡有一處 `浮点游标` → `浮點游標`：opencc 的詞典是**詞組**優先
> （`浮点游标 → 浮點游標`），所以 `游` 保留 —— 這正好也是台灣的標準寫法。

---

## 5. 掛載：`order 25` 與四份清單

| 位置 | 改動 |
|---|---|
| `original-folia-visualizers/lumiere/entry.tsx` | `defineVisualizer({ mode:'lumiere', order:25, labelKey:'ui.visualizerLumiere', labelFallback:'繪光', previewSeed:'lumiere', tuningKind:'lumiere', usesWordSegmentation:true })`；**刻意不吃 seed**（換歌就地交接，不重開 WebGL context） |
| `src/types.ts` | `lumiere` 調校區塊：`LumiereTuning` 與 `DEFAULT_LUMIERE_TUNING` |
| `definition.ts` | `VisualizerTuningKind` 加 `'lumiere'`；`VisualizerSharedProps`／`VisualizerSettingsPanelProps`／`VisualizerSettingsResetProps` 各補該模式的欄位 |
| `tuningAdapter.ts` | 加 `LumiereTuning` 映射（`tuning.ts` 只提供 `defaults` 與 helper，避免與 registry 的值循環） |
| `components/player/panel/stageOptions.ts` | `VISUALIZER_OPTIONS` 加 `{ value: 'lumiere', label: 'Lumiere' }`（在 tempera 之後） |
| `components/OriginalFoliaVisualizerStage.tsx` | `OriginalMode` 加 `"lumiere"`、`MODES`、`STAGE_RUNTIME_CHUNK_LOADERS`（idle 預取） |
| `components/OriginalFoliaTuningPanel.tsx` | 快速調校面板的模式列（本輪改成共用清單，見 §6） |
| `components/landing/landingContent.ts` | 繪光色盤 `['#e8c88a','#101014','#f3ddb0']` |
| `i18n/locales/home.{en,zh-TW}.json` | `welcome.mode_lumiere` |

`src/utils/lucideIconResolver.ts`（52 行）是新的小工具：上游在 `lineart/` 直接抓 lucide 的圖示，
Echora 這邊集中成一個 resolver，讓 `iconPaths.ts` / `themeIcons.ts` 不必各自碰套件內部結構。

「模式清單要同步的地方」現在是**四份**（picker、面板、stage union、idle 預載），
所以本輪新增 `stageModeWiring.test.tsx` 把它們釘住（見 §6）。

---

## 6. 這輪抓到的真 bug：快速調校面板的模式清單漂移

`OriginalFoliaTuningPanel.tsx` 原本**自己又抄了一份** 12 個模式的清單。
加上 `lumiere` 之後，picker 是 13 個、面板還是 12 個 —— 使用者看到的是
「快速面板的左右箭頭走到某處就跟畫面名稱對不上」，而**不會有任何錯誤訊息**
（`OriginalFoliaVisualizerStage` 與 `getVisualizerRegistryEntry` 都安靜地 fallback 到 `classic`）。

修法：面板改成從 `stageOptions` 匯入 `VISUALIZER_OPTIONS` / `BACKGROUND_OPTIONS`（單一來源），
並新增 `stageModeWiring.test.tsx`（jsdom，4 條）守住：

- picker 與 registry 的**集合相等**、picker 沒有重複；
- 每個 registry 條目都有自己的 `labelKey` / `labelFallback` / `previewSeed`，而且**有 tuning adapter**；
- registry 以 `order` 排序；並且**明確記錄** picker 從第 7 個之後刻意不照 `order`
  （`order` 是上游跨模式排序，使用者看到的 picker 一直是手排的）—— 沒有「順手修好」，
  因為那會同時打亂 picker、箭頭與 landing page；
- 兩個已移植模式都必須能穿過共用外殼渲染（`renderToStaticMarkup`，不碰 WebGL）。

寫這條測試時的另一個實測：lazy wrapper 在 SSR 下是**空字串**，所以測試直接渲染
`tempera/VisualizerTempera` 與 `lumiere/VisualizerLumiere`；而且共用字幕覆蓋層顯示的是
**最接近 `currentTime` 的那一行**，不是第一行 —— 斷言因此對準當下那一行。

---

## 7. 量測與驗證

| 項目 | 結果 |
|---|---|
| 移植腳本 | `ported 60 files, 269 imports, 20 identity constants` |
| 結構驗證 | `verify-structure.mjs` → **code token streams identical for every file** |
| 型別閘門 | `node scripts/check-visualizer-types.mjs` → **passed**（7 條既有 `src/types.ts` 債務） |
| 測試 | **68 檔 / 427 條**（新增 `lumiere/lumierePort.test.ts` 8 條 + `stageModeWiring.test.tsx` 4 條） |
| eslint | **0 error / 24 warning**（與基線相同） |
| build | `VisualizerLumiere` **4.13 kB**、`lumiereRuntimeTuning` 79.13 kB、`createLumierePixiRuntime` 101.14 kB，三者都是 lazy |
| bundle-size | 通過：`index` **325.0/335（未變動）**、`sonnet-scene` 2335.8/2500（lucide 落在這裡）、`stage-runtime` 173.3/200、`three-runtime` 875.6/950 |
| dev server | `/`、registry、tuningRegistry、`stageOptions`、面板、`lumiere/VisualizerLumiere`、`lumiere/createLumierePixiRuntime` 全部 200；served 的 registry glob 已含 `lumiere/entry.tsx` |

**`lumierePort.test.ts` 守什麼**（守「移植完整」，不守實作）：

- 100 個燈位、10 族各 10 個，`LUMIERE_KINDS` 100 個不重複；
- 每個 kind 都拿到**自己的** profile，而不是 fallback（`profileOf` 的 fallback 是
  `LUMIERE_PROFILES[0]` = `zenith-shaft`，所以「唯一無法與 miss 區分」的那個 kind 必須是 `LUMIERE_KINDS[0]`）；
- 每個 profile 都可渲染（label / 光型 / 線稿 / region / heroSize / rig factory，且不碰 Pixi 就能呼叫）；
- 3 種轉場各自 `resolveFrame` 都回傳有限值，`duration(gap)` 有上下限；
- 歌詞歌曲編譯出的段落，每個 shot 都是真實 rig；純演奏曲不會**發明**歌詞行；
- 任意時間都能找到段落（超出範圍會 clamp）；
- 死運算式真的被移除（`lumiereScaleMask` 不再出現）。

**誠實的邊界**：沙箱沒有瀏覽器（沒有 chromium），所以**沒有任何像素級驗證**。
上面所有測試、dev transform 200 與 build 只證明「模組圖完整、型別正確、資料表沒有缺口、程式能編譯」；
繪光的實際畫面（光束體積感、bloom、霧、文字被光照亮）要第一次由人眼確認。

---

## 8. 尚未處理 / 刻意延後

1. **`tempera` 的畫布圖片池還沒搬**（下一步）。缺的是四個編輯器／對話框
   （`TemperaImageImportMenu` / `ImageLayerControls` / `ImageLayerDialog` / `ImagePlacementEditor`）、
   `useTemperaLayerImageThumbnails`、`temperaDialogTokens`、`shared/ThemedDialog`、
   `services/temperaLayerImages` / `temperaImageArchive` 與 `fflate` 依賴，以及 IDB 存放。
   **注意**：`temperaImageLayer.ts`（渲染端）已經在 B 層搬進去了，所以剩下的只有**儲存 + UI**。
   `options.tempera*` 的文案也還沒加，理由與 tempera 那輪相同（設定面板整條線目前是死碼）。
2. **沒有像素級驗證**（§7）：繪光的實際輸出待人工確認。
3. **`vite.config.ts` 的 `manualChunks`** 仍然把整包 pixi 歸進 `sonnet-scene`
   （現在是「pixi + 3 個 Pixi 模式」的共用 chunk，名字名不符實）。
4. **`src/types.ts` 的 7 條 TS2307**、`sonnet/**` 等型別覆蓋缺口、`visualSettingsConfig.ts` 死碼：
   與前一輪相同，仍列在閘門的 allowlist／待辦裡。
5. 上游整體約 430 檔 / ~77k 行，Echora 目前約 30%；`tempera` 與 `lumiere` 是其中兩個大模式。

---

## 9. 怎麼重跑

```bash
# 型別閘門（repo 根目錄）：A 層 + tempera + lumiere 全樹 + 13 個 tuning adapter
node scripts/check-visualizer-types.mjs

# 其他
corepack pnpm --filter @echora/web test        # vitest：68 檔 / 427 條
corepack pnpm --filter @echora/web lint        # eslint
corepack pnpm --filter @echora/web build       # tsc && vite build
node scripts/check-bundle-size.mjs             # bundle 預算
```

移植腳本與驗證工具（`port-lumiere.mjs`、`verify-structure.mjs`、`diff-literals.mjs`）
在這一輪是放在工作目錄外的暫存區（`/tmp/s2t`），**不在 repo 裡**：
它們是一次性的重寫工具，不是產品的一部分。要再搬一個模式，請照 §2 的流程重寫一支，
不要沿用這支的硬編碼路徑。
