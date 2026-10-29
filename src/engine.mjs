/** Pure measurement and size-reference functions. No images or DOM are retained. */
const GARMENTS = new Set(['shirt', 'pants', 'skirt', 'shoes']);
const REQUIRED = { shirt: ['chest'], pants: ['waist', 'hip'], skirt: ['waist', 'hip'], shoes: ['leftFoot', 'rightFoot'] };
const LABELS = { chest: 'Pecho', waist: 'Cintura', hip: 'Cadera', leftFoot: 'Pie izquierdo', rightFoot: 'Pie derecho', foot: 'Pie mayor' };
const number = value => typeof value === 'number' ? value : typeof value === 'string' && /^\s*\d+(?:\.\d+)?\s*$/.test(value) ? Number(value) : NaN;
const supplied = value => value !== undefined && value !== null && value !== '';

export function requiredFieldsFor(garment) {
  return [...(REQUIRED[garment] || [])];
}

export function measurePhoto({ kind = 'body', view = 'front', points = {}, width, height, heightCm, referenceCm } = {}) {
  const result = { measures: [], warnings: [], errors: [] };
  const error = message => result.errors.push(message);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    error('La fotografía debe tener ancho y alto válidos.');
    return result;
  }
  if (!points || typeof points !== 'object') {
    error('Faltan los puntos de la fotografía.');
    return result;
  }
  const checked = new Map();
  function point(key, required = false) {
    if (checked.has(key)) return checked.get(key);
    const p = points[key];
    if (!p) {
      if (required) error(`Falta marcar el punto ${key}.`);
      return null;
    }
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > width || p.y < 0 || p.y > height) {
      error(`El punto ${key} no está dentro de la fotografía.`);
      checked.set(key, null);
      return null;
    }
    checked.set(key, p);
    return p;
  }
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const add = (id, label, value) => {
    if (!Number.isFinite(value) || value <= 0) error(`Revisa los puntos de ${label.toLowerCase()}.`);
    else result.measures.push({ id, label, value, unit: 'cm', origin: 'photo' });
  };
  const finish = () => {
    if (result.errors.length) result.measures = [];
    return result;
  };

  if (kind === 'foot') {
    result.warnings.push('La referencia y el pie deben estar en el mismo plano. La cámara debe estar perpendicular al suelo; no se corrige la perspectiva.');
    result.warnings.push('La longitud es orientativa y no incluye holgura. Comprueba ambos pies y utiliza la tabla del fabricante.');
    const reference = number(referenceCm);
    if (!Number.isFinite(reference) || reference < 5 || reference > 40) error('La referencia física debe medir entre 5 y 40 cm.');
    const a = point('refA', true), b = point('refB', true), heel = point('heel', true), toe = point('toe', true);
    if (result.errors.length) return finish();
    const referencePixels = distance(a, b);
    if (referencePixels < width * .08) {
      error('La referencia debe ocupar al menos el 8 % del ancho de la foto. Acerca la cámara o separa correctamente sus puntos.');
      return finish();
    }
    const scale = reference / referencePixels;
    const length = distance(heel, toe) * scale;
    if (length < 8 || length > 35) error('La longitud del pie debe estar entre 8 y 35 cm. Revisa la referencia, el talón y el dedo más largo.');
    else add('footLength', 'Longitud del pie', length);
    const left = point('footL'), right = point('footR');
    if (left && right) add('footWidth', 'Ancho del pie', distance(left, right) * scale);
    else if (left || right) result.warnings.push('Marca ambos extremos para estimar el ancho del pie.');
    return finish();
  }

  if (kind !== 'body' || !['front', 'side'].includes(view)) {
    error('El tipo de captura o la vista no son compatibles.');
    return finish();
  }
  result.warnings.push('La estatura introducida calibra la imagen; no se mide automáticamente. La postura, la ropa y la perspectiva alteran las estimaciones.');
  result.warnings.push('Los anchos y profundidades de la fotografía no son contornos. No los conviertas en contornos ni los uses para elegir una talla.');
  const stature = number(heightCm);
  if (!Number.isFinite(stature) || stature < 60 || stature > 220) error('Introduce una estatura real entre 60 y 220 cm.');
  const top = point('top', true), bottom = point('bottom', true);
  if (result.errors.length) return finish();
  const bodyPixels = bottom.y - top.y;
  if (bodyPixels <= 0) error('La cabeza debe estar por encima del suelo.');
  else if (bodyPixels < height * .25) error('El cuerpo debe ocupar al menos un cuarto de la altura de la fotografía.');
  if (bodyPixels > 0 && Math.abs(bottom.x - top.x) > bodyPixels * .08) error('La cabeza y el suelo están desalineados. Mantén el cuerpo erguido y la cámara recta.');
  if (result.errors.length) return finish();
  const scale = stature / bodyPixels;
  function pair(leftKey, rightKey, id, label, ordered = true) {
    const a = point(leftKey), b = point(rightKey);
    if (!a || !b) {
      if (a || b) result.warnings.push(`Completa los dos puntos de ${label.toLowerCase()}.`);
      return null;
    }
    if ((ordered && a.x >= b.x) || (!ordered && a.x === b.x)) error(`Revisa el orden de los extremos de ${label.toLowerCase()}.`);
    if (Math.abs(a.y - b.y) > bodyPixels * .05) error(`Los extremos de ${label.toLowerCase()} deben estar al mismo nivel.`);
    if (Math.min(a.y, b.y) <= top.y || Math.max(a.y, b.y) >= bottom.y) error(`Los puntos de ${label.toLowerCase()} deben quedar entre la cabeza y el suelo.`);
    add(id, label, Math.abs(b.x - a.x) * scale);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, direction: Math.sign(b.x - a.x) };
  }
  if (view === 'side') {
    const waist = pair('waistFront', 'waistBack', 'waistDepth', 'Profundidad lateral de cintura', false);
    const hip = pair('hipFront', 'hipBack', 'hipDepth', 'Profundidad lateral de cadera', false);
    if (waist && hip && waist.y >= hip.y) error('La cintura debe quedar por encima de la cadera.');
    if (waist && hip && waist.direction !== hip.direction) error('Marca frente y espalda de forma consistente en la vista lateral.');
    return finish();
  }
  const shoulder = pair('shoulderL', 'shoulderR', 'shoulderWidth', 'Ancho entre hombros');
  const waist = pair('waistL', 'waistR', 'waistWidth', 'Ancho frontal de cintura');
  const hip = pair('hipL', 'hipR', 'hipWidth', 'Ancho frontal de cadera');
  if (shoulder && waist) {
    if (shoulder.y >= waist.y) error('Los hombros deben quedar por encima de la cintura.');
    else add('torsoLength', 'Largo visual del torso', (waist.y - shoulder.y) * scale);
  }
  if (waist && hip && waist.y >= hip.y) error('La cintura debe quedar por encima de la cadera.');
  if (waist) add('legLength', 'Largo visual desde cintura al suelo', (bottom.y - waist.y) * scale);
  const shoulderR = point('shoulderR'), elbow = point('elbow'), wrist = point('wrist');
  if (shoulderR && elbow && wrist) {
    if (!distance(shoulderR, elbow) || !distance(elbow, wrist)) error('Los puntos de hombro, codo y muñeca deben estar separados.');
    else add('sleeveLength', 'Largo visual de manga', (distance(shoulderR, elbow) + distance(elbow, wrist)) * scale);
  } else if (elbow || wrist) result.warnings.push('Marca hombro derecho, codo y muñeca para estimar la manga.');
  const crotch = point('crotch');
  if (crotch) {
    if (crotch.y <= (waist ? waist.y : top.y) || crotch.y >= bottom.y) error('La entrepierna debe estar por debajo de la cintura y por encima del suelo.');
    else add('inseam', 'Entrepierna visual hasta el suelo', (bottom.y - crotch.y) * scale);
  }
  return finish();
}

export function recommendSize({ garment, measurements = {}, catalog, confirmed = false, referenceAccepted = false } = {}) {
  const result = { status: 'invalid', size: null, required: [], warnings: [], details: [] };
  if (!GARMENTS.has(garment)) {
    result.warnings.push('Selecciona una prenda compatible.');
    return result;
  }
  const fields = requiredFieldsFor(garment);
  if (!measurements || typeof measurements !== 'object') measurements = {};
  result.required = fields.filter(key => !supplied(measurements[key]));
  const invalid = fields.filter(key => supplied(measurements[key]) && (!Number.isFinite(number(measurements[key])) || number(measurements[key]) <= 0));
  if (invalid.length) {
    result.warnings.push(`Revisa las medidas: ${invalid.map(key => LABELS[key]).join(', ')}.`);
    return result;
  }
  if (result.required.length) {
    result.status = 'missing';
    result.warnings.push('Completa las medidas verificadas que necesita esta prenda. Los anchos visuales no sustituyen los contornos con cinta.');
    return result;
  }
  const expectedKind = garment === 'shoes' ? 'foot' : 'body';
  if (!catalog || catalog.kind !== expectedKind || !Array.isArray(catalog.rows) || !catalog.rows.length) {
    result.warnings.push(catalog?.kind === 'garment' ? 'Esta tabla contiene medidas de prenda. Se necesita una tabla corporal; no se añade holgura automáticamente.' : 'Selecciona una tabla de referencias corporales o de longitud del pie compatible con la prenda.');
    return result;
  }
  const dimensions = garment === 'shoes' ? ['foot'] : fields;
  const seen = new Set();
  for (const [index, row] of catalog.rows.entries()) {
    const size = typeof row?.size === 'string' ? row.size.trim() : '';
    if (!size || seen.has(size.toLocaleLowerCase('es')) || dimensions.some(key => !Number.isFinite(number(row[key])) || number(row[key]) <= 0)) {
      result.warnings.push('La tabla contiene tallas duplicadas, etiquetas vacías o referencias inválidas.');
      return result;
    }
    seen.add(size.toLocaleLowerCase('es'));
    if (index && dimensions.some(key => number(row[key]) < number(catalog.rows[index - 1][key]))) {
      result.warnings.push('Las referencias de la tabla deben estar ordenadas de menor a mayor en todas las medidas requeridas.');
      return result;
    }
  }
  if (confirmed !== true || referenceAccepted !== true) {
    result.status = 'missing';
    if (confirmed !== true) result.warnings.push('Confirma las medidas con cinta o regla antes de obtener una sugerencia.');
    if (referenceAccepted !== true) result.warnings.push('Confirma que esta tabla corresponde al proveedor y al corte que vas a probar.');
    return result;
  }
  const input = Object.fromEntries(fields.map(key => [key, number(measurements[key])]));
  if (garment === 'shoes') {
    input.foot = Math.max(input.leftFoot, input.rightFoot);
    result.details.push(`Se compara el pie mayor: ${input.foot} cm. No se añade holgura automáticamente.`);
    result.warnings.push('La talla depende de la horma y del fabricante. Confirma el ajuste probando ambos zapatos.');
  } else result.warnings.push('Sugerencia para probar según referencias corporales nominales. No son límites máximos publicados ni una garantía de ajuste.');
  const minima = dimensions.map(key => Math.min(...catalog.rows.map(row => number(row[key]))));
  const belowAll = dimensions.every((key, index) => input[key] < minima[index]);
  const candidates = dimensions.map(key => ({ key, row: catalog.rows.find(row => number(row[key]) >= input[key]) }));
  for (const { key, row } of candidates) {
    result.details.push(`${LABELS[key]}: ${input[key]} cm; ${row ? `primera referencia igual o superior: talla ${row.size} (${number(row[key])} cm).` : 'supera las referencias disponibles.'}`);
  }
  const selected = catalog.rows.find(row => dimensions.every(key => number(row[key]) >= input[key]));
  if (belowAll || !selected) {
    result.status = 'outside';
    result.warnings.push(belowAll ? 'Las medidas quedan por debajo de la menor referencia de la tabla. No se extrapola una talla.' : 'Las medidas exceden las referencias disponibles. Solicita una tabla ampliada o revisión presencial.');
    return result;
  }
  if (new Set(candidates.filter(item => item.row).map(item => item.row.size)).size > 1) result.warnings.push('Las medidas corresponden a referencias de tallas distintas. Revisa especialmente cintura y cadera y prueba la prenda.');
  result.status = 'ready';
  result.size = selected.size.trim();
  result.details.push(`Referencia seleccionada: talla ${result.size}; ${dimensions.map(key => `${LABELS[key].toLowerCase()} ${number(selected[key])} cm`).join(', ')}.`);
  return result;
}

function splitCsv(text, delimiter) {
  const rows = [], row = [];
  let value = '', quoted = false, afterQuote = false;
  function field() { row.push(value.trim()); value = ''; afterQuote = false; }
  function endRow() { field(); if (row.some(cell => cell !== '')) rows.push([...row]); row.length = 0; }
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { value += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else value += char;
    } else if (char === delimiter) field();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else if (char === '"') {
      if (value.trim() || afterQuote) throw new Error('El CSV contiene comillas mal colocadas.');
      value = ''; quoted = true;
    } else if (afterQuote && !/\s/.test(char)) throw new Error('Hay texto después del cierre de una celda entre comillas.');
    else if (!afterQuote) value += char;
  }
  if (quoted) throw new Error('El CSV contiene una celda con comillas sin cerrar.');
  if (value || row.length || afterQuote) endRow();
  return rows;
}

export function parseCatalogCsv(text, { name = 'Tabla importada', garment } = {}) {
  if (!GARMENTS.has(garment)) throw new Error('Selecciona una prenda válida antes de importar la tabla.');
  if (typeof text !== 'string' || !text.trim()) throw new Error('El archivo CSV está vacío.');
  if (text.length > 250000) throw new Error('La tabla CSV es demasiado grande.');
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes(';') ? ';' : ',';
  const rows = splitCsv(clean, delimiter);
  if (rows.length < 2) throw new Error('El CSV debe incluir cabecera y al menos una talla.');
  const headers = rows.shift().map(value => value.toLocaleLowerCase('es'));
  const expected = ['talla', 'pecho', 'cintura', 'cadera', 'pie_cm'];
  if (new Set(headers).size !== headers.length || headers.length !== expected.length || expected.some(header => !headers.includes(header))) throw new Error('Usa la cabecera talla,pecho,cintura,cadera,pie_cm (también admite punto y coma).');
  const mapping = { pecho: 'chest', cintura: 'waist', cadera: 'hip', pie_cm: 'foot' };
  const required = garment === 'shoes' ? ['foot'] : requiredFieldsFor(garment);
  const seen = new Set();
  const parsed = rows.map((cells, index) => {
    const line = index + 2;
    if (cells.length !== headers.length) throw new Error(`La fila ${line} no tiene cinco columnas. Usa punto para los decimales.`);
    const data = Object.fromEntries(headers.map((header, i) => [header, cells[i]]));
    const size = data.talla.trim();
    if (!size || size.length > 60 || /[\r\n\u0000-\u001f]/.test(size)) throw new Error(`La fila ${line} tiene una etiqueta de talla inválida.`);
    const key = size.toLocaleLowerCase('es');
    if (seen.has(key)) throw new Error(`La talla ${size} está duplicada.`);
    seen.add(key);
    const row = { size };
    for (const [column, field] of Object.entries(mapping)) {
      if (!data[column]) {
        if (required.includes(field)) throw new Error(`Falta ${column} en la fila ${line}.`);
        continue;
      }
      if (!/^\d+(?:\.\d+)?$/.test(data[column]) || !Number.isFinite(Number(data[column])) || Number(data[column]) <= 0) throw new Error(`Valor inválido de ${column} en la fila ${line}; utiliza centímetros y decimales con punto.`);
      row[field] = Number(data[column]);
    }
    return row;
  });
  for (let i = 1; i < parsed.length; i++) {
    if (required.some(field => parsed[i][field] < parsed[i - 1][field])) throw new Error('Ordena las tallas de menor a mayor en todas las medidas requeridas.');
  }
  return { name: String(name || 'Tabla importada'), garment, kind: garment === 'shoes' ? 'foot' : 'body', rows: parsed };
}
