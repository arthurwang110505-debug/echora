# Local demo browser smoke findings

The local Vite homepage rendered successfully after waiting for React startup. The page defaulted to `Echora 本機展示`, showed the pre-login hero CTA `先體驗歌詞舞台`, showed the secondary `連接 YouTube Music` CTA, and displayed five local showcase tracks.

A UI bug was observed in the screenshot and extracted page content: all five local showcase cards display the source badge `SPOTIFY`, even though their `Song.source` is `local`. The SongCard source badge must be changed to show `本機音檔` for local tracks before release.
