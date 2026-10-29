# Método y precisión de TallaLab

Revisión del 29 de octubre de 2026. Este documento describe decisiones de diseño y un protocolo de validación. No certifica exactitud antropométrica ni garantiza ajuste.

## Qué aporta el documento analizado

Se revisó el documento aportado sobre realidad aumentada y MediaPipe Pose, de 17 páginas, incluyendo la lectura visual de las páginas 8, 9, 13 y 14. La propuesta principal es adecuada: separar seguimiento corporal, estimación de medidas, recomendación de talla y simulación de prendas. Una visualización convincente no demuestra que una talla sea correcta.

La página 9 presenta la calibración `s = H / h_px`, una longitud `L = d_px × s` y la holgura `E = G − B`. También propone usar frente y perfil para aproximar secciones del torso mediante elipses. Las páginas 13 y 14 recomiendan controles de captura, calidad por medida y dimensiones técnicas por prenda. Son orientaciones de arquitectura; no constituyen una validación de TallaLab ni de una población escolar.

El PDF original, sus imágenes y su extracción de texto no forman parte del repositorio público. Este archivo contiene un análisis propio y enlaces a las fuentes primarias.

## Método más fiable que puede ofrecer esta versión

Para las decisiones de talla se priorizan medidas físicas tomadas con cinta o regla y una tabla del proveedor y del modelo concreto. La cámara aporta apoyo visual, postura y estimaciones fotográficas. Una regla calibrada, una cinta bien utilizada y la prueba de la prenda siguen siendo las referencias prácticas disponibles; el programa no puede corregir una medida de entrada incorrecta por sí solo.

El recorrido de mayor control pide tres lecturas independientes por medida. Entre lecturas hay que retirar y recolocar la cinta o regla: repetir la misma cifra sin volver a medir no aporta información. Se usa la mediana y se muestra el rango observado, de la menor a la mayor lectura. Una dispersión de más de 1 cm para medidas corporales o de más de 0,3 cm para longitud del pie solicita repetir la medición. Son umbrales operativos del prototipo, elegidos para detectar discrepancias; no son tolerancias universales publicadas, ni una precisión demostrada.

El rango observado mide repetibilidad de esas tres lecturas. **No es un intervalo de confianza, un intervalo completo de error ni una incertidumbre calibrada.** Tres lecturas iguales pueden compartir el mismo sesgo: cinta inclinada, tensión excesiva, referencia anatómica equivocada o regla mal alineada.

Se distingue entre:

- **Tabla corporal:** describe medidas del cuerpo destinadas a una talla. Las tablas nominales de ejemplo no son límites máximos certificados. La selección de la primera referencia igual o superior es una regla conservadora para decidir qué probar, no una garantía.
- **Prenda terminada:** describe las dimensiones físicas del producto. Debe incluir el modelo, talla, unidad, método de medición y los márgenes de holgura que autoriza el proveedor. Una medida tomada en plano no es automáticamente un contorno; cualquier conversión debe documentarse.
- **Referencia de pie:** relaciona longitud del pie con la talla de un fabricante. Se miden ambos pies con apoyo y se utiliza el mayor. El ancho, la horma y el ajuste requieren comprobación adicional.

La holgura se calcula con dimensiones comparables: `holgura = medida de prenda terminada − medida corporal`. El proveedor debe definir el intervalo aceptable para cada zona, tejido y corte. No hay un valor universal que permita deducir comodidad, movilidad o presión. La comparación dimensional tampoco simula elasticidad, costuras o caída de la tela.

Si los extremos del rango observado llevan a tallas distintas, el resultado debe mostrar esa sensibilidad y pedir una nueva comprobación o probar las alternativas. No se oculta la ambigüedad detrás de una talla única ni se muestra un porcentaje de confianza inventado.

## Qué puede aportar la cámara

MediaPipe detecta 33 puntos anatómicos aproximados. La salida contiene posición, presencia y visibilidad de puntos; estas dos últimas no expresan precisión en centímetros. Los puntos de cadera no son los bordes externos de la cadera y el modelo no proporciona directamente cintura, coronilla o entrepierna de confección.

Los controles de captura comprueban una persona, visibilidad suficiente de puntos relevantes, posición central, cuerpo suficientemente grande, postura y estabilidad temporal. El criterio operativo de ocho cuadros válidos durante al menos un segundo ayuda a evitar una confirmación basada en un único cuadro favorable. Su cumplimiento permite mejorar la toma; no certifica una medida ni sustituye revisar cabeza y pies completos en la imagen. El sistema debe reiniciar la estabilidad al perder seguimiento o incumplir los controles.

La inferencia permanece en un worker, con un solo cuadro en proceso, tiempos límite y liberación de las imágenes transferidas. Se preserva la respuesta de la interfaz sin prometer una frecuencia fija en todos los teléfonos. Los fotogramas y medidas se procesan localmente según el flujo de la aplicación; cualquier futura transmisión de fotos requerirá un recorrido explícito y separado.

La calibración por altura presupone una estatura real bien medida y geometría de captura aproximadamente adecuada. La perspectiva, el gran angular, la inclinación de cámara, el movimiento, los zapatos y el cabello introducen error. Una regla en un plano distinto del cuerpo tampoco corrige automáticamente esa geometría. Las longitudes de foto se muestran como aproximaciones, separadas de los contornos verificados.

## Frente y perfil: experimento, no medida de confección

Dos vistas contienen más información que una sola y permiten investigar ancho y profundidad en el mismo nivel anatómico. Si se aproxima la sección por una elipse de semiejes `a = ancho / 2` y `b = profundidad / 2`, puede calcularse un perímetro aproximado. Sin embargo, el cuerpo no tiene necesariamente esa forma y la ropa modifica la silueta. Una fórmula exacta para una elipse no convierte sus entradas en medidas exactas del cuerpo.

Por ello, las estimaciones de frente y perfil se mantienen identificadas como experimentales y no sustituyen los contornos de cinta en el motor de tallas. La mejora publicada para Dense-Pose2SMPL al incorporar una segunda vista pertenece al método y experimento de ese trabajo; no demuestra una mejora equivalente de MediaPipe, de este prototipo ni de niños y adolescentes.

Una reconstrucción corporal paramétrica o un escáner multivista calibrado es una posible siguiente fase. Requiere modelos adecuados a la población, licencias de uso, calibración y evaluación independiente. Un render generativo o una malla que sigue las articulaciones no añade por sí solo exactitud dimensional.

## Validación pendiente para población escolar

No se ha medido todavía el error de TallaLab en una muestra escolar. No deben publicarse afirmaciones como “precisión de 1 cm”, “95 % exacto” o “talla exacta” a partir de los controles de software o de los umbrales de repetición.

El protocolo de campo propuesto es:

1. Definir con el proveedor puntos anatómicos, postura, tensión de cinta, reglas de holgura, medidas de prenda y criterio de talla apropiada. Documentar si las tablas son nominales, intervalos corporales o dimensiones de producto.
2. Obtener la autorización de responsables y evitar capturas innecesarias. Usar ropa cómoda y adecuada al contexto escolar; no solicitar desnudez ni guardar imágenes como requisito para validar tallas.
3. Reunir una muestra con edades, estaturas y proporciones diversas del grupo escolar objetivo. Incluir distintos dispositivos, iluminación, personas operadoras y formas de vestir. Una evaluación de adultos no basta para afirmar rendimiento en escolares.
4. Tomar una referencia física por una persona capacitada, independiente del resultado del programa. Registrar varias lecturas, instrumento y procedimiento. Si se comparan fotografías, medir la referencia sin consultar su estimación para reducir sesgo.
5. Comparar por separado cada dimensión y método. Informar número de casos, sesgo medio en centímetros, error absoluto medio, mediana y percentil 95 del error absoluto, errores extremos, tasa de repetición y tasa de capturas no utilizables. La repetibilidad se informa separada de la exactitud frente a referencia.
6. Evaluar tallas con la tabla real y prueba de prendas. Registrar coincidencia con la decisión del proveedor, casos entre tallas, prendas que requieren ajuste y comodidad/movilidad reportadas. No usar solo una imagen bonita como evidencia.
7. Reservar casos distintos para validación final y repetir cuando cambien algoritmo, dispositivos admitidos, captura o proveedor. Si se entrenan o ajustan modelos, no evaluar únicamente sobre los mismos casos utilizados para ajustarlos.

Antes de una recomendación automática basada en fotos se deben fijar criterios de aceptación con el proveedor y verificar que el error cerca de los cambios de talla resulta aceptable. Si no se cumplen, mantener cinta/regla y revisión humana como condición del resultado.

## Fuentes primarias contrastadas

- [Google: Pose Landmarker para web](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js). Salidas, coordenadas, segmentación y uso de workers para inferencia síncrona.
- [Google: ficha del modelo BlazePose GHUM 3D](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf). Limitaciones y alcance; las métricas de puntos 2D no validan contornos corporales. La ficha declara fuera de alcance aplicaciones que requieran profundidad métricamente exacta.
- [Gu y colaboradores: Dense-Pose2SMPL, IEEE Access 2022](https://ieeexplore.ieee.org/document/9831448/). Reconstrucción corporal con una y varias vistas; sensibilidad a pose, ropa y punto de vista. Sus resultados no validan este prototipo.
- [GarmentCode: repositorio oficial](https://github.com/maria-korosteleva/GarmentCode). Patrones paramétricos y simulación de prendas, útiles como siguiente fase después de obtener entradas fiables.

Estas fuentes apoyan las decisiones de arquitectura y sus límites. Ninguna certifica el rendimiento de TallaLab ni establece una tabla universal de uniformes escolares.
