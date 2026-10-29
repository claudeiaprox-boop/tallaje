/** MediaPipe indices are anatomical left/right; the photograph is not necessarily mirrored. */
export const BODY_LANDMARKS = [
  ['nose', 'Nariz'], ['leftEyeInner', 'Ojo izquierdo · interior'], ['leftEye', 'Ojo izquierdo'],
  ['leftEyeOuter', 'Ojo izquierdo · exterior'], ['rightEyeInner', 'Ojo derecho · interior'],
  ['rightEye', 'Ojo derecho'], ['rightEyeOuter', 'Ojo derecho · exterior'],
  ['leftEar', 'Oreja izquierda'], ['rightEar', 'Oreja derecha'], ['mouthLeft', 'Boca · lado izquierdo'],
  ['mouthRight', 'Boca · lado derecho'], ['leftShoulder', 'Hombro izquierdo'], ['rightShoulder', 'Hombro derecho'],
  ['leftElbow', 'Codo izquierdo'], ['rightElbow', 'Codo derecho'], ['leftWrist', 'Muñeca izquierda'],
  ['rightWrist', 'Muñeca derecha'], ['leftPinky', 'Meñique izquierdo'], ['rightPinky', 'Meñique derecho'],
  ['leftIndex', 'Índice izquierdo'], ['rightIndex', 'Índice derecho'], ['leftThumb', 'Pulgar izquierdo'],
  ['rightThumb', 'Pulgar derecho'], ['leftHip', 'Articulación de cadera izquierda'], ['rightHip', 'Articulación de cadera derecha'],
  ['leftKnee', 'Rodilla izquierda'], ['rightKnee', 'Rodilla derecha'], ['leftAnkle', 'Tobillo izquierdo'],
  ['rightAnkle', 'Tobillo derecho'], ['leftHeel', 'Talón izquierdo'], ['rightHeel', 'Talón derecho'],
  ['leftFootIndex', 'Punta del pie izquierdo'], ['rightFootIndex', 'Punta del pie derecho'],
].map(([key, label], index) => ({ index, key, label }));

export const POSE_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32],
];

const LM_MIN_VISIBILITY = 0.7;
function LM_validPoint(point) {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
    && Number.isFinite(point.visibility) && point.visibility >= LM_MIN_VISIBILITY && point.visibility <= 1
    && (point.presence === undefined || (Number.isFinite(point.presence) && point.presence >= LM_MIN_VISIBILITY && point.presence <= 1)));
}

/** Automatic joint proposals only. No silhouette edge, ground, crown or body contour is invented. */
export function mapPoseToPhoto({ landmarks, width, height, view = 'front' } = {}) {
  const result = { landmarks: [], points: {}, origins: {}, visibleCount: 0, count: Array.isArray(landmarks) ? landmarks.length : 0, warnings: [] };
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    result.warnings.push('La fotografía necesita dimensiones válidas para situar los puntos.');
    return result;
  }
  if (result.count !== 1 || !Array.isArray(landmarks[0])) {
    result.warnings.push(result.count > 1 ? 'Hay más de una persona: usa una foto donde solo aparezca quien vas a medir.' : 'No se reconoció una persona. Prueba otra foto con buena luz y el cuerpo visible.');
    return result;
  }
  result.landmarks = BODY_LANDMARKS.map(({ index }) => {
    const p = landmarks[0][index];
    return LM_validPoint(p) ? { x: p.x, y: p.y, ...(Number.isFinite(p.z) ? { z: p.z } : {}), visibility: p.visibility, ...(p.presence !== undefined ? { presence: p.presence } : {}) } : null;
  });
  result.visibleCount = result.landmarks.filter(Boolean).length;
  if (result.visibleCount < 33) result.warnings.push('Se omiten los puntos ocultos o con visibilidad insuficiente. Mejora luz, postura o encuadre si faltan articulaciones.');
  result.warnings.push('Los puntos de IA son articulaciones aproximadas: no son bordes del cuerpo ni contornos de confección. Revisa los hombros antes de medir.');
  if (view !== 'front') {
    result.warnings.push('En perfil se muestra el reconocimiento, pero no se rellenan puntos de medida: las articulaciones pueden superponerse.');
    return result;
  }
  const shoulders = [11, 12].map(index => ({ index, point: result.landmarks[index] }));
  if (!shoulders.every(item => item.point) || Math.abs(shoulders[0].point.x - shoulders[1].point.x) < 0.025) {
    result.warnings.push('Los dos hombros deben distinguirse para proponer los puntos del brazo de la derecha de la imagen.');
    return result;
  }
  shoulders.sort((a, b) => a.point.x - b.point.x);
  const add = (key, point) => {
    if (!point) return;
    result.points[key] = { x: point.x * width, y: point.y * height };
    result.origins[key] = 'ai';
  };
  add('shoulderL', shoulders[0].point);
  add('shoulderR', shoulders[1].point);
  const rightImageShoulderIndex = shoulders[1].index;
  add('elbow', result.landmarks[rightImageShoulderIndex === 11 ? 13 : 14]);
  add('wrist', result.landmarks[rightImageShoulderIndex === 11 ? 15 : 16]);
  return result;
}
