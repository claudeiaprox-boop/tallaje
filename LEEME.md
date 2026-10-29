# TallaLab 2.2

Tallaje escolar guiado con cámara, marcado manual, verificación con cinta/regla y comparación con referencias comerciales identificadas. Proyecto Firebase: tallalab-pruebas-20261028.

- Sitio: https://tallalab-pruebas-20261028.web.app
- HTML descargable: https://tallalab-pruebas-20261028.web.app/TallaLab.html
- Evidencia y fuentes: [INVESTIGACION.md](INVESTIGACION.md).
- Encargo estructurado y criterios: [PROMPT-DESARROLLO.md](PROMPT-DESARROLLO.md).

## Recorrido

1. Elegir camisa, pantalón, falda o zapatos.
2. Preparar estatura real o referencia física para pies.
3. Capturar/cargar fotos, encuadrar con silueta, marcar y corregir puntos con lupa. La vista lateral es opcional. También se puede continuar solo con cinta.
4. Introducir medidas comprobadas con cinta o regla; elegir y revisar la tabla de referencia o importar la del proveedor.
5. Consultar una talla orientativa, sus datos y advertencias; descargar informe o imprimir/guardar PDF.

Las referencias ECI y Clarks pertenecen a esas marcas. No son estándares universales ni la tabla del proveedor del colegio. Las filas son medidas nominales, no rangos de ajuste publicados. El motor elige la primera referencia igual o mayor en todas las dimensiones necesarias y señala falta de datos, conflictos y casos fuera de tabla. No agrega holgura automática.

## Arquitectura

- src/index.html, src/style.css, src/app.mjs: interfaz, recorrido y cámara.
- src/engine.mjs: geometría, comparación de tallas y CSV; funciones puras.
- src/catalogs.mjs: referencias y fuentes verificadas.
- src/vision.mjs, src/pose-worker.mjs: MediaPipe opcional, CPU, una inferencia pendiente y hasta seis cuadros por segundo en worker.
- src/vision-assets.json: versiones, tamaños y SHA-256 fijados.
- scripts/preparar.mjs: genera el sitio y un HTML autónomo idéntico desde las mismas fuentes.
- scripts/instalar-vision.mjs: restaura únicamente recursos del modelo/biblioteca que falten o no coincidan con sus hashes.

No hay servidor de aplicación, cuentas de alumnos, almacenamiento de fotos ni analítica. Las fotos y medidas permanecen en memoria del navegador. Los informes solo se guardan por acción explícita. El sitio es accesible para quien tenga su enlace.

## Preparar y comprobar

Requiere Node.js; para publicar, Firebase CLI con una sesión autorizada.

```powershell
node scripts/preparar.mjs
node scripts/instalar-vision.mjs
node scripts/instalar-vision.mjs --verify-only
node --test tests/engine.test.mjs
node scripts/servidor-pruebas.mjs
```

Abre http://127.0.0.1:5100. Este servidor local aplica la política de contenido de Firebase; sirve solo archivos públicos. Para la prueba UI se necesita Playwright y Edge: con el servidor activo, ejecutar node tests/ui-check.cjs. La suite usa Playwright instalado o el runtime incluido de Codex, si existe.

Para actualizar el sitio:

```powershell
firebase deploy --only hosting
```

El despliegue prepara los archivos y comprueba/descarga los recursos de visión antes de publicar. La biblioteca fijada es MediaPipe Tasks Vision 1.2.0; el modelo es Pose Landmarker Lite float16 versión 1. Los recursos se alojan bajo public/vendor/mediapipe; no se deben borrar si se desea preparar sin red. No hay claves API.

## Funciones sin conexión

TallaLab.html contiene interfaz, geometría, tablas, marcado manual e informes. Se puede abrir sin conexión y cargar fotografías compatibles. La cámara de un archivo local depende del navegador. La asistencia automática carga recursos de la versión HTTPS y requiere esa versión; el marcado manual sigue disponible si falla. El primer uso del asistente descarga aproximadamente 20 MB al navegador.

## Límites y validación

- La superposición es una guía visual sobre cámara, no un escáner volumétrico ni una implementación de WebXR.
- MediaPipe estima articulaciones para orientar postura. No localiza coronilla ni bordes/contornos anatómicos y no certifica medidas en centímetros.
- Las fotos corporales producen distancias visibles aproximadas con escala por estatura; no se convierten sus anchos en contornos.
- La foto del pie requiere referencia física en el mismo plano y cámara perpendicular. Esta versión no rectifica perspectiva; confirmar longitud con regla y probar ambos zapatos.
- No hay precisión metrológica validada ni margen de error conocido. Antes de uso operativo se requiere estudio frente a cinta y ajuste real por prenda, dispositivo, postura y proveedor.
- Las comprobaciones automatizadas de cálculo/interfaz y la cámara simulada verifican funcionamiento; la cámara física y el ajuste de uniformes deben probarse en campo.

Los activos de Google conservan sus avisos. La política de contenido permite recursos propios, workers y compilación WASM; no permite conexiones de la aplicación a dominios externos.


## Método actualizado (2.1)

Usa **Tres lecturas** en Verificación: retira y recoloca cinta/regla, revisa mediana y rango. Si las lecturas varían demasiado, repite; si cruzan referencias de talla, prueba las alternativas. Los umbrales del prototipo no prueban exactitud.

Al importar CSV, selecciona medidas corporales o contornos de prenda terminada. Estos últimos requieren la holgura mínima indicada por el proveedor; no uses anchos planos como contornos. El laboratorio de frente/perfil es experimental y nunca decide talla. La asistencia de cámara comprueba postura y estabilidad, sin certificar centímetros.

Consulta [Método y validación pendiente](METODO-PRECISION.md).


## Reconocimiento automático (2.2)

En Cámara deja activado **Detectar puntos automáticamente**. Al activar la cámara frontal aparece el esqueleto detectado; al capturar o cargar una foto, MediaPipe la analiza de nuevo y conserva sus puntos. Puedes seleccionar cualquiera de los 33 puntos para revisarlo y reanalizar con **Reconocer puntos con IA**. Las propuestas numeradas de hombros/codo/muñeca pueden arrastrarse. Las correcciones manuales sobreviven al reanálisis.

El modelo estima articulaciones, no la identidad ni los contornos de confección. Completa coronilla, suelo y bordes necesarios antes de calcular distancias. Para prendas y zapatos mantiene la verificación física del método 2.1. El modelo se ejecuta en el navegador con los recursos del sitio HTTPS; si falla o se cancela, continúa manualmente.
