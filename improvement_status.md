# Echora 改進企劃驗收狀態

本文件以既有「Echora 綜合改進報告」的 ECH-001 至 ECH-013 為基準。所有程式修改均已推送至 `master`；本機單元測試、TypeScript 檢查與 production bundle 已通過。

| Ticket | 狀態 | 已交付內容 | 尚待外部驗收 |
|---|---|---|---|
| ECH-001 | 完成 | YouTube IFrame PlayerState adapter、真實時間輪詢與錯誤狀態。 | 真實帳戶曲目的原生播放手勢。 |
| ECH-002 | 完成 | 共用 PlayerState、播放快照、跨頁恢復與 Media Session。 | 無。 |
| ECH-003 | 完成 | LRC 正規化、時間排序、重複 token 去除與 parser 測試。 | 需以使用者指定影片版本確認歌詞偏移。 |
| ECH-004 | 完成 | 無歌詞、純音樂、解析失敗與載入中 fallback。 | 無。 |
| ECH-005 | 完成 | 未選歌恢復路徑、loading、錯誤、重試與 PWA recovery。 | 離線與慢網路的實體裝置驗收。 |
| ECH-006 | 完成 | `/library`、播放器與首頁共用私人歌單與最近播放資料。 | 真實 YouTube 私人歌單驗收。 |
| ECH-007 | 完成 | connected、authorizing、syncing、synced、expired、error 與重新同步／解除連線回饋。 | 使用者帳戶的權限拒絕與 token 過期流程。 |
| ECH-008 | 完成 | 主要播放控制、歌詞校正與進階舞台設定分層。 | 行動裝置拇指操作驗收。 |
| ECH-009 | 完成 | aria-label、focus-visible、鍵盤 Space、range 語意與 reduced-motion。 | VoiceOver／TalkBack 實體裝置驗收。 |
| ECH-010 | 完成 | 搜尋、最近播放、佇列快照與本機收藏曲目。 | 收藏雲端跨裝置同步需另建後端服務。 |
| ECH-011 | 完成 | 穩定 SVG placeholder、圖片 lazy loading、3D lazy loading 與預快取縮減。 | 真實使用者 Core Web Vitals 監測。 |
| ECH-012 | 完成 | Media Session 播放、暫停、切歌與 seek 控制。 | 各行動裝置系統媒體控制驗收。 |
| ECH-013 | 完成 | OAuth、歌單、歌詞、YouTube 元件與診斷儲存回歸測試；本機診斷事件檢視與清除。 | 企業級外部錯誤追蹤／警示服務需另行選擇供應商與設定憑證。 |

## 外部前提

Spotify 仍維持「尚未啟用」，因為尚未提供 Spotify Developer Client ID 與 redirect URI 設定。此狀態會顯示明確的琥珀色提醒，不會假裝成登入失敗或可播放。

## 本輪 P0 互動驗收

最新版本已修正歌單側欄打開時 YouTube IFrame 遮擋、沉浸舞台切換的 DOM `insertBefore` 錯誤，以及歌詞校正控制在雙欄與沉浸模式不易找到的問題。YouTube 原生播放因瀏覽器手勢政策與帳戶驗證必須由使用者在實際已登入裝置上按下播放後確認暫停；該流程不應由自動化環境偽造。
