# Cover integration smoke findings

The local Vite homepage loaded the generated `/covers/dancing-in-the-stardust.webp` artwork in the hero preview and rendered the five local tracks in the 3D-first library. The extracted page content confirmed the following production-facing cover paths: `/covers/dancing-in-the-stardust.webp`, `/covers/blue-knot.webp`, `/covers/sun-beneath-a-song.webp`, `/covers/stardust-pop-idol.webp`, and `/covers/ocean-morning.webp`.

The homepage continued to show the `本機音檔` source label for each track and the existing local showcase CTA. The visual result kept the dark Echora composition while replacing the previous generated-letter placeholder artwork with distinct cosmic, blue-knot, golden sound-wave, holographic pop, and ocean-dawn imagery.

After reloading `/player?demo=1`, the persisted `Blue Knot` track used `/covers/blue-knot.webp` in the queue thumbnail, player header, and Soundscape stage. The five-track local queue displayed all five distinct WebP covers without falling back to the previous `BK`/initial-letter placeholder artwork.
