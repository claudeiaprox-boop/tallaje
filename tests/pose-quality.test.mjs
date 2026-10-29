import test from 'node:test';
import assert from 'node:assert/strict';
import { createPoseQualityTracker } from '../src/pose-quality.mjs';

function person() {
  const pose = Array.from({ length: 33 }, () => ({ x: .5, y: .2, z: 0, visibility: .99, presence: .99 }));
  const set = (i, x, y) => Object.assign(pose[i], { x, y });
  set(7, .47, .15); set(8, .53, .15);
  set(11, .38, .28); set(12, .62, .28);
  set(13, .32, .40); set(14, .68, .40);
  set(15, .30, .52); set(16, .70, .52);
  set(23, .42, .52); set(24, .58, .52);
  set(25, .44, .70); set(26, .56, .70);
  set(27, .45, .86); set(28, .55, .86);
  set(29, .44, .89); set(30, .56, .89);
  set(31, .43, .90); set(32, .57, .90);
  return pose;
}
function inspect(tracker, pose, time, width = 1000, height = 1600) {
  return tracker.inspect([pose], width, height, time);
}
function settle(tracker, pose = person(), interval = 170) {
  let result;
  for (let i = 0; i < 8; i++) result = inspect(tracker, pose, i * interval);
  return result;
}

test('requires eight raw acceptable frames and at least one second, independently', () => {
  const tracker = createPoseQualityTracker(), pose = person();
  let result;
  for (let i = 0; i < 8; i++) result = inspect(tracker, pose, i * 100);
  assert.equal(result.quality.stableFrames, 8);
  assert.equal(result.quality.ready, false);
  for (let i = 8; i < 11; i++) result = inspect(tracker, pose, i * 100);
  assert.equal(result.quality.ready, true);
  assert.equal(result.checks.stable, true);
  assert.match(result.message, /no valida la precisión/);
  assert.equal(settle(createPoseQualityTracker()).quality.ready, true);
});

test('readiness works at slower inference rate without inventing a percentage', () => {
  const result = settle(createPoseQualityTracker(), person(), 333);
  assert.equal(result.quality.ready, true);
  assert.ok(result.quality.elapsedMs > 2000);
  assert.equal(Object.hasOwn(result.quality, 'confidence'), false);
});

test('raw movement resets stability before display smoothing can hide it', () => {
  const tracker = createPoseQualityTracker();
  settle(tracker);
  const next = person(); next[15].x -= .05;
  const result = inspect(tracker, next, 1400);
  assert.equal(result.quality.ready, false);
  assert.equal(result.quality.stableFrames, 1);
  assert.ok(result.quality.motion > .012);
  assert.equal(result.rawLandmarks[0][15].x, next[15].x);
});

test('small jitter is smoothed for display while raw points and caller inputs stay intact', () => {
  const tracker = createPoseQualityTracker(), pose = person();
  inspect(tracker, pose, 0);
  const next = person(); next[15].x -= .005;
  const result = inspect(tracker, next, 170);
  assert.equal(result.quality.stableFrames, 2);
  assert.equal(result.rawLandmarks[0][15].x, .295);
  assert.ok(result.landmarks[0][15].x > .295 && result.landmarks[0][15].x < .3);
  result.rawLandmarks[0][15].x = 0;
  assert.equal(next[15].x, .295);
});

test('slow cumulative drift also restarts the stability window', () => {
  const tracker = createPoseQualityTracker();
  let result;
  for (let i = 0; i < 9; i++) {
    const pose = person(); pose[15].x -= .004 * i;
    result = inspect(tracker, pose, i * 170);
  }
  assert.equal(result.quality.ready, false);
  assert.ok(result.quality.stableFrames < 8);
});

test('zero or multiple people discard previous stability and smoothed landmarks', () => {
  for (const poses of [[], [person(), person()], null, [null]]) {
    const tracker = createPoseQualityTracker(); settle(tracker);
    const result = tracker.inspect(poses, 1000, 1600, 1400);
    assert.equal(result.quality.ready, false);
    assert.equal(result.quality.stableFrames, 0);
    assert.equal(inspect(tracker, person(), 1570).quality.stableFrames, 1);
  }
});

test('low or malformed confidence and invalid coordinates fail closed', () => {
  const changes = [
    pose => { pose[11].visibility = .69; },
    pose => { delete pose[11].visibility; },
    pose => { pose[11].visibility = 1.1; },
    pose => { pose[23].presence = .69; },
    pose => { pose[23].presence = NaN; },
    pose => { pose[15].x = NaN; },
    pose => { pose[11].z = NaN; },
    pose => { delete pose[12].z; },
    pose => { pose[7].x = -.1; },
  ];
  for (const change of changes) {
    const pose = person(); change(pose);
    assert.equal(settle(createPoseQualityTracker(), pose).quality.ready, false);
  }
  const optionalPresence = person(); optionalPresence.forEach(p => { delete p.presence; });
  assert.equal(settle(createPoseQualityTracker(), optionalPresence).quality.ready, true);
});

test('occlusion, off-centering, poor framing and turned torso prevent readiness', () => {
  const changes = [
    pose => { pose[31].visibility = .1; pose[29].visibility = .1; },
    pose => pose.forEach(point => { point.x -= .18; }),
    pose => { pose[7].y = .35; pose[8].y = .35; },
    pose => { pose[7].y = .08; pose[8].y = .08; },
    pose => { pose[31].y = .96; pose[32].y = .96; },
    pose => { pose[11].z = .2; },
    pose => { pose[24].y += .08; },
    pose => { pose[15].x = .48; },
  ];
  for (const change of changes) {
    const pose = person(); change(pose);
    assert.equal(settle(createPoseQualityTracker(), pose).quality.ready, false);
  }
});

test('pixel aspect is accounted for when judging shoulder tilt', () => {
  const pose = person(); pose[12].y += .02;
  const wide = inspect(createPoseQualityTracker(), pose, 0, 800, 1600);
  const narrow = inspect(createPoseQualityTracker(), pose, 0, 400, 1600);
  assert.equal(wide.checks.level, true);
  assert.equal(narrow.checks.level, false);
});

test('time gaps, non-monotonic timestamps, dimension changes and reset discard old readiness', () => {
  for (const variant of ['gap', 'backward', 'width', 'height', 'reset', 'NaN', 'zeroWidth']) {
    const tracker = createPoseQualityTracker(); settle(tracker);
    if (variant === 'reset') tracker.reset();
    const result = inspect(tracker, person(), variant === 'gap' ? 2000 : variant === 'backward' ? 1100 : variant === 'NaN' ? NaN : 1400,
      variant === 'width' ? 900 : variant === 'zeroWidth' ? 0 : 1000, variant === 'height' ? 1500 : 1600);
    assert.equal(result.quality.ready, false, variant);
    assert.ok(result.quality.stableFrames <= 1, variant);
  }
});
