# JIZURA 演出部件（expression packs）開發指南

JIZURA 是在瀏覽器中製作歌詞動態影片（文字 PV）的引擎：歌詞會切成有時間點的片段；每段包含一種**版面**、一種**進場**、一種**停留動態**、一種**退場**、零個或多個**裝飾**，並可搭配其他 pack 提供的文字加工、背景、鏡頭與畫面效果。所有內容會在設計座標系中繪製到 Canvas 2D，並由種子決定可重現的結果。

一個 pack 對應一個檔案：`src/11p_<pack>.js`。新增部件只能註冊新項目，不要修改核心檔案。

建議先閱讀以下既有實作，以了解專案慣例：`src/06_layouts.js`（版面、`J.mainDraw`、`J.drawFx`）、`src/05_anim.js`（進場／停留／退場）、`src/07_decor.js`（裝飾）、`src/03_text.js`（`J.drawItem` 文字項目模型）、`src/09_render.js`（`makeEnv` 繪圖工具）。

## 檔案基本架構

```js
/* JIZURA pack: <pack> — <簡短說明> */
(() => {
'use strict';
const E = J.E;
const P = '<pack>';            // J.register 使用的 pack 名稱
J.register('layout', 'myKey', { name: '日本語名', tags: ['pop', 'graphic'], w: 1, fits: n => n <= 12, plan(rng, cut, st) { … }, render(env) { … } }, P);
})();
```

`J.register(group, key, def, pack)` 會將項目加進註冊表與順序陣列。`key` 必須是唯一的 camelCase 名稱，請確認不會和現有 key 重複（使用 `J.order(group)` 檢查）。`name` 是顯示在介面上的簡短日文名稱，建議 2～7 個字。`tags` 是適用氛圍，可用 `glitch calm pop graphic editorial emotional horror`；`horror` 僅供恐怖組使用。`w` 是隨機挑選權重：一般為 1；特別或適用範圍窄的效果可用 0.4～0.7；泛用且表現強的效果可用 1.2～1.5。

## 設計座標與繪圖環境

不同畫面比例使用以下設計尺寸：16:9 為 1920×1080、9:16 為 1080×1920、4:3 為 1440×1080、3:4 為 1080×1440、1:1 為 1440×1440、4:5 為 1440×1800、21:9 為 2520×1080。位置與尺寸一律依 `W`、`H`（及 `Math.min(W, H)`）計算；每種版面都必須同時適用橫式與直式。

每次呼叫 render、draw 或 apply 時都會收到 `env`：

| 欄位 | 說明 |
|---|---|
| `ctx` | `CanvasRenderingContext2D`，已轉換至設計座標系並套用鏡頭 |
| `W`、`H` | 設計尺寸 |
| `sc` | 配色：`bg fg sub accent accent2 ink dim ghostA ghostB`（可選 `grad:[a,b]`）。`ink` 是貼紙／底板色，`dim` 是淡色背景字。只能使用這些顏色；需要判斷對比時可另外參考 `#000`、`#fff` 與 `J.lum` |
| `st` | 風格 pack；`st.fonts.display/serif/body/mono` 是字型 key 陣列 |
| `fx` | 0～1 的滑桿值：`motion glitch chroma decor density texture bgSwitch` |
| `cut` | `text`（此片段文字）、`lineText`（完整歌詞句）、`note`、`line`（句子索引）、`index`、`start end dur inDur outDur`、`params`（`plan()` 輸出）、`seed`、`emph`（是否強調）、`words`（詞語片段） |
| `lt` | 片段開始後的局部時間（秒）；依殘影 pass 延遲 |
| `ltb` | `lt` 加上 pass 延遲；連續移動（捲動、旋轉）應使用此值，才能讓殘影正確拖尾 |
| `pIn`、`pOut` | 片段的進場／退場進度，範圍 0～1 |
| `step` | 整數隨機時鐘，頻率最高 24 Hz；供閃爍或抖動使用 |
| `pass` | `B`、`A`（先繪製並著色的色彩錯位殘影）或 `main` |
| `scale` | 設計像素轉換為實際像素的比例；用於像素尺寸的筆畫或濾鏡 |
| `allowFilter` | 快速預覽時為 false；此時不要使用 `ctx.filter` 模糊 |
| `energy` | 音訊音量，範圍 0～1，或 null；`beat` 為 `{since, len, index}` 或 null |

### 色彩錯位殘影 pass（重要）

每個版面 `render` 與裝飾 `draw` 每格會呼叫三次：pass B、pass A（帶時間差並以單一殘影色繪製在主畫面下方），最後是 pass main。環境工具會處理多數情況：

- `env.draw(item)`／`J.mainDraw(env, item)` 用於繪製文字；殘影 pass 會以殘影色繪出相同字形。次要文字若不應產生色彩錯位，請設 `ghost: false`。
- 可用 `env.rect(...)`、`env.line(...)`、`env.polyPartial(...)`、`env.circle(...)`、`env.arc(...)`、`env.rrect(...)`、`env.poly(...)`、`env.blob(...)` 等工具繪圖。`ghost=false` 時只會在主 pass 繪製；`ghost=true` 只適合需要色彩分離的粗線條圖形。
- 若直接操作 `ctx`（例如漸層、裁切路徑或影像），**必須**以 `if (env.pass === 'main') { … }` 限定在主 pass，否則會以原色重複畫三次。變更轉換、裁切、透明度或合成模式時，請用 `ctx.save()`／`ctx.restore()` 保護狀態。

## 文字項目（`J.drawItem` 模型）

文字項目可用以下屬性：

```js
{ text, font, size, x, y, color, align:'center'|'left'|'right', vertical, lead, track, sx, sy, rot, skew, alpha,
  fill (default true), stroke (px), strokeColor, strokeUnder, strokeDash:[a,b], gradient:[c1,c2] or [[offset,colour],…],
  pattern:'dots'|'stripes'|'hatch'|'grid'|'lines' (+patternColor, patternBg), shadow:{color,blur,dx,dy}, extrude:{n,dx,dy,color,fade,a},
  fillAlpha, dash (0..1 stroke draw-on progress), blur, blend, ghost:false, mi (motion index for stagger), plain:true (skip treatments),
  enter/exit/hold (per-item override keys), noHold }
```

字形以 `(x, y)` 為中心，多行文字用 `\n`；`lead` 是行距倍率。`J.measure(item)` 回傳 `{w, h, lay}`；`J.fitSize(text, font, maxW, maxH, {sx, sy, track, lead, vertical})` 回傳可容納文字的字級；`J.itemBox(item)` 回傳 `{x0 y0 x1 y1 w h cx cy}`；另有 `J.splitLines(text, maxPerLine)`（平衡日文換行）、`J.glyphCount(text)`、`J.fontsOf(st, ['display','serif'])`（取得字型 key）與 `J.metrics.adv(fontKey, ch)`（字元 em 寬度）。

字型 key 包含 `gothic_black gothic_bold gothic_med gothic_light dela zenkaku mincho_black mincho_bold mincho mincho_light tokumin round pop dot brush mono sansui`。請優先使用風格所提供的角色字型 `st.fonts.*`。

`J.mainDraw(env, item)` 會套用片段的進場／停留／退場與文字加工，並回傳文字邊界框 `{x0,y0,x1,y1,cx,cy,boxes}`；若目前隱藏則回傳 null。`env.draw(item)` 只繪製一般文字，不套用動態，適合次要文字。可用 `J.unionBB(a, b)` 合併邊界框；也可用 `J.centerBB(env, bb)` 取得置中邊界框。

進場／退場／停留可在文字項目上設定額外動態欄位：`clip:[x0,x1]`（水平視窗）、`clipY:[y0,y1]`、`clipFn(ctx, env, it)`（建立裁切路徑）、`bands:[[y0,y1,dx],…]`（水平切片位移）、`vbands:[[x0,x1,dy],…]`（垂直切片位移）、`streak:{n,dx,dy,a}`（動態殘影）、`echo:{n,dx,dy,a,decay,scale,rot,outline,color}`（階梯式複本）、`wipeBar:{x,h}`、`cursorAt`、`pre(env,it)`／`post(env,it,bb)` hook，以及上述其他欄位。工具函式有 `J.itemBands(env, it, n, (i,n)=>dx)` 與 `J.itemVBands(env, it, n, (i,n)=>dy)`。

逐字動態可將函式 `(i, g, n) => ({dx, dy, rot, s, sx, sy, a, color, ch, hide, skew, blur, outline, clipX:[a,b], clipY:[a,b]})` 加入 `it.charFns`。`i` 是字形索引、`n` 是字形數、`g` 是含 `g.w g.h g.x g.y` 的字形配置；`clipX`／`clipY` 是字形框的比例，中心為 0，例如 `clipY:[-0.7, 0.2]` 會顯示上半部。進階逐筆畫部件函式可加入 `it.pieceFns`：`(ci, pj, piece, ox, oy) => J.PT(dx, dy, rot, s, stretch, stretchDir, a)`；正常狀態回傳 `J.PID`，隱藏時回傳 null。recipe 請設 `pieces: true`（參考 `05_anim.js` 的 `assemble`、`explode`）。

## 亂數、緩動與色彩

動態必須可重現；不要在 render／draw／apply 中呼叫 `Math.random()`。請在 `plan(rng, …)` 使用 `rng()`、`rng.range(a,b)`、`rng.int(a,b)`、`rng.pick(arr)`、`rng.chance(p)`。繪製時可用 `J.r(a,b,c,d,e)`（0～1）、`J.rs(…)`（−1～1）、`J.rr(lo,hi,…)`、`J.h(…)`（無號整數），結果由 `env.cut.seed`、`it.seed`、索引與 `env.step` 決定。平滑雜訊使用 `J.noise1(x, seed)`。
緩動函式：`J.E.lin inQuad outQuad inCubic outCubic inOutCubic outExpo inExpo inOutExpo outBack(x, s) outElastic inOutSine`。常用數學工具：`J.clamp(x,a=0,b=1)`、`J.lerp`、`J.smooth(a,b,x)`、`J.TAU`、`J.DEG`。
色彩工具：`J.lum(hex)`（0～1）、`J.mix(a, b, t)`、`J.rgba(hex, alpha)`、`J.fitContrast(hex, bg, ratio)`。文字判斷工具：`J.isKanji`、`J.isHira`、`J.isKata`、`J.isLatin`、`J.isPunct`、`J.isSmallKana`、`J.romaji(kana)`（含漢字時回傳 null）與 `J.fmtTime(t)`。

## 各類部件的介面契約

**layout**：`{ name, tags, w, fits(n) → bool, plan(rng, cut:{text,n,W,H,dur}, st) → params, render(env) → bbox|null }`。`n` 是不含空格的字形數，範圍 1～30；`params` 必須是純 JSON 資料（數字、字串、布林值、陣列，不可有函式）。可選欄位：`portrait`（直式權重倍率，例如直式效果較差時設 0.5）、`emph`（強調句權重倍率）、`treat: false | 'safe'`（false 表示不套文字加工；'safe' 表示歌詞置於自訂色塊上仍適用）、`busy: true`（版面佔滿畫面時停用繁複背景）、`enterBias: {enterKey: mult}`。

- 歌詞本身**必須**透過 `J.mainDraw` 繪製，才能套用進場、退場與文字加工；多個文字項目需以 `mi` 錯開時間。
- 次要圖形需有進場與退場動畫，例如依 `env.lt` 使用 `E.outExpo(J.clamp(env.lt / 0.35))`，並依 `env.pOut` 使用 `1 - E.inCubic(env.pOut)`。
- 在所有畫面比例下，靜止時歌詞應留在約 5% 安全範圍內；須處理 1～16 字與含空格的拉丁文字，並以 `fits` 排除不適用的字數。
- 在 `plan` 中決定參數（例如 2～4 種變化、尺寸、方向），`render` 從 `env.cut.params` 讀取。

**enter**：`{ name, tags, w, apply(env, it, p, ctx) }`。`p` 從 0 到 1，並已依 `it.delay` 延後；`ctx = {dur, inDur, outDur}`。修改文字項目或加入 `charFns`，使 p=0 時尚未顯示，p=1 時必須完全回到靜止狀態（不可殘留位移或透明度）。可選 `inDur(dur, n)`（預設限制在 `dur*0.36`、0.12～0.6 秒之間）、`minDur`、`maxChars`、`pieces: true`。`apply()` 只在 p < 1 時呼叫。
**exit**：`{ name, tags, w, apply(env, it, p, ctx) }`。p=0 為靜止狀態，p=1 必須完全消失（透明、移出畫面或隱藏）。可選 `outDur(dur, n)`、`minDur`。
**hold**：`{ name, tags, w, apply(env, it, amt, ctx) }`。片段停留期間持續動態；`amt` 在進場後逐漸增加、退場時逐漸降低，範圍 0～1。效果需依 `amt` 與 `env.fx.motion` 調整（amt=0 時不得改變文字）。使用 `env.lt`／`env.ltb`、`env.step`、`env.beat`；效果宜細緻，不要過強。
**decor**：`{ name, tags, w, layer: 'back'|'front', subtle?: true, draw(env, bb, P) }`。`bb` 為歌詞邊界框，可能是 null，此時可用 `J.centerBB(env, bb)`。`P` 包含 `{id, seed, n (1..3), right, low, accent, corner, big, mode, from, to, v (0..5), r (0..1)}`，請利用這些參數增加變化。動畫在 `env.lt` 的前 0.3～0.5 秒進場，並依 `env.pOut` 退場。前景裝飾不可覆蓋歌詞邊界框；背景裝飾應降低對比（使用 `sc.dim`、`sc.sub` 或低透明度），除非尺寸很小。
**treat**：`{ name, tags, w, safe?, plan?(rng, st) → params, apply(env, it, P) }`。對片段中每個主要文字項目套用文字加工，執行時間早於進場／停留／退場。略過 `it.fill === false` 或透明度低的項目（例如版面複本）。保留 `it.color` 作為字色；互補色請從 `env.sc` 挑選並檢查亮度。只有當歌詞在色塊上仍清楚時才設 `safe: true`；標記 `treat:'safe'` 的版面只會搭配安全的文字加工。標記、外框、底線可用 `it.pre`／`it.post` hook，注意它們會在每個 pass 執行，需謹慎設定殘影。
**bg**：`{ name, tags, w, subtle?, plan?(rng, st) → params, draw(env, P) }`。全畫面背景圖形每格只繪製一次，僅在 main pass 執行；不受鏡頭影響。繪製時機在風格背景色之後、文字之前。背景逐句選取，連續動態請使用絕對時間 `env.t`。對比要低，以免影響歌詞閱讀；`subtle: true` 表示可用於繁複版面。
**cam**：`{ name, tags, w, strong?, plan?(rng, st) → params, get(env, P) → {x, y, s, rot, sx, sy, skx, blur} }`。以畫面中央為基準轉換片段內容，單位為設計像素／角度。每個 pass 都會以延遲時間呼叫。歌詞需留在畫面內：位移不超過畫面 5%、縮放約 0.92～1.15、旋轉不超過 5 度；較大動態只能短暫出現並回到穩定狀態。動態幅度需依 `env.fx.motion` 調整；強烈動態設 `strong: true`。
**fx**：`{ name, tags, w, glitchy?, edge? (預設 true), mid?, dur (影格數，24 fps，預設 4), pre (切點前影格數), amp, scratch?, ae?, draw(ctx, ev, k, info) }`。在裝置像素座標（identity transform）執行後製。`info` 為 `{cw, ch, S (scratch:true 時的影格複本), sc, st, step, t, scale, allowFilter, opt, tmp(w,h), tmp2(w,h)}`；`k` 為 0～1 進度，`ev.amp` 為強度。結束時須還原 ctx 狀態。不可對完整影格呼叫 `getImageData`。`ae` 可指定最接近的 AE 事件類型：`chroma shake slice block invert flash zoom mosaic`；也可省略。
**trans**（片段轉場）：`{ name, tags, w, dur (秒，預設 0.35), plan?(rng, st) → params, draw(ctx, A, B, p, info) }`。`A` 是前一片段靜止畫面，`B` 是目前片段畫面（均為完整裝置像素尺寸）；`p` 從 0 線性增加至 1，可自行套用緩動。請以 identity transform、相同尺寸將完整合成結果繪至 `ctx`；p=0 必須與 A 完全相同，p=1 必須與 B 完全相同。`info` 為 `{cw, ch, sc, scPrev, st, P, step, t, scale, allowFilter, seed, tmp(w,h)}`。使用轉場時，編排器會把前一片段退場與目前片段進場改為一般切換。
**style**（配色風格）：直接加入 `J.STYLES` 與 `J.STYLE_ORDER`（完整結構參考 `src/04_styles.js`）。包含 `{ name, desc, moods, schemes, fonts, texture, ghost, bias, decor, hud, glow?, glitchBoost?, useGrad? }`；`schemes` 為 2～4 組含 `bg, fg, sub, accent, accent2, ink, dim, ghostA, ghostB, grad?, paper?` 的配色。

## After Effects 對應項目（`ae`）

每個新增的 **layout／enter／exit／hold／decor** 都必須指定 `ae: '<key>'`，對應到最接近的既有 AE 部件，供瀏覽器匯出至 AE 面板時使用：

- layout：`center mixed vcols marquee tile scatter ring wave huge labels condensed gloss type diag circle stack pill`
- enter：`cut assemble slice type pop drop stretch wipe blur spin flicker scramble zoom`
- exit：`cut explode fall drift slice wipe shrink blur stretch scatter glitch`
- hold：`still jitter drift breathe wave glitchtick`
- decor：`brackets rings dots arrows slash sparks leaders waveform barcode grid stripes blobs bars shapes counter`

## 字型

字型 key 包含 `gothic_black gothic_bold gothic_med gothic_light dela zenkaku mincho_black mincho_bold mincho mincho_light tokumin round pop dot brush mono sansui`，以及新增字型 `reggae`（粗獷展示字）、`rampart`（立體描邊展示字）、`potta`（筆刷風格）、`kiwi`（柔和圓體）、`klee`（手寫鉛筆感）、`shippori`（優雅粗明體）。字型只會在編排使用時載入，請優先採用風格角色字型 `st.fonts.*`。無法連線 Google Fonts 時會使用系統替代字型；檢查排版與動態即可，不需比較字型。

## 新增部件與日式特效的隨機集合

`src/11q_sets.js` 決定隨機挑選範圍。未列於 `J.BASE_PACKS` 的 pack 屬於新增部件，只有開啟「也使用新增的特效」後才會隨機選用。以傳統日本物件、紋樣或圖像為主的部件（燈籠、障子、扇子、家紋、青海波等）必須加入 `J.WA` 或設定 `wa: true`，才能由「也使用日式特效」開關排除。新風格預設屬於新增部件，除非列在 `J.BASE_STYLES`；新字型需加入 `J.EXTRA_FONTS`。

## 有獨立開關的部件集合（文字 PV／動態文字／恐怖）

名稱為 `typo`、`kinetic` 或 `horror` 的 pack（或設定 `set: '<name>'` 的部件）歸入各自的開關，而不是新增部件：`project.typo` 與 `project.kinetic` 預設開啟，`project.horror` 預設關閉。風格也可用 `set: '<name>'` 加入集合。只有開啟恐怖開關時，`J.MOODS.horror` 才會出現在隨機氛圍中，且恐怖部件只在該氛圍使用。key 使用集合前綴 `ty`、`kn`、`hr`；新增集合時，需在 `src/11q_sets.js` 的 `J.SETS` 與介面中加入開關。

## 避免近似重複

開發前先整理同一分類已有哪些部件。只使用 `node -e` 看程式碼不足以判斷視覺差異；請執行 `python3 dev/overview.py <group> out/ov t_all`（先執行 `python3 dev/build_test.py all --all-packs`）並檢視總覽圖。新部件必須在動態原理、構圖或圖像概念上有明顯差異，不能只更換數值。

## 效能與穩定性

1080p 下每次呼叫預算約 2 ms。不可呼叫 `getImageData`，不要每格建立 canvas（若要預先繪圖，請用以參數為 key 的模組層級 Map 快取），避免無界迴圈並限制數量。須處理 `bb === null`、空字串、單一字形與很長的文字，不可拋出例外。

## 每個部件都要跑的測試流程

```sh
python3 dev/build_test.py <pack> src/11p_<pack>.js          # 只以核心程式與此 pack 建置 dev/www/t_<pack>.html
(cd dev/www && python3 -m http.server 8765 &)              # 啟動一次即可
python3 dev/pack_sheet.py --page t_<pack> --group layout --ids key1,key2 --out out/<pack>
```

需求：Python 3、含 Chromium 的 `playwright` 與 `Pillow`。表格工具會列出各部件的主控台錯誤（必須為 0）及最慢影格，並依 key 輸出總覽圖：layout 會呈現 4 種歌詞 × 16:9／9:16／4:3／1:1 與時間軸；enter／exit／hold 會呈現 4 種比例下的動畫影格；decor 會呈現不同配置與時間點。請逐張檢查是否文字重疊或超出畫面、間距不佳、動態過於平淡或與既有部件相似、p=1 留有殘影，以及圖形突然出現而非逐漸動畫。

```sh
python3 dev/build_test.py all --all-packs && python3 dev/smoke_all.py t_all
python3 dev/overview.py <group> out/ov t_all
python3 dev/cost_scan.py t_all 45
node -e "new Function(require('fs').readFileSync('src/11p_<pack>.js','utf8'))"
python3 build.py
```

`overview.py` 可用分類：layout、enter、exit、hold、decor、treat、bg、cam、fx、trans、style。`cost_scan.py` 會列出影格耗時超過 45 ms 的部件。最後執行 `python3 build.py`。

## After Effects

AE 面板（`ae/*.jsx`，由 `python3 build_ae.py` 建置）有自己的部件註冊表：`ae/05_reg.jsx` 的 `jzReg(group, key, def)`，核心部件位於 `ae/20_motion.jsx` 至 `ae/45_core.jsx`，每個移植 pack 各有一個 `ae/p_*.jsx`。瀏覽器引擎會透過 `node tools/export_ae_data.js` 將權重、標籤、新增／和風標記、fits 與時間長度等資料匯出到 `ae/data.json`，讓兩邊使用相同的隨機決策。若瀏覽器部件尚未移植至 AE，會以最接近的對應項目替代（詳見上方 `ae`；`src/11_export.js` 的 `J.AE_MAP` 可覆寫）。新部件仍需設定 `ae`，才能繼續支援瀏覽器至 AE 的 JSON 匯出。

AE 測試需先在 `dev/` 執行一次 `npm install`。之後可執行 `node dev/ae_test.js`，在模擬 AE 的 ES3 環境中測試各風格與多組種子；`node dev/ae_check.js --group layout --ids all` 則檢查指定分類的移植部件。
