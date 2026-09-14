# Google OAuth 品牌驗證 + Search Console 網域驗證

這份文件對應「Google Auth Platform（舊名 OAuth 同意畫面）→ 品牌驗證」被退件、
或在「驗證網域擁有權」卡住時要處理的事。內容分成三塊：

1. **需要你在瀏覽器裡完成的操作**（我沒有你的 Google 帳號，做不到）。
2. **這個 repo 已經先幫你準備好的東西**——Google 對首頁、隱私權政策、robots.txt、
   驗證 meta 標籤的要求，程式碼這邊都補上了。
3. **常見退件原因與排除方式**（包含 `*.vercel.app` 這種共用網域的處理順序）。

---

## 0. 名詞先對齊：Google 其實要求兩件事

| 名稱 | 在哪裡做 | 目的 |
| --- | --- | --- |
| **Search Console 網域（擁有權）驗證** | [Google Search Console](https://search.google.com/search-console) | 證明「這個網域是你的」。Google 只認 Search Console 的驗證結果，其他方式（例如把檔案放上主機）不算。 |
| **OAuth 品牌驗證（Brand verification）** | [Google Cloud Console → Google Auth Platform → Branding](https://console.cloud.google.com/auth/branding) | 審查同意畫面上顯示的名稱、Logo、首頁、隱私權政策、服務條款是否符合規範，並確認上面那些網域都已經完成擁有權驗證。 |

兩者的關係：**品牌驗證會去看 Search Console 的驗證狀態**。所以 Search Console 沒過，
品牌驗證一定不會過。

官方規則：

- 首頁必須在「你已驗證擁有權」的網域上，而且必須**說明 App 的功能**（不能只是登入頁），
  並提供隱私權政策與（選填）服務條款的連結。
- 隱私權政策必須和首頁**同一個網域**、可以公開存取，且必須揭露 App 如何存取／使用／儲存／分享
  Google 使用者資料（Google API Services User Data Policy，含 Limited Use）。
- OAuth 用戶端裡設定的 redirect URI / JavaScript origin 所屬網域，也要一起驗證。

---

## 1. 你要做的步驟

### 步驟 1：在 Search Console 驗證 `echora-three.vercel.app`

1. 用「**同時是 Cloud 專案 Owner/Editor 的那個 Google 帳號**」登入 Search Console
   （Google 明文要求：驗證擁有人必須是該 GCP 專案的 owner/editor）。
2. 左上角資源選單 → **新增資源** → 選 **網址前置字元 (URL prefix)** → 輸入
   `https://echora-three.vercel.app/`
   - 不要用「網域 (Domain)」資源：那需要改 DNS TXT 記錄，`vercel.app` 的子網域沒有自己的 DNS 控制權。
   - 網址要完全一致（`https://`、沒有多餘路徑或結尾斜線差異）。
3. 選 **HTML 標記** 或 **HTML 檔案** 其中一種（兩種 repo 都支援，見下一節）。
4. 部署完成後回到 Search Console 按「**驗證**」，看到綠色「擁有權已驗證」即可。

> **關於共用網域的注意事項**：Google 把 `vercel.app`、`onrender.com`、`github.io` 這類
> 共用主機後綴視為 Public Suffix List 的一員，所以**欄位只能填 `echora-three.vercel.app`
> 這一整串，不能填 `vercel.app`**（填了會出現 “must be a top private domain” 之類的錯誤）。
> 少數情況下 Google 仍會要求你擁有「可註冊的頂級私有網域」；真的被擋住時請看文末的
> 「Plan B：綁自訂網域」。

### 步驟 2：把驗證資訊放進專案（二選一）

**方法 A — HTML 標記（推薦，不用新增檔案）**

Search Console 會給你一段 `<meta name="google-site-verification" content="...">`。
把 `content` 的值（或整段標籤，腳本兩種都吃）設成環境變數即可，建置時會自動注入 `<head>`：

```bash
# 1) 先在本機確認
node scripts/google-search-console-verify.mjs meta <驗證內容或整段 meta 標籤>

# 2) Vercel → 你的專案 → Settings → Environment Variables 新增
#    VITE_GOOGLE_SITE_VERIFICATION = <驗證內容>
#    （勾選 Production，建議 Preview 也一起；加完要 Redeploy）

# 3)（可選）本機 packages/web/.env.local 也可以先測
#    VITE_GOOGLE_SITE_VERIFICATION=<驗證內容>
```

完成後首頁原始碼（檢視網頁原始碼，不是 Inspect Element）應該看到：

```html
<meta name="google-site-verification" content="..." />
```

**方法 B — HTML 檔案**

Search Console 會給你一個檔名像 `google1a2b3c4d5e6f.html` 的檔案：

```bash
node scripts/google-search-console-verify.mjs file google1a2b3c4d5e6f.html
git add packages/web/public/google1a2b3c4d5e6f.html
git commit -m "chore: add Google Search Console verification file"
git push      # Vercel 自動部署
```

檔案會直接放在 `packages/web/public/`，部署後 `https://echora-three.vercel.app/google….html`
會回傳 `google-site-verification: google….html`。**驗證完成後不要刪掉它**，Search Console 之後會回來複查。

> 不要用 DNS TXT 的方式：`vercel.app` 子網域的 DNS 由 Vercel 控制，你改不到根網域的 TXT 記錄。

### 步驟 3：填 Google Auth Platform → Branding

到 [Google Auth Platform → Branding](https://console.cloud.google.com/auth/branding)（舊介面是
「OAuth 同意畫面」），填入與網站一致的值：

| 欄位 | 建議值 |
| --- | --- |
| App name | `Echora`（要和網站標題／PWA 名稱一致，不要寫成「歌詞播放器」這種通用描述） |
| 使用者支援電子郵件 | 你自己會收信的地址 |
| App logo | 需要用 `packages/web/public/echora-icon-512.png`（512×512 PNG） |
| 應用程式首頁 | `https://echora-three.vercel.app/` |
| 隱私權政策 | `https://echora-three.vercel.app/privacy` |
| 服務條款 | `https://echora-three.vercel.app/terms` |
| Authorized domains | `echora-three.vercel.app` |
| 已授權的 JavaScript 來源（Credentials → OAuth client） | `https://echora-three.vercel.app`（本機再加 `http://localhost:3000`） |
| 已授權的重新導向 URI | `https://echora-three.vercel.app/oauth/youtube/callback` |

> 注意：Branding 的修改會先存成 **Draft**，要按 **Publish branding** 才會生效；
> 且驗證進行中不能改 branding，要改必須先按 Cancel 取消該次驗證。

### 步驟 4：送出品牌驗證 / 敏感範圍驗證

`https://www.googleapis.com/auth/youtube.readonly` 是 **sensitive scope**：除了品牌驗證，
還要送 **敏感範圍驗證**（Google 公告約 10 個工作天），需要：

- 範圍用途說明（可直接用下面這段的英文版）：

  > Echora is a browser-based lyrics player for the user's own music. We request
  > `https://www.googleapis.com/auth/youtube.readonly` solely to list the signed-in user's own
  > playlists (`playlists.list`) and the videos inside them (`playlistItems.list`) so the app can
  > display and play them through the official YouTube IFrame Player. We never write data, never
  > request additional scopes, do not use the data for advertising, do not sell or transfer it to
  > third parties, and do not allow humans to read it. Access tokens and playlist caches stay in the
  > browser (localStorage) of the device that signed in; Echora's servers never receive Google user data.

- **示範影片**（上傳到 YouTube，設為「不公開 Unlisted」），要一鏡到底看到：
  1. 從 Echora 按下「連接 YouTube Music」開始。
  2. **英文介面的同意畫面**（把畫面左下角語言切到 English），並顯示 App 名稱 `Echora`。
  3. 瀏覽器網址列**包含你的 OAuth client ID**（`...client_id=xxxx.apps.googleusercontent.com...`）。
  4. 授權完成後，App 內真的讀到你的私人歌單、選一首歌並播放（證明 scope 的用途）。
  5. 登出（Settings → Privacy 的 YouTube 登出）與撤銷授權的流程。

---

## 2. Repo 這邊已經準備好的東西

| Google 的要求 | 對應的程式碼 | 狀態 |
| --- | --- | --- |
| 首頁要說明 App 功能（不能只是登入頁） | `packages/web/src/pages/Welcome.tsx`（Landing Page）+ `packages/web/index.html` 的靜態摘要 | ✅ |
| 首頁要能連到隱私權政策／服務條款 | Landing footer 改成真正的 `<a href="/privacy">`、`<a href="/terms">`（原本是 JS `onClick`，爬蟲與審查工具看不到） | ✅ |
| 隱私權政策要揭露 Google 使用者資料的存取／用途／儲存／分享／保存 | `Privacy.tsx` 的「Google 使用者資料（YouTube API Services）」段落，含 Limited Use 逐字聲明、scope、撤銷連結 | ✅ |
| 要有撤銷存取權的入口 | 隱私權政策 + 服務條款 + Settings 的「管理 Google 帳號存取權」連結；App 內登出同時呼叫 `oauth2.googleapis.com/revoke` | ✅ |
| YouTube API Services 條款連結 | 首頁 footer、隱私權政策、服務條款都放了 YouTube ToS / Google 隱私權政策 / YouTube API Services ToS | ✅ |
| Search Console 的 HTML 標記 | `packages/web/vite-plugins/siteMetadata.ts`，由 `VITE_GOOGLE_SITE_VERIFICATION` 注入，dev 與 build 都會注入 | ✅ |
| Search Console 的 HTML 檔案 | `scripts/google-search-console-verify.mjs file …` 會寫進 `packages/web/public/` | ✅ |
| 網站要有 robots.txt / sitemap.xml | 同一個 plugin 會產生（dev 由 middleware 供應、build 產生實體檔案），並在 robots.txt 指向 sitemap | ✅ |
| 頁面要有 canonical / OG 標籤 | 同一個 plugin 依 `VITE_SITE_URL` 產生 | ✅ |

新增的環境變數（都可以留空，留空時用預設值）：

```text
VITE_SITE_URL=https://echora-three.vercel.app     # canonical / OG / sitemap 用的網址
VITE_GOOGLE_SITE_VERIFICATION=                    # Search Console HTML 標記的 content
```

> 換網域（例如之後綁自訂網域）時，記得同時更新 `VITE_SITE_URL`、
> Search Console 的資源、以及 OAuth client 的 JavaScript 來源與 redirect URI。

---

## 3. 常見退件原因與排除

| 症狀 | 原因 | 處理 |
| --- | --- | --- |
| Search Console 說找不到驗證標記／檔案 | Vercel 還沒部署完就按驗證，或環境變數沒勾選 Production | 用無痕視窗開 `https://echora-three.vercel.app/`，看原始碼是否真的有 `<meta name="google-site-verification">`；檔案法就直接開 `https://echora-three.vercel.app/google….html` |
| 驗證檔案被 App 蓋掉（回傳 HTML 而不是驗證內容） | 檔案不在 `packages/web/public/`，被 `vercel.json` 的 `/(.*) → /index.html` rewrite 接走 | 只放在 `public/`（本 repo 的腳本會放對位置）。既有的靜態檔如 `/favicon.png` 證明實體檔案優先於 rewrite |
| `robots.txt` 回傳的是 App HTML | 以前沒有產生 robots.txt，這個 SPA 的所有未知路徑都被 rewrite 成首頁 | 本 plugin 已修正（`https://<domain>/robots.txt`、`/sitemap.xml` 現在會回正確內容） |
| 品牌驗證退件說 “homepage URL is not registered to you” | Search Console 用的帳號不是 GCP 專案的 owner/editor，或驗證的是別的資源（例如帶 `www`、`http://`） | 換成正確帳號重新驗證，網址字串要與 Branding 欄位完全一致 |
| 品牌驗證退件說首頁／隱私權政策不合規 | 首頁沒有描述功能、隱私權政策沒有揭露 Google 資料用途、或政策頁連不到 | 本 repo 已補上（見上一節表格）。若還被退，請把 Google 的原文要求貼給我，我照著改條文 |
| `Invalid domain: must be a top private domain` | 在 Authorized domains 填了 `vercel.app` | 改填 `echora-three.vercel.app` |
| 同意畫面還是顯示「未驗證的應用程式」 | 品牌驗證還沒通過，或 scope 還沒通過敏感範圍驗證 | 這是預期行為；測試期間可先把測試帳號加進 Audience → Test users（上限 100 個） |
| Google 抓不到網頁（回 401/403 或登入頁） | Vercel 專案的 Deployment Protection / Vercel Authentication 開啟中，只有團隊成員能開網站 | Vercel → Settings → Deployment Protection 關閉（或至少讓 Production 公開）。**實測：本專案的 Preview 部署目前受 SSO 保護**（會跳到「Protected Deployment – Vercel」登入頁），Production（`echora-three.vercel.app`）目前公開可用。所以驗證一定要在正式網域上做，不要在 preview 網址上測，會看到登入頁 |
| Google 要求「隱私權政策頁面」的原始 HTML | 這是 SPA：`/privacy`、`/terms` 由瀏覽器端渲染，非 JS 抓取只會拿到首頁外殼（外殼裡有完整說明與 Limited Use 聲明，但沒有整份政策） | 目前通常不影響審查（審查人員用瀏覽器看）；真的被要求時可以替這兩個路由加 prerender／靜態輸出，我再處理 |
| 使用者人數／權杖 7 天就過期 | 發布狀態仍是 Testing | 通過驗證後改為 Published |

### Plan B：綁自訂網域（Google 堅持要「頂級私有網域」時）

1. Vercel → 專案 → Settings → Domains → 加入你的網域（例如 `echora.app`）。
2. Vercel 環境變數：`VITE_SITE_URL=https://你的網域`，重新部署。
3. Search Console 新增「網域 (Domain)」資源 → 到 DNS 加 TXT 記錄 → 驗證。
4. Google Auth Platform → Branding 的首頁／隱私權政策／服務條款／Authorized domains 全部改成新網域；
   Credentials 的 JavaScript 來源與 redirect URI 也要加新網域。
5. 重新送品牌驗證（進行中要先 Cancel 才能改 branding）。

---

## 4. 我（AI）沒辦法幫你做的部分

- 登入你的 Google 帳號操作 Search Console / Cloud Console。
- 取得驗證 token 或驗證檔名（只有你在 Search Console 畫面看得到）。
- 錄製與上傳驗證用的示範影片。
- 按下「驗證」與「發布品牌資訊」這兩個按鈕。

把 token 貼給我或跑上面的腳本都可以；token 內容本身不是機密，但只有該網域的驗證值有用。

---

## 5. 之後可以考慮的強化（目前不影響驗證）

- Echora 的 YouTube 登入目前使用 OAuth **implicit flow**（`response_type=token`）。
  RFC 9700 / OAuth 2.1 已把它標為 deprecated（Spotify 已在 2025-11-27 硬性移除），
  Google 目前仍支援，但審查人員有可能關切。要改的話是 **Authorization Code + PKCE**，
  需要一支 serverless function 做 token exchange（這個 repo 已經有 `api/` 目錄可用），
  適合當成獨立的一個 PR 處理。
