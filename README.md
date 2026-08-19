# Echora PWA

## License and upstream attribution

Echora is an AGPL-3.0 covered derivative work that incorporates UI and
visualizer work from [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major).
See [UPSTREAM_NOTICE.md](./UPSTREAM_NOTICE.md) for the source-availability and
attribution requirements.

以 Web 為核心的沉浸式歌詞播放器，能安裝到手機、iPad 與電腦主畫面。

## 架構

- **Single Web app**: Vite + React + PWA
- **Core**: 共用歌詞解析、視覺模式、AI 主題與 provider 邏輯
- **Responsive**: 同一套介面適配手機、iPad 與桌面瀏覽器

## 快速開始

```bash
pnpm install
pnpm dev
```

建構與預覽 production PWA：

```bash
pnpm build
pnpm --filter=@echora/web preview
```

## 部署到 Vercel

將此 repository 匯入 Vercel 即可。專案根目錄保持 repository root，`vercel.json` 已設定 workspace build 與 React Router rewrite。

在 Vercel Project Settings → Environment Variables 加入：

```text
VITE_SPOTIFY_CLIENT_ID
VITE_SPOTIFY_REDIRECT_URI=https://你的-vercel-domain.vercel.app/
VITE_YOUTUBE_API_KEY（可選）
```

同時將相同的 HTTPS 網址加入 Spotify Developer Dashboard 的 Redirect URI，然後重新部署。

開啟 `http://localhost:3000` 後，可以在支援的瀏覽器中選擇「加入主畫面」。不需要 Expo 或原生 app 開發環境。

## 音樂服務連線

Spotify 使用瀏覽器安全的 OAuth PKCE，不需要手動貼 access token：

1. 在 Spotify Developer Dashboard 建立一個 app。
2. 本機請將 `http://127.0.0.1:3000/` 加入 Redirect URI（正式環境使用 HTTPS 網址）。
3. 複製 `packages/web/.env.example` 為 `packages/web/.env`，填入 `VITE_SPOTIFY_CLIENT_ID`。
4. 重新啟動 `pnpm dev`，在 Echora 點「連接 Spotify」。

連線後會同步目前播放、播放／暫停、上一首／下一首、進度與 Spotify 私人歌單。播放控制需要 Spotify 帳號有可用的播放裝置；Spotify Web Playback SDK 的完整瀏覽器內播放則需要 Premium。

YouTube Music 目前採官方支援的 companion 模式：可使用 YouTube Data API 做公開音樂搜尋，歌曲會以 `music.youtube.com` 開啟。官方沒有提供可讓第三方 PWA 讀取個人 YouTube Music 播放狀態或直接控制播放的公開 API，因此 Echora 不會依賴 Piped／Invidious 這類不穩定的非官方鏡像。

## 功能

- 7 種歌詞視覺模式
- AI 主題生成
- Spotify OAuth PKCE 與播放／歌單同步
- YouTube Music 官方搜尋與 companion link
- Responsive 歌詞舞台
- PWA 安裝與離線 app shell
