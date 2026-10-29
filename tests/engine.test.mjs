import test from 'node:test';
import assert from 'node:assert/strict';
import { measurePhoto, recommendSize, parseCatalogCsv, requiredFieldsFor } from '../src/engine.mjs';

const body = {
  width: 600, height: 1000, heightCm: 160,
  points: { top: { x: 300, y: 100 }, bottom: { x: 300, y: 900 }, shoulderL: { x: 200, y: 250 }, shoulderR: { x: 400, y: 250 }, waistL: { x: 240, y: 450 }, waistR: { x: 360, y: 450 }, hipL: { x: 220, y: 550 }, hipR: { x: 380, y: 550 }, crotch: { x: 300, y: 600 }, elbow: { x: 430, y: 400 }, wrist: { x: 440, y: 530 } },
};
const catalog = { kind: 'body', rows: [{ size: '8', chest: 64, waist: 58, hip: 68 }, { size: '10', chest: 70, waist: 62, hip: 74 }, { size: '12', chest: 76, waist: 66, hip: 80 }] };
const choose = extra => recommendSize({ garment: 'pants', measurements: { waist: 62, hip: 74 }, catalog, confirmed: true, referenceAccepted: true, ...extra });
const cloneBody = () => structuredClone(body);
const measured = (result, id) => result.measures.find(item => item.id === id)?.value;

test('front measurement uses vertical calibration and produces widths, never circumferences', () => {
  const result = measurePhoto(body);
  assert.deepEqual(result.errors, []);
  assert.equal(measured(result, 'shoulderWidth'), 40);
  assert.equal(measured(result, 'waistWidth'), 24);
  assert.equal(measured(result, 'hipWidth'), 32);
  assert.equal(measured(result, 'torsoLength'), 40);
  assert.equal(measured(result, 'legLength'), 90);
  assert.equal(measured(result, 'inseam'), 60);
  assert.ok(measured(result, 'sleeveLength') > 56);
  assert.ok(result.measures.every(item => item.unit === 'cm' && item.origin === 'photo'));
  assert.ok(!result.measures.some(item => ['chest', 'waist', 'hip'].includes(item.id)));
});

test('small tolerated tilt does not turn diagonal height into a scale', () => {
  const input = cloneBody(); input.points.bottom.x += 40;
  assert.equal(measured(measurePhoto(input), 'shoulderWidth'), 40);
});

test('head/ground reversal and excessive sideways alignment fail closed', () => {
  const reversed = cloneBody(); reversed.points.top.y = 950;
  const tilted = cloneBody(); tilted.points.bottom.x += 65;
  for (const input of [reversed, tilted]) {
    const result = measurePhoto(input);
    assert.ok(result.errors.length); assert.deepEqual(result.measures, []);
  }
});

test('reversed horizontal pairs, excessive pair slope, and body-order errors are rejected', () => {
  const reversed = cloneBody(); [reversed.points.waistL, reversed.points.waistR] = [reversed.points.waistR, reversed.points.waistL];
  const slope = cloneBody(); slope.points.hipR.y += 41;
  const order = cloneBody(); order.points.waistL.y = order.points.waistR.y = 200;
  for (const input of [reversed, slope, order]) assert.deepEqual(measurePhoto(input).measures, []);
});

test('alignment thresholds are inclusive and heights use the stated input range', () => {
  const input = cloneBody(); input.points.bottom.x += 64; input.points.hipR.y += 40;
  assert.equal(measurePhoto(input).errors.length, 0);
  for (const heightCm of [60, 220]) assert.equal(measurePhoto({ ...body, heightCm }).errors.length, 0);
  for (const heightCm of [59.9, 220.1, NaN, '']) assert.ok(measurePhoto({ ...body, heightCm }).errors.length);
});

test('partial pairs do not invent measurements; points outside image invalidate measurements', () => {
  const partial = cloneBody(); delete partial.points.waistR;
  const result = measurePhoto(partial);
  assert.equal(measured(result, 'waistWidth'), undefined); assert.ok(result.warnings.length);
  const outside = cloneBody(); outside.points.hipL.x = -1;
  assert.ok(measurePhoto(outside).errors.length);
  assert.deepEqual(measurePhoto(outside).measures, []);
});

test('side view provides depths with consistent front/back orientation only', () => {
  const input = { ...body, view: 'side', points: { top: body.points.top, bottom: body.points.bottom, waistFront: { x: 250, y: 450 }, waistBack: { x: 350, y: 450 }, hipFront: { x: 240, y: 550 }, hipBack: { x: 360, y: 550 } } };
  const result = measurePhoto(input);
  assert.equal(measured(result, 'waistDepth'), 20); assert.equal(measured(result, 'hipDepth'), 24);
  [input.points.hipFront, input.points.hipBack] = [input.points.hipBack, input.points.hipFront];
  assert.ok(measurePhoto(input).errors.length);
});

test('chest front/profile geometry yields calibrated dimensions without inventing a circumference', () => {
  const front = cloneBody();
  front.points.chestL = { x: 230, y: 350 }; front.points.chestR = { x: 370, y: 350 };
  const frontal = measurePhoto(front);
  assert.deepEqual(frontal.errors, []);
  assert.equal(measured(frontal, 'chestWidth'), 28);
  const side = { ...body, view: 'side', points: { top: body.points.top, bottom: body.points.bottom, chestFront: { x: 250, y: 350 }, chestBack: { x: 350, y: 350 }, waistFront: { x: 255, y: 450 }, waistBack: { x: 345, y: 450 } } };
  const lateral = measurePhoto(side);
  assert.deepEqual(lateral.errors, []);
  assert.equal(measured(lateral, 'chestDepth'), 20);
  for (const result of [frontal, lateral]) assert.ok(!result.measures.some(item => ['chest', 'waist', 'hip'].includes(item.id)));
  side.points.chestFront.y = side.points.chestBack.y = 470;
  assert.deepEqual(measurePhoto(side).measures, [], 'chest must remain above waist');
});

test('chest landmarks enforce horizontal order, shoulder level and side orientation', () => {
  const front = cloneBody();
  front.points.chestL = { x: 370, y: 350 }; front.points.chestR = { x: 230, y: 350 };
  assert.deepEqual(measurePhoto(front).measures, []);
  front.points.chestL = { x: 230, y: 200 }; front.points.chestR = { x: 370, y: 200 };
  assert.deepEqual(measurePhoto(front).measures, [], 'chest cannot be above shoulders');
  const side = { ...body, view: 'side', points: { top: body.points.top, bottom: body.points.bottom, chestFront: { x: 350, y: 350 }, chestBack: { x: 250, y: 350 }, waistFront: { x: 255, y: 450 }, waistBack: { x: 345, y: 450 } } };
  assert.deepEqual(measurePhoto(side).measures, [], 'front/back marking direction must match between chest and waist');
});

const foot = { kind: 'foot', width: 1000, height: 1000, referenceCm: 10, points: { refA: { x: 100, y: 800 }, refB: { x: 300, y: 800 }, heel: { x: 500, y: 800 }, toe: { x: 500, y: 300 }, footL: { x: 400, y: 500 }, footR: { x: 600, y: 500 } } };
test('foot reference produces length and width with perspective and allowance warnings', () => {
  const result = measurePhoto(foot);
  assert.deepEqual(result.errors, []);
  assert.equal(measured(result, 'footLength'), 25);
  assert.equal(measured(result, 'footWidth'), 10);
  assert.ok(result.warnings.some(message => message.includes('perspectiva')));
  assert.ok(result.warnings.some(message => message.includes('holgura')));
});

test('foot rejects a small reference and out-of-range foot lengths', () => {
  const tiny = structuredClone(foot); tiny.points.refB.x = 179;
  assert.ok(measurePhoto(tiny).errors.length);
  for (const length of [7.9, 35.1]) {
    const input = structuredClone(foot); input.points.toe.y = 800 - length * 20;
    assert.ok(measurePhoto(input).errors.length);
  }
  for (const length of [8, 35]) {
    const input = structuredClone(foot); input.points.toe.y = 800 - length * 20;
    assert.equal(measured(measurePhoto(input), 'footLength'), length);
  }
});

test('exact nominal boundary chooses that reference, then next reference above boundary', () => {
  assert.equal(choose().size, '10');
  assert.equal(choose({ measurements: { waist: 62.1, hip: 74 } }).size, '12');
});

test('conflicting waist and hip choose first reference covering both and explain conflict', () => {
  const result = choose({ measurements: { waist: 58, hip: 75 } });
  assert.equal(result.status, 'ready'); assert.equal(result.size, '12');
  assert.ok(result.warnings.some(message => message.includes('tallas distintas')));
  assert.ok(result.details.some(message => message.includes('Cintura')));
  assert.ok(result.details.some(message => message.includes('Cadera')));
});

test('both below minimum or any above maximum is outside; one small dimension may still match', () => {
  assert.equal(choose({ measurements: { waist: 57, hip: 67 } }).status, 'outside');
  assert.equal(choose({ measurements: { waist: 67, hip: 70 } }).status, 'outside');
  assert.equal(choose({ measurements: { waist: 57, hip: 74 } }).size, '10');
});

test('missing values, visual widths and absent confirmations cannot produce a size', () => {
  const missing = choose({ measurements: { waist: 62 } });
  assert.equal(missing.status, 'missing'); assert.deepEqual(missing.required, ['hip']);
  const visual = choose({ measurements: { waistWidth: 30, hipWidth: 34 } });
  assert.equal(visual.status, 'missing'); assert.equal(visual.size, null);
  for (const flags of [{ confirmed: false }, { referenceAccepted: false }]) {
    const result = choose(flags); assert.equal(result.status, 'missing'); assert.equal(result.size, null);
  }
});

test('invalid values and garment measurement tables cannot produce a recommendation', () => {
  for (const waist of [0, -1, NaN, Infinity, { value: 62, origin: 'photo' }]) assert.equal(choose({ measurements: { waist, hip: 74 } }).status, 'invalid');
  assert.equal(choose({ catalog: { ...catalog, kind: 'garment' } }).status, 'invalid');
  assert.equal(choose({ catalog: { ...catalog, rows: [...catalog.rows].reverse() } }).status, 'invalid');
});

test('shoe matching takes larger foot and does not add allowance', () => {
  const result = recommendSize({ garment: 'shoes', measurements: { leftFoot: 21.1, rightFoot: 22 }, catalog: { kind: 'foot', rows: [{ size: 'A', foot: 21 }, { size: 'B', foot: 22 }, { size: 'C', foot: 23 }] }, confirmed: true, referenceAccepted: true });
  assert.equal(result.size, 'B');
  assert.equal(recommendSize({ garment: 'shoes', measurements: { leftFoot: 22 }, catalog }).status, 'missing');
});

test('CSV supports separators, quoted labels, BOM, decimal point, and irrelevant blanks', () => {
  const csv = '\uFEFFtalla;pecho;cintura;cadera;pie_cm\r\n"8 A";64;58.5;68;\r\n10;70;62;74;\r\n';
  const parsed = parseCatalogCsv(csv, { name: 'Proveedor', garment: 'pants' });
  assert.equal(parsed.kind, 'body'); assert.equal(parsed.rows[0].waist, 58.5); assert.equal(parsed.rows[0].size, '8 A');
  assert.equal(parsed.rows[0].foot, undefined);
  const shoes = parseCatalogCsv('talla,pecho,cintura,cadera,pie_cm\n31,,,,20.5\n32,,,,21', { garment: 'shoes' });
  assert.equal(shoes.kind, 'foot'); assert.equal(shoes.rows[0].foot, 20.5);
});

test('CSV preserves explicit garment versus body semantics and refuses garment tables for shoes', () => {
  const csv = 'talla,pecho,cintura,cadera,pie_cm\nS,72,64,80,\nM,78,70,86,\n';
  const garmentTable = parseCatalogCsv(csv, { garment: 'shirt', kind: 'garment' });
  assert.equal(garmentTable.kind, 'garment');
  assert.equal(garmentTable.rows[0].chest, 72, 'does not subtract an invented ease');
  assert.equal(parseCatalogCsv(csv, { garment: 'shirt' }).kind, 'body');
  for (const kind of ['garment', 'body', 'unknown']) assert.throws(() => parseCatalogCsv('talla,pecho,cintura,cadera,pie_cm\n30,,,,18.5', { garment: 'shoes', kind }), /tipo de tabla/);
  assert.throws(() => parseCatalogCsv(csv, { garment: 'shirt', kind: 'foot' }), /tipo de tabla/);
});

test('CSV rejects missing required cells, duplicates, invalid numbers, bad headers and reversed references', () => {
  const invalid = [
    'talla,pecho,cintura,cadera,pie_cm\n8,64,58,,',
    'talla,pecho,cintura,cadera,pie_cm\n8,64,58,68,\n8,70,62,74,',
    'talla,pecho,cintura,cadera,pie_cm\n8,64,-58,68,',
    'talla,pecho,cintura,cadera,pie_cm\n8,64,NaN,68,',
    'talla,pecho,cintura,cadera,pie_cm\n8,64,58,68,\n10,70,57,74,',
    'talla,cintura,cadera\n8,58,68',
    'talla;pecho;cintura;cadera;pie_cm\n8;64;58,5;68;',
  ];
  for (const csv of invalid) assert.throws(() => parseCatalogCsv(csv, { garment: 'pants' }));
});

test('required fields are returned independently and reject unknown garment', () => {
  const fields = requiredFieldsFor('pants'); fields.push('other');
  assert.deepEqual(requiredFieldsFor('pants'), ['waist', 'hip']);
  assert.deepEqual(requiredFieldsFor('unknown'), []);
  assert.equal(recommendSize({ garment: 'unknown' }).status, 'invalid');
});
