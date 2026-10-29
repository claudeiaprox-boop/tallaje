/* End-to-end checks against the prepared app. Uses local Edge and local dependencies only. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
function loadPlaywright() {
  try { return require('playwright'); }
  catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    const bundled = path.join(require('node:os').homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright');
    try { return require(bundled); }
    catch { throw new Error('Las pruebas UI necesitan Playwright: npm install --no-save --package-lock=false playwright'); }
  }
}
const { chromium } = loadPlaywright();

const base = process.env.TALLALAB_TEST_URL || 'http://127.0.0.1:5100';
const offlineFile = pathToFileURL(path.resolve(__dirname, '../TallaLab.html')).href;
const results = [];
let browser;

async function open(options = {}) {
  const { offline = false, mobile = false, camera = false } = options;
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    acceptDownloads: true,
    ...(camera ? { permissions: ['camera'] } : {}),
  });
  const externalRequests = [], pageErrors = [], policyErrors = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && new URL(url).origin !== new URL(base).origin) {
      externalRequests.push(url);
      return route.abort();
    }
    return route.continue();
  });
  if (offline) await context.setOffline(true);
  if (camera) await context.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__tracks = [];
    window.__cameraDelay = 0;
    window.__cameraCompleted = 0;
    window.__cameraFailures = [];
    navigator.mediaDevices.getUserMedia = async (...args) => {
      const delay = window.__cameraDelay;
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      try {
        const stream = await original(...args);
        window.__tracks.push(...stream.getTracks());
        window.__cameraCompleted++;
        return stream;
      } catch (error) {
        window.__cameraFailures.push(error.name + ': ' + error.message);
        throw error;
      }
    };
  });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /Content Security Policy|Refused to/.test(message.text())) policyErrors.push(message.text());
  });
  await page.goto(offline ? offlineFile : base, { waitUntil: 'load' });
  await page.locator('#garments button').first().waitFor();
  async function finish() {
    assert.deepEqual(pageErrors, [], 'uncaught browser errors');
    assert.deepEqual(policyErrors, [], 'content security policy violations');
    assert.deepEqual(externalRequests, [], 'unexpected external request');
  }
  return { page, context, finish };
}

async function step(page, number) {
  await page.locator(`#steps [data-step="${number}"]`).click();
  await page.locator(`#step${number}`).waitFor({ state: 'visible' });
}

async function garment(page, value) {
  await step(page, 1);
  await page.locator(`[data-garment="${value}"]`).click();
}

async function fillMeasurements(page, measurements) {
  for (const [key, value] of Object.entries(measurements)) await page.locator(`#measure-${key}`).fill(String(value));
}

async function ready(page, measurements) {
  await step(page, 4);
  await fillMeasurements(page, measurements);
  await page.locator('#confirmed').check();
  await page.locator('#referenceAccepted').check();
  await step(page, 5);
}

async function test(name, fn) {
  if (process.env.TALLALAB_UI_FILTER && !name.includes(process.env.TALLALAB_UI_FILTER)) return;
  const start = Date.now();
  try {
    await fn();
    results.push({ name, status: 'PASS', ms: Date.now() - start });
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    results.push({ name, status: 'FAIL', ms: Date.now() - start, error: error.stack || error.message });
    process.stdout.write(`FAIL ${name}: ${error.message}\n`);
  }
}

async function using(options, fn) {
  const fixture = await open(options);
  try { await fn(fixture.page); await fixture.finish(); }
  finally { await fixture.context.close(); }
}

async function assertNoOverflow(page) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.width + 1 && dimensions.body <= dimensions.width + 1, `horizontal overflow: ${JSON.stringify(dimensions)}`);
}

async function collectDownload(download) {
  const chunks = [];
  const stream = await download.createReadStream();
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

(async () => {
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    await test('four garments: choose, prepare, verify and receive nominal reference', () => using({}, async page => {
      const cases = [
        ['shirt', { chest: 68 }, '10'],
        ['pants', { waist: 65, hip: 76 }, '10'],
        ['skirt', { waist: 62, hip: 76 }, '10'],
        ['shoes', { leftFoot: 18.5, rightFoot: 18.4 }, '30'],
      ];
      for (const [key, measurements, expected] of cases) {
        await garment(page, key);
        await page.locator('#step1 [data-next]').click();
        assert.equal(await page.locator('#step2').isVisible(), true);
        await page.locator('#skipCamera').click();
        await fillMeasurements(page, measurements);
        await page.locator('#confirmed').check();
        await page.locator('#referenceAccepted').check();
        await page.locator('#step4 [data-next]').click();
        assert.equal(await page.locator('#recommendation .result-size').innerText(), expected, key);
        assert.match(await page.locator('#recommendation').innerText(), /REFERENCIA PARA PROBAR/);
      }
    }));

    await test('missing confirmations, changed inputs, and outside table fail closed', () => using({}, async page => {
      await step(page, 4);
      await fillMeasurements(page, { chest: 68 });
      await step(page, 5);
      assert.equal(await page.locator('#recommendation .result-size').innerText(), 'Completa la verificación');
      await ready(page, { chest: 68 });
      assert.equal(await page.locator('#recommendation .result-size').innerText(), '10');
      await step(page, 4);
      await page.locator('#measure-chest').fill('69');
      assert.equal(await page.locator('#confirmed').isChecked(), false);
      await step(page, 5);
      assert.equal(await page.locator('#recommendation .result-size').innerText(), 'Completa la verificación');
      const rows = page.locator('#catalogTable tbody tr');
      const minimum = Number(await rows.first().locator('td').nth(1).textContent());
      const maximum = Number(await rows.last().locator('td').nth(1).textContent());
      for (const chest of [minimum - .1, maximum + .1]) {
        await ready(page, { chest });
        assert.equal(await page.locator('#recommendation .result-size').innerText(), 'Fuera de esta tabla', `chest=${chest}; ${await page.locator('#resultEvidence').innerText()}`);
      }
    }));

    await test('demo has visible photo estimates and labels its report as fictional', () => using({}, async page => {
      await page.locator('#demoButton').click();
      assert.equal(await page.locator('#demoBanner').isVisible(), true);
      assert.equal(await page.locator('#canvas').isVisible(), true);
      assert.match(await page.locator('#photoResults').innerText(), /Ancho entre hombros/);
      await step(page, 5);
      assert.equal(await page.locator('#recommendation .result-size').innerText(), '10');
      const pending = page.waitForEvent('download');
      await page.locator('#downloadReport').click();
      const download = await pending;
      assert.equal(download.suggestedFilename(), 'TallaLab-informe.txt');
      const text = await collectDownload(download);
      assert.match(text, /EJEMPLO FICTICIO/);
      assert.match(text, /Talla de referencia: 10/);
      assert.match(text, /Las fotos no se incluyen/);
      assert.doesNotMatch(text, /data:image|base64,/);
      await page.locator('#newSession').click();
      assert.equal(await page.locator('#demoBanner').isVisible(), false);
      await step(page, 4);
      assert.equal(await page.locator('#measure-chest').inputValue(), '');
    }));

    await test('CSV labels and supplier names stay inert text through table and result', () => using({}, async page => {
      await step(page, 4);
      await page.locator('#step4 details').filter({ hasText: 'Usar la tabla de mi proveedor' }).locator('summary').click();
      const label = '<img src=x onerror=window.__csvXss=1>';
      const supplier = '<b id=csvSupplier>Proveedor</b>';
      await page.locator('#supplierName').fill(supplier);
      const csv = `talla,pecho,cintura,cadera,pie_cm\n${label},68,65,76,\n`;
      await page.locator('#csvInput').setInputFiles({ name: 'proveedor.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
      await page.waitForFunction(() => document.querySelector('#csvStatus').textContent.includes('Tabla cargada'));
      assert.equal(await page.locator('#catalog option:checked').textContent(), supplier);
      assert.match(await page.locator('#catalogTable').textContent(), /<img src=x/);
      assert.equal(await page.locator('#catalogTable img, #csvSupplier').count(), 0);
      await ready(page, { chest: 68 });
      assert.equal(await page.locator('#recommendation .result-size').textContent(), label);
      assert.equal(await page.locator('#recommendation img').count(), 0);
      assert.equal(await page.evaluate(() => window.__csvXss), undefined);
    }));

    await test('upload, mark, drag, undo, reset, and restore photo points', () => using({}, async page => {
      await garment(page, 'pants');
      await step(page, 2);
      await page.locator('#height').fill('160');
      await step(page, 3);
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1000"><rect width="600" height="1000" fill="#eef3fa"/><path d="M200 100H400V900H200Z" fill="#6686aa"/></svg>';
      await page.locator('#photoInput').setInputFiles({ name: 'silueta.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
      await page.locator('#canvas').waitFor({ state: 'visible' });
      const marks = [['top', 300, 100], ['bottom', 300, 900], ['waistL', 240, 450], ['waistR', 360, 450], ['hipL', 220, 550], ['hipR', 380, 550], ['crotch', 300, 600]];
      const photo = page.locator('#canvas');
      for (const [key, x, y] of marks) {
        await page.locator('#photoPoint').selectOption(key);
        const box = await photo.boundingBox();
        await photo.click({ position: { x: x / 600 * box.width, y: y / 1000 * box.height } });
      }
      assert.match(await page.locator('#pointInstruction').innerText(), /^7\/7/);
      assert.match(await page.locator('#photoResults').innerText(), /24 cm/);
      const box = await photo.boundingBox();
      const from = { x: box.x + 240 / 600 * box.width, y: box.y + 450 / 1000 * box.height };
      await page.mouse.move(from.x, from.y); await page.mouse.down();
      await page.mouse.move(from.x - 12 / 600 * box.width, from.y, { steps: 3 }); await page.mouse.up();
      assert.match(await page.locator('#photoResults').innerText(), /26(?:[.,]4)? cm/);
      await page.locator('#undoPoint').click();
      assert.match(await page.locator('#photoResults').innerText(), /24 cm/);
      await page.locator('#resetPoints').click();
      assert.match(await page.locator('#pointInstruction').innerText(), /^0\/7/);
      await page.locator('#undoPoint').click();
      assert.match(await page.locator('#pointInstruction').innerText(), /^7\/7/);
      await step(page, 4);
      assert.equal(await page.locator('#measure-waist').inputValue(), '', 'photo widths must not become circumferences');
      assert.equal(await page.locator('#measure-hip').inputValue(), '');
    }));

    await test('fake camera captures locally, stops tracks, and discards delayed canceled stream', () => using({ camera: true }, async page => {
      await step(page, 3);
      await page.locator('#startCamera').click();
      await page.waitForFunction(() => !document.querySelector('#capture').disabled);
      assert.equal(await page.locator('#liveOverlay').isVisible(), true);
      await page.locator('#capture').click();
      assert.equal(await page.locator('#canvas').isVisible(), true);
      assert.equal(await page.evaluate(() => window.__tracks.every(track => track.readyState === 'ended')), true);
      // Edge can remove its fake device after release. A local canvas MediaStream
      // isolates the app's late-resolution cleanup from fake-device enumeration.
      await page.evaluate(() => {
        const source = document.createElement('canvas'); source.width = 320; source.height = 240;
        source.getContext('2d').fillRect(0, 0, 320, 240);
        const lateStream = source.captureStream(1);
        window.__tracks.push(...lateStream.getTracks());
        navigator.mediaDevices.getUserMedia = () => new Promise(resolve => setTimeout(() => {
          window.__cameraCompleted++;
          resolve(lateStream);
        }, 500));
      });
      await page.locator('#startCamera').click();
      await page.locator('#stopCamera').click();
      await page.waitForFunction(() => window.__cameraCompleted === 2 || window.__cameraFailures.length);
      assert.deepEqual(await page.evaluate(() => window.__cameraFailures), []);
      assert.equal(await page.evaluate(() => window.__tracks.every(track => track.readyState === 'ended')), true);
      assert.equal(await page.locator('#video').isVisible(), false);
      assert.equal(await page.locator('#canvas').isVisible(), true);
      assert.equal(await page.locator('#startCamera').isEnabled(), true);
    }));

    await test('camera denial leaves upload available and a useful message', () => using({}, async page => {
      await page.evaluate(() => {
        navigator.mediaDevices.getUserMedia = async () => { throw Object.assign(new Error('Denied for test'), { name: 'NotAllowedError' }); };
      });
      await step(page, 3);
      await page.locator('#startCamera').click();
      await page.waitForFunction(() => document.querySelector('#cameraStatus').textContent.includes('No se concedió'));
      assert.equal(await page.locator('#startCamera').isEnabled(), true);
      assert.equal(await page.locator('#photoInput').isEnabled(), true);
    }));

    await test('390 px mobile keeps all steps, photo, and tables within viewport', () => using({ mobile: true }, async page => {
      for (let number = 1; number <= 5; number++) { await step(page, number); await assertNoOverflow(page); }
      await step(page, 1); await page.locator('#demoButton').click(); await assertNoOverflow(page);
      await step(page, 4);
      await page.locator('#step4 details').filter({ hasText: 'Ver valores de la tabla' }).locator('summary').click();
      await assertNoOverflow(page);
      await garment(page, 'shoes'); await step(page, 4); await assertNoOverflow(page);
    }));

    await test('downloadable HTML runs offline with demo, measurements, result and report', () => using({ offline: true, mobile: true }, async page => {
      assert.match(await page.title(), /TallaLab/);
      await page.locator('#demoButton').click();
      assert.match(await page.locator('#photoResults').innerText(), /Ancho entre hombros/);
      await step(page, 5);
      assert.equal(await page.locator('#recommendation .result-size').innerText(), '10');
      const pending = page.waitForEvent('download');
      await page.locator('#downloadReport').click();
      assert.match(await collectDownload(await pending), /EJEMPLO FICTICIO/);
      await page.locator('#newSession').click();
      await garment(page, 'shoes');
      await ready(page, { leftFoot: 18.5, rightFoot: 18.9 });
      assert.equal(await page.locator('#recommendation .result-size').innerText(), '31');
      await assertNoOverflow(page);
    }));
  } finally {
    await browser.close();
  }
  const failed = results.filter(result => result.status === 'FAIL');
  process.stdout.write(`\n${results.length - failed.length}/${results.length} UI checks passed.\n`);
  if (failed.length) process.stdout.write(JSON.stringify(failed, null, 2) + '\n');
  process.exitCode = failed.length ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
