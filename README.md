# 麻將療癒師 OBS 畫面（四方卡）副本

來源：正式版 53.16s11b 的 OBS 畫面檔案（只有畫面這一層，沒有伺服器、分數資料或任何金鑰）。

## 給小蜜的規則
- **只在 `test` 分支修改**，不要動 `main`。
- 可以上傳圖片到 `public/assets/`、`public/mimi-cameo/`，修改 `public/css/*.css` 和 `obs.html`、`obs-win.html`。
- 每次修改用一句話寫清楚改了什麼（commit 訊息）。
- 規格：畫面要 3840×2160 原生向量清晰；四方卡位置、大小、貓耳都不要變大（觀眾是來看牌的）；字要大、對比要高（觀眾很多 55 歲以上）。
- 改好的版本會由開發總監 芷寧 測試、老爺過目後，才裝到正式 OBS。

## 檔案
- `public/obs.html`、`public/js/obs.js`：四方卡主畫面
- `public/obs-win.html`：胡牌卡
- `public/css/obs.css`、`obs-duo.css`、`live-flags.css`：樣式
- `public/mimi-cameo/`、`public/assets/`、`public/sfx/`：咪姬圖、素材、音效

## 暖暖不在線時，老爺自己操作（約 1 分鐘）
1. 給小蜜檔案：切到 `test` 分支 → 綠色「Code」→「Download ZIP」→ 把 ZIP 傳給小蜜。
2. 放回小蜜改好的檔案：在 `test` 分支 →「Add file」→「Upload files」→ 拖進檔案（放到對應資料夾，例如 public/css/）→「Commit changes」。
3. 不要動 `main`。等開發組恢復後，芷寧會測試、老爺看過才裝到正式 OBS。
