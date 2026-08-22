# Player UX baseline

The approved scope targets five issues observed in the supplied mobile screenshots: lyric text can render beyond the usable viewport, the persistent lyric-status banner competes with the stage, the lyric calibration controls do not provide a clear observable result, immersive mode exposes too many bottom controls, and opening the playlist compresses the player stage on narrow screens.

The local homepage at `http://localhost:3001/` still renders the existing five-track local showcase, 3D carousel, and the current headline/CTA. The implementation work is focused on `/player`; no account, playlist data, or sensitive connection state is being changed.

The local player now shows the revised desktop split layout with a fixed-width playlist column and a full-width soundscape stage. Immersive mode currently exposes only `← 歌單`, `暫停／播放`, and `⚙ 設定` in the bottom chrome; the previous four-button strip is no longer present. The screenshot also confirms that the compact control strip remains visually separate from the stage content.

The local homepage can switch to the bundled YouTube Music demo source without OAuth. It exposes `夜に駆ける`, `First Love`, and `アイドル`, which supply lyric lines for browser verification of the classic visualizer. The player can therefore be tested without touching the user's account or playlist data.

The bundled `アイドル` flow reaches `/player` with three YouTube Music demo tracks and lyric content. In the revised desktop split view, the playlist remains a dedicated fixed-width column and the right stage retains its main canvas width. This is the selected scenario for testing lyric overflow and offset controls without OAuth.

The bundled lyricful `アイドル` scenario now renders immersive mode with only the back-to-playlist, play/pause, and Settings controls visible. Opening Settings reveals the lyric status, offset value, minus/sync/plus actions, visual-stage settings, and exit-fullscreen action inside one panel. The former large top status banner is no longer rendered in immersive mode.

A DOM measurement on the local immersive lyric scenario reported `window.innerWidth = 1280` and found the first active Japanese lyric element at approximately `left = -143px`, confirming that the old horizontal transform could push a lyric line outside the viewport even though the document itself had no horizontal scroll. The compact classic layout now sets mobile horizontal spread and rotation to zero, constrains the word width, and allows CJK text to wrap.

## Mobile smoke evidence

At 390×844 and 393×852, the browser smoke measured document `scrollWidth` equal to the viewport width, and all sampled lyric nodes stayed within the viewport (`left >= 0`, `right <= viewport width`). Immersive mode exposed exactly three visible controls: back to playlist, play/pause, and Settings. Clicking the Settings plus action changed the displayed calibration from `已同步` to `+0.25 秒`.

When the playlist was opened at 390px, the drawer measured `left = 0`, `right = 343`, `width = 343`, and `position = fixed`; the main stage remained `left = 0`, `right = 390`, `width = 390`. At 393px the corresponding drawer width was 346px and the main stage remained 393px wide. This confirms the mobile drawer overlays the stage instead of compressing it.

Visual evidence is captured outside the source release as `player-ux-390-stage.png`, `player-ux-390-drawer.png`, `player-ux-393-stage.png`, and `player-ux-393-drawer.png`.

After the stacking-context fix, the 390px drawer screenshot shows the playlist surface covering the full viewport from the top edge. The previous header mode switcher and connection controls are no longer visible behind the drawer; only the playlist header, source switcher, queue, and close action remain. This removes the remaining top-level clutter while the underlying stage remains full width when the drawer is closed.

The latest 390px immersive screenshot shows the Settings surface inset from both sides and fully visible above the compact bottom controls. The active lyric is centered inside the stage rather than clipped at the left edge; the panel contains only status, calibration, visual-stage settings, and exit actions.

The post-stacking 393×852 run also reported document `scrollWidth = 393`, lyric nodes fully within the viewport, three visible immersive controls, `+0.25 秒` offset feedback, and a full-viewport fixed drawer (`left = 0`, `right = 393`, `top = 0`, `bottom = 852`).

Production browser smoke at `https://echora-three.vercel.app/` successfully entered `/player?demo=1` through the local showcase CTA. The deployed player rendered the revised playlist column, source tabs, stage, and compact lower controls without requiring a service login.

Production browser smoke reached the deployed `/player?demo=1` route and switched to immersive mode. The live page exposed the revised three-control bottom chrome; opening Settings exposed the consolidated panel with lyric status, calibration, visual-stage settings, and exit-fullscreen actions. No account connection or private library operation was used.

## Follow-up regression evidence

本地播放器在直接載入 `/player?demo=1`、且 currentSong 由 snapshot 還原的情境下，`アイドル` 已從 lyricless Soundscape 回復為實際日文歌詞舞台；頁面同時顯示 `YT Music` 來源與 3 首示範佇列。切換至沉浸模式後，底部控制保留「← 歌單／播放／⚙ 設定」；按下「← 歌單」會回到雙欄並開啟播放清單。關閉 drawer 後，右上角明確的「📋 歌單」按鈕可再次開啟同一面板。

歌單按鈕的行動意圖已從 icon-only 改為文字入口；歌詞校正控制在雙欄與 Settings 面板都改為「提前／同步／延後」，並顯示每次 0.25 秒與目前 offset。五首本地音檔已各自對應展示轉錄歌詞資料，來源稽核紀錄見 `lyrics-source-audit.md`。

## Follow-up mobile smoke evidence

以獨立 Chromium page target 重新驗收 390×844 與 393×852。兩個尺寸均通過：首頁可切換 YouTube Music 並選取 `夜に駆ける`，播放器實際渲染首句歌詞；明確的「📋 歌單」按鈕可開啟 full-viewport drawer，drawer 的 fixed rect 覆蓋整個 viewport；沉浸模式可顯示三個必要控制，Settings 可開啟，按下「歌詞延後 0.25 秒」會反映 `+0.25 秒`；「← 歌單」會留在播放器內切回雙欄並開啟歌單。切換到 `Dancing in the Stardust` 後，播放器實際渲染轉錄歌詞，Settings 顯示「展示轉錄歌詞」，且文件沒有水平溢出。原始量測 JSON 保留於專案外的 `/home/ubuntu/echora-ux-evidence-followup/player-ux-smoke.json`。

## Latest release evidence

GitHub `master` commit `ea7527fcbe9c56ce4cdf5292d55e7dce3fb52d5d`（`fix(player): restore demo lyrics and playlist flow`）已在 Vercel 建立 production deployment `dpl_AeupGBGb1jmeDYRnhkNpebgD2tRY`，狀態 `READY`，deployment URL 為 `https://echora-8h1mbqf5r-arthurwang110505-3171s-projects.vercel.app`。正式 alias 仍為 `https://echora-three.vercel.app/`；尚待完成正式 alias smoke check 後再標記 release task 完成。

## Production browser follow-up

正式網址 `/player?demo=1&release=ea7527f` 已由 browser client render 實際呈現 `夜に駆ける`、YOASOBI 與多行日文歌詞（包括「沈むように」「溶けてゆく」「二人だけの空が広がる夜に」）。頁面同時可見 `YT Music` 佇列、明確「📋 歌單」入口與「校正與設定」入口；此確認不涉及登入或外部帳戶操作。
