# Local demo player browser smoke findings

Clicking the homepage `先體驗歌詞舞台` navigated to `/player?demo=1` without OAuth. The player rendered a five-track `本機展示佇列`, marked each queue item as `本機音檔`, displayed `Dancing in the Stardust` by `Free Sound Server`, and showed the estimated duration as `1:58`.

The player controls rendered a progress range input, previous/play/next controls, and a visible `Echora 本機音檔展示 · 不需登入或 YouTube` marker. The status panel correctly stated that this local showcase track has no verified synced lyrics and suggested importing `.lrc` or `.vtt` later.

After a full reload, the player restored the persisted local playback snapshot at approximately 0:42 and remained paused, which is the expected recovery behavior. A fresh play click changed the control from `▶ 播放` to `⏸ 暫停`, showed the active-song indicator, and advanced the progress from roughly 0:42 to 0:53, confirming the CDN MP3 loaded and HTML5 Audio `timeupdate` reached the store. Clicking pause changed the control back to `▶ 播放` and stopped the visible progress.

Queue navigation also passed in the browser: `下一首` loaded `Blue Knot` with a reset position and approximately 2:55 duration; `上一首` returned to `Dancing in the Stardust` with approximately 1:58 duration. Both tracks remained marked `本機音檔` and the stage artwork changed with the selected track.
