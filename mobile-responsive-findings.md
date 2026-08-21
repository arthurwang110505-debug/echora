# Mobile responsive findings

The 390 x 844 homepage screenshot shows a stable single-column layout. The header fits within the viewport, the hero artwork intentionally collapses away, the headline wraps without clipping, and the two CTA buttons stack vertically with comfortable touch targets. The first two metric cards stack cleanly; the lower page continues below the viewport rather than forcing horizontal overflow.

The 390 x 844 player screenshot captured the initial PlayerSkeleton state. The player header, current-track card, centered stage skeleton with orbit rings and waveform, and bottom playback control card all remain inside the viewport. The desktop queue is correctly hidden at this breakpoint, and the skeleton preserves the eventual mobile stage composition without horizontal overflow.

The primary mobile copy issue was not layout failure but tone: the previous hero CTA `先體驗歌詞舞台` was understandable but conversational and generic. The secondary `連接 YouTube Music` also read like an instruction rather than a premium next step. The final copy is `探索 Echora 舞台` and `同步你的音樂庫`; both remain explicit enough for accessibility while sounding like an invitation into the Echora product.

No horizontal clipping was visible in the captured viewport. The final 390px mobile screenshot also shows the updated CTA pair without clipping or overlap. The CTA change is implemented locally and is ready for the release gate; production has not yet been changed at this point in the note.
