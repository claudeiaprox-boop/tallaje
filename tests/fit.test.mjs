import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFit, summarizeRepeated, ellipseCircumference } from '../src/fit.mjs';

const body = { kind: 'body', rows: [{ size: 'S', chest: 68, waist: 62, hip: 72 }, { size: 'M', chest: 72, waist: 66, hip: 78 }, { size: 'L', chest: 76, waist: 70, hip: 84 }] };
const garment = { kind: 'garment', rows: [{ size: 'S', chest: 72, waist: 64, hip: 80 }, { size: 'M', chest: 78, waist: 70, hip: 86 }, { size: 'L', chest: 84, waist: 76, hip: 92 }] };
const base = { garment: 'shirt', measurements: { chest: 68 }, confirmed: true, referenceAccepted: true };

test('three independent readings produce median and actual observed range', () => {
  const result = summarizeRepeated([68.4, '68.2', 68.3]);
  assert.equal(result.status, 'ready');
  assert.equal(result.value, 68.3);
  assert.deepEqual(result.range, [68.2, 68.4]);
  assert.equal(result.count, 3);
  assert.equal(result.spread, .2);
  assert.match(result.warnings.join(' '), /No demuestran exactitud/);
});

test('repeats fail closed on missing, invalid or excessive variation without deleting outlier', () => {
  assert.equal(summarizeRepeated([68, '', null]).status, 'missing');
  assert.equal(summarizeRepeated([68, NaN, 68]).status, 'invalid');
  assert.equal(summarizeRepeated([68, false, 68]).status, 'invalid');
  assert.equal(summarizeRepeated([68, -1, 68]).status, 'invalid');
  assert.equal(summarizeRepeated([68, 68, 68], { maxSpread: -1 }).status, 'invalid');
  const result = summarizeRepeated([68, 68.1, 74]);
  assert.equal(result.status, 'repeat');
  assert.equal(result.value, 68.1);
  assert.deepEqual(result.range, [68, 74]);
});

test('foot repeat threshold includes exact decimal boundary and rejects larger spread', () => {
  assert.equal(summarizeRepeated([18.1, 18.2, 18.4], { maxSpread: .3 }).status, 'ready');
  assert.equal(summarizeRepeated([18.1, 18.2, 18.41], { maxSpread: .3 }).status, 'repeat');
});

test('body references preserve old selection; no ranges means unchecked', () => {
  const result = evaluateFit({ ...base, catalog: body });
  assert.equal(result.size, 'S');
  assert.equal(result.status, 'ready');
  assert.equal(result.stability.status, 'unchecked');
  assert.deepEqual(result.zones, []);
  assert.equal(evaluateFit({ ...base, catalog: body, confirmed: false }).status, 'missing');
});

test('garment table uses explicit ease instead of treating dimensions as body references', () => {
  const result = evaluateFit({ ...base, catalog: garment, ease: { chest: 6 } });
  assert.equal(result.size, 'M');
  assert.deepEqual(result.zones, [{ key: 'chest', body: 68, garment: 78, ease: 10, minEase: 6 }]);
  assert.equal(evaluateFit({ ...base, catalog: garment, ease: { chest: 4 } }).size, 'S');
  assert.equal(evaluateFit({ ...base, catalog: garment }).status, 'missing');
  assert.equal(evaluateFit({ ...base, catalog: garment, ease: { chest: -1 } }).status, 'invalid');
  assert.equal(evaluateFit({ ...base, catalog: garment, ease: { chest: 0 } }).size, 'S');
});

test('garment fit requires all zones, confirmations and finite ordered catalog data', () => {
  const options = { garment: 'pants', measurements: { waist: 62, hip: 79 }, catalog: garment, ease: { waist: 2, hip: 3 }, confirmed: true, referenceAccepted: true };
  assert.equal(evaluateFit(options).size, 'M');
  assert.equal(evaluateFit({ ...options, measurements: { waist: 62 } }).status, 'missing');
  assert.equal(evaluateFit({ ...options, ease: { waist: 2 } }).status, 'missing');
  assert.equal(evaluateFit({ ...options, referenceAccepted: false }).status, 'missing');
  assert.equal(evaluateFit({ ...options, catalog: { ...garment, rows: [garment.rows[1], garment.rows[0]] } }).status, 'invalid');
  assert.equal(evaluateFit({ ...options, catalog: { ...garment, rows: [{ size: 'S', waist: 64, hip: Infinity }] } }).status, 'invalid');
  assert.equal(evaluateFit({ ...options, catalog: { ...garment, rows: [garment.rows[0], garment.rows[0]] } }).status, 'invalid');
  assert.equal(evaluateFit({ ...options, measurements: { waist: 200, hip: 200 } }).status, 'outside');
});

test('garment capacity allows smaller body but explicitly does not validate excessive ease', () => {
  const result = evaluateFit({ ...base, catalog: garment, measurements: { chest: 50 }, ease: { chest: 4 } });
  assert.equal(result.size, 'S');
  assert.match(result.warnings.join(' '), /No valida exceso de holgura/);
});

test('repeat range flags body-size boundary and outside-table crossing', () => {
  const boundary = evaluateFit({ ...base, catalog: body, ranges: { chest: [67.9, 68.1] } });
  assert.equal(boundary.size, 'S');
  assert.equal(boundary.stability.status, 'boundary');
  assert.deepEqual(boundary.stability.sizes, ['S', 'M']);
  const stable = evaluateFit({ ...base, measurements: { chest: 70 }, catalog: body, ranges: { chest: [69.8, 70.2] } });
  assert.equal(stable.stability.status, 'stable');
  const over = evaluateFit({ ...base, measurements: { chest: 76 }, catalog: body, ranges: { chest: [75.9, 76.1] } });
  assert.equal(over.stability.status, 'boundary');
  const bothOutside = evaluateFit({ ...base, catalog: body, ranges: { chest: [60, 90] } });
  assert.equal(bothOutside.stability.status, 'boundary', 'baseline must be included even if both endpoints are outside');
});

test('garment repeated range crossing minimum ease flags instability', () => {
  const result = evaluateFit({ ...base, catalog: garment, ease: { chest: 4 }, ranges: { chest: [67.9, 68.1] } });
  assert.equal(result.size, 'S');
  assert.equal(result.stability.status, 'boundary');
  assert.deepEqual(result.stability.sizes, ['S', 'M']);
});

test('range combinations account for both pants zones and both feet', () => {
  const pants = evaluateFit({ garment: 'pants', measurements: { waist: 65.8, hip: 77.8 }, catalog: body, ranges: { waist: [65.6, 66.2], hip: [77.6, 78.2] }, confirmed: true, referenceAccepted: true });
  assert.equal(pants.size, 'M');
  assert.equal(pants.stability.status, 'boundary');
  assert.deepEqual(pants.stability.sizes, ['M', 'L']);
  const shoes = evaluateFit({ garment: 'shoes', measurements: { leftFoot: 18.4, rightFoot: 18.5 }, catalog: { kind: 'foot', rows: [{ size: '30', foot: 18.5 }, { size: '31', foot: 19 }] }, ranges: { leftFoot: [18.3, 18.6], rightFoot: [18.4, 18.6] }, confirmed: true, referenceAccepted: true });
  assert.equal(shoes.size, '30');
  assert.equal(shoes.stability.status, 'boundary');
  assert.deepEqual(shoes.stability.sizes, ['30', '31']);
});

test('invalid observed ranges invalidate a previously ready reference', () => {
  for (const ranges of [null, [], { chest: [70, 67] }, { chest: [67, Infinity] }, { chest: [-1, 69] }, { chest: [67, 67.9] }, { chest: [68] }, { unknown: [67, 69] }]) {
    const result = evaluateFit({ ...base, catalog: body, ranges });
    assert.equal(result.status, 'invalid', JSON.stringify(ranges));
    assert.equal(result.size, null);
    assert.deepEqual(result.zones, []);
  }
});

test('ellipse formula has correct circle limit and axis symmetry, rejects invalid geometry', () => {
  assert.ok(Math.abs(ellipseCircumference({ width: 20, depth: 20 }) - 20 * Math.PI) < 1e-10);
  assert.equal(ellipseCircumference({ width: 30, depth: 20 }), ellipseCircumference({ width: 20, depth: 30 }));
  for (const width of [0, -1, Infinity, NaN, true, '']) assert.equal(ellipseCircumference({ width, depth: 20 }), null);
});
