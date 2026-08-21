# Skeleton loading smoke findings

- The local homepage at `http://localhost:3001/` loaded into the real Echora page without a blank-state layout jump. The 3D carousel, hero artwork, five-track local queue, source labels, and CTA were present after loading.
- The local player at `http://localhost:3001/player?demo=1` loaded the real player with the five-track queue, the generated Dancing in the Stardust cover, and the lyricless Soundscape stage. The cover/card dimensions remained stable while assets were resolved.
- Skeleton SSR regression tests cover the global route loader, home hero, 3D carousel, player layout, and stage layout. The image wrapper uses `aria-busy` while artwork is unresolved and removes it after `onLoad`.
- The development server used port 3001 because an older process held port 3000; port 3001 returned the current source bundle successfully. This is local verification only and does not affect the production domain.
