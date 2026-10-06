# 移植 `tempera` 的畫布圖片池（繁中）：儲存、UI，以及它順手還掉的一筆型別債

> 這是 `tempera` 移植（`f1f7f8b`）刻意延後的最後一塊。**19 個檔案**，其中 18 個是上游原文
> （token 級比對過），1 個是新的轉接層；再加 22 條上游自己的測試。
> 結論先講：**圖片池現在是活的** —— 在播放器的快速調校面板裡，只有 `tempera` 會出現。

---

## 0. 成果摘要

| 項目 | 結果 |
|---|---|
| 移植檔案 | **19**（4 個池 UI + 2 個 service + 2 個 zip 格式/封存 + 3 個工具/共用 + 3 個上游測試 + 3 個型別模組 + 1 個新轉接層） |
| 新增依賴 | **`fflate`**（zip 匯入／匯出；上游用的就是它） |
| 新程式碼 | `services/imageAssetCache.ts`（IndexedDB，三個操作，~100 行） |
| 測試 | 上游的封存測試 13 條 + 檔名規則 5 條 + status store 4 條 = **22 條** |
| 閘門 | 型別閘門 **0 error（allowlist 清空）**、71 檔 / 450 測試、eslint 0 error、build + bundle-size 通過 |
| Chunk | 圖片池自成一塊 lazy chunk（`TemperaImageLayerControls-*.js`），entry 裡沒有 `fflate` |

---

## 1. 搬進來的是什麼

| 檔案 | 行數 | 做什麼 |
|---|---:|---|
| `tempera/TemperaImageLayerControls.tsx` | 506 | 面板上的摘要列：預覽縮圖、加入／匯入／匯出、開啟對話框。**編輯是草稿，關閉時才寫回 tuning** |
| `tempera/TemperaImageLayerDialog.tsx` | 370 | 對話框本體（`createPortal`）：清單、拖放、保存、忙碌狀態 |
| `tempera/TemperaImagePlacementEditor.tsx` | 216 | 九宮格對齊編輯器 + 縮放／不透明度 |
| `tempera/TemperaImageImportMenu.tsx` | 108 | 「追加／取代」兩種匯入的下拉 |
| `tempera/useTemperaLayerImageThumbnails.ts` | 54 | 從 IndexedDB 取得縮圖並轉成 object URL（含 revoke） |
| `tempera/temperaDialogTokens.ts` | 77 | 對話框色票（portal 在外層，`--text-*` 變數在那裡解析不到） |
| `services/visualizerImageAsset.ts` | 45 | 單張圖的存／取／清 + 支援格式判斷 |
| `services/temperaLayerImages.ts` | 118 | 圖片池的 key 命名、準備（縮放／轉檔）、上限 |
| `services/temperaImageArchiveFormat.ts` | 123 | zip 內的清單格式與路徑 |
| `services/temperaImageArchive.ts` | 222 | 匯出／匯入 zip（含中止回復、id 重鑄、上限截斷） |
| `utils/downloadFileName.ts` | 41 | 下載檔名淨化 + 本地日期戳 |
| `store/useStatusMessageStore.ts` | 42 | 全 App 的訊息通道（zustand + 模組級 emitter） |
| `components/shared/ThemedDialog.tsx` | 113 | 對話框外殼（動畫、關閉鈕） |
| 上游測試 3 檔 | 388 | 封存 13、檔名 5、status 4 |

**關鍵設計**（上游的，值得記下來）：圖片的 blob 只進 IndexedDB，tuning 裡只留 **id 與擺放參數**。
所以 tuning 物件永遠小、可以進 localStorage，而換歌／換分鏡不需要重新編碼圖片 ——
渲染端 `temperaImageLayer.ts`（B 層就已搬入）只讀那些參數，把 blob 交給 loader。

---

## 2. 唯一一個「不是搬運」的檔案：`services/imageAssetCache.ts`

上游把這些圖存在 **整個 App 共用的 `services/db.ts`**（本機音樂庫、主題、session、migration 都在一起）。
Echora 沒有那個資料庫 —— 全 repo 只有 `localStorage`。

兩個選擇：把 277 行的 `db.ts` 連同它的 repository 一起搬（然後為了存使用者的圖，
把音樂庫與主題的 migration 也帶進來），或者是**只補上游 helper 實際用到的那三個操作**。
選了後者：`getFromCache` / `saveToCache` / `removeFromCache`，一個 object store，
`{ key, data, timestamp }` 的記錄形狀與上游一致（`Blob` 交給 IndexedDB 的 structured clone，
回來還是 `Blob`，正好是 `visualizerImageAsset` 檢查的東西），另外附上 `getCacheEntriesByPrefix`
（圖片池今天不需要，但記錄帶 `timestamp` 就是為了它）。

失敗路徑刻意清楚：沒有 `indexedDB`、被隱私模式擋、被別的 tab 佔住（`onblocked`）都回**具名錯誤**，
因為每個呼叫端都已經把「promise reject」當成「什麼都沒存」並用訊息通道回報。

---

## 3. 兩個整合決定（都在程式碼裡有註解）

### 3.1 圖片池掛在**活的**快速調校面板，不在設定面板

上游把它放在 `TemperaSettingsPanel`（「畫布圖片」區塊）。
但 Echora 的 `renderSettingsPanel` **唯一的呼叫端是死掉的 `VisPlayground`** ——
把它搬進設定面板，等於做了一個沒人能打開的功能。

所以：`OriginalFoliaTuningPanel`（播放器右下的快速調校面板，使用者真的會開的那個）
在 `mode === 'tempera'` 時多一個「畫布圖片」區塊，直接渲染 `TemperaImageLayerControls`。
同時 `TemperaSettingsPanel` 的那個區塊也**照上游還原**（parity），兩邊共用同一個元件。

面板與池之間的契約就是 tuning 的三個欄位：

```tsx
onCommit={({ layerImages, layerImageDepth, layerImageFrequency }) => (
  update({ layerImages, layerImageDepth, layerImageFrequency })
)}
```

刻意逐鍵寫入而不是 spread：bundle 的形狀是給渲染器讀的，不該由池的 commit 介面決定。

### 3.2 `setStatusMessage` 沒有地方顯示 → 顯示在面板裡

匯出成功、匯入失敗、圖片太大……上游全都走 `setStatusMessage` → App 的 toast。
**Echora 沒有任何 toast 元件**（全 repo grep 沒有），所以那些訊息本來會**靜靜消失**。
現在面板在池的下方以 `role="status"` 顯示一行，非 `persistent` 的訊息 4 秒後自動清除
（`durationMs` 可覆寫）。這是刻意的暫時解：Echora 之後有 toast host 時，這一段就搬過去。

---

## 4. 順手還掉的型別債：`src/types.ts` 的 7 條 `TS2307`

`src/types.ts`（上游 2026-08-30 快照）import 三個**這個 repo 從來沒有**的模組：
`types/onlineMusic`、`types/localLibrary`、`types/localCover`。
這件事之所以一直被容忍，是因為**只有主程式之外的檔案**會碰到 vendored 型別
（`original-folia-visualizers/**` 與 `utils/**` 都被主 tsconfig exclude 掉），
所以它只是視覺化樹那道閘門的一筆 allowlist 債務。

圖片池的 helper 打破這個前提：`OriginalFoliaTuningPanel` → `TemperaImageLayerControls`
→ `services/temperaLayerImages` → `../types`，**主程式開始碰 vendored 型別**，
於是 `pnpm build` 直接紅在 `src/types.ts` 的 7 條 `TS2307`。

三個模組上游都有（399 / 61 / 21 行），所以直接搬（token 級相同、註解轉繁），
`scripts/check-visualizer-types.mjs` 的 `KNOWN_DEBT` 清成**空陣列**。
這道閘門的設計正好在這裡發揮作用：它**同時**會因為「出現新錯誤」和「allowlist 指到的債務已經不存在」而失敗
—— 所以還完債不清 allowlist 是不可能的。

---

## 5. i18n：`options` 這一區，以及「section 不能自己一個檔案」

圖片池的文案（47 鍵）從上游的 `src/i18n/locales/{en,zh-CN}.ts` 抽出，zh 端做 cn → tw 轉換。
**事實**：`LOCALE_BUNDLE_SECTIONS` 的鍵是 **bundle 檔名**，section 是檔案裡的**頂層鍵**；
所以 `options` 區不能有自己的 `options.zh-TW.json`，必須放進 `player.zh-TW.json`
（它渲染的地方就是 player 路線）。第一次放錯檔案時，`localeBundles.test.ts` 立刻紅 ——
就是它該做的事。

另外做了一次**台灣用語**校正（只動文案、不動資料）：`添加→新增`、`導出→匯出`、`導入→匯入`、
`當前→目前`、`替換→取代`、`保存→儲存`、`窗口→視窗`、`文件→檔案`、`居中→置中`、
`橫向／縱向→水平／垂直`。上游是簡體文案，直接轉繁會留下對岸用詞。

---

## 6. 搬運方式與驗證（與 `lumiere` 同一套紀律）

腳本化重寫 + token 級比對（`port-images.mjs` / `verify-images.mjs`）：
import 一律**解析上游絕對目標 → 映射到 Echora → 重算相對路徑**，
再比對「剝掉註解與字串後的 token 流」。結果：**16/16 檔案 identical**（另 3 個型別模組同法搬入）。

這支腳本自己踩到的坑（跟前一個 port 同類，值得記）：

- **不能從檔案自身深度推前綴**：`components/visualizer/tempera/X.tsx` 在這裡少一層，
  `../../types` 被算成 `../../../types`，一次 20 幾個 `TS2307`。
  正解是「先決定檔案最終落點，再從落點算相對路徑」。
- **`src/types` 是檔案、`src/types/` 是資料夾**：兩者同名，映射時必須分開，否則
  `from '../types'` 會變成 `from './'`。
- **`@/` 不只在 import 裡**：`vi.mock('@/services/db')` 與 `typeof import('@/services/…')`
  都是字串，要單獨處理（Echora 沒有 `@/` alias，測試改成相對路徑）。
- **測試的落點要重算**：上游 `test/unit/**` 對應到這裡 `src/**` 旁邊，
  所以 `resolveImport` 要用「上游位置解析、落點位置輸出」。

---

## 7. 量測與驗證

| 項目 | 結果 |
|---|---|
| 型別閘門 | `node scripts/check-visualizer-types.mjs` → **passed（0 條已知債務）** |
| 測試 | **71 檔 / 450 條**（新增 22 條上游測試 + 面板接線 1 條） |
| eslint | 0 error / 24 warning（與基線相同） |
| build | 通過；`index` 327.2/335（+2.2 kB）、`stage-runtime` 177.5/200 |
| bundle-size | 通過；池自成一塊 lazy chunk，`fflate` **不在** entry |
| dev server | 13 條路徑全 200（含 6 個新 service/store/util 與 4 個池元件） |
| 服務化後的 registry | 不變；池只由 player 路線與 stage 的設定面板 lazy 取用 |

**誠實的邊界**：沙箱沒有瀏覽器（沒有 chromium），所以**圖片池沒有任何像素或真實 IDB 驗證**。
上游那 22 條測試是用 mock 過的儲存層跑的（`vi.mock('./imageAssetCache')`），
所以「zip 內容正確、擺放來回一致、上限與 id 重鑄」有數字；
但「真的把一張 PNG 拖進對話框、縮圖出現、關閉後畫面出現圖片」要第一次由人眼確認。
`imageAssetCache.ts` 本身沒有單元測試（它是 IndexedDB 的薄轉接層），也列在下面的待辦。

---

## 8. 尚未處理

1. **`Echora` 沒有 toast host**：目前訊息只在快速調校面板裡顯示（§3.2）。
   要做成全站 toast 就得有一顆元件與掛載點，那時把面板那一段搬過去。
2. **`imageAssetCache.ts` 沒有測試**：需要 `fake-indexeddb`（新 devDependency）才能測；
   目前它只被上游測試以 mock 取代。若之後要驗，建議連同「配額爆掉」的行為一起。
3. **其餘 12 個模式的設定面板仍是死碼**：`options.*` 目前只有 `tempera` 圖片池那 47 鍵；
   要不要一次補齊（並替 playground 開一條 dev-only 路線）或整條線砍掉，仍是未決。
4. **沒有像素級驗證**（§7）。
5. `vite.config.ts` 的 `manualChunks` 仍把整包 pixi 歸進 `sonnet-scene`（名不符實，但預算內）。

---

## 9. 怎麼重跑

```bash
node scripts/check-visualizer-types.mjs                              # 型別閘門（0 債務）
corepack pnpm --filter @echora/web test                              # 71 檔 / 450 條
corepack pnpm --filter @echora/web lint
corepack pnpm --filter @echora/web build && node scripts/check-bundle-size.mjs
```

移植腳本與驗證工具放在工作目錄外（`/tmp/s2t`），**不在 repo 裡**（一次性工具）。
要再搬一塊，請照 §6 的流程重寫，不要沿用硬編碼路徑。
