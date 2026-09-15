# Echora PWA 快速開始指南

## 環境要求

- Node.js >= 18
- pnpm >= 9
- 支援 Service Worker 的現代瀏覽器

## 安裝與開發

```bash
cd echora-mobile
pnpm install
pnpm dev
```

## 建構與預覽

```bash
pnpm build
pnpm --filter=@echora/web preview
```

## 使用方式

- 開發網址：`http://localhost:3000`（`/` 是 Landing Page，`/app` 直接進入播放器）
- 手機／iPad：用瀏覽器開啟部署網址，再選擇「加入主畫面」；安裝後開啟會直接進入 `/app` 的歌單選擇
- 桌面：可使用瀏覽器提供的安裝按鈕
- 不需要 Expo Go、React Native 或獨立 mobile app

## 專案結構

```text
echora/
├── packages/
│   ├── core/              # 共用歌詞、provider、visualizer 邏輯
│   └── web/               # 唯一的 responsive Vite PWA app
├── scripts/
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```
