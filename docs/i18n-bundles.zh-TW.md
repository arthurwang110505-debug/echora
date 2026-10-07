# i18n 分區載入（繁中說明）

> 動機：`index` 這條 app shell 預算在一季內被調升三次（360 → 390 → 394 → 397 KiB），
> 每次的理由都是「新功能的文案」。真正的原因不是功能變重，而是 **兩個語系的全部文案
> 都躺在 entry chunk 裡**——首頁訪客會下載播放器面板的字串，播放器使用者會下載隱私政策。

---

## 1. 之前為什麼會這樣

`src/i18n/index.ts` 直接 `import zhTW from './locales/zh-TW.json'`、`import en from './locales/en.json'`，
而 `main.tsx` 會載入 `./i18n`。於是 11 個頂層 section、735 條字串、兩個語系、共 **83.0 kB**
原始碼全部落在 `index-*.js`。

實測（改動前）：把每個 section 的字串拿去 grep 建置產物，**兩語系 100% 都在 `index` 裡**：

| section | en+zh gzip | 誰在用 |
|---|---|---|
| `player` / `panel` / `lyricSegmentation` / `ui` | 11.7 KiB | `/play` 播放器與其面板 |
| `welcome` | 4.7 KiB | `/`、`/welcome` 著陸頁 |
| `settings` | 4.6 KiB | `/settings` |
| `privacy` / `terms` | 8.4 KiB | `/privacy`、`/terms` |
| `library` | 1.8 KiB | `/library` |
| `appHome` / `footer` | 4.7 KiB | `/app` 與 shell 骨架 |

只有最後一列的 `appHome` / `footer` 是 shell 真的會渲染的。

## 2. 現在的分法

```
src/i18n/locales/
  shell.en.json      shell.zh-TW.json      41 條   ← 靜態載入，唯一進 index 的檔案
  home.*.json      188 條  welcome + appHome        ← /、/welcome、/app
  player.*.json    320 條  player + panel + ui + lyricSegmentation  ← /play
  settings.*.json   93 條  settings                 ← /settings
  library.*.json    39 條  library                  ← /library
  legal.*.json      93 條  privacy + terms          ← /privacy、/terms
```

* **section → bundle 的對應**寫在 [`src/i18n/bundles.ts`](../packages/web/src/i18n/bundles.ts) 的
  `LOCALE_BUNDLE_SECTIONS`；**route → bundle** 寫在 `ROUTE_LOCALE_BUNDLES`。
* 路由是用 `withLocaleBundle('player', () => import('./pages/Player'))` 包起來的
  （[`App.tsx`](../packages/web/src/App.tsx)），頁面 chunk 與文案 chunk **平行抓取**，
  兩者都到位才開始 render，所以不會出現「先閃一下 raw key」。
* 載入器用 `import.meta.glob('./locales/*.json', '!./locales/shell.*.json')`，
  新增一個 bundle 只要加檔案，不必改十行 import 路徑。

### 什麼進 shell？

只有三種情況會進 shell，其餘一律跟著路由走：

1. **entry chunk 靜態可達的模組會渲染的字串** —— 錯誤邊界、骨架、常駐迷你播放器、
   `LocalAudioController`。目前 25 條。
2. **刻意不掛 player bundle 的兩個路由**（`/obs`、YouTube OAuth callback）——加 8 條。
   OBS 瀏覽器來源與 OAuth 回呼是全站最輕的兩個頁面，不該為了 4 條字串拖進整個播放器文案。
3. **兩個「不同 bundle」的路由都要用的字串** —— 例如 `VolumeControl` 同時被 `/play` 與
   `/settings` 使用，它就必須在 shell。目前 5 條音量／靜音字串。

（`footer` 整段留在 shell：每個頁面的頁尾都用到它，而且只有 3 條。）

## 3. 這條規則怎麼被守住

`src/i18n/localeBundles.test.ts`（16 個測試）不驗「檔案內容長得像對的」，而是**走 import graph**：

| 測試 | 抓到的錯 |
|---|---|
| entry chunk 的靜態圖用到的每條字串都在 shell | 新字串放錯檔案 → AppHome 顯示 `player.retryScene` |
| 每個路由（含動態載入的模組）用到的每條字串都在 shell ∪ 自己的 bundle | `/settings` 借用了 player 的字串 |
| `App.tsx` 的每個 `import('./pages/*')` 都在對應表裡（反之亦然） | 新頁面沒有決定它要載哪個 bundle |
| 每個 bundle 的 en / zh-TW 鍵集合完全相同 | 一邊漏翻譯 |
| 每個 bundle 兩個語系的檔案都存在 | 檔名打錯 → 載入器只 `console.error` |
| 全 repo 的字串都在某個 bundle 裡 | 拼錯 key |
| 每個 bundle 檔裡的 section 都有在對應表宣告 | 檔案與對應表漂移 |
| 真正呼叫 `loadLocaleBundle()` 會抓檔並合併進 i18n instance | 載入器本身壞掉 |

這支測試在寫的過程中就抓到三個**既有問題**（見 §5）。

## 4. 語言切換與取捨

* 只抓「當前語言」的那一份：讀繁中的人不會下載 en 檔（反之亦然）。
  切換語言時 `setLanguage()` 會先把已經載入過的 bundle 換語言抓齊，才 `changeLanguage()`，
  所以切換後不會有 raw key。PWA 已 precache 這些 chunk，實務上是本機讀取。
* `fallbackLng: 'zh-TW'`：因為一次只載一種語言，**en 缺 key 時不會回退到 zh-TW**。
  因此「兩語系鍵集合相同」是一條硬性測試，而不是慣例。
* 單位測試（`vitest.config.ts` 的 `setupFiles`）載入 `src/i18n/testSetup.ts`，
  它把所有 bundle 一次合併——測試可以從任何進入點渲染任何畫面，行為與改動前一致。

## 5. 過程中發現的既有問題

1. **`welcome.modeIndex` 從來沒有文案**（已修）。著陸頁第二幕的「模式 1 / 4」徽章自始至終
   顯示 `welcome.modeIndex` 這個原始字串。測試是因「路由用到的字串找不到」而失敗才被發現的。
   已補上 `模式 {{current}} / {{total}}`（en：`MODE {{current}} / {{total}}`）。
2. **`player.volumeShortcutHint` 是設定頁的字串卻掛在 `player` section**（已改名為
   `settings.volumeShortcutHint`）。它只被 `Settings.tsx` 使用，放在 player 會逼設定頁
   背整包播放器文案。
3. **`utils/appPlaybackHelpers.ts` 匯入了一個不存在的模組**（未修，回報）。
   它 `import i18n from '../i18n/config'`——`src/i18n/config.ts` 不存在；
   而 `getReplayGainModeLabel` 又去 `t('replayGain.${mode}')`，`replayGain` 這個 section
   也從來不存在。這整條之所以沒被發現，是因為 `src/utils` 被排除在 tsc 之外，
   而且它唯一的引用者 `utils/appNavidromeLyrics.ts` 自己也沒有人 import
   （`grep hasRenderableLyrics dist/assets/*.js` 無結果 → 根本沒進建置）。
   `utils/replayGain.ts` 同樣是死檔。建議：修 tsc 的排除範圍，而不是逐檔補救。

## 6. 量測

| | 改動前 | 改動後 |
|---|---|---|
| `index-*.js` | **394.5 kB** | **325.0 kB**（−69.5 kB，−17.6%） |
| `index` 預算 | 397 kB | **335 kB**（下調，不是再調升） |
| 文案 chunk | 0 | home 10.0 / player 12.8 / settings 5.0 / library 1.9 / legal 9.0 kB（en，另一語系各一份） |
| 首頁 `/` 實際下載 | 全部文案 | shell + `home.*.json` |
| `/obs`、OAuth callback | 全部文案 | 只有 shell（41 條） |

驗證方式：`pnpm build` 後把每個 section 的字串拿去 grep `dist/assets/index-*.js`——
shell 41 條全中，`settings` / `legal` 0 條，其餘只有刻意留在 shell 的那 13 條重複項。

## 7. 對第 4 項（tempera）的意義

**結果（tempera 那輪結束時）**：實際只加了 `welcome.mode_tempera` 一組（兩語系各 1 鍵，落在
`home.*.json`），因為 landing 的 Modes act 走 `VISUALIZER_OPTIONS`、而 `LandingStage.test.tsx`
逐模式比對 id／名稱／兩語系文案。面板自己的 `options.*` 33 鍵**沒有**加：那些面板目前沒有任何
live 介面會渲染（`VisPlayground` 從 `main.tsx` 走不到），見
[`docs/tempera-port.zh-TW.md`](./tempera-port.zh-TW.md) §3.6。

tempera 的文案（上游：en 94 鍵、zh 92 鍵；換算到 Echora 兩語系約 +10～12 KiB gzip）現在會落在
`player.*.json`，**不進 `index`**。也就是說第 4 項不會再撞到 app shell 預算，
`index` 335 KiB 的額度留給真正的 shell 程式碼成長。
