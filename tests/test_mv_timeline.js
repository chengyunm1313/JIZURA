'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(new URL('../src/13_mv_timeline.js', `file://${__filename}`), 'utf8');
const J = {
  STYLES: { noir: {}, crimson: {} },
  TRANS: { wipe: {} },
  resolveStyle: project => ({ id: project.style }),
  outputSize: () => [64, 64],
};
vm.runInNewContext(source, { J });
const timeline = {
  sections: [
    { id: 'verse', startFrame: 0, endFrame: 24 },
    { id: 'chorus', startFrame: 24, endFrame: 48 },
  ],
  styles: [
    { sectionId: 'verse', styleId: 'noir' },
    { sectionId: 'chorus', styleId: 'crimson' },
  ],
  transitions: [{ atFrame: 24, transitionId: 'wipe', durationFrames: 8 }],
};
const plan = J.MVTimeline.attachToPlan({ fps: 24, cuts: [{ start: 1, trans: 'fade' }] }, { style: 'noir' }, timeline);
const styleAt = frame => {
  const section = plan.mvStyleTracks.find(item => frame >= item.startFrame && frame < item.endFrame);
  return section && plan.mvStyleMap[section.styleId].id;
};
assert.equal(styleAt(23.999), 'noir');
assert.equal(styleAt(24), 'crimson');
assert.equal(plan.cuts[0].trans, 'wipe');
assert.equal(plan.cuts[0].transDur, 8 / 24);
console.log('MV style boundary and transition attachment OK');
