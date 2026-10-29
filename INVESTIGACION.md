# TallaLab: evidencia y criterios de diseño

Consulta de fuentes oficiales: 28 de octubre de 2026. Este documento describe un prototipo de pruebas; no constituye certificación de precisión ni conformidad con una norma.

## Tallaje: qué se puede afirmar

No adoptamos una talla universal para escuelas: cada catálogo pertenece a un proveedor, corte y producto. Las referencias iniciales permiten probar la experiencia; para comprar uniformes debe cargarse y validarse la tabla real del colegio.

- [ISO 8559-1:2017](https://www.iso.org/standard/61686.html) describe mediciones antropométricas para ropa y continúa vigente, confirmada en 2026.
- [ISO 8559-2:2025](https://www.iso.org/standard/85590.html) trata indicadores de tallaje basados en medidas corporales. Reemplaza la edición de 2017. No proporciona precisión de cámara ni un catálogo escolar universal.
- [El Corte Inglés, uniformes](https://www.elcorteingles.es/moda-infantil/tallas-uniformes/) declara que sus tablas corresponden al cuerpo. Se transcribe una selección de etiquetas 2–18 en `src/catalogs.mjs`, con pecho, cintura y cadera en centímetros. No publica estatura o largos en esa tabla: esos datos quedan ausentes. Las etiquetas no permiten deducir la edad ni las proporciones individuales.
- [Simplicity](https://simplicity.com/how-to-choose-your-ideal-pattern-size) distingue el cuerpo de la prenda terminada, que contempla holgura y diseño. No añadimos una holgura genérica al comparar un cuerpo con una tabla corporal.

## Cámara, silueta y realidad aumentada

[MediaPipe Pose Landmarker para web](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js) admite imagen y vídeo, coordenadas de imagen y coordenadas tridimensionales estimadas. Su [descripción general](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker) documenta 33 puntos de postura. Son apropiados para guiar postura y encuadre.

Nuestra decisión: usar una silueta ajustable como ayuda visual. El niño no debe cambiar su cuerpo para coincidir con un patrón. El estado de encuadre se describe con texto además de color. Una detección estable no equivale a una medida exacta.

Las coordenadas del modelo, incluso cuando se expresan en metros, son predicciones: no sustituyen una calibración física ni demuestran profundidad métrica exacta. Una imagen frontal no revela contornos de pecho, cintura o cadera. No multiplicamos anchos por constantes para fabricar esos contornos. La estatura de referencia únicamente aporta una escala aproximada al plano fotografiado; perspectiva, ropa y postura introducen error.

## Qué comparar por producto

Decisiones de este proyecto, sujetas a validación con el proveedor:

- **Camisa:** contorno de pecho confirmado; cuello, manga y largo requieren datos del modelo.
- **Pantalón:** cintura y cadera confirmadas; entrepierna y largo se revisan aparte.
- **Falda:** cintura y cadera confirmadas; largo conforme al diseño del colegio.
- **Zapatos:** medir ambos pies apoyados; usar el más largo y comprobar ancho y ajuste.

## Calzado y calibración

[Clarks UK](https://www.clarks.com/en-gb/fitguide) publica largo del pie en milímetros, talla Clarks EU y distintas anchuras. El catálogo seleccionado convierte milímetros a centímetros dividiendo por diez. No es una conversión EU universal. Las tablas de otras regiones pueden diferir.

[Nike Colombia](https://www.nike.com.co/guia-de-tallas) explica la medición en papel con peso repartido y la selección del pie mayor. Usamos ese procedimiento como alternativa verificable. Para fotografía del pie, una referencia física debe estar en el mismo plano, con cámara perpendicular y bordes visibles; esa aproximación requiere comprobación con regla.

No sumamos automáticamente margen de crecimiento al largo antes de consultar la tabla: podría contar dos veces un margen ya considerado por la marca. La recomendación de calzado sigue siendo provisional hasta probar el producto.

## Método conservador propio de comparación

Los valores nominales publicados no se convierten en intervalos oficiales. Como regla de prueba, puede buscarse la primera fila cuyos valores nominales cubran todas las medidas necesarias confirmadas; se presenta como candidata orientativa, no como garantía de ajuste. Esta regla es una decisión del proyecto, no una recomendación de ISO ni del fabricante.

Si faltan medidas, hay discrepancias entre proporciones, se está entre filas o fuera del catálogo, se muestra la limitación y se requiere revisión. No se extrapolan tallas fuera de los datos. Los largos ausentes no se deducen de la etiqueta. Deben conservarse fuente, fecha y método de obtención de cada medida para revisar el resultado.

## Interfaz y validación

La [guía de Google sobre objetivos táctiles y accesibilidad Material](https://support.google.com/accessibility/android/answer/7101858?hl=es) recomienda superficies táctiles amplias y separadas. Aplicamos controles grandes, acciones claras, una tarea por paso y estados comprensibles. Es una inspiración de diseño; no implica afiliación o certificación de Google.

Antes de utilizar resultados para pedidos se necesita una prueba con prendas reales y mediciones repetidas con cinta o regla, registrando errores por medida, dispositivo y condiciones. No se publica un porcentaje de confianza de tallaje sin esa validación. Las imágenes deben procesarse localmente y descartarse al terminar, salvo una acción explícita de exportación del usuario.
