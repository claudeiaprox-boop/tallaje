import { parseCatalogCsv } from './engine.mjs';

const INV_SOURCE = 'Acta de reintegro de sobrantes · documento aportado por el usuario';
const INV_NOTE = 'El acta enumera etiquetas de talla; no incluye medidas en centímetros ni cantidades completadas. La equivalencia debe corresponder al proveedor y modelo.';
const INV_FULL_SIZES = ['T4', 'T6', 'T8', 'T10', 'T12', 'T14', 'T16', 'T18', 'T20', 'T22', 'T1X', 'T2X'];
const INV_SMALL_SIZES = INV_FULL_SIZES.slice(0, 5);
const INV_BEIGE_SIZES = INV_FULL_SIZES.slice(3);

export const INVENTORY_ITEMS = [
  { id: 'camisa-blanca', name: 'Camisa Blanca', garment: 'shirt', sizes: [...INV_FULL_SIZES] },
  { id: 'camisa-azul', name: 'Camisa Azul', garment: 'shirt', sizes: [...INV_SMALL_SIZES] },
  { id: 'pantalon-azul', name: 'Pantalón Azul', garment: 'pants', sizes: [...INV_FULL_SIZES] },
  { id: 'short-azul', name: 'Short Azul', garment: 'pants', sizes: [...INV_SMALL_SIZES] },
  { id: 'falda-azul-elastica', name: 'Falda Azul Elas', garment: 'skirt', sizes: INV_FULL_SIZES.slice(0, 7) },
  { id: 'falda-azul', name: 'Falda Azul', garment: 'skirt', sizes: [...INV_FULL_SIZES] },
  { id: 'falda-beige', name: 'Falda Beige', garment: 'skirt', sizes: [...INV_BEIGE_SIZES] },
  { id: 'pantalon-beige', name: 'Pantalón Beige', garment: 'pants', sizes: [...INV_BEIGE_SIZES] },
  { id: 'zapatos', name: 'Zapatos', garment: 'shoes', sizes: Array.from({ length: 23 }, (_, index) => String(index + 23)) },
].map(item => ({ ...item, source: INV_SOURCE, note: INV_NOTE }));

function INV_item(itemId) {
  const item = INVENTORY_ITEMS.find(candidate => candidate.id === itemId);
  if (!item) throw new Error('Selecciona una prenda válida del acta.');
  return item;
}

/** The CSV supplies metric references; the acta supplies only the exact permitted labels. */
export function parseInventoryCatalogCsv(text, { itemId, kind, name } = {}) {
  const item = INV_item(itemId);
  const resolvedKind = kind ?? (item.garment === 'shoes' ? 'foot' : 'body');
  const parsed = parseCatalogCsv(text, {
    garment: item.garment,
    kind: resolvedKind,
    name: name || `${item.name} · tabla del proveedor`,
  });
  const allowed = new Set(item.sizes);
  const unsupported = parsed.rows.filter(row => !allowed.has(row.size)).map(row => row.size);
  if (unsupported.length) {
    throw new Error(`Estas tallas no figuran para ${item.name} en el acta: ${unsupported.join(', ')}. Conserva las etiquetas exactas; no se convierten números ni tallas de otras prendas.`);
  }
  const missing = item.sizes.filter(size => !parsed.rows.some(row => row.size === size));
  return {
    ...parsed,
    id: `inventory-${item.id}`,
    inventoryItemId: item.id,
    sourceLabel: INV_SOURCE,
    note: `${INV_NOTE} Referencias en cm proporcionadas por el usuario para ${item.name}.${missing.length ? ` Tabla parcial: faltan ${missing.join(', ')}; solo se comparan las tallas con medidas cargadas.` : ' Tabla con referencias para todas las etiquetas del acta.'}`,
  };
}

/** Blank metric cells are intentional: exporting a template must never fabricate measurements. */
export function createInventoryTemplate(itemId) {
  const item = INV_item(itemId);
  return ['talla,pecho,cintura,cadera,pie_cm', ...item.sizes.map(size => `${size},,,,`)].join('\r\n') + '\r\n';
}

/** An explicit numerical-label experiment, not a validated equivalence with the acta provider. */
export function createProvisionalInventoryCatalog(itemId, { bodyReference, footReference } = {}) {
  const item = INV_item(itemId);
  const reference = item.garment === 'shoes' ? footReference : bodyReference;
  const expectedKind = item.garment === 'shoes' ? 'foot' : 'body';
  if (!reference || reference.kind !== expectedKind || !Array.isArray(reference.rows)) {
    throw new Error(`Se necesita una referencia ${expectedKind === 'foot' ? 'de longitud del pie' : 'corporal'} para crear esta comparación provisional.`);
  }
  const dimensions = item.garment === 'shoes' ? ['foot'] : item.garment === 'shirt' ? ['chest'] : ['waist', 'hip'];
  const allowed = new Set(item.sizes);
  const rows = [];
  for (const row of reference.rows) {
    if (typeof row?.size !== 'string' || !/^\d+$/.test(row.size)) continue;
    const numericSize = Number(row.size);
    const withinRange = item.garment === 'shoes' ? numericSize >= 25 && numericSize <= 40 : numericSize >= 4 && numericSize <= 18;
    const size = item.garment === 'shoes' ? row.size : `T${row.size}`;
    if (!withinRange || !allowed.has(size) || dimensions.some(key => !Number.isFinite(row[key]) || row[key] <= 0)) continue;
    if (rows.some(previous => previous.size === size)) throw new Error('La referencia provisional contiene tallas duplicadas.');
    const cloned = { size, referenceSize: row.size };
    for (const key of ['chest', 'waist', 'hip', 'foot']) if (Number.isFinite(row[key]) && row[key] > 0) cloned[key] = row[key];
    rows.push(cloned);
  }
  if (!rows.length) throw new Error('No hay referencias completas compatibles con las etiquetas numéricas de esta prenda del acta.');
  for (let index = 1; index < rows.length; index++) {
    if (dimensions.some(key => rows[index][key] < rows[index - 1][key])) throw new Error('La referencia provisional debe estar ordenada de menor a mayor en las medidas necesarias.');
  }
  const missingSizes = item.sizes.filter(size => !rows.some(row => row.size === size));
  const referenceName = typeof reference.name === 'string' && reference.name.trim() ? reference.name.trim() : 'Referencia comercial externa';
  const mappingNote = item.garment === 'shoes'
    ? 'Se supone provisionalmente que la numeración del acta es EU. Solo se conservan referencias enteras de 25 a 40 que existen exactamente en la tabla; no se redondean medias tallas.'
    : 'Se antepone T a las etiquetas numéricas de 4 a 18 que aparecen en ambas tablas. Esta coincidencia de números no demuestra que sean tallas equivalentes del mismo proveedor.';
  return {
    id: `inventory-provisional-${item.id}`,
    name: `${item.name} · referencia provisional`,
    garment: item.garment,
    kind: expectedKind,
    inventoryItemId: item.id,
    provisional: true,
    referenceName,
    source: typeof reference.source === 'string' ? reference.source : undefined,
    sourceLabel: `Referencia provisional: ${referenceName}; etiquetas tomadas del acta aportada`,
    note: `Sugerencia provisional, no una equivalencia validada con el proveedor del acta. ${mappingNote} Medidas de referencia: ${referenceName}.${missingSizes.length ? ` Sin referencia: ${missingSizes.join(', ')}. No se extrapolan esas tallas.` : ''} Confirma la tabla real y prueba la prenda antes de decidir.`,
    rows,
    missingSizes,
  };
}

/** Attach an already evaluated metric recommendation to its exact acta item without remapping sizes. */
export function evaluateInventoryMatch({ itemId, recommendation, catalog } = {}) {
  const result = { status: 'unconfigured', itemId: itemId || null, itemName: null, size: null, candidates: [], warnings: [], sourceLabel: INV_SOURCE, provisional: catalog?.provisional === true };
  let item;
  try { item = INV_item(itemId); }
  catch (error) { result.status = 'invalid'; result.warnings.push(error.message); return result; }
  result.itemName = item.name;
  if (result.provisional) result.warnings.push('Referencia provisional de otra tabla comercial: la correspondencia con las tallas del acta no está validada. Confirma con el proveedor y prueba la prenda.');
  if (!catalog || catalog.inventoryItemId !== item.id) {
    result.warnings.push(`Falta una tabla en centímetros específica para ${item.name}. El acta no define equivalencias y no se reutilizan automáticamente las de otra prenda o marca.`);
    return result;
  }
  const validKind = item.garment === 'shoes' ? catalog.kind === 'foot' : ['body', 'garment'].includes(catalog.kind);
  const allowed = new Set(item.sizes);
  if (catalog.garment !== item.garment || !validKind || !Array.isArray(catalog.rows) || !catalog.rows.length
    || catalog.rows.some(row => !row || !allowed.has(row.size))
    || new Set(catalog.rows.map(row => row.size)).size !== catalog.rows.length) {
    result.status = 'invalid';
    result.warnings.push('La tabla vinculada no corresponde a esta prenda o contiene tallas ajenas al acta. Revisa el catálogo.');
    return result;
  }
  if (!recommendation || !['ready', 'outside', 'missing', 'invalid'].includes(recommendation.status)) {
    result.status = 'missing';
    result.warnings.push('Completa las medidas verificadas y confirma la tabla antes de sugerir una talla del acta.');
    return result;
  }
  if (['missing', 'invalid'].includes(recommendation.status)) {
    result.status = recommendation.status;
    result.warnings.push('La comparación de medidas no está lista. Revisa sus avisos antes de usar una talla del acta.');
    return result;
  }
  const represented = new Set(catalog.rows.map(row => row.size));
  const rawCandidates = recommendation.stability?.sizes ?? [];
  if (!Array.isArray(rawCandidates) || rawCandidates.some(size => !allowed.has(size) || !represented.has(size))
    || (recommendation.status === 'ready' && (!allowed.has(recommendation.size) || !represented.has(recommendation.size)))) {
    result.status = 'invalid';
    result.warnings.push('La propuesta incluye una talla que no tiene referencia válida para esta prenda del acta. No se sustituye por otra etiqueta.');
    return result;
  }
  if (recommendation.stability?.status === 'boundary') {
    result.status = 'boundary';
    result.candidates = [...new Set([...rawCandidates, ...(recommendation.status === 'ready' ? [recommendation.size] : [])])];
    result.warnings.push('Las lecturas cambian la referencia de talla o salen de la tabla. Repite las medidas y prueba las candidatas; no hay una talla estable.');
    return result;
  }
  if (recommendation.status === 'outside') {
    result.status = 'outside';
    result.warnings.push('Las referencias cargadas no cubren estas medidas. No se extrapola ni se salta a otra talla del acta.');
    return result;
  }
  result.status = 'ready';
  result.size = recommendation.size;
  result.candidates = [recommendation.size];
  result.warnings.push('La etiqueta figura en el acta y tiene una referencia en centímetros cargada. El acta en blanco no confirma existencias; revisa disponibilidad y ajuste.');
  return result;
}
