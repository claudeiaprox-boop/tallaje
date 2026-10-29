/** Conservative framing checks, not anthropometry or a calibrated confidence score. */
const CONFIDENCE = 0.7;
const REQUIRED_FRAMES = 8;
const REQUIRED_DURATION_MS = 1000;
const MAX_GAP_MS = 700;
const MOTION_LIMIT = 0.012;
const DRIFT_LIMIT = 0.02;
const TRACKED = [7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

function visible(point) {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && Number.isFinite(point.visibility) && point.visibility >= CONFIDENCE && point.visibility <= 1
    && (point.presence === undefined || (Number.isFinite(point.presence) && point.presence >= CONFIDENCE && point.presence <= 1))
    && point.x > 0.025 && point.x < 0.975 && point.y > 0.025 && point.y < 0.975);
}

function copy(poses) {
  return poses.map(pose => Array.isArray(pose) ? pose.map(point => point && typeof point === 'object' ? { ...point } : null) : []);
}

/** Each camera run owns one tracker. Call reset() on stop/restart or view change. */
export function createPoseQualityTracker() {
  let previous = null, anchor = null, smoothed = null, lastTime = null, firstStableTime = null;
  let previousWidth = null, previousHeight = null, stableFrames = 0;

  function reset() {
    previous = anchor = smoothed = null;
    lastTime = firstStableTime = null;
    previousWidth = previousHeight = null;
    stableFrames = 0;
  }

  function inspect(input, width, height, timestamp) {
    const poses = Array.isArray(input) ? input : [];
    const count = poses.length;
    const pose = Array.isArray(poses[0]) ? poses[0] : [];
    const dimensionsValid = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
    const timeValid = Number.isFinite(timestamp) && timestamp >= 0;
    if (!dimensionsValid || !timeValid || lastTime === null || timestamp <= lastTime
      || timestamp - lastTime > MAX_GAP_MS || width !== previousWidth || height !== previousHeight) reset();
    const p = index => pose[index];
    const has = index => visible(p(index));
    const onePerson = count === 1 && dimensionsValid && timeValid;
    const torsoVisible = onePerson && [11, 12, 23, 24].every(has);
    const shouldersVisible = onePerson && [11, 12].every(has);
    const hipsVisible = onePerson && [23, 24].every(has);
    const torsoX = torsoVisible ? [11, 12, 23, 24].reduce((sum, index) => sum + p(index).x, 0) / 4 : 0;
    const shoulderSpan = shouldersVisible ? Math.abs(p(12).x - p(11).x) : 0;
    const hipSpan = hipsVisible ? Math.abs(p(24).x - p(23).x) : 0;
    const leftFoot = has(31) ? 31 : has(29) ? 29 : null;
    const rightFoot = has(32) ? 32 : has(30) ? 30 : null;
    const endsVisible = onePerson && [7, 8].every(has) && leftFoot !== null && rightFoot !== null;
    const upperY = endsVisible ? Math.min(p(7).y, p(8).y) : 0;
    const lowerY = endsVisible ? Math.max(p(leftFoot).y, p(rightFoot).y) : 0;
    const bodySpan = lowerY - upperY;
    const frontalPair = (a, b, span) => Number.isFinite(p(a)?.z) && Number.isFinite(p(b)?.z)
      && Math.abs(p(a).z - p(b).z) <= span * 0.6;
    const checks = {
      person: onePerson,
      centered: torsoVisible && torsoX >= 0.35 && torsoX <= 0.65,
      // Ear and foot landmarks do not establish the crown or complete silhouette.
      fullBody: endsVisible && TRACKED.every(has),
      framing: endsVisible && bodySpan >= 0.6 && bodySpan <= 0.88 && upperY >= 0.10 && lowerY <= 0.94,
      level: shouldersVisible && shoulderSpan > 0.035 && Math.abs(p(12).y - p(11).y) * height <= shoulderSpan * width * 0.18,
      hips: hipsVisible && hipSpan > 0.025 && Math.abs(p(24).y - p(23).y) * height <= hipSpan * width * 0.22,
      frontal: torsoVisible && shoulderSpan > 0.035 && hipSpan > 0.025
        && frontalPair(11, 12, shoulderSpan) && frontalPair(23, 24, hipSpan),
      arms: torsoVisible && [13, 14, 15, 16].every(has) && shoulderSpan > 0.035
        && Math.min(p(15).x, p(16).x) < torsoX - shoulderSpan * 0.55
        && Math.max(p(15).x, p(16).x) > torsoX + shoulderSpan * 0.55
        && Math.min(p(15).y, p(16).y) > Math.max(p(11).y, p(12).y),
      stable: false,
    };
    const acceptable = Object.entries(checks).every(([key, value]) => key === 'stable' || value);
    const motionPoints = acceptable ? [...TRACKED, leftFoot, rightFoot].map(index => ({ x: p(index).x, y: p(index).y })) : null;
    // Normalizing by actual image/body height avoids aspect-ratio-dependent decisions.
    const delta = (before, after) => Math.max(...after.map((point, index) => Math.hypot(
      (point.x - before[index].x) * width, (point.y - before[index].y) * height
    ) / (bodySpan * height)));
    let motion = null;
    if (acceptable) {
      motion = previous ? delta(previous, motionPoints) : 0;
      const drift = anchor ? delta(anchor, motionPoints) : 0;
      if (!previous || motion > MOTION_LIMIT || drift > DRIFT_LIMIT) {
        stableFrames = 1;
        firstStableTime = timestamp;
        anchor = motionPoints;
        smoothed = null;
      } else stableFrames += 1;
      previous = motionPoints;
    } else {
      previous = anchor = smoothed = null;
      firstStableTime = null;
      stableFrames = 0;
    }
    const elapsedMs = firstStableTime === null ? 0 : timestamp - firstStableTime;
    checks.stable = acceptable && stableFrames >= REQUIRED_FRAMES && elapsedMs >= REQUIRED_DURATION_MS;

    // Drawn points are smoothed only after raw checks. Filtering must not hide movement.
    const rawLandmarks = copy(poses);
    let landmarks = copy(poses);
    if (acceptable) {
      if (smoothed) landmarks[0] = landmarks[0].map((point, index) => {
        const before = smoothed[index];
        if (!visible(point) || !visible(before)) return point;
        return { ...point, x: before.x * 0.65 + point.x * 0.35, y: before.y * 0.65 + point.y * 0.35 };
      });
      smoothed = landmarks[0];
    }
    lastTime = timeValid ? timestamp : null;
    previousWidth = dimensionsValid ? width : null;
    previousHeight = dimensionsValid ? height : null;
    let message;
    if (!dimensionsValid || !timeValid) message = 'No se pudo revisar este cuadro. Espera la siguiente imagen de cámara.';
    else if (count === 0) message = 'Coloca a una persona dentro de la guía y muestra su cuerpo completo.';
    else if (count > 1) message = 'Se detectó más de una persona. Deja solo a quien vas a medir en el cuadro.';
    else if (!checks.fullBody) message = 'Hay puntos ocultos o poco visibles. Revisa cabeza, brazos y ambos pies; mejora la luz.';
    else if (!checks.framing) message = 'Ajusta la distancia: cuerpo completo, margen sobre la cabeza y bajo los pies.';
    else if (!checks.centered) message = 'Colócate en el centro de la guía.';
    else if (!checks.frontal) message = 'Mira al frente con hombros y caderas orientados hacia la cámara.';
    else if (!checks.level || !checks.hips) message = 'Mantén hombros y caderas nivelados, con el peso repartido.';
    else if (!checks.arms) message = 'Separa ligeramente los brazos para dejar visible el torso.';
    else if (!checks.stable) message = `Mantén la postura quieta: ${Math.min(stableFrames, REQUIRED_FRAMES)}/${REQUIRED_FRAMES} cuadros estables. Revisa cabeza y pies.`;
    else message = 'Encuadre estable. Confirma cabeza y pies completos y toma la foto. Esto no valida la precisión de las medidas.';
    return { landmarks, rawLandmarks, count, checks, message, quality: {
      ready: checks.stable, stableFrames, requiredFrames: REQUIRED_FRAMES,
      requiredDurationMs: REQUIRED_DURATION_MS, elapsedMs, motion,
    } };
  }
  return { inspect, reset };
}
