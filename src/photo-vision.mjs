const PHOTO_INIT_TIMEOUT_MS = 30000;
const PHOTO_DETECT_TIMEOUT_MS = 15000;

const photoAbortError = () => Object.assign(new Error('Reconocimiento cancelado.'), { name: 'AbortError' });

/** Detect this exact still image locally. No live-video result is reused for a photograph. */
export async function detectPhotoPose({ image, onStatus, signal, baseUrl = '/vendor/mediapipe/' } = {}) {
  if (!image) throw new Error('Falta la fotografía que se va a reconocer.');
  if (signal?.aborted) throw photoAbortError();
  if (typeof Worker !== 'function' || typeof createImageBitmap !== 'function') {
    throw new Error('Este navegador no permite el reconocimiento automático. Puedes marcar los puntos manualmente.');
  }
  const status = message => { try { onStatus?.(message); } catch { /* Status rendering cannot interrupt frame disposal. */ } };
  const worker = new Worker('/pose-worker.mjs', { type: 'module', name: 'tallalab-fotografia' });
  let timer = null, settled = false, phase = 'init', abort = null;
  try {
    return await new Promise((resolve, reject) => {
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        if (error) reject(error); else resolve(value);
      };
      const fail = message => finish(new Error(message));
      abort = () => finish(photoAbortError());
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      const sendImage = async () => {
        let bitmap = null;
        try {
          bitmap = await createImageBitmap(image);
          if (settled || signal?.aborted) return;
          worker.postMessage({ type: 'image', id: 1, bitmap }, [bitmap]);
          bitmap = null; // The worker now owns the only transferred frame.
        } catch {
          fail('No se pudo preparar la fotografía para la IA. Puedes marcarla manualmente.');
        } finally {
          try { bitmap?.close(); } catch { /* Includes cancellation while createImageBitmap was resolving. */ }
        }
      };
      worker.onmessage = ({ data }) => {
        if (settled || !data) return;
        if (data.type === 'error') {
          if (data.id !== undefined && data.id !== 1) return;
          fail(`No se pudo reconocer la foto. ${typeof data.message === 'string' ? data.message : 'Revisa la imagen o marca manualmente.'}`);
          return;
        }
        if (data.type === 'ready' && phase === 'init') {
          phase = 'image';
          clearTimeout(timer);
          timer = setTimeout(() => fail('El reconocimiento de esta foto tardó demasiado. Puedes continuar con el marcado manual.'), PHOTO_DETECT_TIMEOUT_MS);
          status('Detectando puntos de esta fotografía con IA…');
          void sendImage();
          return;
        }
        if (data.type !== 'image-result' || data.id !== 1 || phase !== 'image') return;
        const landmarks = Array.isArray(data.landmarks) ? data.landmarks : [];
        finish(null, { landmarks, count: landmarks.length });
      };
      worker.onerror = event => { event.preventDefault?.(); fail('El procesador de reconocimiento no pudo ejecutarse. Puedes marcar manualmente.'); };
      worker.onmessageerror = () => fail('No se pudo recibir el reconocimiento de la foto. Puedes marcar manualmente.');
      status('Preparando el modelo de IA para esta fotografía…');
      timer = setTimeout(() => fail('El modelo de IA no se preparó a tiempo. Revisa la conexión o continúa manualmente.'), PHOTO_INIT_TIMEOUT_MS);
      try {
        const base = new URL(baseUrl, document.baseURI);
        if (!base.pathname.endsWith('/')) base.pathname += '/';
        worker.postMessage({ type: 'init', runningMode: 'IMAGE', baseUrl: base.href });
      } catch { fail('No se pudo iniciar el reconocimiento de la fotografía. Puedes marcar manualmente.'); }
    });
  } finally {
    settled = true;
    clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
    worker.onmessage = worker.onerror = worker.onmessageerror = null;
    worker.terminate();
  }
}
