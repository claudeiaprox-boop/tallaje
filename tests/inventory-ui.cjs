/* School inventory integration. Test measurements are synthetic fixtures, not validated uniform dimensions. */
const assert = require('node:assert/strict');
const path = require('node:path');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require(path.join(require('node:os').homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules','playwright'))); }
const base=process.env.TALLALAB_TEST_URL||'http://127.0.0.1:5100';
const results=[];
let browser;
async function fixture({mobile=false}={}) {
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},acceptDownloads:true});
 const errors=[],external=[],policy=[];
 await context.route('**/*',route=>{const url=route.request().url();if(/^https?:/.test(url)&&new URL(url).origin!==new URL(base).origin){external.push(url);return route.abort();}return route.continue();});
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&/Content Security Policy|Refused to/.test(message.text()))policy.push(message.text());});
 try{await page.goto(base,{waitUntil:'load'});await step(page,4);await page.locator('#autoRecognize').evaluate(input=>{input.checked=false;});}catch(error){await context.close();throw error;}
 return {page,async finish(){assert.deepEqual(errors,[],'uncaught browser errors');assert.deepEqual(external,[],'unexpected external request');assert.deepEqual(policy,[],'content security policy violation');},async close(){await context.close();}};
}
async function using(options,run){const f=await fixture(options);try{await run(f.page);await f.finish();}finally{await f.close();}}
async function step(page,number){await page.locator(`#steps [data-step="${number}"]`).click();await page.locator(`#step${number}`).waitFor({state:'visible'});}
async function chooseGarment(page,garment){await step(page,1);await page.locator(`[data-garment="${garment}"]`).click();await step(page,4);}
async function selectItem(page,itemId){await step(page,1);await page.locator('#inventoryItem').selectOption(itemId);await step(page,4);}
async function measure(page,data){await step(page,4);if(await page.locator('#measurementMode').inputValue()!=='single')await page.locator('#measurementMode').selectOption('single');for(const[key,value]of Object.entries(data))await page.locator(`#measure-${key}`).fill(String(value));}
async function result(page,data){await measure(page,data);await page.locator('#confirmed').check();await page.locator('#referenceAccepted').check();await step(page,5);}
async function tableSizes(page){return page.locator('#catalogTable tbody tr').evaluateAll(rows=>rows.map(row=>row.querySelector('td')?.textContent));}
async function editor(page){const details=page.locator('#inventoryEditor');if(await details.getAttribute('open')===null)await details.locator('summary').click();}
async function fillEditor(page,rows,{kind='body',source='Synthetic provider QA fixture',confirmed=true}={}){await editor(page);await page.locator('#inventoryEditorKind').selectOption(kind);for(const[size,values]of Object.entries(rows))for(const[key,value]of Object.entries(values))await page.locator(`#inventoryMeasurements input[data-size="${size}"][data-measure="${key}"]`).fill(String(value));await page.locator('#inventoryEditorSource').fill(source);if(confirmed)await page.locator('#inventoryEditorConfirmed').check();}
async function saveEditor(page,rows,options){await fillEditor(page,rows,options);await page.locator('#saveInventoryMeasures').click();await page.waitForFunction(()=>!document.querySelector('#catalog').disabled);}
async function csv(page,text){await page.locator('#csvInput').setInputFiles({name:'inventory-qa.csv',mimeType:'text/csv',buffer:Buffer.from(text)});}
async function downloadText(download){const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);return Buffer.concat(chunks).toString('utf8');}
async function noOverflow(page){const widths=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));assert.ok(widths.document<=widths.viewport+1&&widths.body<=widths.viewport+1,JSON.stringify(widths));}
async function test(name,run){if(process.env.TALLALAB_INVENTORY_FILTER&&!name.includes(process.env.TALLALAB_INVENTORY_FILTER))return;try{await run();results.push({name,status:'PASS'});process.stdout.write(`PASS ${name}\n`);}catch(error){results.push({name,status:'FAIL',error:error.stack||error.message});process.stdout.write(`FAIL ${name}: ${error.message}\n`);}}
(async()=>{
 browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  await test('inventory is the default and item choices follow each garment category',()=>using({},async page=>{
   assert.equal(await page.locator('#catalogContext').inputValue(),'inventory');
   const cases=[['shirt',['camisa-blanca','camisa-azul']],['pants',['pantalon-azul','short-azul','pantalon-beige']],['skirt',['falda-azul-elastica','falda-azul','falda-beige']],['shoes',['zapatos']]];
   for(const[garment,expected]of cases){await chooseGarment(page,garment);assert.deepEqual(await page.locator('#inventoryItem option').evaluateAll(options=>options.map(option=>option.value).sort()),expected.sort());assert.equal(await page.locator('#catalog').isDisabled(),true);}
  }));
  await test('an acta item without metric equivalence cannot yield a size',()=>using({},async page=>{
   await measure(page,{chest:68});await page.locator('#confirmed').check();await step(page,5);
   assert.equal(await page.locator('#recommendation .result-size').innerText(),'Sin equivalencia en cm');
   assert.match(await page.locator('#inventoryResult').innerText(),/Camisa Blanca/i);
   await step(page,4);await editor(page);assert.ok((await page.locator('#inventoryMeasurements input[data-size]').evaluateAll(inputs=>inputs.map(input=>input.value))).every(value=>value===''),'acta labels must not become fabricated centimetres');
  }));
  await test('provisional guide uses exact T labels and leaves unsupported adult sizes unavailable',()=>using({},async page=>{
   await page.locator('#useProvisionalGuide').click();
   assert.deepEqual(await tableSizes(page),['T4','T6','T8','T10','T12','T14','T16','T18']);
   assert.match(await page.locator('#inventoryNotice').innerText(),/T20/);assert.match(await page.locator('#inventoryNotice').innerText(),/T1X/);
   await result(page,{chest:68});assert.equal(await page.locator('#recommendation .result-size').innerText(),'T10');assert.match(await page.locator('#inventoryResult').innerText(),/provisional/i);
   await step(page,4);await editor(page);assert.ok((await page.locator('#inventoryMeasurements input[data-size]').evaluateAll(inputs=>inputs.map(input=>input.value))).every(value=>value===''),'provisional values must not be relabeled as measured uniforms');
   await result(page,{chest:100});assert.equal(await page.locator('#recommendation .result-size').innerText(),'Fuera de esta tabla');
  }));
  await test('a partial provisional guide never extrapolates to labels absent from that item',()=>using({},async page=>{
   await selectItem(page,'camisa-azul');await page.locator('#useProvisionalGuide').click();
   assert.deepEqual(await tableSizes(page),['T4','T6','T8','T10','T12']);
   await result(page,{chest:76});assert.equal(await page.locator('#recommendation .result-size').innerText(),'Fuera de esta tabla');assert.doesNotMatch(await page.locator('#inventoryResult').innerText(),/talla\s+T14\b/i);
  }));
  await test('profiles and acceptance do not leak across item or garment selection',()=>using({},async page=>{
   await page.locator('#useProvisionalGuide').click();await page.locator('#referenceAccepted').check();
   await selectItem(page,'camisa-azul');assert.equal(await page.locator('#catalog').isDisabled(),true);assert.equal(await page.locator('#referenceAccepted').isChecked(),false);
   await selectItem(page,'camisa-blanca');assert.equal(await page.locator('#catalog').isDisabled(),false);assert.equal(await page.locator('#referenceAccepted').isChecked(),false);
   await chooseGarment(page,'pants');assert.equal(await page.locator('#catalog').isDisabled(),true);
  }));
  await test('editor requires declared source and confirmation, then saves an honest partial metric profile',()=>using({},async page=>{
   await fillEditor(page,{T4:{chest:56},T6:{chest:60}},{confirmed:false});
   if(await page.locator('#saveInventoryMeasures').isEnabled()){await page.locator('#saveInventoryMeasures').click();assert.equal(await page.locator('#catalog').isDisabled(),true);}else assert.equal(await page.locator('#saveInventoryMeasures').isDisabled(),true);
   await page.locator('#inventoryEditorSource').fill('');await page.locator('#inventoryEditorConfirmed').check();if(await page.locator('#saveInventoryMeasures').isEnabled()){await page.locator('#saveInventoryMeasures').click();assert.equal(await page.locator('#catalog').isDisabled(),true);}
   await page.locator('#inventoryEditorSource').fill('Synthetic provider QA fixture');assert.equal(await page.locator('#inventoryEditorConfirmed').isChecked(),false);await page.locator('#inventoryEditorConfirmed').check();await page.locator('#saveInventoryMeasures').click();await page.waitForFunction(()=>!document.querySelector('#catalog').disabled);
   assert.deepEqual(await tableSizes(page),['T4','T6']);await result(page,{chest:58});assert.equal(await page.locator('#recommendation .result-size').innerText(),'T6');assert.doesNotMatch(await page.locator('#inventoryResult').innerText(),/guía provisional/i);
   await result(page,{chest:62});assert.equal(await page.locator('#recommendation .result-size').innerText(),'Fuera de esta tabla');
  }));
  await test('garment measurements require explicit minimum ease before recommending',()=>using({},async page=>{
   await saveEditor(page,{T4:{chest:76},T6:{chest:80}},{kind:'garment'});await result(page,{chest:70});assert.equal(await page.locator('#recommendation .result-size').innerText(),'Completa la verificación');
   await step(page,4);await page.locator('#ease-chest').fill('6');await page.locator('#referenceAccepted').check();await page.locator('#confirmed').check();await step(page,5);assert.equal(await page.locator('#recommendation .result-size').innerText(),'T4');assert.match(await page.locator('#fitZones').innerText(),/76/);assert.match(await page.locator('#fitZones').innerText(),/70/);
  }));
  await test('new student keeps the declared garment profile and ease, but clears personal measurements and acceptance',()=>using({},async page=>{
   await page.locator('#useProvisionalGuide').click();await saveEditor(page,{T4:{chest:76},T6:{chest:80}},{kind:'garment'});await measure(page,{chest:70});await page.locator('#ease-chest').fill('6');await page.locator('#confirmed').check();await page.locator('#referenceAccepted').check();await step(page,5);assert.equal(await page.locator('#recommendation .result-size').innerText(),'T4');
   await page.locator('#newSession').click();await step(page,4);assert.deepEqual(await tableSizes(page),['T4','T6']);assert.equal(await page.locator('#measure-chest').inputValue(),'');assert.equal(await page.locator('#confirmed').isChecked(),false);assert.equal(await page.locator('#referenceAccepted').isChecked(),false);assert.equal(await page.locator('#ease-chest').inputValue(),'6');assert.doesNotMatch(await page.locator('#inventoryNotice').innerText(),/GUÍA PROVISIONAL/);await result(page,{chest:70});assert.equal(await page.locator('#recommendation .result-size').innerText(),'T4');
  }));
  await test('a supplied T1X reference retains its exact label without inferring T2X',()=>using({},async page=>{
   await saveEditor(page,{T1X:{chest:100}});await result(page,{chest:100});assert.equal(await page.locator('#recommendation .result-size').innerText(),'T1X');assert.match(await page.locator('#inventoryResult').innerText(),/Camisa Blanca/);
   await result(page,{chest:108});assert.equal(await page.locator('#recommendation .result-size').innerText(),'Fuera de esta tabla');
  }));
  await test('inventory CSV rejects label aliases and rows from another item',()=>using({},async page=>{
   await csv(page,'talla,pecho,cintura,cadera,pie_cm\n4,56,,,\n');await page.waitForFunction(()=>/etiquet|tallas|acta|figuran/i.test(document.querySelector('#csvStatus').textContent));assert.equal(await page.locator('#catalog').isDisabled(),true);
   await csv(page,'talla,pecho,cintura,cadera,pie_cm\nT4,56,,,\nT6,60,,,\n');await page.waitForFunction(()=>!document.querySelector('#catalog').disabled);assert.deepEqual(await tableSizes(page),['T4','T6']);
   await selectItem(page,'camisa-azul');await csv(page,'talla,pecho,cintura,cadera,pie_cm\nT20,100,,,\n');await page.waitForFunction(()=>document.querySelector('#csvStatus').textContent.includes('T20'));assert.equal(await page.locator('#catalog').isDisabled(),true);
  }));
  await test('shoe guide uses only integer acta labels and never fills missing lengths',()=>using({},async page=>{
   await chooseGarment(page,'shoes');await page.locator('#useProvisionalGuide').click();const sizes=await tableSizes(page);assert.ok(sizes.length>0);assert.ok(sizes.every(size=>/^\d+$/.test(size)&&Number(size)>=23&&Number(size)<=45));assert.ok(!sizes.includes('23')&&!sizes.includes('45'));
   await result(page,{leftFoot:18.5,rightFoot:18.4});assert.equal(await page.locator('#recommendation .result-size').innerText(),'30');assert.match(await page.locator('#inventoryResult').innerText(),/provisional/i);
   await result(page,{leftFoot:28,rightFoot:28});assert.equal(await page.locator('#recommendation .result-size').innerText(),'Fuera de esta tabla');
  }));
  await test('report discloses inventory item, provisional source, metric kind and exact label',()=>using({},async page=>{
   await page.locator('#useProvisionalGuide').click();await result(page,{chest:68});const pending=page.waitForEvent('download');await page.locator('#downloadReport').click();const text=await downloadText(await pending);assert.match(text,/Camisa Blanca/);assert.match(text,/provisional/i);assert.match(text,/body|corporal/i);assert.match(text,/T10/);assert.doesNotMatch(text,/data:image|base64,/);
  }));
  await test('mobile inventory editor, result and source tables fit the viewport',()=>using({mobile:true},async page=>{
   await noOverflow(page);await editor(page);await noOverflow(page);await page.locator('#useProvisionalGuide').click();await noOverflow(page);await result(page,{chest:68});await noOverflow(page);await chooseGarment(page,'pants');await editor(page);await noOverflow(page);
  }));
 }finally{await browser.close();}
 const failed=results.filter(result=>result.status==='FAIL');process.stdout.write(`\n${results.length-failed.length}/${results.length} inventory checks passed.\n`);if(failed.length)process.stdout.write(JSON.stringify(failed,null,2)+'\n');process.exitCode=failed.length?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
