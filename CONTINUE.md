# Echora continuation handoff

## Project

- Target app: `folia-mobile/packages/web`
- Framework: Vite + React + TypeScript + PWA
- Package manager: pnpm workspace
- Production domain: `https://echora-three.vercel.app`
- Deploy from: repository root `folia-mobile`, using `vercel --prod`

## Current implementation

- Original Folia visualizer source is copied to `packages/web/src/original-folia-visualizers`.
- The 193 visualizer files were compared against the downloaded Folia source and currently match byte-for-byte.
- `OriginalFoliaVisualizerStage.tsx` adapts Echora lyric timestamps from milliseconds to Folia's seconds contract.
- Immersive stage uses browser Fullscreen API and attempts mobile landscape orientation lock.
- Spacebar toggles play/pause when focus is not an input.
- Immersive mode hides the header, progress bar, visualizer chip row, and visible YouTube iframe.
- Tuning panel is a small bottom-right overlay. It can switch visualizer mode, background mode, motion amount, font scale, enable auto mode, and close with `×`.
- YouTube OAuth and playlist loading live in `packages/web/src/integrations/youtubeAuth.ts`, `packages/web/src/store/playerStore.ts`, and `packages/core/src/providers/ytmusic.ts`.

## Important limitations

- YouTube IFrame API provides playback time/control but not raw PCM/FFT data to the parent page. True Folia audio spectrum reactivity requires a same-origin/local audio source or another permitted audio pipeline.
- Bundled demo cards are metadata-only. The player now attempts to resolve missing demo video IDs through YouTube search; this requires `VITE_YOUTUBE_API_KEY`. Playlist tracks should already carry an 11-character YouTube video ID.
- YouTube Data API playlist access requires the OAuth test user to be configured in Google Cloud and the `youtube.readonly` scope to be granted.

## Verification commands

```powershell
cd "C:\Users\mbbtt\OneDrive\桌面\Folia\folia-mobile"
pnpm --filter=@echora/web exec tsc -- --noEmit --pretty false
pnpm --filter=@echora/web build
vercel --prod
```

## Next recommended work

1. Replace the compact custom tuning overlay with the copied `VisPlaygroundSettingsPanel.tsx`, wiring all original tuning/background/subtitle props to persistent Zustand settings.
2. Add a local/audio-element playback path with `AudioContext` + `AnalyserNode`, then pass real `AudioBands` to `OriginalFoliaVisualizerStage`.
3. Add YouTube API pagination and inspect/log the exact API response when playlists are empty.
4. Run a browser smoke test on the production URL: OAuth callback, playlist load, playlist track playback, fullscreen, Esc exit, Space pause, and Tuning close.
