/* Recognition integration: real UI and bitmap transfer with deterministic model replies.
 * These checks validate automatic marking, lifecycle and privacy; they do not establish model accuracy. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(require('node:os').homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright'))); }
const base = process.env.TALLALAB_TEST_URL || 'http://127.0.0.1:5100';
const offlineFile = pathToFileURL(path.resolve(__dirname, '../TallaLab.html')).href;
const photoSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"><rect width="800" height="1200" fill="#eef3fa"/><circle cx="400" cy="180" r="65" fill="#748dae"/><path d="M300 310H500L560 680L470 1080H410L400 740L390 1080H330L240 680Z" fill="#748dae"/></svg>';
const results = [];
let browser;

async function fixture(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['camera'], acceptDownloads: true });
  const errors = [], external = [], policyErrors = [], writes = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (!['GET','HEAD'].includes(route.request().method())) { writes.push(route.request().method()+' '+url); return route.abort(); }
    if (/^https?:/.test(url) && new URL(url).origin !== new URL(base).origin) { external.push(url); return route.abort(); }
    return route.continue();
  });
  await context.addInitScript(({ imageMode, imageDelay, initFail }) => {
    const OriginalWorker = window.Worker;
    window.__imageMode = imageMode; window.__imageDelay = imageDelay; window.__imageRequests = 0;
    window.__imageDelivered = 0; window.__videoInits = 0; window.__imageInits = 0; window.__terminated = 0;
    window.__imageDimensions = []; window.__cameraTracks = [];
    navigator.mediaDevices.getUserMedia = async () => {
      const source = document.createElement('canvas'); source.width = 800; source.height = 1200;
      const painter = source.getContext('2d'); painter.fillRect(0, 0, 800, 1200);
      const stream = source.captureStream(12); const timer = setInterval(() => painter.fillRect(0, 0, 800, 1200), 80);
      window.__cameraTracks.push(...stream.getTracks());
      for (const track of stream.getTracks()) { const stop = track.stop.bind(track); track.stop = () => { clearInterval(timer); stop(); }; }
      return stream;
    };
    function person() {
      const pose = Array.from({ length: 33 }, () => ({ x: .5, y: .2, z: 0, visibility: .99, presence: .99 }));
      // Anatomical left is on the right of this frontal image.
      for (const [index,x,y] of [[0,.5,.14],[7,.47,.15],[8,.53,.15],[11,.62,.28],[12,.38,.28],[13,.68,.4],[14,.32,.4],[15,.7,.52],[16,.3,.52],[23,.58,.52],[24,.42,.52],[25,.56,.7],[26,.44,.7],[27,.55,.86],[28,.45,.86],[29,.56,.89],[30,.44,.89],[31,.57,.9],[32,.43,.9]]) Object.assign(pose[index],{x,y});
      return pose;
    }
    window.Worker = class {
      constructor(url, config) {
        if (new URL(url, location.href).pathname !== '/pose-worker.mjs') return new OriginalWorker(url, config);
        this.timers = new Set(); this.closed = false;
      }
      send(data,delay=10,onDeliver) { const timer=setTimeout(()=>{this.timers.delete(timer);if(this.closed)return;onDeliver?.();this.onmessage?.({data});},delay);this.timers.add(timer); }
      postMessage(data) {
        if(data.type==='init') { this.runningMode=data.runningMode||'VIDEO';if(this.runningMode==='IMAGE')window.__imageInits++;else window.__videoInits++;this.send(initFail?{type:'error',message:'Synthetic model unavailable'}:{type:'ready'});return; }
        if(!['frame','image'].includes(data.type))return;
        const isImage=data.type==='image';
        if(isImage){window.__imageRequests++;window.__imageDimensions.push([data.bitmap.width,data.bitmap.height]);}
        data.bitmap?.close();
        const pose=person(),mode=isImage?window.__imageMode:'valid';
        if(mode==='error'){this.send({type:'error',message:'Synthetic recognition failure'});return;}
        if(mode==='low'){pose[11].visibility=.1;pose[15].visibility=.1;}
        const landmarks=mode==='none'?[]:mode==='multiple'?[pose,person()]:[pose];
        this.send({type:isImage?'image-result':'result',id:data.id,landmarks,count:landmarks.length},isImage?window.__imageDelay:10,()=>{if(isImage)window.__imageDelivered++;});
      }
      terminate(){this.closed=true;for(const timer of this.timers)clearTimeout(timer);this.timers.clear();window.__terminated++;}
    };
  },{imageMode:options.imageMode||'valid',imageDelay:options.imageDelay||10,initFail:Boolean(options.initFail)});
  if(options.offline)await context.setOffline(true);
  const page=await context.newPage();page.setDefaultTimeout(12000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&/Content Security Policy|Refused to/.test(message.text()))policyErrors.push(message.text());});
  try{await page.goto(options.offline?offlineFile:base,{waitUntil:'load'});await step(page,3);}catch(error){await context.close();throw error;}
  return {page,async finish(){assert.deepEqual(errors,[],'uncaught browser errors');assert.deepEqual(policyErrors,[],'content security policy violations');assert.deepEqual(external,[],'unexpected external requests');assert.deepEqual(writes,[],'recognition must not transmit images or derived data');},async close(){await context.close();}};
}
async function using(options,run){const f=await fixture(options);try{await run(f.page);await f.finish();}finally{await f.close();}}
async function step(page,number){await page.locator(`#steps [data-step="${number}"]`).click();}
async function upload(page){await page.locator('#photoInput').setInputFiles({name:'persona.svg',mimeType:'image/svg+xml',buffer:Buffer.from(photoSvg)});await page.locator('#canvas').waitFor({state:'visible'});}
async function recognized(page,count=1){await page.waitForFunction(n=>window.__imageDelivered>=n,count);await page.waitForFunction(()=>document.querySelector('#recognitionStatus').dataset.state!=='loading');}
async function selectedMarks(page){return page.locator('#photoPoint option').evaluateAll(options=>options.filter(option=>option.textContent.includes('✓')).map(option=>option.value).sort());}
async function collectDownload(download){const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);return Buffer.concat(chunks).toString('utf8');}
async function test(name,run){if(process.env.TALLALAB_RECOGNITION_FILTER&&!name.includes(process.env.TALLALAB_RECOGNITION_FILTER))return;try{await run();results.push({name,status:'PASS'});process.stdout.write(`PASS ${name}\n`);}catch(error){results.push({name,status:'FAIL',error:error.stack||error.message});process.stdout.write(`FAIL ${name}: ${error.message}\n`);}}

(async()=>{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 try{
  await test('automatic recognition is default and marks supported joints without inventing garment contours',()=>using({},async page=>{
   assert.equal(await page.locator('#autoRecognize').isChecked(),true);
   await upload(page);await recognized(page);
   assert.equal(await page.evaluate(()=>window.__imageInits),1);
   assert.equal(await page.locator('#aiPointSelect option').count(),33);
   assert.match(await page.locator('#landmarkSummary').innerText(),/33/);
   assert.equal(await page.locator('#showAiPoints').isChecked(),true);
   assert.deepEqual(await selectedMarks(page),['elbow','shoulderL','shoulderR','wrist'].sort());
   await page.locator('#aiPointSelect').selectOption('0');
   assert.match(await page.locator('#aiPointHelp').innerText(),/nariz/i);
   await step(page,4);assert.equal(await page.locator('#measure-chest').inputValue(),'');
  }));
  await test('manual correction remains visible after reanalysis of the same photo',()=>using({},async page=>{
   await upload(page);await recognized(page);
   await page.locator('#photoPoint').selectOption('shoulderL');
   const canvas=page.locator('#canvas'),box=await canvas.boundingBox();
   await canvas.click({position:{x:box.width*.24,y:box.height*.28}});
   await page.locator('#photoPoint').selectOption('shoulderL');
   const before=await canvas.screenshot({animations:'disabled'});
   await page.locator('#recognizePhoto').click();await recognized(page,2);
   await page.locator('#photoPoint').selectOption('shoulderL');
   assert.deepEqual(await canvas.screenshot({animations:'disabled'}),before,'reanalysis must preserve the user-corrected point');
  }));
  await test('camera starts the model automatically and recognizes the captured image independently',()=>using({},async page=>{
   await page.locator('#startCamera').click();
   await page.waitForFunction(()=>window.__videoInits>=1);
   await page.waitForFunction(()=>!document.querySelector('#capture').disabled);
   await page.locator('#capture').click();await recognized(page);
   assert.deepEqual(await page.evaluate(()=>window.__imageDimensions),[[800,1200]]);
   assert.deepEqual(await selectedMarks(page),['elbow','shoulderL','shoulderR','wrist'].sort());
   assert.equal(await page.evaluate(()=>window.__cameraTracks.every(track=>track.readyState==='ended')),true);
  }));
  await test('no person and multiple people produce no automatic measurement points',async()=>{
   for(const imageMode of ['none','multiple'])await using({imageMode},async page=>{await upload(page);await recognized(page);assert.deepEqual(await selectedMarks(page),[]);assert.equal(await page.locator('#recognitionStatus').getAttribute('data-state'),imageMode==='none'?'empty':'multiple');});
  });
  await test('low visibility leaves uncertain joints pending for manual review',()=>using({imageMode:'low'},async page=>{
   await upload(page);await recognized(page);
   const marked=await selectedMarks(page);assert.ok(marked.length<4);assert.ok(!marked.includes('shoulderR'));assert.ok(!marked.includes('wrist'));
   assert.match(await page.locator('#landmarkSummary').innerText(),/31|visib|revis/i);
  }));
  await test('new session cancels pending recognition and discards late results',()=>using({imageDelay:900},async page=>{
   await upload(page);await page.waitForFunction(()=>window.__imageRequests===1);
   await page.locator('#newSession').click();await step(page,3);
   await page.waitForTimeout(1100);
   assert.equal(await page.evaluate(()=>window.__imageDelivered),0);
   assert.equal(await page.locator('#canvas').isVisible(),false);
   assert.deepEqual(await selectedMarks(page),[]);
  }));
  await test('changing view cancels pending recognition instead of attaching it to another view',()=>using({imageDelay:900},async page=>{
   await upload(page);await page.waitForFunction(()=>window.__imageRequests===1);
   await page.locator('#viewTabs button').nth(1).click();
   await page.waitForTimeout(1100);
   assert.equal(await page.evaluate(()=>window.__imageDelivered),0);
   assert.equal(await page.locator('#canvas').isVisible(),false);
   assert.deepEqual(await selectedMarks(page),[]);
  }));
  await test('model failure leaves manual photo marking available',()=>using({imageMode:'error'},async page=>{
   await upload(page);await page.waitForFunction(()=>/no disponible|no se pudo|error/i.test(document.querySelector('#recognitionStatus').textContent));
   assert.equal(await page.locator('#photoPoint').isEnabled(),true);
   const photo=page.locator('#canvas'),box=await photo.boundingBox();
   await page.locator('#photoPoint').selectOption('top');await photo.click({position:{x:box.width*.5,y:box.height*.08}});
   assert.ok((await selectedMarks(page)).includes('top'));
  }));
  await test('offline HTML explains model availability and keeps manual marking usable',()=>using({offline:true},async page=>{
   await upload(page);
   await page.waitForFunction(()=>/HTTPS|internet|conexión|publicada|en línea/i.test(document.querySelector('#recognitionStatus').textContent));
   assert.equal(await page.locator('#canvas').isVisible(),true);
   assert.equal(await page.locator('#photoPoint').isEnabled(),true);
  }));
 }finally{await browser.close();}
 const failed=results.filter(result=>result.status==='FAIL');process.stdout.write(`\n${results.length-failed.length}/${results.length} recognition checks passed.\n`);if(failed.length)process.stdout.write(JSON.stringify(failed,null,2)+'\n');process.exitCode=failed.length?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
