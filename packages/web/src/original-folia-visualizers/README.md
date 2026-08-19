# Original Folia visualizer source

This directory is a verbatim source snapshot copied from the downloaded Folia project:

`folia-major-main/src/components/visualizer`

It contains the original visualizer modes, entries, shared runtime, backgrounds, and mode-specific source. The Expo Native app cannot import these files directly because several modes render through browser DOM, Canvas, Pixi, or Three.js APIs. `../../App.tsx` therefore uses a native adapter for the stage while keeping this source available as the reference implementation for future Expo Web/WebView integration.

Modes copied from the original project:

- classic / 浮名
- cadenza / 流光
- partita / 群唱
- fume / 傾訴
- monet / 鏡台
- cappella / 心象
- pendolo / 云階
- sonnet / 詩篇
- claddagh / 齒輪
- diorama / 舞台
- tilt / 傾斜
