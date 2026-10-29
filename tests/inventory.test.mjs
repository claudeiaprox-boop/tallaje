import test from 'node:test';
import assert from 'node:assert/strict';
import { INVENTORY_ITEMS, parseInventoryCatalogCsv, createInventoryTemplate, evaluateInventoryMatch, createProvisionalInventoryCatalog } from '../src/inventory.mjs';
import { evaluateFit } from '../src/fit.mjs';

const csv = 'talla,pecho,cintura,cadera,pie_cm\nT4,56,,,\nT6,60,,,\n';
const catalog = () => parseInventoryCatalogCsv(csv, { itemId: 'camisa-blanca' });
const ready = extra => evaluateFit({ garment: 'shirt', measurements: { chest: 58 }, catalog: catalog(), confirmed: true, referenceAccepted: true, ...extra });

test('acta provides exact item-specific labels and no fabricated quantities or cm', () => {
  assert.equal(INVENTORY_ITEMS.length, 9);
  const lookup = id => INVENTORY_ITEMS.find(item => item.id === id);
  assert.deepEqual(lookup('camisa-azul').sizes, ['T4', 'T6', 'T8', 'T10', 'T12']);
  assert.deepEqual(lookup('short-azul').sizes, lookup('camisa-azul').sizes);
  assert.equal(lookup('falda-azul-elastica').sizes.at(-1), 'T16');
  assert.equal(lookup('falda-beige').sizes[0], 'T10');
  assert.equal(lookup('pantalon-beige').sizes.at(-1), 'T2X');
  assert.deepEqual(lookup('zapatos').sizes, Array.from({ length: 23 }, (_, index) => String(index + 23)));
  assert.ok(INVENTORY_ITEMS.every(item => !('quantity' in item) && !('stock' in item) && !('rows' in item)));
});

test('blank templates preserve labels without supplying guessed centimetres', () => {
  const template = createInventoryTemplate('camisa-azul');
  assert.equal(template.split('\r\n')[1], 'T4,,,,');
  assert.equal(template.split('\r\n').at(-2), 'T12,,,,');
  assert.throws(() => parseInventoryCatalogCsv(template, { itemId: 'camisa-azul' }), /Falta/);
  assert.throws(() => createInventoryTemplate('other'), /prenda válida/);
});

test('metric imports link exact labels and describe partial coverage', () => {
  const parsed = catalog();
  assert.equal(parsed.inventoryItemId, 'camisa-blanca');
  assert.equal(parsed.kind, 'body');
  assert.equal(parsed.garment, 'shirt');
  assert.equal(parsed.rows[1].size, 'T6');
  assert.match(parsed.note, /Tabla parcial/);
  assert.match(parsed.note, /T2X/);
});

test('aliases and labels belonging only to a different acta item are rejected', () => {
  for (const size of ['4', '#4', 't4', 'T 4', 'XS', 'T24']) {
    assert.throws(() => parseInventoryCatalogCsv(`talla,pecho,cintura,cadera,pie_cm\n${size},56,,,`, { itemId: 'camisa-blanca' }), /etiquetas exactas/);
  }
  assert.throws(() => parseInventoryCatalogCsv('talla,pecho,cintura,cadera,pie_cm\nT14,70,,,', { itemId: 'camisa-azul' }), /no figuran/);
  assert.throws(() => parseInventoryCatalogCsv(csv, { itemId: 'unknown' }), /prenda válida/);
});

test('foot tables require actual foot references and reject body/garment semantics', () => {
  const feet = 'talla,pecho,cintura,cadera,pie_cm\n23,,,,14\n24,,,,14.6';
  const parsed = parseInventoryCatalogCsv(feet, { itemId: 'zapatos' });
  assert.equal(parsed.kind, 'foot');
  assert.equal(parsed.rows[0].foot, 14);
  for (const kind of ['body', 'garment']) assert.throws(() => parseInventoryCatalogCsv(feet, { itemId: 'zapatos', kind }), /tipo de tabla/);
  assert.throws(() => parseInventoryCatalogCsv(feet.replace('23,', '22,'), { itemId: 'zapatos' }), /no figuran/);
});

test('garment dimensions remain garment dimensions and retain normal ease gate', () => {
  const parsed = parseInventoryCatalogCsv(csv, { itemId: 'camisa-blanca', kind: 'garment' });
  assert.equal(parsed.kind, 'garment');
  const output = ready({ catalog: parsed });
  assert.equal(output.status, 'missing');
  assert.equal(evaluateInventoryMatch({ itemId: 'camisa-blanca', catalog: parsed, recommendation: output }).status, 'missing');
});

test('an unlinked or different-item reference cannot become an acta recommendation', () => {
  const output = ready();
  assert.equal(output.size, 'T6');
  for (const other of [null, { ...catalog(), inventoryItemId: undefined }, { ...catalog(), inventoryItemId: 'camisa-azul' }]) {
    const result = evaluateInventoryMatch({ itemId: 'camisa-blanca', catalog: other, recommendation: output });
    assert.equal(result.status, 'unconfigured');
    assert.equal(result.size, null);
    assert.deepEqual(result.candidates, []);
  }
});

test('verified measurement recommendation retains exact label without claiming stock', () => {
  const result = evaluateInventoryMatch({ itemId: 'camisa-blanca', catalog: catalog(), recommendation: ready() });
  assert.equal(result.status, 'ready');
  assert.equal(result.size, 'T6');
  assert.deepEqual(result.candidates, ['T6']);
  assert.match(result.warnings.join(' '), /no confirma existencias/);
});

test('confirmation gates and outside references do not assign an acta size', () => {
  const parsed = catalog();
  for (const extra of [{ confirmed: false }, { referenceAccepted: false }]) {
    const result = evaluateInventoryMatch({ itemId: 'camisa-blanca', catalog: parsed, recommendation: ready(extra) });
    assert.equal(result.status, 'missing');
    assert.equal(result.size, null);
  }
  const result = evaluateInventoryMatch({ itemId: 'camisa-blanca', catalog: parsed, recommendation: ready({ measurements: { chest: 64 } }) });
  assert.equal(result.status, 'outside');
  assert.equal(result.size, null);
  assert.deepEqual(result.candidates, []);
});

test('crossing observed ranges exposes exact candidates and removes single size', () => {
  const recommendation = ready({ measurements: { chest: 56 }, ranges: { chest: [55.8, 56.2] } });
  const result = evaluateInventoryMatch({ itemId: 'camisa-blanca', catalog: catalog(), recommendation });
  assert.equal(result.status, 'boundary');
  assert.equal(result.size, null);
  assert.deepEqual(new Set(result.candidates), new Set(['T4', 'T6']));
});

test('invalid recommendations cannot silently map to another available label', () => {
  const parsed = catalog();
  for (const recommendation of [
    { ...ready(), size: '6' },
    { ...ready(), size: 'T8' },
    { ...ready(), stability: { status: 'boundary', sizes: ['T6', 'T24'] } },
    { ...ready(), stability: { status: 'boundary', sizes: ['T6', 'T8'] } },
  ]) {
    const result = evaluateInventoryMatch({ itemId: 'camisa-blanca', catalog: parsed, recommendation });
    assert.equal(result.status, 'invalid');
    assert.equal(result.size, null);
    assert.deepEqual(result.candidates, []);
  }
});

test('corrupt linked tables fail closed and missing engine output requests verification', () => {
  for (const corrupt of [
    { ...catalog(), garment: 'pants' }, { ...catalog(), kind: 'foot' },
    { ...catalog(), rows: [{ size: 'M' }] }, { ...catalog(), rows: [] },
    { ...catalog(), rows: [{ size: 'T4' }, { size: 'T4' }] },
  ]) assert.equal(evaluateInventoryMatch({ itemId: 'camisa-blanca', catalog: corrupt, recommendation: ready() }).status, 'invalid');
  assert.equal(evaluateInventoryMatch({ itemId: 'camisa-blanca', catalog: catalog() }).status, 'missing');
  assert.equal(evaluateInventoryMatch({ itemId: 'not-an-item' }).status, 'invalid');
});
const provisionalBody = {
  kind: 'body', name: 'Referencia escolar de prueba', source: 'https://example.test/tabla',
  rows: [{ size: '2', chest: 52, waist: 49, hip: 56 }, { size: '4', chest: 56, waist: 53, hip: 61 },
    { size: '6', chest: 60, waist: 57, hip: 66 }, { size: '16', chest: 86, waist: 77, hip: 91 },
    { size: '18', chest: 90, waist: 81, hip: 95 }, { size: '20', chest: 94, waist: 85, hip: 99 }],
};

test('provisional body mapping only prefixes shared numerical labels 4 through 18', () => {
  const parsed = createProvisionalInventoryCatalog('camisa-blanca', { bodyReference: provisionalBody });
  assert.deepEqual(parsed.rows.map(row => row.size), ['T4', 'T6', 'T16', 'T18']);
  assert.equal(parsed.provisional, true);
  assert.equal(parsed.inventoryItemId, 'camisa-blanca');
  assert.equal(parsed.rows[2].referenceSize, '16');
  for (const unsupported of ['T20', 'T22', 'T1X', 'T2X']) assert.ok(parsed.missingSizes.includes(unsupported));
  assert.match(parsed.note, /no una equivalencia validada/);
  assert.match(parsed.note, /coincidencia de números no demuestra/);
  const small = createProvisionalInventoryCatalog('camisa-azul', { bodyReference: provisionalBody });
  assert.deepEqual(small.rows.map(row => row.size), ['T4', 'T6']);
});

test('provisional references clone only dimensions and cannot mutate their source', () => {
  const input = structuredClone(provisionalBody);
  const parsed = createProvisionalInventoryCatalog('pantalon-azul', { bodyReference: input });
  parsed.rows[0].waist = 999;
  parsed.rows.push({ size: 'T99' });
  parsed.missingSizes.push('T3X');
  assert.deepEqual(input, provisionalBody);
  assert.ok(!INVENTORY_ITEMS.find(item => item.id === 'pantalon-azul').sizes.includes('T3X'));
});

test('provisional shoes keep exact integer EU references without rounding or extrapolating', () => {
  const footReference = { kind: 'foot', name: 'Clarks EU de prueba', rows: [
    { size: '23', foot: 13 }, { size: '24', foot: 14 }, { size: '25', foot: 14.7 },
    { size: '25.5', foot: 15.1 }, { size: '26', foot: 15.5 }, { size: '39.5', foot: 24.4 },
    { size: '40', foot: 24.9 }, { size: '41', foot: 25.5 }, { size: '45', foot: 29 },
  ] };
  const parsed = createProvisionalInventoryCatalog('zapatos', { footReference });
  assert.equal(parsed.kind, 'foot');
  assert.deepEqual(parsed.rows.map(row => row.size), ['25', '26', '40']);
  for (const size of ['23', '24', '41', '42', '43', '44', '45']) assert.ok(parsed.missingSizes.includes(size));
  assert.match(parsed.note, /supone provisionalmente.*EU/);
  assert.match(parsed.note, /no se redondean/);
});

test('provisional matching retains the flag and still requires complete measurement verification', () => {
  const parsed = createProvisionalInventoryCatalog('camisa-blanca', { bodyReference: provisionalBody });
  const output = ready({ catalog: parsed });
  const matched = evaluateInventoryMatch({ itemId: 'camisa-blanca', catalog: parsed, recommendation: output });
  assert.equal(matched.status, 'ready');
  assert.equal(matched.size, 'T6');
  assert.equal(matched.provisional, true);
  assert.match(matched.warnings.join(' '), /no está validada/);
  const missing = evaluateInventoryMatch({ itemId: 'camisa-blanca', catalog: parsed, recommendation: ready({ catalog: parsed, referenceAccepted: false }) });
  assert.equal(missing.status, 'missing');
  assert.equal(missing.size, null);
  const outside = evaluateInventoryMatch({ itemId: 'camisa-blanca', catalog: parsed, recommendation: ready({ catalog: parsed, measurements: { chest: 94 } }) });
  assert.equal(outside.status, 'outside');
  assert.equal(outside.size, null);
});

test('provisional creation rejects incompatible, empty or unordered references', () => {
  assert.throws(() => createProvisionalInventoryCatalog('camisa-blanca'), /referencia corporal/);
  assert.throws(() => createProvisionalInventoryCatalog('zapatos', { footReference: provisionalBody }), /longitud del pie/);
  assert.throws(() => createProvisionalInventoryCatalog('camisa-blanca', { bodyReference: { ...provisionalBody, rows: [{ size: 'XXS', chest: 68 }] } }), /No hay referencias/);
  assert.throws(() => createProvisionalInventoryCatalog('pantalon-azul', { bodyReference: { ...provisionalBody, rows: [{ size: '4', chest: 56 }] } }), /No hay referencias/);
  assert.throws(() => createProvisionalInventoryCatalog('camisa-blanca', { bodyReference: { ...provisionalBody, rows: [...provisionalBody.rows].reverse() } }), /ordenada/);
});
