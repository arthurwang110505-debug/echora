# 舞台引擎與量測（Echora）

這份文件對應缺口清單的第 1 項：**引擎化 + 量測紀律**。
前面的卡頓診斷（`docs/sonnet-diorama-stall-diagnosis.md`）回答了「為什麼卡」，
這份回答「**之後怎麼確定它不卡、以及下次卡在哪裡**」。

---

## 一、這次加了什麼

### 1. 引擎：換歌用溶解，不是切斷（`sonnet/songHandover.ts`）

上游 Folia 的換歌是「溶解」（dissolve）：舊畫面留在一個獨立容器裡淡出，新節目在下面淡入，
整段 560 ms（`SONNET_SONG_SWAP_MS`）。Echora 之前是 `clearScenes()` 之後直接重建 —— 換歌、換曲
的瞬間會先空一格，然後新畫面直接出現，讀起來就是「切斷」。

現在 `SonnetPixiRuntime` 會：

- 換歌時把**正在畫的那個 scene 容器**搬到 `handoverContainer`（不重建、不重新排版）；
- 新節目照常在 `sceneContainer` 建第一個 scene；
- 每幀依 `resolveSonnetHandoverFrame()` 設定兩邊 alpha：`outgoing + incoming = 1`，
  所以中間不會出現比任一畫面更暗的一格（兩條各自獨立 fade 的曲線就會有這個問題）；
- 溶解期間又換歌 → 舊的直接丟掉、重新開始，不會疊成一堆；
- 暫停、resize、銷毀、換主題 → 直接收掉，不留殘影在半透明狀態。

曲線是純函式，所以可以在沒有 WebGL 的情況下測試（`songHandover.test.ts`：端點、單調性、
兩端斜率為零、α 和為 1、NaN／負數／自訂時長的處理）。

### 2. 量測：`utils/stageProbe.ts`（在真機上量，而不是用感覺）

上游的量測紀律是 `dev/probes` 底下幾十個獨立 harness，加上一個**刻意單 worker** 的 Playwright
runner —— 理由寫在它們的註解裡：「只有在機器不忙的時候，render count 才可以歸因」。
Echora 跑在手機和平板上，所以等價物必須是**能在真機、真 App 裡打開並讀回来的東西**。

探針做到的事（與模式無關，所以 11 個舞台全部自動涵蓋）：

- **主執行緒的每幀節奏**：p50 / p95 / p99 幀時間、超過 20 ms 的幀數、超過 100 ms 的凍結次數，
  以及每次凍結發生的時間點；
- **引擎自己回報的計數與耗時**：scene 建置時間、命中／淘汰次數、換歌次數、resize 次數……

關於 overhead：關閉時每個入口都只是**一次 boolean 判斷**；開啟時每幀多一個 rAF callback 與兩次
`performance.now()`，且**每幀不配置任何物件**。

---

## 二、怎麼在真機上量（三步）

### 1. 打開探針

三種方式，任選一種：

| 方式 | 做法 | 適用 |
|---|---|---|
| URL 參數 | 在網址後面加 `?stageProbe=1` | 一次性檢查，例如 `/player?stageProbe=1` |
| 記住設定 | Console 執行 `localStorage.setItem('echora.stageProbe','1')` 後重新載入 | 手機上不想每次改網址 |
| 開發模式 | `pnpm dev` 預設就開 | 本機開發 |

要跑「乾淨基準線」時，用 `?stageProbe=0` 蓋掉以上全部（連 dev 也關）。

### 2. 重現你覺得卡的操作

打開播放器、進到全螢幕舞台，然後**照平常的方式用它**：

- 換歌（現在應該是溶解，不是切斷）
- 拖動畫面板的滑桿、換主題（右側面板）
- 切換不同的歌詞模式
- 撐過一段純音樂／間奏
- 旋轉手機、調整視窗大小

### 3. 讀結果

在 Console 執行：

```js
__echoraStageReport()
```

會印出摘要與計數表，並回傳一份 JSON（可以直接複製貼給我）：

```
[echora stage probe] {
  mode: 'sonnet', running: true, frames: 3600, fps: 59.4,
  p50: '16.7ms', p95: '17.9ms', p99: '21.4ms', worst: '147.2ms',
  'frames >20ms': 41, 'stalls >100ms': 3,
  'clock advanced': '3586/3600 (99%)'
}
[echora stage probe] worst stalls [ '147ms at t+12.4s', '112ms at t+48.1s' ]
```

畫面整個不動、但影格數字都很漂亮的時候，會多印一行警告：

```
[echora stage probe] STALLED: tempera advanced the timeline on only 4 of 61 playing
frames (7%, expected ~100%) while rendering 60 frames at 59.8 fps. The stage is
drawing, but the clock it reads is not moving per frame - see
docs/tempera-lumiere-stall-diagnosis.md.
```

另外：

```js
__echoraStageReset()          // 清空樣本，重新量（例如換歌之後再量一次）
__echoraStageProbe.begin('sonnet')   // 手動指定一個 session
__echoraStageProbe.end()
```

### 怎麼判讀

| 數字 | 健康 | 意思 |
|---|---|---|
| `p50` | ≈ 16.7 ms | 一般影格預算（60 fps） |
| `p95` | < 20 ms | 只有極少數影格超出預算 |
| `frames >20ms` | 少於總影格的 1 % | 掉格比例 |
| `stalls >100ms` | 0（或只在換歌那一瞬間） | 讀起來會是「卡一下」的凍結 |
| `clock advanced` | 接近 100 % | **時間軸有沒有跟著每一格動**。這是「慢」跟「整個凍住」的分水嶺 |
| 計數表的 `max (ms)` | `sonnet.sceneBuild` 應該 < 50 ms | 一個段落的排版＋建 Pixi Text 的成本 |

`clock advanced` 這一項是後來才加的，因為前面幾項**看不到本repo實際踩過兩次的那種故障**。
影格節奏量的是 rAF 有沒有準時回來；可是時間軸凍住的時候，每一格都畫得很便宜（因為每格畫的都
是同一張圖），於是 `p95` 漂亮、`longFrames` 是 0、`stalls` 也是 0 —— 所有數字都說舞台很健康，
畫面卻完全靜止。當年 tempera／lumiere 讀到的是 store 那個約 4 Hz 的時鐘，61 格只有 5 個不同
位置，比例約 7 %；修好之後（`playback/stageClock.ts` 自己往外 extrapolate）是 99 %。

判讀方式：

- **接近 100 %** → 時鐘是每格讀的，正常。
- **明顯偏低但不是 0** → 舞台讀到的時鐘更新頻率低於影格頻率。這就是「看起來卡住」的那個 bug。
- **`no playing frames sampled`** → 這段時間沒有在播放。暫停時計鐘不動是正確的，所以暫停的影格
  根本不計入，否則每次暫停都會被誤報成 stall。

樣本太少（不到半秒、30 格）時不會下判斷，因為拖進度軸、換歌、剛 mount 都會合理地停個幾格。

如果 `stalls` 的發生時間點對得上「換歌」「拖滑桿」「切模式」，那問題就在那條路徑上 ——
把 `at+t` 跟操作對起來看，比記「哪一段好像卡卡的」精確得多。

---

## 三、編譯期的基準（`pnpm bench`）

真機探針量的是「場景建置」與整幀節奏；**節目編譯**（`compileSonnetProgram`）是純資料、不需要
canvas 或 WebGL，所以在 Node 裡量就好，也不必造假 shim：

```bash
pnpm bench
```

```
[bench] sonnet program compile
  fixture   120 lines (CJK + Latin, word-timed, 3.2s gaps)
  compiled  6 paragraphs / 96 shots
  best      26.27 ms
  median    32.56 ms  (0.271 ms per line)
  worst     37.54 ms
  budget    90 ms
```

- 檔案在 `packages/web/bench/sonnetCompile.bench.ts`，**刻意不進單元測試**：計時只在閒置的機器上
  才有意義，而單元測試是平行跑很多檔案的。跑它要明講（`pnpm bench`）。
- 它有自己的 config（`vitest.bench.config.ts`）：`maxWorkers: 1`、`fileParallelism: false`，
  理由與上游的 probe runner 相同。
- 預算是刻意的寬鬆值（中位數 90 ms vs 實測 33 ms，約 2.7 倍）：這道閘門要抓的是**量級的退化**
  （不小心變成 O(n²)、memo 失效），不是幾個百分點的抖動。實測中位數改變時，連同預算一起改，
  並把新數字記在這裡。
**建議加進 CI（一行，尚未加入）**：本次推送用的 GitHub App 沒有 `workflows` 權限，所以
`.github/workflows/ci.yml` 沒有動。想讓每輪 CI 都留下這個數字、退化時直接紅燈，在
`Bundle-size budget` 之後加：

```yaml
      - name: Compile benchmark
        run: pnpm bench
```

---

## 四、還沒做（同一條路線上的後續）

1. **畫面級探針**：~~目前只有主執行緒節奏 + 引擎回報的計數~~ → 時間軸推進比例（`clock advanced`）
   已加上，這正是「影格很漂亮但畫面靜止」那類故障唯一量得到的東西。剩下的是把 `probeSpan` 加進
   更多模式（canvas 2D 系的排版、diorama 的轉場）：目前只有 sonnet 回報計數（7 個呼叫點），其他
   12 個模式的計數表是空的，只有共用的影格與時鐘數字。上游還有在瀏覽器裡量 render count 的 probes。
2. **`songHandover` 的溢位保護**：上游在溶解之外還有一層 wall-clock 保護，處理「新場景建置比
   溶解還久」的情況；目前溶解結束就是結束。
3. **`mod()` / `setModulation`**（Folium 模組的可調參數）與 `transparentBackground`。
4. **`loadPixi()` 的 `highp` 精度切換**（Linux/NVIDIA 黑三角）與 outro blur 的 `repeatEdgePixels`。
5. **把探針結果自動化**：現在要人工複製 JSON。之後可以考慮在 CI 的 e2e 用同樣的 API 收集數字
   （需要能跑的瀏覽器，本沙箱無法）。
