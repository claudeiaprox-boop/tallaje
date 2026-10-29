const FRAME_INTERVAL_MS = 1000 / 6;
const INIT_TIMEOUT_MS = 30000;
const FRAME_TIMEOUT_MS = 12000;
const VISIBILITY_THRESHOLD = 0.6;

function inspectPose(landmarks, count, width, height) {
  const pose = landmarks[0] || [];
  const pointVisible = (index) => {
    const point = pose[index];
    return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y)
      && (point.visibility ?? 1) >= VISIBILITY_THRESHOLD
      && point.x > 0.025 && point.x < 0.975 && point.y > 0.025 && point.y < 0.975);
  };
  const torsoVisible = [11, 12, 23, 24].every(pointVisible);
  const torsoX = torsoVisible ? [11, 12, 23, 24].reduce((sum, index) => sum + pose[index].x, 0) / 4 : 0;
  const shouldersVisible = [11, 12].every(pointVisible);
  const shoulderSpan = shouldersVisible ? Math.abs(pose[12].x - pose[11].x) : 0;
  const checks = {
    person: count === 1,
    centered: count === 1 && torsoVisible && torsoX >= 0.35 && torsoX <= 0.65,
    // Ears and foot landmarks cannot establish the crown or the full silhouette.
    fullBody: count === 1 && [7, 8].every(pointVisible)
      && (pointVisible(29) || pointVisible(31)) && (pointVisible(30) || pointVisible(32)),
    level: count === 1 && shouldersVisible && shoulderSpan > 0.035
      && Math.abs(pose[12].y - pose[11].y) * height <= shoulderSpan * width * 0.18,
    arms: count === 1 && torsoVisible && [15, 16].every(pointVisible) && shoulderSpan > 0.035
      && Math.min(pose[15].x, pose[16].x) < torsoX - shoulderSpan * 0.5
      && Math.max(pose[15].x, pose[16].x) > torsoX + shoulderSpan * 0.5
      && Math.min(pose[15].y, pose[16].y) > Math.min(pose[11].y, pose[12].y),
  };
  let message;
  if (count === 0) message = 'Coloca a una persona dentro de la guía y muestra su cuerpo completo.';
  else if (count > 1) message = 'Se detectó más de una persona. Deja solo a quien vas a medir en el cuadro.';
  else if (!checks.fullBody) message = 'Revisa cabeza y pies: deben quedar completos dentro del cuadro.';
  else if (!checks.centered) message = 'Acércate al centro de la guía. Revisa cabeza y pies antes de confirmar.';
  else if (!checks.level) message = 'Mantén una postura recta y hombros nivelados. Revisa cabeza y pies antes de confirmar.';
  else if (!checks.arms) message = 'Separa ligeramente los brazos. Revisa cabeza y pies antes de confirmar.';
  else message = 'Revisa cabeza y pies completos antes de confirmar el encuadre.';
  return { landmarks, count, checks, message };
}

/** Optional local framing assistance. It produces no centimetres or body edges. */
export async function createPoseAssistant({ video, onResult, onStatus, baseUrl = '/vendor/mediapipe/' }) {
  if (!video) throw new Error('Falta la vista de cámara para la guía.');
  if (typeof Worker !== 'function' || typeof createImageBitmap !== 'function') {
    throw new Error('La guía automática no está disponible en este navegador. Continúa con el marcado manual.');
  }

  const status = (message) => {
    try { onStatus?.(message); } catch { /* UI callback errors must not leak camera frames. */ }
  };
  const worker = new Worker('/pose-worker.mjs', { type: 'module', name: 'tallalab-postura' });
  let disposed = false;
  let running = false;
  let generation = 0;
  let frameId = 0;
  let preparingFrame = false;
  let inFlight = null;
  let loopTimer = null;
  let frameTimer = null;
  let initTimer = null;
  let initSettled = false;
  let initResolve;
  let initReject;

  const ready = new Promise((resolve, reject) => { initResolve = resolve; initReject = reject; });

  const stop = () => {
    running = false;
    generation += 1;
    clearTimeout(loopTimer);
    loopTimer = null;
  };
  const cleanup = () => {
    if (disposed) return;
    stop();
    disposed = true;
    clearTimeout(initTimer);
    clearTimeout(frameTimer);
    inFlight = null;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
  };
  const fail = (detail) => {
    const error = new Error(`La guía automática no está disponible. Continúa con el marcado manual. ${detail || ''}`.trim());
    if (!initSettled) {
      initSettled = true;
      initReject(error);
    }
    status('Guía automática no disponible. Puedes continuar con el marcado manual.');
    cleanup();
  };
  const queueFrame = (delay = FRAME_INTERVAL_MS) => {
    if (running && !disposed) loopTimer = setTimeout(captureFrame, delay);
  };

  async function captureFrame() {
    loopTimer = null;
    if (!running || disposed) return;
    if (preparingFrame || inFlight || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      queueFrame();
      return;
    }
    const capturedGeneration = generation;
    let bitmap;
    preparingFrame = true;
    try {
      bitmap = await createImageBitmap(video);
      if (disposed || !running || capturedGeneration !== generation) {
        bitmap.close();
        bitmap = null;
        return;
      }
      const id = ++frameId;
      inFlight = { id, generation: capturedGeneration, width: video.videoWidth, height: video.videoHeight };
      worker.postMessage({ type: 'frame', id, bitmap, timestamp: performance.now() }, [bitmap]);
      bitmap = null; // Worker owns this frame after transfer.
      frameTimer = setTimeout(() => fail('La revisión del cuadro tardó demasiado.'), FRAME_TIMEOUT_MS);
    } catch (error) {
      try { bitmap?.close(); } catch { /* Bitmap may already have been transferred. */ }
      if (!disposed && capturedGeneration === generation) fail(error?.message);
    } finally {
      preparingFrame = false;
      // A new start() may already have scheduled its own timer while this frame resolved.
      if (!loopTimer) queueFrame();
    }
  }

  worker.onmessage = ({ data }) => {
    if (disposed || !data) return;
    if (data.type === 'ready') {
      if (!initSettled) {
        clearTimeout(initTimer);
        initSettled = true;
        status('Guía de postura lista. Confirma siempre el encuadre visualmente.');
        initResolve();
      }
      return;
    }
    if (data.type === 'error') {
      fail(data.message);
      return;
    }
    if (data.type !== 'result' || !inFlight || data.id !== inFlight.id) return;
    const frame = inFlight;
    inFlight = null;
    clearTimeout(frameTimer);
    frameTimer = null;
    if (!running || frame.generation !== generation) return;
    const landmarks = Array.isArray(data.landmarks) ? data.landmarks : [];
    const result = inspectPose(landmarks, landmarks.length, frame.width, frame.height);
    try { onResult?.(result); } catch { /* The camera loop remains recoverable if the UI callback fails. */ }
  };
  worker.onerror = (event) => { event.preventDefault?.(); fail(event.message || 'No se pudo abrir el procesador de postura.'); };
  worker.onmessageerror = () => fail('No se pudo recibir la revisión de postura.');
  status('Preparando guía de postura en este dispositivo…');
  initTimer = setTimeout(() => fail('La preparación tardó más de 30 segundos.'), INIT_TIMEOUT_MS);
  try {
    const resolvedBase = new URL(baseUrl, document.baseURI);
    if (!resolvedBase.pathname.endsWith('/')) resolvedBase.pathname += '/';
    worker.postMessage({ type: 'init', baseUrl: resolvedBase.href });
  } catch (error) {
    fail(error?.message);
  }
  await ready;

  return {
    start() {
      if (disposed) throw new Error('La guía se cerró. Vuelve a activarla para utilizarla.');
      if (running) return;
      running = true;
      generation += 1;
      queueFrame(0);
    },
    stop,
    dispose: cleanup,
  };
}
