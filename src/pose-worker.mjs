// Pose estimates guide framing only. They are never garment measurements.
let landmarker = null;
let initialized = false;
let processing = false;

const readableError = (error) => error instanceof Error ? error.message : String(error || 'Error desconocido');

self.onmessage = async ({ data }) => {
  if (!data || typeof data.type !== 'string') return;

  if (data.type === 'init') {
    if (initialized || landmarker) return;
    initialized = true;
    try {
      if (typeof OffscreenCanvas !== 'function') {
        throw new Error('Este navegador no permite procesar la guía fuera de la pantalla.');
      }
      const base = new URL(data.baseUrl, self.location.href);
      if (!base.pathname.endsWith('/')) base.pathname += '/';
      const { FilesetResolver, PoseLandmarker } = await import(new URL('vision_bundle.mjs', base).href);
      // A module worker cannot publish the classic loader's top-level var.
      // MediaPipe 1.2 exposes an ES module loader that sets ModuleFactory globally.
      const vision = await FilesetResolver.forVisionTasks(new URL('wasm', base).href, true);
      landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: new URL('pose_landmarker_lite.task', base).href,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numPoses: 2,
        minPoseDetectionConfidence: 0.6,
        minPosePresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
        outputSegmentationMasks: false,
      });
      self.postMessage({ type: 'ready' });
    } catch (error) {
      try { landmarker?.close(); } catch { /* Best effort cleanup. */ }
      landmarker = null;
      self.postMessage({ type: 'error', phase: 'init', message: readableError(error) });
    }
    return;
  }

  if (data.type !== 'frame') return;
  const bitmap = data.bitmap;
  try {
    if (!landmarker) throw new Error('La guía de postura no está lista.');
    if (processing) throw new Error('Ya se está revisando un cuadro.');
    processing = true;
    const result = landmarker.detectForVideo(bitmap, data.timestamp);
    const landmarks = (result.landmarks || []).map((pose) => pose.map((point) => ({
      x: point.x,
      y: point.y,
      z: point.z,
      visibility: point.visibility,
      presence: point.presence,
    })));
    self.postMessage({ type: 'result', id: data.id, landmarks, count: landmarks.length });
  } catch (error) {
    self.postMessage({ type: 'error', phase: 'frame', id: data.id, message: readableError(error) });
  } finally {
    processing = false;
    try { bitmap?.close(); } catch { /* A transferred frame must always be released. */ }
  }
};
