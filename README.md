# TallaLab 2.2

Prototipo de tallaje escolar guiado con cámara para **camisa, pantalón, falda y zapatos**. Combina detección automática con IA, siluetas de encuadre, fotografías y marcado corregible con lupa y comparación con tablas de referencia identificadas.

**[Abrir la aplicación](https://tallalab-pruebas-20261028.web.app)** · [Descargar el HTML](https://tallalab-pruebas-20261028.web.app/TallaLab.html)

## Cómo funciona

1. Elegir una prenda y preparar la estatura real o una referencia física para los pies.
2. Capturar o cargar fotografías, encuadrar con la silueta y ajustar los puntos. También se puede continuar solo con medidas de cinta.
3. Tomar tres lecturas independientes por contorno, revisar la mediana y el rango observado. Si difieren más de 1 cm (0,3 cm en pies), repetir. Hay modo de una lectura con menor evidencia.
4. Revisar la tabla corporal o importar contornos completos de prenda terminada con la holgura mínima indicada por el proveedor.
5. Consultar una talla orientativa y descargar o imprimir el informe.

El modelo preentrenado Google MediaPipe Pose Lite detecta hasta 33 puntos corporales. La detección arranca automáticamente al abrir la cámara frontal o cargar una foto corporal y puede desactivarse. La superposición sobre la cámara es una guía visual; **no es un escáner corporal ni una implementación de WebXR**.

## Precisión y privacidad

- **La precisión no está validada y no hay un margen de error conocido.** Confirmar medidas con cinta o regla y comprobar el ajuste real de la prenda.
- Las fotografías estiman distancias visibles; sus anchos no se convierten en contornos verificados de pecho, cintura o cadera. La comparación elíptica frontal/perfil es experimental y nunca entra en la recomendación. Estos contornos deben medirse con cinta.
- Para el pie se necesita una referencia física en el mismo plano y cámara perpendicular; confirmar la longitud con regla y probar ambos zapatos.
- Las tablas de ECI y Clarks corresponden a esas marcas; no son estándares universales ni sustituyen la tabla del proveedor escolar. No se añade holgura automáticamente.
- Las fotos y medidas permanecen en la memoria del navegador. No hay cuentas, almacenamiento remoto ni analítica; los informes se guardan por acción del usuario.

## Reconocimiento automático (2.2)

- Cámara frontal: la IA arranca automáticamente, muestra puntos y esqueleto y revisa postura/estabilidad. La carga puede cancelarse y existe recorrido manual.
- Foto corporal: el modelo se ejecuta sobre el archivo o cuadro capturado exacto en modo IMAGE, no reutiliza articulaciones de un cuadro anterior.
- Selector para revisar los 33 puntos. Se dibujan solo los puntos con visibilidad suficiente; cero o varias personas generan avisos y no propuestas arbitrarias.
- En foto frontal se proponen hombros, codo y muñeca como apoyos corregibles. Los puntos de hombro son articulaciones aproximadas, no el extremo de una prenda. El perfil muestra esqueleto sin proponer bordes.
- La IA nunca completa coronilla, suelo, cintura, cadera, pecho, entrepierna ni contornos. Esas referencias no están en el esquema del modelo y deben comprobarse con el método apropiado.
- Los cambios manuales se conservan al reconocer de nuevo; los informes distinguen apoyos IA y manuales. La inferencia se cancela al abandonar la vista y las imágenes siguen en memoria local.
- La IA usa el modelo local fijado en `src/vision-assets.json`, no requiere claves ni servicio externo. El HTML suelto ofrece marcado manual y enlaza al sitio HTTPS para usar IA.

## Mejoras de método (2.1)

- Tres lecturas, mediana y rango observado. Repetibilidad no equivale a exactitud: los umbrales son operativos, no precisión validada.
- Sensibilidad a cambios de talla: si los extremos de las lecturas dan referencias distintas, se muestran las candidatas y se pide repetir/probar.
- Tipo de tabla explícito al importar CSV: cuerpo o prenda terminada. Esta última exige holgura mínima del proveedor por contorno y muestra `prenda − cuerpo`; no simula tejido ni garantiza comodidad.
- MediaPipe comprueba visibilidad, postura frontal aproximada, encuadre y ocho cuadros estables durante al menos un segundo. Los controles usan puntos sin suavizar; el dibujo tiene filtrado temporal. Las revisiones caducan para evitar usar cuadros antiguos.
- Frente/perfil permite explorar una sección elíptica ideal, siempre separada de las medidas físicas y del motor de talla.
- Informes incluyen método, lecturas, rango, tipo de tabla, holguras y origen del control de encuadre, sin fotografías.

[Análisis del documento y protocolo pendiente de validación escolar](METODO-PRECISION.md).

## Inicio rápido

Requiere Node.js 20 o posterior. La aplicación no tiene dependencias npm de ejecución.

```sh
npm run build
npm run vision:setup
npm run dev
```

Abrir **http://127.0.0.1:5100**. El primer `vision:setup` necesita conexión: descarga los recursos de MediaPipe y comprueba sus tamaños y hashes. Los usos posteriores reutilizan los recursos válidos.

`TallaLab.html` se genera desde las mismas fuentes y permite carga de fotos, marcado manual e informes sin conexión. La cámara al abrir un archivo local depende del navegador; la asistencia automática necesita la versión HTTPS. En un teléfono, usar el sitio publicado y permitir el acceso a la cámara.

## Comprobaciones

```sh
npm test
npm run vision:verify
```

`npm test` verifica geometría, comparación de tallas e importación CSV. Para comprobar la interfaz se necesita **Playwright, Microsoft Edge y el servidor local activo**. Instalar la herramienta de pruebas y, en otra terminal, ejecutar:

```sh
npm install --no-save --package-lock=false playwright
npm run test:ui
npm run test:assistant
npm run test:recognition
```

Las pruebas de interfaz utilizan cámara simulada. El funcionamiento con cámara física y la precisión del tallaje requieren pruebas de campo.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `src/` | Interfaz, cámara, motor de tallas, catálogos y asistencia MediaPipe. |
| `scripts/` | Generación del sitio, descarga verificada del modelo y servidor local. |
| `tests/` | Comprobaciones del motor y de la interfaz. |
| `public/` | Sitio generado y recursos de visión; excluido de Git. |
| `firebase.json`, `.firebaserc` | Configuración de Firebase Hosting. |
| `TallaLab.html` | Archivo descargable generado. |

Consultar [la investigación y sus fuentes](INVESTIGACION.md), [el encargo y los criterios de desarrollo](PROMPT-DESARROLLO.md) y [las notas técnicas](LEEME.md).

## Publicación en Firebase

Con Firebase CLI instalado y una sesión autorizada para el proyecto configurado:

```sh
npm run deploy
```

El despliegue genera el sitio y verifica los recursos de visión antes de publicar. Para usar otro proyecto, ajustar los destinos de `.firebaserc` y `firebase.json`. No se necesitan claves API en el código.
