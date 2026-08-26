# Echora 改進企劃交付清單

- [x] 對照既有綜合改進報告、目前程式碼與正式網站，逐項確認剩餘範圍及可驗收標準。
- [x] 完成 YouTube Music OAuth 工作階段驗證、歌單同步、帳戶／權限錯誤訊息與重新連線流程。
- [x] 完成 YouTube IFrame 真實播放狀態、播放／暫停／進度、播放失敗與手機沉浸舞台控制流程。
- [x] 完成同步歌詞解析、去重、同步、無歌詞／純音樂 fallback 與對應錯誤狀態。
- [x] 完成 /library 與播放器的共用音樂資料來源、已同步歌單呈現及資料一致性。
- [x] 完成首頁、播放器與設定流程的鍵盤操作、ARIA 語意、焦點可見性與行動版響應式可及性。
- [x] 完成播放器與首頁的效能改善，包括大型模組載入策略、資源成本與減少動態效果偏好支援。
- [x] 補齊單元與整合回歸測試，覆蓋 OAuth、歌單同步、播放、暫停、歌詞 fallback、全螢幕與手機返回歌單。
- [x] 執行型別檢查、測試、受限記憶體下的生產建置與桌面／手機視覺驗證。
- [x] 推送完成版本至 GitHub `master`，觸發並核對 Vercel 正式部署。
- [x] 診斷並修正正式環境重整後首頁短暫顯示即全黑的 P0 執行期故障。
- [x] 降低首次載入成本，避免重整後長時間白屏／黑屏，並提供可見載入與失敗回復狀態。
- [x] 驗證正式環境重整、慢網路載入與錯誤邊界，推送 GitHub 並重新部署 Vercel。
- [x] 校正 YouTube 真實播放時間與歌詞時間軸，修正歌詞與音樂不同步。
- [x] 修正暫停與部分視覺場景切換時的執行期錯誤，並提供安全 fallback。
- [x] 離開播放器或返回歌單時完整卸載 YouTube IFrame 與其事件監聽。
- [x] 補齊播放、暫停、場景與離頁回歸測試，推送 GitHub 並重新部署 Vercel。
- [x] 重現並修正實際 YouTube 暫停按鈕導致的錯誤畫面，不以錯誤邊界掩蓋根因。
- [x] 將歌詞同步「−／同步／＋」控制放入手機、雙欄與沉浸舞台均可見的操作位置。
- [x] 歌單選擇側欄展開時暫時隱藏 YouTube 原生播放器，避免遮擋歌單，關閉側欄後再恢復。
- [x] 逐項重審完整改進企劃，標示已驗收、待補強與受外部憑證限制的項目，完成可實作範圍的回歸測試與正式驗收。
- [x] 修正切換沉浸舞台時的 DOM `insertBefore` 錯誤，避免全螢幕操作再度進入錯誤頁面。
- [x] 完成收藏曲目持久化與首頁／音樂庫入口，補齊 ECH-010 的個人化探索範圍。
- [x] 建立不傳送敏感資料的本機診斷事件紀錄與設定頁檢視入口，補齊 ECH-013 的可觀測性基礎。
- [x] REC-P0-01：讓首頁 hero 的服務標籤、封面與 CTA 隨 Spotify、YouTube Music／本地音樂或未連線狀態保持一致。
- [x] REC-P0-02：釐清播放器來源篩選、混合佇列與各曲目播放服務的關係，讓來源切換的影響範圍可被辨識。
- [x] REC-P0-03：區分等待原生播放、載入歌詞、同步歌詞可用與無同步歌詞狀態，並為每種狀態提供下一步。
- [x] REC-P1-01：依帳戶連線狀態整理首頁主 CTA，將安裝與未啟用服務降為次要資訊。
- [x] REC-P1-02：將首頁探索調整為先選來源再選內容，讓 3D／網格成為瀏覽方式而非服務決策。
- [x] REC-P1-03：為最近播放與收藏曲目的重複項目提供分組意義或合併小型資料集的呈現方式。
- [x] REC-P1-04：將歌詞校正與舞台設定收納為次層操作，保留播放傳輸控制作為第一層。
- [x] REC-P1-05：將設定頁分為播放與外觀、連線與隱私、進階實驗功能，並說明 AI API Key 的資料處理方式。
- [x] REC-P2-01：將本機診斷事件轉為中文可讀描述，並提供不含敏感資料的診斷摘要複製功能。
- [x] REC-P2-02：將 Spotify 顯示為非可選的鎖定狀態卡，避免被誤認為可播放但故障的來源。
- [x] REC-P2-03：為 3D 模式提供效能提示、偏好記憶與 reduced-motion 下的網格預設。
- [x] 補齊 REC-P0-01 至 REC-P2-03 的單元測試、型別檢查、桌面／手機視覺驗證與關鍵回歸流程。
- [x] 檢視完整差異、提交並推送核准範圍至 GitHub `master`，建立發布前檢查點與 Vercel 發布交接。

## Final website quality scan implementation follow-up
- [x] REC-P0-01：重新驗證來源、示範內容與 playability 狀態的一致性，避免未連線曲目呈現假性播放。
- [x] REC-P0-02：重新驗證播放器跨頁恢復、provider 狀態與第三方播放器等待／阻擋提示的一致性。
- [x] REC-P1-01：明確標示本機最近播放／收藏與雲端私人歌單的資料邊界。
- [x] REC-P1-02：補強佇列與 3D 輪播的原生鍵盤語意、焦點與局部快捷鍵。
- [x] REC-P1-03：提供可保存的 Reduced Motion「依系統／開啟／關閉」設定。
- [x] REC-P1-04：補齊對話框初始焦點、Escape、focus trap 與關閉後焦點還原。
- [x] REC-P1-05：補強行動版沉浸模式與 safe-area 的可驗收狀態（沉浸控制列與播放器 surface 已使用 safe-area inset；本輪未以真機驗證）。
- [x] REC-P1-06：將 BYOK 資料流向與費用風險說明清楚，避免 Gemini key 暴露於 query string。
- [x] REC-P2-01：確認本機診斷摘要與清除流程不含敏感資料。
- [x] REC-P2-02：確認 Spotify 未啟用時為鎖定狀態且不會被誤認為可播放來源。
- [x] REC-P2-03：確認 3D 效能提示、偏好記憶、PWA 與 bundle budget（stage runtime 已延後載入，Player 初始 chunk 約 29KB；stage chunk 約 1.45MB 的 build warning 保留為後續優化）。
- [x] Final verification：lint、test、typecheck、build 與桌面瀏覽器 smoke check 已通過；手機以 safe-area／responsive code review 驗收，尚未使用真機。
- [x] Delivery：已建立 `aa7454c`、推送 `master`，並確認 Vercel production deployment `dpl_2fQMennV8dZPhdzHqNMbBojDPQqY` 為 READY；production domain 已完成首頁與設定頁 smoke check。

## Pre-login lyrics demo CTA
- [x] DEMO-001：未連線 YouTube Music 時，首頁主 CTA 改為先體驗歌詞舞台，次 CTA 才是連接服務。
- [x] DEMO-002：主 CTA 以現有內建示範曲目進入播放器，不要求 OAuth；播放器顯示展示模式提示，為後續本機音檔與同步歌詞接入保留入口。
- [x] DEMO-003：已連線狀態維持回到正在播放／重新同步歌單的 CTA，不破壞已登入流程。
- [x] DEMO-004：完成首頁、播放器的 typecheck、test、lint、build、本地 production-like smoke check 與正式 Vercel deployment 驗證。

## Local audio showcase tracks
- [x] AUDIO-001：將五首使用者提供的 MP3 以不進 Git 的 CDN 媒體 URL 建立本機展示曲目 metadata。
- [x] AUDIO-002：未登入展示 CTA 與首頁展示來源改用五首 `local` 音檔，保留 YouTube Music 連線 CTA 與已登入流程。
- [x] AUDIO-003：為本機展示曲目接入持久 HTML5 Audio 播放、播放／暫停、進度、seek、上一首／下一首、音量與 ended 狀態，同步 Zustand 播放狀態與 Media Session。
- [x] AUDIO-004：為五首音檔提供內建、免網路 lyrics fallback，並在播放器清楚標示本機展示來源與歌詞狀態。
- [x] AUDIO-005：完成本機音檔播放的單元／整合測試、typecheck、lint、build、瀏覽器 smoke check，提交 GitHub `master` 並驗證 Vercel production deployment。

## 3D-first and lyricless soundscape
- [x] UX-3D-001：首頁探索區預設直接使用 3D 輪播，不顯示效能／流量降低提示，也不因首次進入而攔截使用者。
- [x] UX-3D-002：首頁保留網格作為可選瀏覽方式，但不以 reduced-motion 或未看過提示強制改變預設 3D 行為。
- [x] UX-SOUND-001：無同步歌詞或純音樂曲目顯示專用沉浸式聲景背景，含封面色彩、音樂脈動、粒子／光暈與清楚的無歌詞狀態，不留下空舞台。
- [x] UX-SOUND-002：有同步歌詞的曲目維持原有 Folia 歌詞舞台；無歌詞聲景背景支援播放、暫停、切歌、響應式版面與 reduced-motion 偏好。
- [x] UX-SOUND-003：完成測試、typecheck、lint、build、桌面／行動瀏覽器 smoke check，提交 GitHub `master` 並驗證 Vercel production deployment。

## Mobile responsive and premium CTA
- [x] UX-MOBILE-001：以 390px 行動視窗驗證首頁、3D 輪播、CTA、播放器與 Soundscape，不出現水平溢出或主要內容遮擋。
- [x] UX-MOBILE-002：將首頁未登入與本機展示 CTA 改為品牌化、精簡且仍可理解的行動語言；保留已登入與來源連線狀態的語意。
- [x] UX-MOBILE-003：完成桌面／行動瀏覽器驗證、測試、typecheck、lint、build，提交 GitHub `master` 並驗證 Vercel production deployment。

## Homepage headline refinement
- [x] UX-HOME-001：將首頁未登入／本機展示 Hero 主標題改為品牌化語句，完成 desktop／mobile smoke check、測試、typecheck、lint、build 與 Vercel production 驗證。

## Player mobile immersive UX refinement
- [x] UX-PLAYER-001：修正行動版歌詞舞台的文字溢出、裁切與控制列遮擋問題，並保留長行可讀性。
- [x] UX-PLAYER-002：移除沉浸舞台常駐狀態 Banner，改為低干擾的狀態呈現。
- [x] UX-PLAYER-003：修復歌詞校正 −／同步／＋操作，使 offset 真正影響 active lyric 計算並補回歸測試。
- [x] UX-PLAYER-004：將全螢幕控制收合為必要操作加單一 Settings 入口，支援展開、收合、Escape、外部點擊與鍵盤操作。
- [x] UX-PLAYER-005：將行動版歌單改為 overlay drawer，避免壓縮右側舞台；桌面雙欄維持合理最小寬度與可讀性。
- [x] UX-PLAYER-006：完成 390／393px 與桌面瀏覽器驗證、測試、typecheck、lint、build，提交 GitHub `master` 並驗證 Vercel production deployment。

## Player demo lyrics and controls follow-up
- [x] UX-PLAYER-007：修正歌單按鈕與「← 歌單」返回流程，確保行動版可到達完整歌單畫面，並補 drawer 開啟回歸測試。
- [x] UX-PLAYER-008：恢復 `夜に駆ける`、`First Love`、`アイドル` 的展示歌詞載入，確認 demo ID 與 lyrics lookup 不被 playback URL 覆寫。
- [x] UX-PLAYER-009：讓五首本地音檔使用可合法整合的歌詞資料；無可核實歌詞者保留明確無歌詞狀態，不臆造內容。
- [x] UX-PLAYER-010：將歌詞校正控制改為清楚的「提前／同步／延後」標籤與數值反饋，補 mobile／desktop 互動驗收。
- [x] UX-PLAYER-011：完成測試、typecheck、lint、build、390／393px 與 desktop smoke，提交 GitHub `master` 並驗證 Vercel production deployment。

## Player Folia stage and lyric precision follow-up
- [x] FOLIA-001：以 GitHub repository 內的 Folia original renderer 為基準，修正 Fume／Monet／Diorama 切換後不再靜默回落 Classic，並讓 Diorama 顯示可見內容。
- [x] FOLIA-002：Settings／tuning 開啟時暫時隱藏下方 subtitle／upcoming lyric overlay，避免遮擋固定對話框；關閉後恢復。
- [x] FOLIA-003：以 stage 實際容器尺寸與 landscape 可用高度限制歌詞行寬、縮放、旋轉與位移，避免桌面／橫向裝置裁切或水平溢出。
- [x] FOLIA-004：將沉浸播放器 Settings 的舞台動畫選擇與舞台控制放在歌詞校正之前，並補足模式錯誤的可見 recovery。
- [x] FOLIA-005：播放器、設定頁、骨架與首頁／輪播等使用者可見 icon 全面改用 Lucide React，不留 emoji icon。
- [x] FOLIA-006：細分五首本地展示音檔的展示轉錄歌詞時間段與 word timings，補同步邊界／時間軸回歸測試，並保持非官方歌詞透明標示。
- [x] FOLIA-007：完成 desktop、390×844、393×852 與橫向窄高舞台 browser smoke，通過 release gate、GitHub master push 與 Vercel production 驗證。

## Stage-first product experience refinement
- [x] ECHORA-P0-01：首頁預設以可立即播放的本機展示曲目作為第一個互動，讓未登入使用者一鍵進入歌詞舞台；服務來源與 OAuth 僅在使用者需要播放自己的音樂時出現。
- [x] ECHORA-P0-02：重整首頁資訊層級與行動版觸控流程，以「選歌 → 播放 → 進入 Stage」取代來源／技術設定的前置決策，並保留 YouTube、Spotify 與本機曲目的既有行為。
- [x] ECHORA-P0-03：將播放器的 Stage 入口與沉浸模式表達為核心體驗，預設保留歌曲資訊、傳輸控制與歌詞／Stage 操作；既有校正、視覺器與進階調校持續收納於次層設定。
- [x] ECHORA-P1-01：將音樂庫重整為「最近播放、收藏、我的歌單」優先的音樂 App 資訊層級，將同步、來源與本機保存資訊降至次要描述，並維持既有同步與錯誤回復流程。
- [x] ECHORA-P1-02：將 AI 主題功能改為「為這首歌生成舞台」的歌曲情境流程，使用目前歌曲與已取得歌詞作為輸入；保留 BYOK、Gemini／OpenAI 選擇與不持久化金鑰的既有安全邊界。
- [x] ECHORA-P1-03：將安裝入口改為自然的「像 App 一樣使用 Echora／加到主畫面」文案，保留現有 PWA manifest、service worker 與安裝流程。
- [x] ECHORA-P2-01：補齊首頁與設定頁的可及性文案、空狀態與載入／生成回饋，避免技術詞彙成為一般使用者的主要阻力。
- [x] ECHORA-VERIFY-01：完成變更範圍的測試、TypeScript、lint、production build，以及桌面與 390px 行動版首頁、播放器、音樂庫與設定頁驗證；確認 Folia attribution、播放器、服務來源、歌詞與 PWA 沒有回歸。
- [x] ECHORA-DELIVERY-01：檢視差異後以描述性 conventional commit 推送至確認的 GitHub 分支；不部署到外部平台，除非使用者明確提出。

## Mobile music-app refinement
- [x] ECHORA-MOBILE-P0-01：在 390px 行動版保留「讓每一首歌，都成為一座舞台」及「立即播放展示曲目」，但將 Hero 首屏高度縮短約 20–25%，讓歌曲探索更早出現。
- [x] ECHORA-MOBILE-P0-02：將首頁三張「選歌／播放／Stage」教學卡改為單行、低視覺權重的流程提示，避免首頁像教學網站。
- [x] ECHORA-MOBILE-P0-03：將首頁來源控制改為「你的音樂」內容來源層級，保留本機展示、YouTube Music、Spotify 與連線狀態，但降低 provider 設定感。
- [x] ECHORA-MOBILE-P0-04：精修 3D／網格歌曲卡的封面比例、標題與演出者階層、觸控回饋、選取與播放狀態；保留 active song 的 emerald outline，並改善非作用中卡片辨識度。
- [x] ECHORA-MOBILE-P0-05：將迷你播放器提升為跨首頁、音樂庫與設定頁的持久控制列；未選歌時不顯示，播放後固定在安全區上方，提供封面、曲名、演出者、收藏、播放／暫停，並可點擊資訊進入 `/player`。
- [x] ECHORA-MOBILE-P1-01：保持既有 Mobile Header 的品牌、Connect 與 Settings 優先順序，避免額外狀態壓過 Echora 品牌。
- [x] ECHORA-MOBILE-P1-02：更新首頁載入骨架，使其高度與內容密度對齊縮短後的 Hero 與簡化流程提示。
- [x] ECHORA-MOBILE-VERIFY-01：完成新增或更新的行為測試、TypeScript、lint、production build，以及 375px、390px、430px、768px、1440px 的首頁與持久迷你播放器視覺驗證；確認無水平溢出、裁切、modal 溢出或 safe-area 遮擋。
- [x] ECHORA-MOBILE-DELIVERY-01：檢視差異後以描述性 conventional commit 推送 `master`，並驗證既有 Vercel production 網址確實服務相同 commit。

## Agnes AI settings integration follow-up
- [x] AI-001：移除 Settings 的 Gemini／OpenAI API key 與 provider 選擇，改為統一 Agnes AI 設定說明，不在前端收集或傳送金鑰。
- [x] AI-002：新增安全的 Agnes server-side proxy，使用 `AGNES_API_KEY`，不把 secret 暴露到 Vite bundle；缺少設定時顯示可操作錯誤。
- [x] AI-003：修復 AI 主題生成與 Settings 其他控件的實際 state wiring，避免「可點擊但不生效」；補測試。
- [x] AI-004：完成官方 Agnes API health／request contract 檢查、型別檢查、lint、build 與 Settings browser smoke。
- [x] AI-005：使用最新 Agnes integration commit 推送 GitHub master，並完成 Vercel production deployment／HTTP verification。

## Settings and background playback follow-up
- [x] UI-001：設定頁開啟時隱藏底部 PersistentMiniPlayer，避免歌曲列覆蓋設定內容。
- [x] UI-002：重整 Settings 的 mobile、iPad／tablet 與 desktop layout，修正容器寬度、header、卡片間距與底部安全區。
- [x] PLAY-001：舞台播放控制清楚顯示 Play／Pause icon 與 aria-label，且 local、YouTube Music、Spotify 的 pause action 都能與實際播放來源同步。
- [x] PLAY-002：檢查頁面進入背景、離開 fullscreen、route 切換與 Media Session 後的播放／暫停狀態，補回歸測試。
- [x] UI-003：完成 390×844、768×1024 iPad portrait、1024×768 iPad landscape 與 desktop browser smoke，通過 release gate、GitHub master push 與 Vercel production 驗證。

## Settings information density and branding follow-up
- [x] UI-004：從 Settings 移除本機診斷紀錄整個 UI 區塊，避免佔用設定頁主要垂直空間；保留其他設定功能不受影響。
- [x] UI-005：Settings 不顯示任何特定 AI 供應商名稱、專屬金鑰名稱或供應商品牌文案，改用中性的 AI 主題服務描述。
- [x] UI-006：將「像 App 一樣使用」改為顯示目前產品版本 `vX.Y.Z`，來源與 web package version 一致。
- [ ] UI-007：完成 Settings mobile／iPad／desktop screenshot smoke、tests、typecheck、lint、build、GitHub push 與 Vercel production verification。
