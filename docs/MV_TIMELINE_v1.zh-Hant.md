# JIZURA MV Timeline v1：單曲 MVP

MV Timeline v1 是 JIZURA 瀏覽器編輯器、本機 AI 編排工具和 FFmpeg 共用的專案格式。既有 `.jizura.json`、After Effects JSON、瀏覽器 MP4／PNG 匯出維持原狀；本流程建立獨立的 MV 專案資料夾。

## 目前流程

1. 使用 Chrome 或 Edge 開啟 JIZURA，載入歌詞、歌曲與一段以上的背景影片。背景影片由外部工具生成後匯入；JIZURA 不會呼叫影片生成服務或分析影片畫面。
2. 在「匯出」分頁展開 **AI MV Motion Graphics Engine**，選擇父資料夾並建立 MV 專案。歌曲和影片會複製到專案的 `assets/`，原始檔不會修改。專案另含 `timeline.json`、`catalog.json`、`manifest.json` 和 `README-MV.txt`。
3. 在 JIZURA 原始碼資料夾開啟 Terminal，先驗證專案：

   ```sh
   python3 tools/mv_engine.py validate "/完整路徑/歌曲-mv"
   ```

4. 若要取得 AI 建議，金鑰需先存入 macOS Keychain：

   ```sh
   python3 tools/mv_engine.py keychain-set
   ```

   每次 AI 請求都必須明確加上同意旗標：

   ```sh
   python3 tools/mv_engine.py ai-plan "/完整路徑/歌曲-mv" --consent-lyrics-features
   ```

   工具會建立待審核的 `timeline.proposed.json`，不會覆寫 `timeline.json`。也可省略 AI 步驟，直接在 JIZURA 編輯及核准時間軸。
5. 回到 JIZURA，按「開啟 MV 專案資料夾」。找到 AI 建議時可載入審核。編輯段落類型、起訖影格、Style、鏡頭素材與來源裁切、鏡頭描述；可鎖定段落以固定其類型、範圍、Style 和描述。鎖定段落在 AI 建議合併時會保留原設定。
6. 按「核准並儲存時間軸」，再按「輸出透明圖層至專案」。影格會逐格直接寫入 `render/mg/back/` 和 `render/mg/front/`；輸出中斷時會標示未完成，必須重新輸出。
7. 確認本機已安裝 FFmpeg，且 `ffmpeg` 與 `ffprobe` 都可從 Terminal 找到，再合成：

   ```sh
   python3 tools/mv_engine.py render "/完整路徑/歌曲-mv" --approved
   ```

   合成結果為 `render/final.mp4`，驗證資訊為 `render/render-manifest.json`。此工具不會自動下載或安裝 FFmpeg。

## Timeline v1 結構

時間統一使用輸出影格編號，區間一律是左閉右開 `[startFrame, endFrame)`。例如 24 fps 下，`startFrame: 24` 表示第 1 秒；`[24, 48)` 剛好 1 秒。歌曲段落與背景鏡頭須從影格 0 連續覆蓋至 `project.durationFrames`，不得重疊或留空。

```json
{
  "schemaVersion": 1,
  "approved": false,
  "project": {
    "title": "示範歌曲",
    "artist": "示範演出者",
    "width": 1920,
    "height": 1080,
    "fps": 24,
    "durationFrames": 240,
    "aspect": "16:9",
    "resolution": 1080
  },
  "assets": [
    {"id": "audio-001", "kind": "audio", "path": "assets/audio/audio-001-song.m4a", "name": "song.m4a", "size": 2500000},
    {"id": "video-001", "kind": "video", "path": "assets/video/video-001-shot.mp4", "name": "shot.mp4", "size": 9000000, "durationUs": 10000000, "width": 1920, "height": 1080}
  ],
  "audio": {"assetId": "audio-001", "durationUs": 10000000},
  "beats": [{"id": "beat-001", "frame": 12, "strength": null}],
  "audioFeatures": {"bpm": 120, "energyRateHz": 20, "energy": [{"frame": 0, "value": 0.42}]},
  "sections": [
    {"id": "section-ai-001", "type": "verse", "startFrame": 0, "endFrame": 96, "confidence": 0.86, "locked": false, "shotDescription": "夜色中的城市遠景"},
    {"id": "section-ai-002", "type": "chorus", "startFrame": 96, "endFrame": 240, "confidence": 0.92, "locked": false, "shotDescription": "節奏增強時切到明亮的近景"}
  ],
  "lyrics": [{"id": "lyric-001", "lineIndex": 0, "text": "示範歌詞", "startFrame": 12, "endFrame": 42}],
  "shots": [
    {"id": "shot-001", "assetId": "video-001", "startFrame": 0, "endFrame": 96, "sourceInUs": 0, "sourceOutUs": 5000000, "fit": "cover", "description": "城市遠景"},
    {"id": "shot-002", "assetId": "video-001", "startFrame": 96, "endFrame": 240, "sourceInUs": 5000000, "sourceOutUs": 10000000, "fit": "cover", "description": "節奏加強的近景"}
  ],
  "styles": [
    {"sectionId": "section-ai-001", "styleId": "noir"},
    {"sectionId": "section-ai-002", "styleId": "crimson"}
  ],
  "transitions": [{"atFrame": 96, "transitionId": "wipe", "durationFrames": 8}],
  "render": {
    "backPattern": "render/mg/back/frame_%06d.png",
    "frontPattern": "render/mg/front/frame_%06d.png",
    "frameCount": 240,
    "layersStatus": "missing"
  }
}
```

| 欄位 | 用途 |
|---|---|
| `project` | 輸出尺寸、fps、影格總數與作品資訊。fps 僅接受 24、30、60。 |
| `assets` | 專案素材清單；`path` 必須是專案資料夾內的安全相對路徑。 |
| `audio` | 指向唯一歌曲素材；CLI 會確認檔案存在。 |
| `beats`、`audioFeatures` | 節拍影格、BPM 與本機抽取的能量摘要。 |
| `sections` | 全曲連續分段，包含類型、信心值、鎖定狀態及鏡頭描述。 |
| `lyrics` | 歌詞文字與顯示的起訖影格。 |
| `shots` | 背景影片時間軸及素材來源裁切點；`sourceInUs`／`sourceOutUs` 使用微秒。 |
| `styles` | 每個歌曲段落對應一個 JIZURA 既有 Style ID。 |
| `transitions` | 轉場 ID、開始影格及長度；只能使用 `catalog.json` 中的識別碼。 |
| `render` | 透明圖層影格序列位置與狀態：`missing`、`exporting` 或 `complete`。 |

專案實際內容可能比範例多 `editorProject`、素材 MIME 類型、核准時間與建議狀態等欄位。未來格式變更會遞增 `schemaVersion`。

## AI 請求與隱私範圍

使用者每次執行 AI 編排時都要提供 `--consent-lyrics-features`。該次 Responses API 請求包含：歌詞文字與起訖影格、BPM、節拍影格、抽樣能量值、影格率／片長，以及可用的 Style 和轉場目錄。Style 目錄取自 JIZURA 內建登錄項目。

請求不包含原始音訊、影片、媒體檔名、專案資料夾名稱或本機路徑。API 金鑰透過 macOS Keychain 讀取，不寫入專案、時間軸、命令輸出或渲染紀錄。AI 回應受 JSON Schema 限制，只能提出已登錄的 Style／轉場 ID；程式碼不會執行 AI 文字。鏡頭描述只是文字建議，AI 沒有看過背景影片。

## 轉場與相容性

- 對齊背景鏡頭切點的轉場會以 FFmpeg `xfade` 合成，並依轉場 ID 對應到相近的 FFmpeg 轉場效果。
- 位於歌曲段落切點、但沒有對應背景鏡頭切點的轉場，會在該段落交界套用短暫淡黑轉場。
- 其餘歌詞層轉場仍由 JIZURA 瀏覽器 Motion Graphics Renderer 繪製到透明影格中。
- 核准時間軸或輸出圖層狀態不符、素材遺失、鏡頭未覆蓋全曲、缺少 FFmpeg／ffprobe 時，CLI 會停止並指出原因。
- 合成後會以 ffprobe 檢查尺寸、影格率、總片長和音軌，再讓 FFmpeg 完整解碼影片；任一檢查失敗都不會寫入成功紀錄。
