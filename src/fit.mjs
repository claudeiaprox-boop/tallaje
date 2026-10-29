import { recommendSize, requiredFieldsFor } from './engine.mjs';

const FIT_LABELS = { chest: 'Pecho', waist: 'Cintura', hip: 'Cadera', leftFoot: 'Pie izquierdo', rightFoot: 'Pie derecho' };
const fitSupplied = value => value !== undefined && value !== null && value !== '';
const fitNumeric = value => typeof value === 'number' ? value : typeof value === 'string' && /^\s*\d+(?:\.\d+)?\s*$/.test(value) ? Number(value) : NaN;
const fitRounded = value => Math.round((value + Number.EPSILON) * 100) / 100;
const fitExtra = () => ({ stability: { status: 'unchecked', sizes: [] }, zones: [] });

/** Repeatability is not accuracy. This range describes observed readings, not a confidence interval. */
export function summarizeRepeated(values, { maxSpread = 1 } = {}) {
  const result = { status: 'missing', value: null, min: null, max: null, spread: null, count: 0, range: null, warnings: [] };
  if (!Array.isArray(values) || !Number.isFinite(maxSpread) || maxSpread < 0) {
    result.status = 'invalid';
    result.warnings.push('Revisa las lecturas y el umbral de repetición.');
    return result;
  }
  const provided = values.filter(fitSupplied);
  const readings = provided.map(fitNumeric);
  result.count = readings.filter(value => Number.isFinite(value) && value > 0).length;
  if (readings.some(value => !Number.isFinite(value) || value <= 0)) {
    result.status = 'invalid';
    result.warnings.push('Cada lectura debe ser un número positivo en centímetros.');
    return result;
  }
  if (readings.length < 3) {
    result.warnings.push('Toma tres lecturas independientes; retira y vuelve a colocar la cinta o regla entre lecturas.');
    return result;
  }
  readings.sort((a, b) => a - b);
  const middle = Math.floor(readings.length / 2);
  result.value = fitRounded(readings.length % 2 ? readings[middle] : (readings[middle - 1] + readings[middle]) / 2);
  result.min = readings[0];
  result.max = readings.at(-1);
  result.spread = Number((result.max - result.min).toFixed(10));
  result.range = [result.min, result.max];
  result.status = result.spread > maxSpread + 1e-9 ? 'repeat' : 'ready';
  if (result.status === 'repeat') result.warnings.push(`La diferencia entre lecturas supera ${maxSpread} cm. Repite la medición completa; no descartes una lectura solo para aprobar el control.`);
  result.warnings.push('La mediana y el rango observado describen repetibilidad. No demuestran exactitud ni corrigen una cinta mal colocada.');
  return result;
}

function fitGarmentReference({ garment, measurements, catalog, confirmed, referenceAccepted, ease }) {
  const result = { status: 'invalid', size: null, required: [], warnings: [], details: [], ...fitExtra() };
  if (!['shirt', 'pants', 'skirt'].includes(garment)) {
    result.warnings.push('La comparación de prenda terminada admite camisa, pantalón y falda. Para zapatos utiliza longitud del pie y tabla del fabricante.');
    return result;
  }
  const fields = requiredFieldsFor(garment);
  result.required = fields.filter(key => !fitSupplied(measurements[key]));
  if (fields.some(key => fitSupplied(measurements[key]) && (!Number.isFinite(fitNumeric(measurements[key])) || fitNumeric(measurements[key]) <= 0))) {
    result.warnings.push('Revisa los contornos corporales: deben ser números positivos en centímetros.');
    return result;
  }
  if (result.required.length) {
    result.status = 'missing';
    result.warnings.push('Completa los contornos corporales medidos con cinta antes de comparar con la prenda.');
    return result;
  }
  if (!Array.isArray(catalog.rows) || !catalog.rows.length) {
    result.warnings.push('La tabla de prenda terminada no contiene tallas.');
    return result;
  }
  const seen = new Set();
  for (const [index, row] of catalog.rows.entries()) {
    const size = typeof row?.size === 'string' ? row.size.trim() : '';
    if (!size || seen.has(size.toLocaleLowerCase('es')) || fields.some(key => !Number.isFinite(fitNumeric(row[key])) || fitNumeric(row[key]) <= 0)) {
      result.warnings.push('La tabla contiene tallas duplicadas, etiquetas vacías o medidas de prenda inválidas.');
      return result;
    }
    seen.add(size.toLocaleLowerCase('es'));
    if (index && fields.some(key => fitNumeric(row[key]) < fitNumeric(catalog.rows[index - 1][key]))) {
      result.warnings.push('Ordena las tallas de menor a mayor en todas las medidas requeridas.');
      return result;
    }
  }
  const missingEase = fields.filter(key => !fitSupplied(ease[key]));
  if (fields.some(key => fitSupplied(ease[key]) && (!Number.isFinite(fitNumeric(ease[key])) || fitNumeric(ease[key]) < 0))) {
    result.warnings.push('La holgura mínima debe ser un número mayor o igual a cero, indicado por el proveedor para cada contorno.');
    return result;
  }
  if (missingEase.length || confirmed !== true || referenceAccepted !== true) {
    result.status = 'missing';
    if (missingEase.length) result.warnings.push(`Falta la holgura mínima indicada por el proveedor: ${missingEase.map(key => FIT_LABELS[key]).join(', ')}. No se aplica una holgura universal.`);
    if (confirmed !== true) result.warnings.push('Confirma las medidas con cinta antes de obtener una sugerencia.');
    if (referenceAccepted !== true) result.warnings.push('Confirma que esta tabla y las holguras corresponden al proveedor, al corte y a la prenda que vas a probar.');
    return result;
  }
  const selected = catalog.rows.find(row => fields.every(key => fitNumeric(row[key]) + 1e-9 >= fitNumeric(measurements[key]) + fitNumeric(ease[key])));
  result.warnings.push('Se comparan contornos completos de prenda terminada con contornos corporales. Un ancho plano sin convertir no es un contorno.');
  result.warnings.push('Esta comparación solo verifica la holgura mínima introducida. No valida exceso de holgura, elasticidad, tolerancia de confección, movimiento ni caída de la tela. Comprueba largo y prueba la prenda.');
  if (!selected) {
    result.status = 'outside';
    result.warnings.push('Ninguna talla disponible cumple la holgura mínima en todas las zonas. Solicita otra talla o una revisión presencial.');
    return result;
  }
  result.status = 'ready';
  result.size = selected.size.trim();
  result.zones = fields.map(key => ({ key, body: fitNumeric(measurements[key]), garment: fitNumeric(selected[key]), ease: fitRounded(fitNumeric(selected[key]) - fitNumeric(measurements[key])), minEase: fitNumeric(ease[key]) }));
  for (const zone of result.zones) result.details.push(`${FIT_LABELS[zone.key]}: prenda ${zone.garment} cm − cuerpo ${zone.body} cm = holgura ${zone.ease} cm; mínimo solicitado ${zone.minEase} cm.`);
  result.details.push(`Primera talla que cumple la holgura mínima en todas las zonas: ${result.size}.`);
  return result;
}

/** Adds explicit garment ease and sensitivity to observed repeat ranges to the nominal size engine. */
export function evaluateFit({ garment, measurements = {}, ranges = {}, catalog, confirmed = false, referenceAccepted = false, ease = {} } = {}) {
  if (!measurements || typeof measurements !== 'object') measurements = {};
  if (!ease || typeof ease !== 'object') ease = {};
  const options = { garment, measurements, catalog, confirmed, referenceAccepted, ease };
  const evaluate = input => catalog?.kind === 'garment' ? fitGarmentReference(input) : { ...recommendSize(input), ...fitExtra() };
  const result = evaluate(options);
  const fields = requiredFieldsFor(garment);
  if (!ranges || typeof ranges !== 'object' || Array.isArray(ranges)) {
    result.status = 'invalid'; result.size = null; result.zones = [];
    result.warnings.push('El rango de lecturas no es válido.');
    return result;
  }
  const entries = Object.entries(ranges);
  for (const [key, range] of entries) {
    const value = fitNumeric(measurements[key]);
    if (!fields.includes(key) || !Array.isArray(range) || range.length !== 2 || range.some(limit => !Number.isFinite(fitNumeric(limit)) || fitNumeric(limit) <= 0)
      || fitNumeric(range[0]) > fitNumeric(range[1]) || !Number.isFinite(value) || value < fitNumeric(range[0]) - 1e-9 || value > fitNumeric(range[1]) + 1e-9) {
      result.status = 'invalid'; result.size = null; result.zones = [];
      result.warnings.push(`Revisa el rango observado de ${FIT_LABELS[key] || key}: necesita mínimo y máximo positivos y debe contener la medida utilizada.`);
      return result;
    }
  }
  if (!entries.length || !['ready', 'outside'].includes(result.status)) return result;
  let corners = [{ ...measurements }];
  for (const [key, range] of entries) corners = corners.flatMap(corner => [...new Set(range.map(fitNumeric))].map(value => ({ ...corner, [key]: value })));
  // Include the baseline: ranges can span both ends of a finite reference table.
  const outcomes = [result, ...corners.map(corner => evaluate({ ...options, measurements: corner }))];
  const sizes = [...new Set(outcomes.filter(item => item.status === 'ready').map(item => item.size))];
  const hasOutside = outcomes.some(item => item.status === 'outside');
  result.stability = { status: sizes.length === 0 ? 'outside' : hasOutside || sizes.length > 1 ? 'boundary' : 'stable', sizes };
  if (result.stability.status === 'boundary') result.warnings.push('El rango observado entre repeticiones cruza referencias de talla o sale de la tabla. No hay una talla estable: repite con cuidado y prueba las tallas candidatas.');
  result.details.push(`Sensibilidad a los extremos observados de ${entries.map(([key]) => FIT_LABELS[key]).join(', ')}: ${result.stability.status === 'stable' ? 'la referencia no cambia' : result.stability.status === 'outside' ? 'fuera de la tabla' : 'la referencia cambia o sale de la tabla'}. No es un intervalo de confianza ni demuestra exactitud.`);
  return result;
}

/** Ramanujan approximation for an ideal ellipse. Experimental geometry, never a verified body contour. */
export function ellipseCircumference({ width, depth } = {}) {
  const w = fitNumeric(width), d = fitNumeric(depth);
  if (!Number.isFinite(w) || !Number.isFinite(d) || w <= 0 || d <= 0) return null;
  const a = w / 2, b = d / 2;
  const h = ((a - b) / (a + b)) ** 2;
  const circumference = Math.PI * (a + b) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h)));
  return Number.isFinite(circumference) ? circumference : null;
}

