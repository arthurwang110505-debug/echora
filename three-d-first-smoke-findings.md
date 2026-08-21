# 3D-first and soundscape browser smoke findings

The local homepage initially rendered with the `🌌 3D 輪播` control selected and the five local showcase tracks visible in the 3D coverflow. No performance, bandwidth, traffic-reduction, or first-use confirmation dialog appeared. The optional `▦ 網格列表` control remained available.

The first browser navigation briefly showed a blank white frame while React was starting; after waiting for the page to settle, the app rendered normally. This is a development-server startup timing observation, not a runtime failure after initialization.

The local demo player rendered the new `Echora Soundscape · 無同步歌詞` stage for `Dancing in the Stardust`. The stage showed the cover artwork with a blurred color field, dual orbit rings, floating particles, a waveform, and the title/artist; it did not leave the central stage empty. The player status remained explicit that the audio had no verified synced lyrics.

Browser playback controls remained visible. The local audio snapshot advanced from 0:00 to approximately 0:12 and then 0:26 during the direct playback interactions; the UI kept the local queue, cover artwork, and Soundscape stage intact. The browser extraction intermittently reported the play button as paused after the click while the position advanced, so the exact button-state timing remains a browser smoke observation rather than a new product regression; the pre-existing local audio controller tests and earlier playback validation remain the primary playback evidence.

After reload and persisted queue recovery, `Blue Knot` rendered through the same Soundscape stage with its own blue artwork, artist metadata, `Echora Soundscape · 無同步歌詞` label, orbit treatment, and waveform. No duplicate generic lyrics status card was shown over the stage.

Reduced-motion verification on the player confirmed `.soundscape-stage` and `.soundscape-waveform` remain rendered. With `document.documentElement.dataset.motion = "reduced"`, computed animation duration for the Soundscape glow and particles was `0.00001s`, while the orbit animation was `none`; the visual fallback remains available without continuous motion.
