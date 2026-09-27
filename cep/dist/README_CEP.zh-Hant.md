# JIZURA 字面｜After Effects CEP 面板指南

CEP 版可在 After Effects 中直接使用 JIZURA 瀏覽器版介面與預覽。按「AEでコンポを生成」（在 AE 建立合成）即可產生可編輯的合成，不必先匯出或匯入 JSON。

- **支援版本：**After Effects 2022（22.0）以上，Windows 與 macOS。
- **面板本體：**`com.852wa.jizura` 資料夾。

## 安裝方式

1. 將解壓後的資料夾放在容易找到的位置；請勿移動其中的 `com.852wa.jizura` 資料夾。
2. 依作業系統執行安裝檔：
   - **macOS：**執行 `install_mac.command`。若系統顯示無法開啟，可在檔案上按右鍵並選「打開」。
   - **Windows：**執行 `install_win.bat`。
3. 重新啟動 After Effects，選擇「視窗」→「擴充功能」→「JIZURA 字面」。

安裝檔會執行以下操作：

- 將 `com.852wa.jizura` 複製到目前使用者的 CEP 擴充功能資料夾：
  - macOS：`~/Library/Application Support/Adobe/CEP/extensions/`
  - Windows：`%APPDATA%\Adobe\CEP\extensions\`
- 設定 Adobe 的 `PlayerDebugMode`，允許載入未簽署的面板（CSXS 10～14）。

若要手動安裝，請自行完成上述兩項操作。

## 使用方式

- 歌詞、風格與演出設定方式和瀏覽器版相同，預覽也會顯示在面板內。
- **「AEでコンポを生成」：**依目前編排建立新合成；每次建立可用一次復原撤銷。
- **匯出範圍：**指定句子後，可只建立該範圍的合成，歌曲也會對齊相同位置。適合將長曲分段製作；「匯出至 AE」的 JSON 也會套用相同範圍。
- **AE 中選取的歌曲：**先選取目前合成中的歌曲圖層，再按此功能即可分析節拍並將歌曲放入新合成。
- **AE 標記作為句首：**使用選取圖層的標記（若未選圖層則使用合成標記）設定各句起始時間。選取歌曲圖層時，標記會換算為相對於歌曲開頭的時間。
- 畫面比例、解析度、fps 與背景（一般／綠幕／黑底）會沿用匯出區的設定。
- 面板也可直接匯出 MP4 與 PNG 序列圖；匯出時會詢問儲存位置。若 AE 面板環境不支援 MP4，介面會顯示提示，可改用 PNG 序列圖或 AE 渲染。
- 字型會沿用指令碼版面板「字型」分頁中的設定；若尚未設定，會自動使用電腦已安裝的字型。
- **儲存診斷報告：**在「匯出」分頁的 After Effects 區塊，要求 AE 計算最後建立合成的運算式，並將錯誤與替換項目寫入 `JIZURA_report.txt`。遇到問題時可附上此檔案回報。

## 建立供散布的 .zxp

1. 取得 Adobe 簽署工具 **ZXPSignCmd**（可在 GitHub 的 Adobe-CEP／CEP-Resources 專案中找到），將工具放在此資料夾或加入 `PATH`。
2. 執行 `sign_zxp_mac.sh`（macOS）或 `sign_zxp_win.bat`（Windows），建立自我簽署憑證並產生 `JIZURA.zxp`。可透過環境變數 `JIZURA_CERT_PASS` 設定密碼。
3. 收件者可使用 aescripts 的「ZXP Installer」等工具安裝 `.zxp`；這種方式不需要設定 `PlayerDebugMode`。

## 疑難排解

- **面板沒有出現在選單中：**完全結束 After Effects 後重新開啟。若 `PlayerDebugMode` 設定未生效，可再次執行安裝檔。
- **出現「無法連線至 After Effects」：**關閉面板後重新開啟，並確認 `com.852wa.jizura/jsx/` 中有 `host.jsx` 與 `jizura_core.jsx`。
- **建立合成時有部件發生問題：**匯出區會顯示受影響部件的數量。
