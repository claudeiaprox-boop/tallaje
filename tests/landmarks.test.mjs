import test from 'node:test';
import assert from 'node:assert/strict';
import { BODY_LANDMARKS, POSE_CONNECTIONS, mapPoseToPhoto } from '../src/landmarks.mjs';
import { detectPhotoPose } from '../src/photo-vision.mjs';

function person() {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: .98, presence: .99 }));
  for (const [index,x,y] of [[11,.7,.25],[12,.3,.25],[13,.8,.4],[14,.2,.4],[15,.85,.5],[16,.15,.5]]) points[index] = { ...points[index], x, y };
  return points;
}
const map = (pose, extra = {}) => mapPoseToPhoto({ landmarks: [pose], width: 600, height: 1000, ...extra });

test('33 named anatomical indices and valid skeleton edges are available', () => {
  assert.equal(BODY_LANDMARKS.length, 33);
  assert.equal(new Set(BODY_LANDMARKS.map(p => p.key)).size, 33);
  assert.deepEqual(BODY_LANDMARKS.map(p => p.index), Array.from({ length: 33 }, (_, i) => i));
  assert.ok(POSE_CONNECTIONS.every(edge => edge.length === 2 && edge.every(i => Number.isInteger(i) && i >= 0 && i < 33)));
});

test('maps image-relative shoulders and matching right-image arm without changing the input', () => {
  const pose = person(), before = structuredClone(pose), result = map(pose);
  assert.deepEqual(pose, before);
  assert.equal(result.count, 1); assert.equal(result.visibleCount, 33);
  assert.equal(result.landmarks.length, 33);
  assert.deepEqual(result.points, { shoulderL: { x: 180, y: 250 }, shoulderR: { x: 420, y: 250 }, elbow: { x: 480, y: 400 }, wrist: { x: 510, y: 500 } });
  assert.ok(Object.values(result.origins).every(origin => origin === 'ai'));
  result.landmarks[11].x = 0;
  assert.equal(pose[11].x, .7, 'result never aliases the original pose');
});

test('spatial mapping follows the opposite anatomical arm when image is mirrored', () => {
  const pose = person();for (const p of pose) p.x = 1 - p.x;
  const result = map(pose);
  assert.ok(result.points.shoulderL.x < result.points.shoulderR.x);
  assert.ok(Math.abs(result.points.elbow.x - 480) < 1e-8);
  assert.ok(Math.abs(result.points.wrist.x - 510) < 1e-8);
});

test('never invents crown, ground, torso borders, contours, crotch or foot measurement points', () => {
  const result = map(person());
  assert.deepEqual(Object.keys(result.points).sort(), ['elbow','shoulderL','shoulderR','wrist']);
  assert.equal(result.points.hipL, undefined);assert.equal(result.points.waistL, undefined);assert.equal(result.points.top, undefined);
  assert.equal(result.points.bottom, undefined);assert.equal(result.points.crotch, undefined);assert.equal(result.points.chestL, undefined);
  assert.ok(result.warnings.some(w => w.includes('articulaciones')));
});

test('zero and multiple people do not select an arbitrary pose', () => {
  for (const landmarks of [undefined, [], [person(), person()]]) {
    const result = mapPoseToPhoto({ landmarks, width: 600, height: 1000 });
    assert.deepEqual(result.landmarks, []);assert.deepEqual(result.points, {});assert.equal(result.visibleCount, 0);
  }
});

test('out of bounds, malformed and low-confidence landmarks are omitted, never clamped', () => {
  for (const invalid of [{ x: NaN },{ y: Infinity },{ x: -0.01 },{ y: 1.01 },{ visibility: .69 },{ visibility: NaN },{ visibility: 1.1 },{ presence: .69 },{ presence: null }]) {
    const pose = person();Object.assign(pose[15], invalid);
    const result = map(pose);
    assert.equal(result.landmarks[15], null);assert.equal(result.points.wrist, undefined);assert.equal(result.visibleCount, 32);
  }
  const missing = person();delete missing[15].visibility;
  assert.equal(map(missing).points.wrist, undefined);
});

test('visibility threshold inclusive, optional presence, confidence-free z does not break 2D drawing', () => {
  const pose = person();pose[15].visibility=.7;delete pose[15].presence;pose[15].z=NaN;
  const result=map(pose);assert.ok(result.points.wrist);assert.equal(result.landmarks[15].z,undefined);
});

test('profile keeps a safe skeleton and does not populate measurement points', () => {
  const result = map(person(), { view: 'side' });
  assert.equal(result.visibleCount, 33);assert.equal(result.landmarks.length, 33);assert.deepEqual(result.points, {});
  assert.ok(result.warnings.some(w => w.includes('perfil')));
});

test('missing or overlapping shoulders cannot produce ambiguous arm proposals', () => {
  const missing = person();missing[11].visibility=.1;
  const overlapping = person();overlapping[11].x=overlapping[12].x;
  for (const p of [missing,overlapping]) assert.deepEqual(map(p).points,{});
});

test('invalid dimensions and malformed pose fail safely', () => {
  for (const dimensions of [{width:0},{height:-1},{width:NaN},{height:Infinity}]) {
    const result=map(person(),dimensions);assert.deepEqual(result.points,{});assert.deepEqual(result.landmarks,[]);
  }
  assert.deepEqual(map(null).points,{});
  const partial=map([]);assert.equal(partial.visibleCount,0);assert.equal(partial.landmarks.length,33);assert.deepEqual(partial.points,{});
});

async function photoTransport({ init, image, bitmap } = {}, run) {
  const original = new Map(['Worker', 'createImageBitmap', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const workers = [], bitmaps = [];
  class FakeWorker {
    constructor() { this.terminated = false; this.messages = []; workers.push(this); }
    postMessage(data) {
      this.messages.push(data);
      if (data.type === 'init') queueMicrotask(() => init ? init(this, data) : this.onmessage?.({ data: { type: 'ready' } }));
      if (data.type === 'image') queueMicrotask(() => image ? image(this, data) : this.onmessage?.({ data: { type: 'image-result', id: data.id, landmarks: [person()] } }));
    }
    terminate() { this.terminated = true; }
  }
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: FakeWorker });
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: { baseURI: 'https://tallalab.example/' } });
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, writable: true, value: bitmap || (async () => { const value = { closed: 0, close() { this.closed++; } }; bitmaps.push(value); return value; }) });
  try { return await run({ workers, bitmaps }); }
  finally {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}

test('still-image transport sends IMAGE mode and the exact bitmap, then terminates its worker', () => photoTransport({}, async ({ workers, bitmaps }) => {
  const result = await detectPhotoPose({ image: {} });
  assert.equal(result.count, 1);assert.equal(result.landmarks[0].length, 33);
  assert.equal(workers.length, 1);assert.equal(workers[0].terminated, true);
  assert.equal(workers[0].messages[0].runningMode, 'IMAGE');
  assert.equal(workers[0].messages[0].baseUrl, 'https://tallalab.example/vendor/mediapipe/');
  assert.equal(workers[0].messages[1].type, 'image');
  assert.equal(workers[0].messages[1].bitmap, bitmaps[0]);
  assert.equal(bitmaps[0].closed, 0, 'transferred frame ownership belongs to worker');
}));

test('still-image transport ignores wrong request ids and releases worker on error', async () => {
  await photoTransport({ image(worker, data) {
    worker.onmessage?.({ data: { type: 'image-result', id: 99, landmarks: [person(), person()] } });
    worker.onmessage?.({ data: { type: 'image-result', id: data.id, landmarks: [] } });
  } }, async ({ workers }) => {
    const result = await detectPhotoPose({ image: {} });
    assert.equal(result.count, 0);assert.equal(workers[0].terminated, true);
  });
  await photoTransport({ init(worker) { worker.onmessage?.({ data: { type: 'error', phase: 'init', message: 'Fallo controlado' } }); } }, async ({ workers }) => {
    await assert.rejects(detectPhotoPose({ image: {} }), /Fallo controlado/);
    assert.equal(workers[0].terminated, true);
  });
});

test('already canceled still-image request creates no worker', () => photoTransport({}, async ({ workers }) => {
  const controller = new AbortController();controller.abort();
  await assert.rejects(detectPhotoPose({ image: {}, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(workers.length, 0);
}));

test('cancel during model initialization releases worker without creating a bitmap', () => photoTransport({ init() {} }, async ({ workers, bitmaps }) => {
  const controller = new AbortController();
  const pending = detectPhotoPose({ image: {}, signal: controller.signal });
  const checked = assert.rejects(pending, { name: 'AbortError' });controller.abort();await checked;
  assert.equal(workers[0].terminated, true);assert.equal(bitmaps.length, 0);
}));

test('bitmap resolving after cancellation is closed without transfer to terminated worker', async () => {
  let release;
  const late = new Promise(resolve => { release = resolve; });
  await photoTransport({ bitmap: () => late }, async ({ workers }) => {
    const controller = new AbortController();
    const pending = detectPhotoPose({ image: {}, signal: controller.signal });
    await new Promise(resolve => setImmediate(resolve));
    const checked = assert.rejects(pending, { name: 'AbortError' });controller.abort();await checked;
    const bitmap = { closed: 0, close() { this.closed++; } };release(bitmap);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(bitmap.closed, 1);assert.equal(workers[0].messages.length, 1);assert.equal(workers[0].terminated, true);
  });
});
