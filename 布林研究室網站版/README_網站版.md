# 布林研究室 · 網站版

把 v6.9.5 紫霧粉藍版的布林選股工具做成公開網站。手機、平板、任何電腦打開網址就能用，你的電腦不用開機。

## 運作方式

- 網站放在 **GitHub Pages**（免費）。
- **GitHub Actions** 每個交易日 **14:40、17:40（台灣時間）** 自動執行 `build_site.py`：
  1. 抓證交所／櫃買中心公司清單，再用 Yahoo 抓全上市櫃每檔日 K（沿用上次資料增量更新）
  2. 用收盤日 K 跑一次「強勢雷達」全市場掃描
  3. 產生網站並自動上線
- 介面、選股規則、個股研究、Daily Bias、SMC/SNR、圖卡匯出都是原本的程式碼，沒有改交易邏輯。

## 跟電腦版的差別

| 功能 | 電腦版 | 網站版 |
|---|---|---|
| 選股工作區、研究清單、中軌突破 | ✔ | ✔（收盤資料） |
| 個股研究 | 每次即時抓 Yahoo | 用網站當天的全市場日 K |
| 強勢雷達 | 盤中＋盤後即時掃描 | 每天收盤後自動掃描一次 |
| 盤中即時快照、Fugle 設定 | ✔ | ✘（隱藏） |
| 「一鍵更新全市場」 | 立即下載 | 改成「重新載入」網站上的最新資料 |
| 5 年長期回測資料 | ✔ | ✘（回測改用目前約 1 年的日 K） |
| 追蹤驗證備份 | 存在電腦 cache | 存在各自裝置的瀏覽器 |

## 第一次上線（約 5 分鐘）

1. 到 https://github.com/new 建立 **Public** repo，例如 `bollinger-web`（不要勾 README）。
2. 在這個資料夾雙擊 `setup-github.cmd`，貼上 repo 網址，它會幫你 git push。
   （它會先把 `github-workflow/update-site.yml` 複製到 `.github/workflows/`。若自己手動上傳，也要先做這一步，再執行：`git init -b main`、`git add .`、`git commit -m init`、`git remote add origin <網址>`、`git push -u origin main`）
3. 到 repo 的 **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。
4. 到 **Actions** 分頁 → 左邊「每日更新布林選股網站」→ **Run workflow**。第一次約 5～10 分鐘。
5. 完成後網址是：`https://<你的帳號>.github.io/bollinger-web/`

> 第 2 步 push 時會自動跑一次，但因為第 3 步還沒開，那次會失敗，屬正常；第 4 步手動再跑一次即可。

想用自己的網域（例如 `stock.ourhope.com.tw`）：Settings → Pages → Custom domain 填入，再到 DNS 加一筆 CNAME 指向 `<你的帳號>.github.io`。

## 之後要改東西

- 修改 `app/` 裡的程式（例如換新版布林工具），git push 後網站會自動重建。
- 想立即更新資料：Actions → Run workflow。
- 想改排程時間：`.github/workflows/update-site.yml`（`github-workflow/` 裡是同一份備份） 的 `cron`（用 UTC，台灣時間減 8 小時）。

## 檔案說明

- `app/`：原工具的 Python 與網頁程式（未改邏輯）
- `web/static_api.js`：網站版轉接層，把原本呼叫本機伺服器的 `/api/*` 改讀靜態 JSON
- `web/web.css`：隱藏網站上用不到的按鈕、加上「網站版」標示
- `build_site.py`：抓資料並產生 `_site/` 網站
- `cache/`：第一次執行用的 2026-09-18 歷史快取；之後由 GitHub Actions 自動保存最新資料
- `python build_site.py --offline`：不連網，用 cache 產生網站在本機預覽（`python -m http.server -d _site`）

## 注意

- GitHub 的排程可能延遲數十分鐘。
- 若 Yahoo 或證交所擋海外主機，當天更新會失敗並保留前一天資料；Actions 頁面會顯示紅色錯誤。
- 網站是公開的，所有內容都是研究工具，不是買賣建議。
