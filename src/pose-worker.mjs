// Pose estimates locate joints and guide framing. They are never body contours.
let landmarker = null;
let initialized = false;
let processing = false;
let runningMode = 'VIDEO';

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
      if (data.runningMode !== undefined && !['IMAGE', 'VIDEO'].includes(data.runningMode)) {
        throw new Error('El modo de reconocimiento no es compatible.');
      }
      runningMode = data.runningMode || 'VIDEO';
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
        runningMode,
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

  if (!['frame', 'image'].includes(data.type)) return;
  const bitmap = data.bitmap;
  try {
    if (!landmarker) throw new Error('La guía de postura no está lista.');
    if (processing) throw new Error('Ya se está revisando un cuadro.');
    if ((data.type === 'image' ? 'IMAGE' : 'VIDEO') !== runningMode) {
      throw new Error('El reconocimiento no se preparó para este tipo de imagen.');
    }
    processing = true;
    const result = data.type === 'image'
      ? landmarker.detect(bitmap)
      : landmarker.detectForVideo(bitmap, data.timestamp);
    const landmarks = (result.landmarks || []).map((pose) => pose.map((point) => ({
      x: point.x,
      y: point.y,
      z: point.z,
      visibility: point.visibility,
      presence: point.presence,
    })));
    self.postMessage({ type: data.type === 'image' ? 'image-result' : 'result', id: data.id, landmarks, count: landmarks.length });
  } catch (error) {
    self.postMessage({ type: 'error', phase: data.type, id: data.id, message: readableError(error) });
  } finally {
    processing = false;
    try { bitmap?.close(); } catch { /* A transferred frame must always be released. */ }
  }
};
