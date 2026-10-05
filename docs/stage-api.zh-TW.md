# Stage API 與 OBS 輸出（Echora）

這份文件對應缺口清單的第 2 項：**Stage API + OBS 頁面**。
上游把它做成桌面端才有的本機服務；Echora 是 PWA，所以做法必須調整，但**成果要一樣**：
讓舞台被 OBS、直播、外部程式拿去用。

---

## 一、這次的架構決定：relay 走 SSE，不是 BroadcastChannel

OBS 的瀏覽器來源**跑在另一個 Chromium 設定檔**（自己的 origin、自己的 storage）。
換句話說，它和播放器分頁之間：

- 沒有共用的 `BroadcastChannel`；
- 沒有共用的 `localStorage` / IndexedDB；
- 沒有共用的 React tree。

所以「OBS 整合」不可能靠同瀏覽器通訊完成，一定要有一個**跨程序的中介**。
上游的答案是本機 HTTP 服務（`127.0.0.1:32107` + Bearer token，7 個端點）；
Echora 保留同樣的形狀，但把「推播」改成 **SSE**：

```
播放器分頁 ──POST /stage/publish──▶ relay（Node，無依賴）──SSE /obs/events──▶ overlay（OBS 瀏覽器來源）
```

為什麼是 SSE 而不是 WebSocket：overlay 端只需要**單向**接收，
`EventSource` 是瀏覽器原生、會自己重連（relay 送 `retry: 2000`）、
而且在 OBS 的瀏覽器來源裡行為穩定。WebSocket 要多寫心跳與重連邏輯，換不到任何東西。

### 兩種傳輸，同一組訊息

| 傳輸 | 用途 | 需要什麼 |
|---|---|---|
| `relay` | OBS 瀏覽器來源、其他程式、其他瀏覽器 | 跑 `pnpm stage:server`、一組 token |
| `broadcast` | 同一個瀏覽器的另一個視窗（「擷取視窗」用法） | 什麼都不用，零設定 |

兩個傳輸送的是**完全相同的兩種訊息**（`config` 與 `clock`），所以 overlay 頁面只有一份程式碼。

---

## 二、訊息設計：config 大而少，clock 小而快

這是整個設計最重要的一點。若把「目前播放位置」當成每幀推播的資料，只有兩種下場：
推太慢 → 字幕抖動；推太快 → relay 被灌爆。所以拆成兩種：

**`config`（大、少）**：歌詞全文、主題、視覺模式、tuning、曲目資訊。
內容不變就不重送 —— `ObsStageConfigPublisher` 用一個忽略 `updatedAt` 的簽章比對，
所以「React 重新渲染但內容一樣」不會驚動 overlay。

**`clock`（小、快）**：不是「現在是第幾秒」，而是**一個錨點**：

```json
{ "currentTime": 12.5, "sentAtMs": 1730000000000, "playerState": "playing",
  "duration": 200, "playbackRate": 1, "lyricOffsetMs": 0 }
```

overlay 收到後自己外推：

```
position = currentTime + (now - sentAtMs) / 1000 × playbackRate   // playing 時
position = currentTime                                            // paused 時
```

如此一來 **200 ms 一次的推送就能驅動 60 fps 的舞台**。
外推、夾界（`[0, duration]`）、扣除歌詞位移都是純函式 `resolveObsStageTime()`
（`src/obs/protocol.ts`），測試在 `src/obs/protocol.test.ts`。

overlay 端能維持 60 fps 的另一半在舞台上：`OriginalFoliaVisualizerStage` 新增了
`timeProvider?: () => number`。原本時間是 prop，只有 React 重繪才會動 ——
本機播放沒問題（值一直在更新），但對「幾秒才推一次錨點」的遠端來源就是致命的。
有了 provider，**舞台自己的 rAF 迴圈每幀去問現在幾秒**，React 完全不參與。

---

## 三、使用方式

### 1. 啟動 relay

```bash
cd packages/web
pnpm stage:server                       # 預設 127.0.0.1:32107，無 token（僅本機）
pnpm stage:server --token my-secret     # 建議：有 token
pnpm stage:server --host 0.0.0.0        # 要給同網路的另一台機器看才需要
pnpm stage:server --port 32107 --token my-secret
```

啟動訊息會直接印出可以貼進 OBS 的網址。

### 2. 在 Echora 打開

`設定 → 舞台輸出（OBS）`：打開開關、選傳輸、填 relay 位址與 token，
卡片上會出現一段 **Overlay URL**（可直接複製）。播放時標題旁會出現「輸出中」的膠囊。

### 3. 在 OBS 貼上

新增 **瀏覽器來源** → 貼上 overlay URL → 建議 1920×1080、背景透明。
播放器沒開時，overlay 會顯示一張狀態卡（寫出它預期的 relay 位址），
按 `?quiet=1` 或設定裡的「隱藏 overlay 狀態卡」可以只留黑畫面。

### 4. 不裝 relay 的用法（同瀏覽器）

傳輸選「同瀏覽器」，把 overlay URL 開在**另一個視窗**，用 OBS 的「視窗擷取」抓它。
零設定，但僅限同一個瀏覽器。

---

## 四、端點

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/stage/health` | 存活檢查，**不需要 token** |
| GET | `/stage/status` | 目前 config／clock 摘要、overlay 連線數 |
| POST | `/stage/lyrics` | `{ lyricsText, overrides? }` —— 直接吃 LRC 字串 |
| POST | `/stage/session` | `{ title, artist, album?, coverUrl?, duration? }` |
| POST | `/stage/clock` | `{ positionSec, playing?, durationSec?, playbackRate?, lyricOffsetMs? }` |
| POST | `/stage/publish` | `{ kind: 'config' \| 'clock', ... }`（播放器走這條，送完整 payload） |
| GET | `/obs/events` | SSE：`event: config` / `event: clock`，`retry: 2000`，15 s 心跳，連上先補送現況 |

認證：`Authorization: Bearer <token>` 或 `?token=<token>`。
**`EventSource` 不能自訂標頭**，所以 query string 是必要的；
這也代表 overlay URL 本身就是機密（設定頁有寫）。

LRC 解析（`parseLrc`，在 relay 內）支援 `[mm:ss.xx]` 行時間、`<mm:ss.xx>` 逐字標記、
以及 `[ar:]` 之類的中介資料行。

### 用 curl 推一首歌

```bash
curl -s -X POST http://127.0.0.1:32107/stage/session \
  -H "Authorization: Bearer my-secret" -H 'content-type: application/json' \
  -d '{"title":"告五人","artist":"愛人錯過","duration":279}'

curl -s -X POST http://127.0.0.1:32107/stage/lyrics \
  -H "Authorization: Bearer my-secret" -H 'content-type: application/json' \
  -d '{"lyricsText":"[00:12.00]我肯定在幾百年前就說過愛你\n[00:18.50]只是愛會讓人變笨"}'

curl -s -X POST http://127.0.0.1:32107/stage/clock \
  -H "Authorization: Bearer my-secret" -H 'content-type: application/json' \
  -d '{"positionSec":12,"playing":true,"durationSec":279}'
```

看 SSE 串流：

```bash
curl -N "http://127.0.0.1:32107/obs/events?token=my-secret"
```

---

## 五、幾個必須知道的陷阱

**1. CORS：https 頁面 → loopback http relay**
部署在 Vercel 的播放器是 `https://…`，而 relay 是 loopback 上的純 `http://`。
現代瀏覽器允許 https 頁面連 localhost（這是 PNA 的例外），但**跨來源仍然要走 preflight**，
所以 relay 的 CORS 必須正確：`Access-Control-Allow-Origin` 回填來源（設定 token 時採精確比對），
並處理 `OPTIONS`。本機 relay 與 overlay 請盡量留在同一台機器。

**2. overlay 是跨來源的，所以它讀不到播放器的 storage**
封面、圖片、表情符號若要出現在 overlay 上，必須**隨 config 一起送進去（data URL）**。
`coverUrl` 例外：它保留成一般網址（用 data URL 反而會污染 canvas）。

**3. overlay 是唯讀的**
從 overlay 點歌詞跳轉需要一條回播放器的通道，Stage API 沒有這條（上游的 overlay 也一樣是唯讀）。

**4. token 會出現在網址裡**
`EventSource` 不能帶標頭，所以 token 只能進 query string。
請把 overlay URL 當成機密，不要貼進公開場合。

---

## 六、量測與成本

- overlay 頁面是獨立 chunk：`ObsStage-*.js` **4.6 KiB**（gzip 1.9 KiB），
  它重用既有的 `OriginalFoliaVisualizerStage` lazy chunk，不重複打包舞台。
- 設定 store 獨立成 `obsStageStore-*.js` 2.6 KiB，不會被拉進主殼。
- app shell（`index-*.js`）因新增設定文案（兩個語系）由 390.0 → 391.9 KiB，
  `scripts/check-bundle-size.mjs` 的預算已**明示調升** 390 → 394 KiB（含原因註解）。
  註：該腳本量的是 bytes/1024（KiB），Vite 印的是 kB，兩者數字不同，別誤判。
- `pnpm bench`（Sonnet 編譯）median 27.6 ms / 90 ms 預算 —— relay 與 overlay 不影響主執行緒。
- 測試：`src/obs/protocol.test.ts`（18，純函式與 URL 契約）、
  `src/obs/stageRelay.test.ts`（13，對真的 HTTP 伺服器與真的 SSE 連線）。

### relay 修掉的真實 bug（由新測試抓到）

SSE 的訂閱清理原本掛在 `req.on('close')`。Node 對「沒有 body 的 GET」會**立刻**觸發它，
所以 overlay 一連上就被取消訂閱：**只收到連線當下補送的 config，之後永遠收不到 clock**。
改成 `res.on('close' / 'error')` 之後正常。這個 bug 用 curl 看會以為是「事件太少」，
只有寫成測試、對真的連線驗證才會現形 —— 這正是量測紀律的價值。
