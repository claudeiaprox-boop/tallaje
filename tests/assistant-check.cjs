/* Camera/worker integration checks. Synthetic landmarks verify UI state, not model accuracy. */
const assert = require('node:assert/strict');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(require('node:os').homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright'))); }
const base = process.env.TALLALAB_TEST_URL || 'http://127.0.0.1:5100';
const results = [];
let browser;

async function fixture(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['camera'] });
  const errors = [], external = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && new URL(url).origin !== new URL(base).origin) { external.push(url); return route.abort(); }
    return route.continue();
  });
  await context.addInitScript(({ initDelay, initFail }) => {
    const OriginalWorker = window.Worker;
    // A canvas-backed fake camera avoids Edge's fake-device re-enumeration after stop().
    navigator.mediaDevices.getUserMedia = async () => {
      const source = document.createElement('canvas'); source.width = 800; source.height = 1200;
      const painter = source.getContext('2d'); painter.fillRect(0, 0, 800, 1200);
      const stream = source.captureStream(12);
      const timer = setInterval(() => { painter.fillRect(0, 0, 800, 1200); }, 80);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { clearInterval(timer); stop(); };
      }
      return stream;
    };
    window.__poseMode = 'valid';
    window.__poseReplyDelay = 10;
    window.__poseDelivered = 0;
    window.__poseDeliveredLate = 0;
    window.__poseFrames = 0;
    window.__poseTerminations = 0;
    function person() {
      const pose = Array.from({ length: 33 }, () => ({ x: .5, y: .2, z: 0, visibility: .99, presence: .99 }));
      for (const [index, x, y] of [[7,.47,.15],[8,.53,.15],[11,.38,.28],[12,.62,.28],[13,.32,.4],[14,.68,.4],[15,.3,.52],[16,.7,.52],[23,.42,.52],[24,.58,.52],[25,.44,.7],[26,.56,.7],[27,.45,.86],[28,.55,.86],[29,.44,.89],[30,.56,.89],[31,.43,.9],[32,.57,.9]]) Object.assign(pose[index], { x, y });
      return pose;
    }
    window.Worker = class {
      constructor(url, config) {
        if (new URL(url, location.href).pathname !== '/pose-worker.mjs') return new OriginalWorker(url, config);
        this.timers = new Set(); this.closed = false;
      }
      send(data, delay, onDeliver) {
        const timer = setTimeout(() => {
          this.timers.delete(timer);
          if (this.closed) return;
          onDeliver?.();
          this.onmessage?.({ data });
        }, delay);
        this.timers.add(timer);
      }
      postMessage(data) {
        if (data.type === 'init') { this.send(initFail ? { type: 'error', message: 'Synthetic initialization failure' } : { type: 'ready' }, initDelay); return; }
        if (data.type !== 'frame') return;
        data.bitmap?.close();
        window.__poseFrames++;
        const mode = window.__poseMode, delay = window.__poseReplyDelay;
        if (mode === 'pause') return;
        if (mode === 'error') { this.send({ type: 'error', message: 'Synthetic worker failure' }, delay); return; }
        const pose = person();
        if (mode === 'moving') pose[15].x -= window.__poseFrames % 2 ? .07 : 0;
        const landmarks = mode === 'multiple' ? [pose, person()] : mode === 'none' ? [] : [pose];
        this.send({ type: 'result', id: data.id, landmarks }, delay, () => {
          window.__poseDelivered++;
          if (delay >= 700) window.__poseDeliveredLate++;
        });
      }
      terminate() { this.closed = true; for (const timer of this.timers) clearTimeout(timer); this.timers.clear(); window.__poseTerminations++; }
    };
  }, { initDelay: options.initDelay || 10, initFail: Boolean(options.initFail) });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base, { waitUntil: 'load' });
    await page.locator('#steps [data-step="3"]').click();
    await page.locator('#startCamera').click();
    await page.waitForFunction(() => !document.querySelector('#capture').disabled);
  } catch (error) { await context.close(); throw error; }
  return {
    page,
    async finish() { assert.deepEqual(errors, [], 'uncaught browser errors'); assert.deepEqual(external, [], 'unexpected external requests'); },
    async close() { await context.close(); },
  };
}
async function using(options, run) {
  const f = await fixture(options);
  try { await run(f.page); await f.finish(); }
  finally { await f.close(); }
}
async function activate(page) {
  await page.locator('#assistButton').click();
  await page.waitForFunction(() => document.querySelector('#assistButton').textContent.includes('Detener'));
}
async function stable(page) {
  await page.waitForFunction(() => !document.querySelector('#capture').disabled && document.querySelector('#captureReadiness').textContent.includes('Postura estable'), null, { timeout: 10000 });
}
async function test(name, run) {
  try { await run(); results.push({ name, status: 'PASS' }); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { results.push({ name, status: 'FAIL', error: error.stack || error.message }); process.stdout.write(`FAIL ${name}: ${error.message}\n`); }
}

(async () => {
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    await test('assistant blocks capture until eight stable frames and one second', () => using({}, async page => {
      await activate(page);
      assert.equal(await page.locator('#capture').isDisabled(), true);
      await stable(page);
      assert.ok(await page.evaluate(() => window.__poseDelivered >= 8));
      assert.match(await page.locator('#poseChecks').innerText(), /✓ Postura estable/);
      await page.locator('#capture').click();
      await page.locator('#canvas').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#video').isVisible(), false);
      assert.ok(await page.evaluate(() => window.__poseTerminations >= 1));
    }));

    await test('movement and multiple people revoke readiness; valid posture must settle again', () => using({}, async page => {
      await activate(page); await stable(page);
      await page.evaluate(() => { window.__poseMode = 'moving'; });
      await page.waitForFunction(() => document.querySelector('#capture').disabled);
      await page.evaluate(() => { window.__poseMode = 'multiple'; });
      await page.waitForFunction(() => document.querySelector('#assistStatus').textContent.includes('más de una persona'));
      assert.equal(await page.locator('#capture').isDisabled(), true);
      await page.evaluate(() => { window.__poseMode = 'valid'; });
      await stable(page);
    }));

    await test('stalled worker expires readiness and permits explicit manual fallback', () => using({}, async page => {
      await activate(page); await stable(page);
      await page.evaluate(() => { window.__poseMode = 'pause'; });
      await page.waitForFunction(() => document.querySelector('#capture').disabled, null, { timeout: 3000 });
      assert.match(await page.locator('#captureReadiness').innerText(), /Espera/);
      assert.equal(await page.locator('#poseChecks').isVisible(), false, 'expired green check chips must not remain visible');
      await page.locator('#assistButton').click();
      assert.equal(await page.locator('#capture').isEnabled(), true);
      assert.match(await page.locator('#captureReadiness').innerText(), /Captura manual/);
    }));

    await test('late result cannot renew freshness of an old captured frame', () => using({}, async page => {
      await activate(page); await stable(page);
      await page.evaluate(() => { window.__poseReplyDelay = 950; });
      await page.waitForFunction(() => window.__poseDeliveredLate >= 1, null, { timeout: 5000 });
      assert.equal(await page.locator('#capture').isDisabled(), true, 'old inference must not re-enable capture upon arrival');
    }));

    await test('worker failure restores manual capture with a useful status', () => using({}, async page => {
      await activate(page); await stable(page);
      await page.evaluate(() => { window.__poseMode = 'error'; });
      await page.waitForFunction(() => document.querySelector('#assistStatus').textContent.includes('no disponible'));
      assert.equal(await page.locator('#capture').isEnabled(), true);
      assert.match(await page.locator('#captureReadiness').innerText(), /Captura manual/);
      assert.ok(await page.evaluate(() => window.__poseTerminations >= 1));
    }));

    await test('initialization failure releases the loading gate', () => using({ initDelay: 150, initFail: true }, async page => {
      await page.locator('#assistButton').click();
      assert.equal(await page.locator('#capture').isDisabled(), true);
      await page.waitForFunction(() => document.querySelector('#assistStatus').textContent.includes('no disponible'));
      assert.equal(await page.locator('#capture').isEnabled(), true);
      assert.equal(await page.locator('#assistButton').isEnabled(), true);
    }));
  } finally { await browser.close(); }
  const failed = results.filter(result => result.status === 'FAIL');
  process.stdout.write(`\n${results.length - failed.length}/${results.length} assistant checks passed.\n`);
  if (failed.length) process.stdout.write(JSON.stringify(failed, null, 2) + '\n');
  process.exitCode = failed.length ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
