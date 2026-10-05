# 詞切分（word segmentation）（Echora）

這份文件對應缺口清單的第 3 項：**詞切分（含 AI）+ 歌詞品質**。
上游 Folia 的診斷是「這對 CJK 排版品質影響最直接」，而 Echora 的狀況比缺一個檔案更糟：
**有三份各自為政的 `Intl.Segmenter` 呼叫**，所以任何「使用者自己決定切分」的功能都不可能一致生效。

---

## 一、為什麼切分要能覆寫

歌詞的**時間**來自解析器（LRC／YRC／QRC／TTML），這塊 Echora 不缺。缺的是**詞的邊界**：

- 逐字時間的來源（YRC／QRC）會把一行切成很小的碎片，例如 `It` / `’` / `s` / `unbelievable`，
  以及 CJK 的**單字**切分（`世` / `界` / `。`）；
- 排版引擎要的是「人眼會讀成一個詞」的單位（`It’s`、`世界。`、`看不見`）；
- `Intl.Segmenter` 給的是通用語言學答案，**它不知道這首歌在唱什麼**。
  日文尤其明顯：`いっぱいあるんだよ欲しいもの` 若要照樂句唱歌，切在 `いっぱい` / `あるんだよ` / `欲しい` / `もの`
  比照字典切更合理。

所以切分是**可覆寫的資料**，不是每次現算的結果。上游把它做成 per-song 的紀錄（AI 產生或手動編輯），
Echora 沿用同一套格式。

---

## 二、這次的架構

```
                    ┌──────────────────────────────────────────────┐
使用者按「用 AI 切分」 │  shared/segmentationPrompt.ts                │
        ────────────▶│  （prompt + 回應解析，前端與伺服器共用）        │
                    └───────────────┬──────────────────────────────┘
                                    │
        api/ai/segment.ts ──(AGNES, temperature 0, JSON)──▶ 邊界陣列
                                    │
   src/services/lyricSegmentationAi.ts（分批、進度、失敗只影響那批）
                                    │
   src/store/lyricSegmentationStore.ts（localStorage，per-song，上限 40 首）
                                    │
   src/pages/Player.tsx ─ useSegmentedLyrics() ─▶ stageLines ─▶ 所有 visualizer + OBS overlay
                                    │
        src/lyrics/wordSegmentation.ts ◀── sonnet / classic / partita 都讀同一份切分
```

### 1. 單一 segmenter（`src/lyrics/wordSegmentation.ts`）

上游那個檔案的開頭就寫著它的存在理由：同樣的 `getSegmenterParts` 被複製到 `sonnetSemantic.ts`，
`cjkSemanticLayout.ts` 又有第三個版本，所以「使用者覆寫」得接三個地方，而且會漂移。
Echora 原本正是這個狀態（第三個在 `store/localDemoSongs.ts`，那是示範曲目的時間產生器，這次不動它）。

現在 `segmentLyricWords(line)` 是唯一入口：有合法的 `line.wordSegments` 就用它，否則用 `Intl.Segmenter`；
沒有 `Segmenter` 的環境退回**碼位**切分（保證每個 code unit 都在，時間不會遺失）。

兩個渲染路徑都接上了：

| 消費者 | 用途 |
|---|---|
| `original-folia-visualizers/sonnet/sonnetSemantic.ts` | Sonnet 的排版單位（旗艦模式） |
| `utils/lyrics/cjkSemanticLayout.ts` | classic 與 partita 的排版單位 |

### 2. 紀錄格式（與上游相同）

```ts
interface LyricSegmentationRecord {
  version: 1;
  songKey: string;                 // `source:id`，不是 raw song id（兩個來源可以撞 id）
  updatedAt: number;
  source: 'ai' | 'manual';
  lines: Record<string, string[]>; // 行 key -> 邊界；邊界接起來必須等於該行全文
}
```

行的 key 是 `round(startTime * 1000) | fullText`：**刻意不用 `Line.id`**（解析器填得不一致）。
換歌詞來源時它就對不上，而那正是想要的行為 —— 為別的歌詞做的切分不該照著套上去。
套用前會再用「接起來是否等於原文」驗一次，不合法就忽略（寧可用預設，也不要整體位移）。

### 3. AI 路徑：一個 prompt 模組、兩種用法

`shared/segmentationPrompt.ts`（**repo 根目錄**，上游也是 `shared/`）同時被
`api/ai/segment.ts` 與前端 `services/lyricSegmentationAi.ts` 匯入，所以
**「幫我跑」與「給我 prompt 自己貼」問的是同一件事**。前端用 `@shared` 別名（vite／vitest／tsconfig 三處都設）。

伺服器端的重點：

- **`temperature: 0` + `response_format: json_object`**：切詞是機械工作，沒有要取樣的地方，
  而 temperature 是唯一能讓模型「順手改寫歌詞」的旋鈕；
- **回應驗證在伺服器**：`parseSegmentationResponse` 把每一列**對回它原本的那一行**，
  對不回去的列回 `null`（那一行維持預設切分，是正確輸出），全部對不回去才 502
  —— 並把模型的原始回應寫進 log，因為那是唯一能事後判斷原因的證據；
- **只信任切點、不信任文字**：模型經常正確切點但把空白正規化（尾端空白消失、全角變半角）。
  直接比對字串會因為一個裝飾性差異丟掉整首歌，所以 `realignSegmentsToText` 只取切點，
  文字一律從原文切出來 —— 產出的每一段都必然是原文的片段。

前端的分批（`SEGMENTATION_BATCH_SIZE = 100`）是上游量測後的結論：一次請求約 1.4 秒固定成本，
拆批反而**更慢**（43 行：3 批 6.5 秒 vs 1 批 3.6 秒），所以批次留著只是為了
「一行輸出約 18 token、超長歌詞會撞到輸出上限」這種情況。
一批失敗只影響那批（那幾行維持預設），全部失敗才丟錯 —— 使用者已經等到的批次不該被丟掉。

**環境變數**（與主題生成共用）：

```
AGNES_API_KEY           必要，沒有就回 503
AGNES_MODEL             選用，預設 agnes-2.0-flash
ECHORA_ALLOWED_ORIGINS  選用，逗號分隔；預設只允許 *.vercel.app 與 localhost
```

### 4. UI：掛在「歌詞資訊」面板

三種進入方式，因為成本差很多：

| 方式 | 什麼時候用 |
|---|---|
| **用 AI 切分** | 部署有 `AGNES_API_KEY`；一首歌通常一次請求 |
| **複製 prompt** | 使用者自己已經有付費的模型；把回答貼回下面的欄位 |
| **手動** | 只想修某一行：把目前切分載入文字框、改一改再套用（`詞/詞/詞` 每行一列，模型回的 JSON 也吃） |

面板上還有**目前這行的切分預覽**（空白會顯示成 `␣`）—— 對 CJK 來說，看到
`把回忆拼好给你` 變成 `把 / 回忆 / 拼好 / 给 / 你` 就是這個功能的回饋本身。

### 5. 本機開發：不需要真的 key 也能跑完整條路徑

```
AGNES_API_KEY=test AGNES_BASE_URL=http://127.0.0.1:32155/v1 pnpm dev
```

`AGNES_BASE_URL` 可以覆寫（正式環境不設，走預設值），所以把它指到一個假的上游就能把
**前端 → proxy → prompt → 解析 → 紀錄** 整條路徑跑一遍，不花任何 key。
這也是驗證 prompt 有沒有真的帶上那些規則的方法：假上游把收到的 request 記下來，直接看。

---

## 三、驗證

- **測試 371 條 / 59 檔**（本次新增 51 條 / 5 檔）：
  - `src/lyrics/wordSegmentation.test.ts`（15）：偏移、空白成形、覆寫有效／失效、無 Segmenter 的退路；
  - `src/lyrics/segmentationRecord.test.ts`（14）：套用、略過過期紀錄、匯出／匯入來回、逐列錯誤；
  - `src/lyrics/segmentationPrompt.test.ts`（12）：prompt 內容（含日文規則與「編號不是歌詞」）、對齊、解析；
  - `src/lyrics/segmentEndpoint.test.ts`（8）：**直接驅動真的 serverless handler**（假的 upstream），
    驗 200／400／403／405／502／503 與「要求上游回傳嚴格無損的答案」；
  - `src/services/lyricSegmentationAi.test.ts`（9）：分批、進度、單批失敗、全部失敗、abort；
  - `src/utils/lyrics/cjkSemanticLayout.test.ts`（5）、`sonnet/sonnetSemantic.test.ts`（6）：覆寫真的到得了排版層。
- `tsc` 乾淨、`eslint src bench` 0 error、build 成功、bundle-size 通過。
- **端到端（經過真的 dev server）**：`POST /api/ai/segment`（由 dev 掛載的**真** handler 處理）
  → 假上游 → 200，回傳的邊界接得回原文；並確認送出的 request 是
  `agnese-2.0-flash / temperature 0 / {"type":"json_object"}`，system prompt 帶著
  `Lossless`、`Japanese specifically`、`NOT part of the`、`Never translate` 與日文範例，
  user prompt 是編號過的歌詞行。

### 一個原本會很貴的 bug（測試寫出來才想到）

`segmentEndpoint.test.ts` 一開始把 `ECHORA_ALLOWED_ORIGINS` 設在 import **之後**，結果回 403。
原因不是 bug：允許清單是**模組載入時**讀取的常數（與 `api/ai/theme.ts` 一致）。
測試因此改成 `vi.resetModules()` + 動態 import —— 這也順手證明了「設定在部署時生效、不隨請求變動」是刻意的。

---

## 四、已知限制（誠實清單）

1. **沒有逐行編輯器**：手動路徑是文字列格式（一行一列），不是上游那種逐行 UI。要改一行得改那一列。
2. **`store/localDemoSongs.ts` 仍有自己的切分**：它產生示範曲目的逐字時間，不是排版，這次刻意不動。
   若哪天要合併，它是第三份 `Intl.Segmenter` 的最後殘留。
3. **上限 40 首**：紀錄放 localStorage（跟 `echora.lyrics-offsets` 同一個做法），
   超過就淘汰最舊的。上游是放在 cache DB 的 `lyricSeg_` 前綴下（刻意避開「清除歌詞快取」會掃到的前綴），
   Echora 沒有那層，所以用上限換取不會撐爆 5 MB。
4. **`api/ai/segment.ts` 正式環境跑在 Vercel 上**，本機則由 `vite-plugins/devAiFunctions.ts`
   在 `vite dev` 裡掛上同一支 handler（另有 `/api/ai/theme`、`/api/ai/status`）。若沒有掛到
   （例如用了別的伺服器），按「用 AI 切分」會得到一句明確的錯誤並引導改用「複製 prompt」，
   而不是含混的「回應不完整」。
5. **沒有 `lyricExport`**：上游有歌詞匯出流程，Echora 仍缺（與本項無關，記在缺口清單 §4）。
6. **app shell 預算**：這次的文案讓 `index` 由 391.9 → 394.5 KiB，預算已第三次調升
   （390 → 394 → 397 KiB）。三個調升都是同一個根因：**兩個語系的文案全在 shell 裡**。
   修法（route-level resource bundle，約可回收 7 KiB）已列進缺口清單的工程紀律表，不該再靠調預算過去。
