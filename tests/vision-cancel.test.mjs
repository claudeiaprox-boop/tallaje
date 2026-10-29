import test from 'node:test';
import assert from 'node:assert/strict';
import { createPoseAssistant } from '../src/vision.mjs';

async function withVisionTransport({ ready = false, bitmap } = {}, run) {
  const original = new Map(['Worker', 'createImageBitmap', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const workers = [];
  class WorkerMock {
    constructor() { this.messages = []; this.terminations = 0; workers.push(this); }
    postMessage(data) {
      this.messages.push(data);
      if (data.type === 'init' && ready) queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }));
    }
    terminate() { this.terminations++; }
  }
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: WorkerMock });
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: { baseURI: 'https://tallalab.example/' } });
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, writable: true, value: bitmap || (async () => ({ close() {} })) });
  try { return await run(workers); }
  finally {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}
const video = { readyState: 2, videoWidth: 600, videoHeight: 1000 };

test('already aborted live detection rejects before allocating a worker', () => withVisionTransport({}, async workers => {
  const controller = new AbortController();controller.abort();
  await assert.rejects(createPoseAssistant({ video, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(workers.length, 0);
}));

test('abort while initializing terminates worker immediately and rejects pending readiness', () => withVisionTransport({}, async workers => {
  const controller = new AbortController();
  const pending = createPoseAssistant({ video, signal: controller.signal });
  assert.equal(workers.length, 1);
  const checked = assert.rejects(pending, { name: 'AbortError' });
  controller.abort();
  assert.equal(workers[0].terminations, 1);
  await checked;
  assert.equal(workers[0].onmessage, null);
}));

test('status callback can cancel loading without leaving a timer or sending init afterwards', () => withVisionTransport({}, async workers => {
  const controller = new AbortController();
  await assert.rejects(createPoseAssistant({ video, signal: controller.signal, onStatus: () => controller.abort() }), { name: 'AbortError' });
  assert.equal(workers[0].terminations, 1);
  assert.equal(workers[0].messages.length, 0);
}));

test('abort after ready disposes live assistant and removes listeners exactly once', () => withVisionTransport({ ready: true }, async workers => {
  const controller = new AbortController();
  const assistant = await createPoseAssistant({ video, signal: controller.signal });
  controller.abort();
  assert.equal(workers[0].terminations, 1);
  assert.throws(() => assistant.start(), /cerró/);
  assistant.dispose();
  assert.equal(workers[0].terminations, 1);
}));

test('bitmap resolving after runtime abort is closed without transferring a new frame', async () => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  await withVisionTransport({ ready: true, bitmap: () => delayed }, async workers => {
    const controller = new AbortController();
    const assistant = await createPoseAssistant({ video, signal: controller.signal });assistant.start();
    await new Promise(resolve => setTimeout(resolve, 10));
    controller.abort();
    const frame = { closes: 0, close() { this.closes++; } };release(frame);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(frame.closes, 1);
    assert.deepEqual(workers[0].messages.map(message => message.type), ['init']);
    assert.equal(workers[0].terminations, 1);
  });
});

test('caller without signal retains normal readiness and disposal', () => withVisionTransport({ ready: true }, async workers => {
  const assistant = await createPoseAssistant({ video });assistant.dispose();
  assert.equal(workers[0].terminations, 1);
}));
