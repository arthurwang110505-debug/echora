
## Local browser implementation smoke
- Home source switch from 本機展示 to YouTube Music updates the hero and library count from 05 to 03 without a stale search query.
- Source controls expose labels for Spotify, YouTube Music, and 本機展示; the disabled source includes an assistive-only explanation.
- Home mobile discovery link is present in the hero and the carousel exposes a live selection hint with active/inactive selection semantics.

## Search recovery smoke
- An impossible YouTube Music query rendered 00 results with a dedicated clear-filter control labelled 清除歌曲篩選.
- Activating the recovery control restored the 03-song list and the active carousel selection hint without reloading the route.

## Library hierarchy smoke
- The unconnected Library now separates the personal-playlist area from a dedicated Device showcase section.
- The CTA 先探索本機展示 navigates to Home with `source=local#explore-library`, switches the source to local, and scrolls to the exploration section.
- The CTA 連接我的音樂 navigates to Home with `connect=1` so the connection dialog can open without an opaque dead end.

## Player and Stage smoke
- Selecting the carousel CTA opened the player with the selected local demo track playing and an explicit 暫停音訊 transport label.
- Entering immersive Stage hid the full-player chrome from the accessibility tree and left one grouped control surface: 返回歌單選擇頁、上一首、暫停音訊、下一首、沉浸舞台設定.
- The Stage transport reports 目前播放中 through a polite live region and keeps the bottom bar inside the safe-area padding.

## Stage accessibility measurements
- The live Stage exposes five active focusable controls and the full-player controls are inside an aria-hidden subtree.
- The Stage control group measured 68px high with a 16px viewport bottom gap in the local browser, while the live status reported 目前播放中.
- The first console probe used a TypeScript-only assertion in browser JavaScript and failed; the equivalent plain JavaScript probe passed and produced the evidence above.

## Responsive screenshot smoke
- At 390×844, Home keeps the hero primary CTA prominent while exposing a compact 瀏覽展示歌曲 link, and the source/view/search controls stack without horizontal overflow.
- At 390×844, Library presents the unconnected explanation, two distinct actions, a compact personal-playlist empty state, and a full-width Device showcase CTA without bottom-player overlap.

## Player responsive screenshot smoke
- The 390×844 and 1440×900 no-track states preserve two clear recovery actions: return to exploration and open the Library.
- The empty player state remains centered and readable at both sizes; no bottom player overlap or horizontal overflow was observed.

## Connection recovery smoke
- Library's 連接我的音樂 action returned to Home and opened the connection dialog via a route-level deep link.
- The unavailable source remained disabled and was accompanied by a clear explanation, rather than looking like a broken interactive option.

## Desktop screenshot smoke
- At 1440×900, Home keeps the hero and primary CTA dominant while the source, view, and search controls align in a single readable exploration row.
- At 1440×900, Library uses the available width for a coherent unconnected flow without a blank reserved rail; personal playlists and the device showcase are visibly distinct.

## Stage focus isolation regression
- After entering Stage from the demo player, the rendered control set contains exactly five active controls: playlist return, previous, play/pause, next, and settings.
- A DOM focusability assertion reported `activeFocusableCount: 5`, `hiddenFocusableCount: 0`, and the live status `目前已暫停`. The full-player header and bottom transport are now conditionally unrendered in Stage rather than merely hidden with ARIA.

## Mobile Library entry regression
- At a real 390×844 headless viewport, Home now renders a visible 44×44 Library icon button in the mobile header with the accessible label `我的音樂庫`; the existing desktop nav remains breakpoint-scoped.
- The same 390×844 screenshot preserves the primary showcase CTA, compact discovery link, source/view/search controls, and no horizontal overflow.
