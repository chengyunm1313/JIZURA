/* ============================================================
   JIZURA — MV Timeline v1、專案資料夾與格式驗證
   ============================================================ */
(() => {
'use strict';

const VERSION = 1;
const clone = value => JSON.parse(JSON.stringify(value));
const frameOf = (seconds, fps) => Math.max(0, Math.round(seconds * fps));
const safeName = value => String(value || 'asset').normalize('NFKC').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 100) || 'asset';
const idOf = (kind, i) => `${kind}-${String(i + 1).padStart(3, '0')}`;

function create({ project, plan, audio, audioFile, videos = [] }) {
  const fps = plan.fps || project.fps || 24;
  const [width, height] = J.outputSize(project);
  const durationFrames = Math.max(1, Math.ceil(plan.duration * fps));
  const assets = [];
  let audioAssetId = null;
  if (audioFile) {
    audioAssetId = 'audio-001';
    assets.push({ id: audioAssetId, kind: 'audio', path: `assets/audio/${audioAssetId}-${safeName(audioFile.name)}`, name: audioFile.name, size: audioFile.size || 0, lastModified: audioFile.lastModified || 0, mediaType: audioFile.type || '' });
  }
  const videoAssets = videos.map((v, i) => {
    const id = v.id || idOf('video', i);
    const asset = { id, kind: 'video', path: `assets/video/${id}-${safeName(v.file.name)}`, name: v.file.name, size: v.file.size || 0, lastModified: v.file.lastModified || 0, mediaType: v.file.type || '',
      durationUs: Math.max(0, Math.round((v.duration || 0) * 1e6)), width: v.width || 0, height: v.height || 0 };
    assets.push(asset);
    return asset;
  });
  const sections = [{ id: 'section-001', type: 'unknown', startFrame: 0, endFrame: durationFrames, confidence: null, locked: false }];
  const styles = [{ sectionId: sections[0].id, styleId: project.style || 'noir' }];
  const shots = videoAssets.length ? [{ id: 'shot-001', assetId: videoAssets[0].id, startFrame: 0, endFrame: durationFrames,
    sourceInUs: 0, sourceOutUs: videoAssets[0].durationUs || Math.round(plan.duration * 1e6), fit: 'cover', description: '' }] : [];
  const beats = (plan.beats || []).map((seconds, i) => ({ frame: frameOf(seconds, fps), strength: null, id: `beat-${i + 1}` }))
    .filter((beat, i, all) => beat.frame < durationFrames && (!i || beat.frame > all[i - 1].frame));
  const lines = (plan.lines || []).filter(line => !line.interlude && line.text).map(line => ({
    id: `lyric-${line.index + 1}`, lineIndex: line.index, text: String(line.text), startFrame: frameOf(line.start, fps),
    endFrame: Math.min(durationFrames, Math.max(frameOf(line.start, fps) + 1, frameOf(line.visEnd || line.end, fps))),
  }));
  const energy = [];
  if (audio && audio.energy && audio.energyRate) {
    const count = Math.min(600, audio.energy.length);
    for (let i = 0; i < count; i++) {
      const at = Math.round(i * (audio.energy.length - 1) / Math.max(1, count - 1));
      energy.push({ frame: frameOf(at / audio.energyRate, fps), value: +Math.max(0, Math.min(1, audio.energy[at])).toFixed(4) });
    }
  }
  const transitionMap = new Map();
  for (const cut of (plan.cuts || [])) if (cut.trans && J.TRANS && J.TRANS[cut.trans]) {
    const atFrame = frameOf(cut.start, fps);
    transitionMap.set(atFrame, { atFrame, transitionId: cut.trans, durationFrames: Math.max(1, frameOf(cut.transDur || 0.35, fps)) });
  }
  const transitions = [...transitionMap.values()];
  return {
    schemaVersion: VERSION,
    approved: false,
    project: { title: String(project.title || ''), artist: String(project.artist || ''), width, height, fps, durationFrames,
      aspect: project.aspect || '16:9', resolution: project.res || 1080 },
    editorProject: clone(project),
    assets,
    audio: audioAssetId ? { assetId: audioAssetId, durationUs: Math.round((audio && audio.duration || plan.duration) * 1e6) } : null,
    beats,
    audioFeatures: { bpm: audio && Number.isFinite(audio.bpm) ? audio.bpm : null, energyRateHz: audio && audio.energyRate || 0, energy },
    sections,
    lyrics: lines,
    shots,
    styles,
    transitions,
    render: { backPattern: 'render/mg/back/frame_%06d.png', frontPattern: 'render/mg/front/frame_%06d.png', frameCount: durationFrames, layersStatus: 'missing' },
  };
}

function validate(timeline, { requireShots = false } = {}) {
  const errors = [];
  const fail = message => errors.push(message);
  if (!timeline || typeof timeline !== 'object' || Array.isArray(timeline)) return { valid: false, errors: ['時間軸必須是 JSON 物件'] };
  if (timeline.schemaVersion !== VERSION) fail(`不支援的時間軸版本：${timeline.schemaVersion}`);
  const p = timeline.project || {};
  if (!Number.isInteger(p.fps) || ![24, 30, 60].includes(p.fps)) fail('project.fps 必須是 24、30 或 60');
  if (!Number.isInteger(p.width) || p.width < 2 || !Number.isInteger(p.height) || p.height < 2) fail('project.width／height 必須是正整數');
  if (!Number.isInteger(p.durationFrames) || p.durationFrames < 1) fail('project.durationFrames 必須大於 0');
  const total = Number.isInteger(p.durationFrames) ? p.durationFrames : 0;
  const ids = new Set(), byId = new Map();
  if (!Array.isArray(timeline.assets)) fail('assets 必須是陣列');
  else for (const asset of timeline.assets) {
    if (!asset || typeof asset.id !== 'string' || !asset.id || ids.has(asset.id)) fail('素材 id 必須存在且不可重複');
    else { ids.add(asset.id); byId.set(asset.id, asset); }
    if (!asset || !['audio', 'video'].includes(asset.kind)) fail(`素材 ${asset && asset.id || '?'} 的 kind 無效`);
    const path = asset && asset.path;
    if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) fail(`素材 ${asset && asset.id || '?'} 的路徑必須是安全的相對路徑`);
  }
  if (!timeline.audio || !byId.has(timeline.audio.assetId) || byId.get(timeline.audio.assetId).kind !== 'audio') fail('audio.assetId 必須指向一個音訊素材');
  const styles = new Map();
  if (!Array.isArray(timeline.styles)) fail('styles 必須是陣列');
  else for (const style of timeline.styles) {
    if (!style || !J.STYLES[style.styleId]) fail(`未知的 Style：${style && style.styleId || '?'}`);
    if (style && typeof style.sectionId !== 'string') fail('Style 必須指定 sectionId');
    else if (style && styles.has(style.sectionId)) fail(`段落 ${style.sectionId} 重複指定 Style`);
    else if (style) styles.set(style.sectionId, style.styleId);
  }
  const declaredSectionIds = new Set((Array.isArray(timeline.sections) ? timeline.sections : []).filter(section => section && typeof section.id === 'string').map(section => section.id));
  for (const sectionId of styles.keys()) if (!declaredSectionIds.has(sectionId)) fail(`Style 引用了不存在的段落：${sectionId}`);
  if (!Array.isArray(timeline.sections) || !timeline.sections.length) fail('sections 必須至少有一個段落');
  else {
    const sectionIds = new Set();
    const sorted = timeline.sections.slice().sort((a, b) => (Number.isInteger(a && a.startFrame) ? a.startFrame : -1) - (Number.isInteger(b && b.startFrame) ? b.startFrame : -1));
    let cursor = 0;
    for (const section of sorted) {
      if (!section || typeof section.id !== 'string' || !section.id || sectionIds.has(section.id)) fail('段落 id 必須存在且不可重複');
      else sectionIds.add(section.id);
      if (!section || !['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro', 'instrumental', 'unknown'].includes(section.type)) fail(`段落類型無效：${section && section.type || '?'}`);
      if (!section || !Number.isInteger(section.startFrame) || !Number.isInteger(section.endFrame) || section.startFrame !== cursor || section.endFrame <= section.startFrame || section.endFrame > total) fail('sections 必須不重疊並連續覆蓋完整歌曲');
      if (section && section.confidence !== null && (!Number.isFinite(section.confidence) || section.confidence < 0 || section.confidence > 1)) fail(`段落 ${section.id || '?'} 的 confidence 必須介於 0 與 1`);
      if (section && typeof section.locked !== 'boolean') fail(`段落 ${section.id || '?'} 必須有 locked 布林值`);
      if (section && !styles.has(section.id)) fail(`段落 ${section.id || '?'} 缺少 Style`);
      if (section && section.endFrame > cursor) cursor = section.endFrame;
    }
    if (cursor !== total) fail('sections 的最後一格必須等於 project.durationFrames');
  }
  if (!Array.isArray(timeline.lyrics)) fail('lyrics 必須是陣列');
  else for (const lyric of timeline.lyrics) if (!lyric || typeof lyric.text !== 'string' || !Number.isInteger(lyric.startFrame) || !Number.isInteger(lyric.endFrame) || lyric.startFrame < 0 || lyric.endFrame <= lyric.startFrame || lyric.endFrame > total) fail(`歌詞 ${lyric && lyric.id || '?'} 的影格範圍無效`);
  if (!Array.isArray(timeline.beats)) fail('beats 必須是陣列');
  else {
    let previous = -1;
    for (const beat of timeline.beats) {
      if (!beat || !Number.isInteger(beat.frame) || beat.frame < 0 || beat.frame >= total || beat.frame <= previous) fail('beats 必須依影格遞增且位於歌曲範圍內');
      if (beat && beat.strength !== null && (!Number.isFinite(beat.strength) || beat.strength < 0 || beat.strength > 1)) fail('beat strength 必須介於 0 與 1');
      if (beat && Number.isInteger(beat.frame)) previous = beat.frame;
    }
  }
  if (!Array.isArray(timeline.shots)) fail('shots 必須是陣列');
  else {
    const sorted = timeline.shots.slice().sort((a, b) => (Number.isInteger(a && a.startFrame) ? a.startFrame : -1) - (Number.isInteger(b && b.startFrame) ? b.startFrame : -1));
    const shotIds = new Set();
    let cursor = 0;
    for (const shot of sorted) {
      const asset = shot && byId.get(shot.assetId);
      if (!shot || !asset || asset.kind !== 'video') fail(`鏡頭 ${shot && shot.id || '?'} 必須引用影片素材`);
      if (!shot || typeof shot.id !== 'string' || !shot.id || shotIds.has(shot.id)) fail('鏡頭 id 必須存在且不可重複'); else shotIds.add(shot.id);
      if (!shot || !Number.isInteger(shot.startFrame) || !Number.isInteger(shot.endFrame) || shot.startFrame !== cursor || shot.endFrame <= shot.startFrame || shot.endFrame > total) fail('shots 必須不重疊並連續覆蓋完整歌曲');
      if (shot && (!Number.isSafeInteger(shot.sourceInUs) || !Number.isSafeInteger(shot.sourceOutUs) || shot.sourceInUs < 0 || shot.sourceOutUs <= shot.sourceInUs)) fail(`鏡頭 ${shot && shot.id || '?'} 的來源裁切時間無效`);
      if (shot && asset && asset.durationUs > 0 && shot.sourceOutUs > asset.durationUs + Math.round(1e6 / (p.fps || 24))) fail(`鏡頭 ${shot.id || '?'} 的來源出點超出影片長度`);
      if (shot && shot.endFrame > cursor) cursor = shot.endFrame;
    }
    if (requireShots && (!sorted.length || cursor !== total)) fail('合成前需要影片鏡頭完整覆蓋歌曲');
  }
  if (!Array.isArray(timeline.transitions)) fail('transitions 必須是陣列');
  else {
    const transitionFrames = new Set();
    for (const tr of timeline.transitions) {
      if (!tr || !Number.isInteger(tr.atFrame) || tr.atFrame < 0 || tr.atFrame >= total || !Number.isInteger(tr.durationFrames) || tr.durationFrames < 1 || tr.durationFrames > (p.fps || 24) * 10 || !J.TRANS[tr.transitionId]) fail(`轉場設定無效：${tr && tr.transitionId || '?'}`);
      else if (transitionFrames.has(tr.atFrame)) fail(`影格 ${tr.atFrame} 重複指定轉場`);
      else transitionFrames.add(tr.atFrame);
    }
  }
  return { valid: errors.length === 0, errors };
}

function attachToPlan(plan, project, timeline) {
  if (!timeline || !Array.isArray(timeline.sections)) return plan;
  const fps = plan.fps || 24;
  const styleBySection = new Map((timeline.styles || []).map(item => [item.sectionId, item.styleId]));
  const styleMap = {};
  for (const section of timeline.sections) {
    const id = styleBySection.get(section.id);
    if (id && J.STYLES[id] && !styleMap[id]) styleMap[id] = J.resolveStyle(Object.assign({}, project, { style: id }));
  }
  plan.mvTimeline = timeline;
  plan.mvStyleTracks = timeline.sections.map(section => ({ startFrame: section.startFrame, endFrame: section.endFrame, styleId: styleBySection.get(section.id) || project.style || 'noir' }));
  plan.mvStyleMap = styleMap;
  for (const transition of timeline.transitions || []) {
    const at = transition.atFrame / fps;
    const cut = plan.cuts.find(item => Math.abs(item.start - at) < 0.5 / fps);
    if (cut && J.TRANS[transition.transitionId]) { cut.trans = transition.transitionId; cut.transDur = transition.durationFrames / fps; }
  }
  return plan;
}

function refreshFromEditor(timeline, project, plan, audio) {
  const fps = plan.fps || project.fps || 24;
  const [width, height] = J.outputSize(project);
  const durationFrames = Math.max(1, Math.ceil(plan.duration * fps));
  timeline.project = Object.assign({}, timeline.project, { title: String(project.title || ''), artist: String(project.artist || ''), width, height, fps, durationFrames,
    aspect: project.aspect || '16:9', resolution: project.res || 1080 });
  timeline.editorProject = clone(project);
  timeline.beats = (plan.beats || []).map((seconds, i) => ({ frame: frameOf(seconds, fps), strength: null, id: `beat-${i + 1}` }))
    .filter((beat, i, all) => beat.frame < durationFrames && (!i || beat.frame > all[i - 1].frame));
  timeline.lyrics = (plan.lines || []).filter(line => !line.interlude && line.text).map(line => ({
    id: `lyric-${line.index + 1}`, lineIndex: line.index, text: String(line.text), startFrame: frameOf(line.start, fps),
    endFrame: Math.min(durationFrames, Math.max(frameOf(line.start, fps) + 1, frameOf(line.visEnd || line.end, fps))),
  }));
  const energy = [];
  if (audio && audio.energy && audio.energyRate) {
    const count = Math.min(600, audio.energy.length);
    for (let i = 0; i < count; i++) {
      const at = Math.round(i * (audio.energy.length - 1) / Math.max(1, count - 1));
      energy.push({ frame: frameOf(at / audio.energyRate, fps), value: +Math.max(0, Math.min(1, audio.energy[at])).toFixed(4) });
    }
  }
  timeline.audioFeatures = { bpm: audio && Number.isFinite(audio.bpm) ? audio.bpm : null, energyRateHz: audio && audio.energyRate || 0, energy };
  if (timeline.audio) timeline.audio.durationUs = Math.round((audio && audio.duration || plan.duration) * 1e6);
  return timeline;
}

J.MVTimeline = { version: VERSION, create, validate, attachToPlan, refreshFromEditor, safeName, frameOf };
})();
