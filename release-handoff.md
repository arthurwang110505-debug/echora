# Echora 改進計劃交付摘要

**範圍：** UI-001、UI-002、PLAY-001、PLAY-002、UI-003  
**GitHub：** `arthurwang110505-debug/echora`，`master`，commit `69033e31d1940d342757025ea8b7eb793a5d5325`  
**Vercel 狀態：** `production-ready`  
**發布摘要：** 已將 Settings route 的持久歌曲列隱藏、完成 Settings 的 mobile／iPad／desktop responsive layout，並修正 local audio 播放狀態與 Play／Pause 控制同步。GitHub master push 後，既有 `echora` Vercel project 已自動產生 production deployment；deployment 狀態與 production route 均已驗證。

## 已完成內容

| ID | 使用者可見結果 | 驗收狀態 |
|---|---|---|
| UI-001 | 進入 `/settings` 時不再渲染 `PersistentMiniPlayer`，不會覆蓋設定卡片與診斷內容；首頁／音樂庫仍保留持久控制列。 | 已通過 |
| UI-002 | Settings 移除舊的 600px CSS 限制；手機與 iPad portrait 使用單欄，iPad landscape／desktop 使用寬版雙欄與 secondary rail，header／間距／內容寬度均調整。 | 已通過 |
| PLAY-001 | 舞台控制在播放中顯示 Lucide Pause icon、`暫停`、`aria-label="暫停音訊"` 與 `aria-pressed=true`；停止時顯示 Play。播放中的 persistent control 直接呼叫明確 `pause()`，避免 toggle race。 | 已通過 |
| PLAY-002 | LocalAudioController 以 `audio.play()` Promise 與 `pageshow`／`visibilitychange` reconciliation 同步 HTMLAudioElement 與 Zustand；從播放器離開至首頁後，persistent control 仍可停止實際音訊，並回復 `繼續播放`。 | 已通過 |
| UI-003 | 完成四種 viewport 的 Settings screenshot smoke、web tests／typecheck／lint／build、GitHub push 與 Vercel production verification。 | 已通過 |

## 驗證證據

| 類型 | 指令／流程 | 結果 |
|---|---|---|
| 單元測試 | `pnpm --filter @echora/web test` | 12 test files、37 tests passed。 |
| Web 型別檢查 | `pnpm --filter @echora/web exec tsc --noEmit` | 通過。 |
| Agnes handler 型別檢查 | `pnpm --filter @echora/core exec tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck ../../api/ai/status.ts ../../api/ai/theme.ts` | 通過。第一次由 root 執行的等效命令因 root 未提供 Node typings 而失敗，未修改 dependencies；改用已有 Node typings 的 core workspace 後通過。 |
| Diff／lint | `git diff --check`; `pnpm --filter @echora/web lint` | diff check 通過；lint 0 errors、24 個既有 Folia unused-disable warnings。 |
| Production build | `pnpm --filter @echora/web build` | 通過；保留既有大型 visualizer chunk 與 PWA glob warning，沒有 build error。 |
| Local Settings smoke | `/settings` with active song in browser | `PersistentMiniPlayer=false`、no horizontal overflow；1280×1100 desktop main columns 約 705px／479px，scrollWidth 等於 clientWidth。 |
| Local pause smoke | local demo → `/player` → `/` → click persistent `暫停播放` | HTML audio 由 `paused:false` 變為 `paused:true`；control label 變為 `繼續播放`。Immersive Stage 播放中顯示 `暫停音訊`。 |
| Responsive screenshots | 390×844、768×1024、1024×768、1440×900 Settings | 390 與 iPad portrait 單欄；iPad landscape 與 desktop 雙欄；未見水平溢出或底部歌曲列遮擋。截圖保留於 `browser-smoke/`。 |
| Production HTTP smoke | `https://echora-three.vercel.app/`、`https://echora-three.vercel.app/settings` via Vercel URL fetch | 兩個 route 均 HTTP 200、`text/html; charset=utf-8`、Vercel response successful。 |

## GitHub 交付

| 項目 | 已驗證值 |
|---|---|
| Repository | `https://github.com/arthurwang110505-debug/echora` |
| Branch | `master` |
| Commit | `69033e31d1940d342757025ea8b7eb793a5d5325` |
| Commit message | `fix(player): sync pause controls across routes` |
| Push 結果 | 成功；remote `refs/heads/master` 指向 `69033e31d1940d342757025ea8b7eb793a5d5325`。 |

## Vercel 部署證據

| 項目 | 已驗證值 |
|---|---|
| Connector | `Vercel`，已啟用 |
| Team | `arthurwang110505-3171's projects` (`team_jdonrY3U82gD7CnZnR7eTaB6`) |
| Project | `echora` (`prj_UlOMf7pJo7IHsW8P1DyVNR3h9xly`) |
| Deployment | `dpl_BJEVb8mQWrcxdWdaFr47bXbPcAZe` |
| Target | `production` |
| Status | `READY` |
| Deployment URL | `https://echora-lqmogwtak-arthurwang110505-3171s-projects.vercel.app` |
| Production alias | `https://echora-three.vercel.app` |
| Commit reference | `69033e31d1940d342757025ea8b7eb793a5d5325`；Vercel metadata commit message 為 `fix(player): sync pause controls across routes`。 |
| Smoke check | Production `/` 與 `/settings`：HTTP 200，HTML response successful。 |

## 已知限制

本輪實際瀏覽器播放與跨 route pause 以五首 local demo MP3 驗證。YouTube Music 與 Spotify 的第三方真實帳戶播放、背景限制與 provider-specific pause callback 未在本輪重新連線測試；程式仍使用既有 source-aware pause dispatch 與 Media Session handlers。iPad 真機未連接，本輪使用對應 768×1024 與 1024×768 viewport 截圖；iOS／Safari 的硬體背景播放策略仍由瀏覽器平台決定。既有 visualizer 大型 chunk 與 PWA glob warning 未在本輪範圍內重構。

## 下一步

本輪為 `production-ready`。Production deployment 已由 GitHub master push 觸發並經 Vercel connector 回傳 `READY`，production alias `https://echora-three.vercel.app` 的根路由與 Settings route 均已回應 HTTP 200。使用者可直接以手機或 iPad 實機確認 Safari／PWA 的硬體背景音訊政策與 YouTube Music provider 行為。
