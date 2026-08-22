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
