# Tallas del acta y referencias en centímetros

Revisión del 29 de octubre de 2026. Este análisis distingue las etiquetas del formulario de inventario de una tabla técnica de medidas. No establece una equivalencia oficial entre documentos de proveedores distintos.

## Qué contiene el acta

El archivo aportado se titula internamente **Acta de reintegro de sobrantes**. Se revisaron sus dos páginas completas y su extracción de texto.

El cuadro incluye ocho modelos de ropa: camisa blanca, camisa azul, pantalón azul, short azul, falda azul elástica, falda azul, falda beige y pantalón beige. Cada modelo tiene su propia lista de etiquetas. El cuadro de zapatos incluye tallas de 23 a 45. En total hay 71 filas de tallas de ropa y 23 de zapatos.

El acta **no contiene centímetros, método de medición, tabla corporal, dimensiones de prenda, equivalencias alfabéticas ni horma de calzado**. Las celdas de cantidad están vacías. Por tanto:

- Una talla enumerada en el formulario no demuestra existencias disponibles.
- Las cantidades no se deben interpretar como cero ni como stock confirmado.
- `T16` es una etiqueta de ese artículo; no significa automáticamente 16 años, talla 16 de otra marca, `XXS` o una determinada medida de pecho.
- `T1X` y `T2X` deben conservarse tal como aparecen. El formulario no define su equivalencia con `XL`, `XXL`, `1XL` o cualquier otra nomenclatura.
- La lista permitida cambia según el artículo. Una talla de camisa blanca no debe sugerirse como camisa azul si no figura en la lista de esta última.

## Qué muestra y qué no aclara la imagen

La imagen relaciona etiquetas de varias categorías con pecho, longitud, altura y peso. Es útil como ejemplo visual de una tabla que explica el resultado en centímetros, pero presenta ambigüedades que impiden utilizarla directamente como tabla oficial de los uniformes del acta.

### Un número de talla no identifica una medida universal

La propia imagen contiene dos usos distintos de `#16`: la sección infantil superior indica pecho de 68 cm; la sección de ropa deportiva infantil indica 88 cm. Son categorías diferentes dentro de la misma imagen. Ninguno de esos valores establece por sí solo la medida de `T16` en el acta.

### Pecho puede ser contorno o ancho de prenda en plano

La sección masculina superior muestra valores de pecho de 100 a 124 cm, mientras que la femenina y la masculina deportiva muestran 41 a 49 cm. Estos últimos podrían describir el ancho de una prenda extendida, pero la imagen no explica el procedimiento. Esa interpretación es una hipótesis, no una confirmación del proveedor.

No se debe comparar un contorno corporal con un ancho plano como si fueran la misma dimensión. Tampoco se deben multiplicar automáticamente por dos los valores de 41 a 49 sin verificar qué representan, cómo se midieron y a qué modelo pertenecen. Una conversión de ancho a contorno de prenda, cuando proceda, sigue sin convertirlo en contorno corporal: la prenda incorpora su holgura y diseño.

### Longitud, altura y peso requieren contexto

La columna de longitud masculina superior contiene rangos muy amplios, desde 50-60 hasta 105-115 cm. La imagen no permite confirmar si son largos de la prenda, otra referencia o un error de rotulación. No deben utilizarse como largos técnicos verificados del uniforme.

La altura y el peso ayudan a orientar una prueba, pero no determinan por sí solos pecho, cintura, cadera o la holgura de una prenda concreta. El peso no se debe inferir de la cámara ni pedir como sustituto de una dimensión que pueda medirse. El sistema tampoco debe garantizar ajuste basándose únicamente en altura y peso.

La nota inferior de la imagen menciona medición manual y una posible variación de 1 a 3 cm. Esa observación corresponde a la tabla de esa tienda: no es un margen de error validado de TallaLab, una tolerancia autorizada para los uniformes escolares ni una corrección que deba sumarse a todas las medidas.

## Regla para sugerir las tallas del acta

La lista del acta sirve para identificar **qué etiquetas existen en el formulario de cada artículo**. Para relacionarlas con las medidas de una persona se necesita además una tabla técnica del mismo proveedor y modelo.

El recorrido debe permitir seleccionar el artículo y mostrar sus tallas, conservando las etiquetas originales. La tabla de centímetros debe quedar vinculada a ese artículo concreto. Sin esa tabla confirmada, el resultado debe indicar que falta configurar la equivalencia; no debe renombrar una sugerencia de una marca externa como si fuera una talla oficial del acta.

## Guía provisional solicitada para empezar sin centímetros propios

El usuario aclaró que todavía no dispone de las medidas técnicas de los uniformes y que la imagen sirve como orientación. Para poder explorar una sugerencia mientras se consiguen esos datos, esta versión ofrece la acción **Cargar guía orientativa de tallas**. No la activa por defecto ni transforma la tabla ilustrativa de camisetas en una tabla oficial del acta.

La guía utiliza referencias corporales escolares externas ya incluidas en TallaLab: [El Corte Inglés, tablas de uniformes](https://www.elcorteingles.es/moda-infantil/tallas-uniformes/) para ropa y [Clarks, guía de calzado](https://www.clarks.com/en-gb/fitguide) para pies. Su función es proponer qué revisar o probar, no certificar la talla del proveedor escolar.

En ropa se conservan únicamente etiquetas numéricas de 4 a 18 que aparezcan tanto en la referencia como en la lista de ese artículo del acta. Se antepone `T` al número como correspondencia provisional de etiquetas. **La coincidencia numérica no demuestra equivalencia de patrón, proveedor ni centímetros entre marcas.** Cada tabla queda vinculada al artículo seleccionado; una guía de camisa blanca no autoriza a sugerir etiquetas ajenas a camisa azul.

No se extrapolan `T20`, `T22`, `T1X` o `T2X`, ni se completan las medidas de esas filas. La interfaz muestra las etiquetas sin referencia. Si las medidas superan las referencias cargadas, el resultado debe quedar fuera de tabla en vez de asignar una de esas tallas por proximidad.

En zapatos se supone provisionalmente que la numeración del acta es EU. Solo se conservan referencias enteras de Clarks entre 25 y 40 que estén presentes exactamente en ambas listas. No se redondean medias tallas, no se extrapolan las tallas 23, 24 o 41 a 45 y no se demuestra compatibilidad de horma o ancho.

El usuario debe aceptar de forma explícita que utilizará una guía de otra marca cuya equivalencia con ese uniforme no está validada. Tanto el resultado como el informe identifican la naturaleza **provisional** de la tabla. Esa aceptación no sustituye las mediciones físicas, las verificaciones exigidas por el motor ni la prueba de la prenda; tampoco confirma existencias.

Al obtener medidas reales se puede completar la tabla del artículo o importar un CSV con sus etiquetas exactas. Los perfiles de medida real y las guías provisionales se distinguen; sus valores no deben mezclarse ni presentarse como si tuvieran el mismo origen. La sugerencia definitiva debe basarse en la tabla y el modelo del proveedor.

La tabla puede ser de uno de estos tipos:

1. **Medidas corporales de referencia.** Indica qué medidas del cuerpo corresponden a las etiquetas del proveedor. Si contiene referencias nominales en vez de intervalos, se debe explicar la regla utilizada para elegir qué prenda probar.
2. **Contornos completos de prenda terminada.** Permite comparar dimensiones de la prenda con dimensiones corporales comparables y la holgura mínima indicada por el proveedor para ese tejido y corte. No equivale a una simulación de comodidad o tensión de la tela.
3. **Longitud real del pie.** Para el calzado, debe relacionar la longitud de ambos pies con las etiquetas y horma del proveedor. La longitud de la suela no sustituye la longitud del pie.

Una plantilla de carga puede incluir todas las tallas del artículo con las celdas de medida vacías. Los espacios pendientes deben permanecer vacíos; no se completan con cifras de otras marcas ni con interpolaciones no autorizadas. Una tabla que cubra solo algunas tallas debe advertirlo y limitar la comparación a esas filas.

Si las lecturas repetidas de una persona conducen a etiquetas diferentes, conviene mostrar las candidatas y pedir revisión o prueba. Si la tabla no cubre las medidas o ninguna talla del artículo cumple los requisitos, no se debe seleccionar automáticamente la etiqueta disponible más cercana.

## Qué debe incluir el resultado y el informe

Para que la sugerencia sea comprensible, el resultado debe mostrar:

- Artículo exacto, talla sugerida o motivo por el que no se asigna una.
- Medidas verificadas utilizadas y, si se repitieron, su mediana y rango observado.
- Tipo, proveedor y modelo de la tabla técnica de centímetros.
- Valores de referencia de la talla y holguras explícitas cuando se comparen prendas terminadas.
- Advertencias sobre casos entre tallas, cobertura parcial de la tabla y comprobaciones pendientes.
- La aclaración de que el acta enumera etiquetas y no confirma existencias.

El informe puede identificar la etiqueta del acta para facilitar la revisión del inventario. Esto no autoriza a completar cantidades, modificar un acta administrativa, afirmar disponibilidad ni sustituir la prueba de la prenda. Cualquier escritura sobre el documento de inventario debe responder a una acción específica del usuario y a datos confirmados.

## Procedencia y publicación

Se utilizaron los dos archivos proporcionados por el usuario: el formulario de inventario y la imagen de referencia de camisetas. No se ha establecido que correspondan al mismo proveedor, tejido, patrón o colección. Esta procedencia debe confirmarse antes de activar una equivalencia como oficial.

Este archivo es un análisis propio. El PDF original, la imagen original, las capturas de revisión y la extracción de texto no se incorporan al repositorio público como parte de esta revisión.
