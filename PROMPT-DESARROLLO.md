# TallaLab: especificación y prompt de desarrollo

## Encargo

Actúa como un equipo de arquitectura de software, visión por computadora, diseño de experiencia móvil y patronaje escolar. Mejora TallaLab, alojado en Firebase Hosting, para orientar un tallaje escolar verificable y fácil de usar desde Android, sin atribuir a la cámara precisión que no se haya demostrado.

## Resultado esperado

Un recorrido de cinco pasos: elegir prenda, preparar/calibrar, capturar, verificar medidas y consultar una talla de referencia. Soportar camisa, pantalón, falda y zapatos. Separar siempre medidas tomadas con cinta, distancias estimadas por foto y referencia comercial de talla. Mostrar el proveedor, unidades, fecha y límites de la tabla utilizada.

## Experiencia visual

- Diseño inspirado en Material Design, sin presentarse como un producto certificado por Google.
- Superficies claras, jerarquía tipográfica, controles grandes y contraste suficiente. Una acción principal por paso; instrucciones breves al lado de la acción.
- Silueta neutral ajustable sobre la cámara, sin asignarle las proporciones de una talla ni deformar el cuerpo para que encaje.
- Captura frontal y lateral opcional; recorrido independiente para cada pie. Vista ampliada al colocar puntos, corrección por arrastre, selección directa y controles de teclado.
- Mostrar estados reales de carga, cámara, marcado, verificación, datos faltantes, fuera de tabla y errores recuperables.

## Medición y visión

- Obtener cámara solo tras una acción del usuario, desde HTTPS, sin audio. Liberar todos los recursos al cerrar, cambiar de vista o dejar la página.
- Calibrar las fotos corporales con estatura real medida. Marcar coronilla y suelo manualmente; rechazar geometría claramente desalineada.
- Utilizar MediaPipe Pose Landmarker local opcional, en un worker, para orientar encuadre y postura. Sus articulaciones no son bordes exteriores de pecho, cintura o cadera. No utilizar worldLandmarks como cinta métrica ni inventar un porcentaje de precisión.
- Las salidas fotográficas son distancias visibles aproximadas. No duplicar anchos ni convertir frontal/lateral en contornos mediante una fórmula presentada como exacta.
- Para pies: referencia de longitud conocida, misma superficie, cámara perpendicular, talón y dedo más largo; medir ambos. Advertir que la perspectiva no se corrige en esta versión y comprobar con regla.
- Conservar el marcado manual si el modelo no carga o el teléfono no es compatible.

## Motor de tallas

- Camisa: comparar pecho; revisar manga/cuello/largo según el modelo. Pantalón y falda: cintura y cadera; los largos requieren verificación adicional. Zapatos: comparar la longitud del pie mayor y revisar ancho/horma.
- Exigir medidas comprobadas y aceptación de la tabla. Las referencias incorporadas ECI y Clarks son demostraciones comerciales identificadas, no estándares universales ni la tabla del colegio.
- Admitir CSV del proveedor con medidas corporales de referencia en cm. Rechazar tablas incompletas, valores inválidos, tallas duplicadas y secuencias inconsistentes.
- Si solo existen referencias nominales, explicar la regla: primera fila igual o mayor en las dimensiones necesarias. No inventar rangos oficiales. Señalar conflictos entre dimensiones, falta de datos y casos fuera de tabla. No añadir holgura genérica.
- No recomendar una compra definitiva solo por la foto. Probar la prenda y validar con el proveedor.

## Arquitectura y privacidad

- Mantener funciones geométricas y motor de tallas puros, separados de interfaz, cámara y visión.
- Generar sitio y HTML descargable desde la misma fuente. El archivo único funciona sin conexión con fotos, marcado manual, catálogos y reportes; la asistencia automática requiere los recursos de la versión HTTPS.
- No subir fotos, identificar al estudiante, guardar historiales ni añadir analítica. Conservar datos solo en memoria y exportar únicamente por acción del usuario.
- Fijar la versión y verificar hashes del modelo y WASM. Alojar recursos de visión en el mismo sitio; limitar la política de contenido a recursos propios y permitir únicamente lo requerido para WASM/workers.

## Criterios de aceptación

1. Flujo completo en escritorio y teléfono, sin desbordamiento horizontal; navegación por teclado y etiquetas accesibles.
2. Cámara, captura, carga de foto, cambio de vista, corrección de puntos, deshacer y reinicio funcionan; las sesiones de ejemplo no se mezclan con datos reales.
3. Pruebas del motor: fronteras, datos faltantes, fuera de tabla, conflictos, CSV y geometrías inválidas.
4. Validar modelo real en navegador con la política de contenido aplicada. Simular falta de recursos y comprobar la alternativa manual.
5. Descargar informe y HTML; imprimir sin exponer fotos; verificar el sitio HTTPS tras publicar.
6. Documentar que las pruebas funcionales no certifican exactitud. Antes de uso operativo, estudiar repetibilidad, error frente a cinta y ajuste real por prenda, edad, postura, dispositivo y proveedor.

## Alcance de esta versión

La superposición sobre cámara y el asistente de postura son una guía visual interactiva. No constituyen un escáner volumétrico, una reconstrucción corporal en profundidad ni una implementación universal de WebXR. Cualquier ampliación a profundidad o reconstrucción 3D deberá comprobar hardware, calibración, privacidad y precisión de manera independiente.


## Método 2.1: criterios obligatorios

Mantener separados el seguimiento AR, las estimaciones fotográficas, las medidas físicas y las dimensiones de prenda. El modo recomendado pide tres lecturas independientes y usa mediana/rango; solicita repetir si la dispersión supera el umbral operativo (1 cm corporal; 0,3 cm pie), sin llamarlo precisión o intervalo de confianza. Los extremos observados deben probarse contra el motor para exponer cambios de talla. Diferenciar tipo corporal/contorno prenda al importar; prenda necesita holgura mínima explícita del proveedor. No inferir comodidad, caída o elasticidad. La elipse de dos vistas es solo laboratorio sin conexión automática a medidas verificadas. El control de captura exige 8 cuadros estables y 1 segundo, usa puntos originales, y caduca con fotogramas antiguos; el suavizado es solo visual. Validar en escolares según METODO-PRECISION.md antes de prometer exactitud.
