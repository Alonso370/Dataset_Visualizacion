# VIZZU · Explorador de accidentes de tránsito

Vista nacional por proporción de accidentes de mayor impacto, mapa de calles al seleccionar un estado, RadViz climático a la derecha y dos líneas de accidentes por hora debajo: lunes–viernes frente a sábado–domingo. Se mantiene la navegación USA → estado → condado → ciudad, con filtros de fuente, año, reloj de 24 horas y selección geográfica mediante lazo.

El mapa seleccionado utiliza [Mapbox Streets](https://docs.mapbox.com/map-styles/reference/streets/), con calles, etiquetas, zoom y desplazamiento. Mantiene Mapbox como proveedor; no requiere una cuenta de Google Maps.

## Ejecutar

1. Usa Python 3.10 o posterior e instala `pip install -r requirements.txt`.
2. Configura un token **público** de Mapbox en `js/config.js`.
3. En Windows, ejecuta **`run_server.bat` de esta carpeta**. Abre automáticamente la URL correcta en el navegador. Mantén abierta la ventana del servidor mientras uses la aplicación.

El arranque fija la carpeta del proyecto, busca otro puerto si el 8000 está ocupado y evita cargar HTML, CSS o JavaScript antiguos desde la caché. Si ya hay un servidor de esta misma carpeta activo, abre su versión actual. Usa la pestaña que abre el `.bat`, porque una pestaña anterior en `localhost:8000` puede pertenecer a otra aplicación.

Alternativa desde terminal: `python scripts/serve.py`. Puedes indicar `--port 8010` o `--no-open`. No abras el HTML con doble clic.

Esta copia incluye los resúmenes de **7.728.394 accidentes** en `data/processed` y las muestras nuevas en `data/explorer`. No necesitas reprocesar al cambiar filtros o recargar la página.

## Actualizar datos

Para un CSV nuevo, genera los resúmenes y luego las muestras:

```powershell
python scripts/preprocess_7m.py --input "data/raw/US_Accidents_March23.csv" --output "data/processed"
python scripts/build_explorer.py --input "data/raw/US_Accidents_March23.csv" --output "data/explorer"
```

`preprocess_7m.py` reemplaza el directorio indicado en `--output`: elige exclusivamente una carpeta destinada a datos generados. `build_explorer.py` mantiene intactos los resúmenes originales y escribe sus propios archivos. El CSV original nunca se modifica. Ejecuta los procesos sin usar simultáneamente la aplicación y recarga al finalizar.

Las muestras nuevas incluyen `hour` (0–23) y `weekday` (lunes = 0, domingo = 6). Las muestras de esta copia conservan sus IDs originales y usan paquetes `temporal.json` por estado/condado, ya generados desde el CSV completo. Para actualizar muestras antiguas sin volver a muestrear, ejecuta:

```powershell
python scripts/enrich_temporal.py --input "data/raw/US_Accidents_March23.csv"
```

Esta migración aprovecha los IDs `A-<número>` del dataset US Accidents para construir un índice temporal compacto en memoria. Para datos con otros IDs, usa `build_explorer.py`. Se mantienen las horas y días registrados en el CSV; si solo existe `Start_Time`, se derivan en UTC. Los datos faltantes permanecen ausentes.

Ambos leen bloques de 250.000 filas y seleccionan únicamente las columnas necesarias. Puedes reducir memoria con `--chunksize 100000`. El constructor de muestras usa archivos temporales en el directorio de salida y elimina únicamente su carpeta temporal propia al finalizar.

El entorno `.venv` incluido en la copia original apunta a Python de otra computadora. Si no funciona, crea uno nuevo con tu instalación de Python o ejecuta los comandos con otro Python que tenga pandas instalado.

## Qué muestra cada vista

- **USA:** los estados se colorean por `high / total`, respetando fuente y año. Los condados se cargan por primera vez al seleccionar un estado.
- **Estado:** calles y límites transparentes de condados, puntos de la muestra, RadViz y gráfica de semana/fin de semana. Selecciona un condado en el mapa o un punto para avanzar.
- **Condado:** muestra local y burbujas violetas de ciudades. Selecciona una burbuja para abrir una ciudad.
- **Ciudad:** se solicita el pequeño archivo de muestra de esa ciudad y, para las muestras antiguas, el paquete horario del condado que se reutiliza entre ciudades. No se descarga `accidents.csv` del condado.
- **RadViz:** temperatura (°F), humedad (%), presión (inHg), visibilidad (mi), viento (mph) y precipitación (in). Las casillas permiten elegir dimensiones. Cada factor se normaliza al rango de la muestra del área; la posición es la media de los anclajes ponderada por esos valores. Dimensiones constantes aportan fuerza cero. Los registros incompletos para las dimensiones activas se omiten y se indica cuántos son. Haz clic en un punto para centrar el mapa.
- **Semana vs. fin de semana:** dos líneas de cantidades de accidentes de la muestra visible por hora. Lunes–viernes y sábado–domingo se agrupan por el día registrado de cada accidente. Los conteos no se dividen por el número de días de cada grupo; no son tasas poblacionales. Las horas excluidas del reloj interrumpen la línea, en vez de presentarse como cero accidentes. Se indica cuántos registros se omiten por hora/día faltantes.
- **Reloj:** disponible desde el nivel Estado. Abre «Horas» en los filtros. El primer clic cuando están todas seleccionadas elige una sola hora; los clics siguientes añaden o quitan horas. Arrastrar pinta sectores consecutivos y permite cruzar medianoche (23 → 00). Cada sector incluye los minutos 00–59 de esa hora. «Todas» y «Ninguna» establecen las selecciones correspondientes. También puedes seleccionar cada sector con Tab y Enter/Espacio.
- **Lazo:** activa «Seleccionar con lazo», arrastra sobre el mapa y suelta para rodear los accidentes deseados. Esc cancela el dibujo; «Limpiar lazo» recupera los puntos del área. El polígono se conserva al hacer zoom o desplazarse y filtra simultáneamente el mapa, RadViz y líneas. Al cambiar de área se limpia el lazo; al cambiar fuente/año se conserva.
- **Reiniciar filtros:** restaura fuente y año a todos, las 24 horas, todas las severidades y dimensiones climáticas, y limpia el lazo. Conserva el estado/condado/ciudad que estás explorando.

Los filtros de fuente y año afectan tanto los totales como la muestra. Los filtros de severidad, reloj y lazo afectan solamente la muestra. Los totales superiores corresponden a todos los accidentes del área, no solo a severidad ≥ 3. Se muestra también la cantidad y proporción de accidentes de mayor impacto.

## Rendimiento y límites

El navegador nunca lee el CSV original. Los totales provienen de resúmenes completos y las vistas de registros utilizan muestras deterministas por fuente/año. Se eligen los menores hashes del ID: hasta **300 por estado/fuente/año**, **200 por condado/fuente/año** y **64 por ciudad/fuente/año**. Se preservan muestras de ciudades pequeñas por separado. Las muestras incluyen todas las severidades y mantienen valores faltantes como `null`.

Después de filtrar por fuente y año, las tres visualizaciones comparten como máximo **2.500 registros** (`MAX_CHART_ROWS` en `js/config.js`). Si hay más, se toma un subconjunto a intervalos regulares. Las muestras estratificadas sirven para explorar relaciones; sus frecuencias no representan proporciones de toda la población.

Además:

- carga por área y archivos compactos con columnas compartidas;
- caché LRU con presupuesto de **24 MiB estimados a partir del texto JSON**; no equivale al consumo total de RAM del navegador;
- cancelación de solicitudes y comprobación de versión al cambiar rápidamente de selección;
- agrupación temporal en 24 posiciones por línea, evitando miles de elementos gráficos;
- redibujado de filtros limitado a un frame del navegador;
- lazo almacenado en coordenadas de Mercator, independiente del zoom y del tamaño de pantalla;
- coordenadas agregadas sin truncar decimales en futuros preprocesamientos;
- índices de agregados para evitar que cada condado recorra todas las ciudades al exportar.
- combinación de variantes de nombres de condados que comparten carpeta, evitando sobrescribir ciudades. En esta copia se recuperaron los resúmenes afectados desde el CSV completo; las versiones previas están en `data/summary_backup`.

El preprocesamiento necesita memoria para los agregados, muestras estatales y un condado cada vez, además de espacio temporal en disco; su consumo no es constante respecto al número de áreas. El renderizado está acotado independientemente de los 7 millones de filas. La velocidad real también depende de CPU, red, WebGL y carga de teselas. No se ha medido un factor de aceleración contra la versión anterior.

Si una combinación fuente/año no tiene datos, las gráficas muestran cero registros. Si faltan archivos, aparece un mensaje visible. El mapa necesita internet para Mapbox, bibliotecas CDN y límites geográficos.

## Verificación

```powershell
python tests/test_preprocessing.py
python tests/validate_assets.py
node --check js/app.js
node --check js/charts.js
node --check js/filters.js
node tests/filter-core.cjs
node tests/browser-smoke.cjs
```

La prueba Python verifica muestreo, áreas, valores faltantes, sumas de coordenadas y horas/días. Las pruebas de filtros cubren los límites de semana/fin de semana, medianoche y polígonos cóncavos. La prueba de navegador ejecuta el **BAT real desde otra carpeta**, con el puerto solicitado ocupado por otra aplicación: comprueba carpeta, puerto alternativo, caché y versión de scripts. También dibuja un lazo real, verifica su permanencia al cambiar el zoom, utiliza el reloj con ratón y en pantalla móvil, comprueba las líneas y el reinicio, y verifica navegación rápida y ausencia de descargas de CSV completos. Usa Playwright y Chrome; configura `PLAYWRIGHT_MODULE` y `CHROME_PATH` si sus ubicaciones difieren de las incluidas en el script.

`validate_assets.py` recorre todas las muestras y contrasta poblaciones, áreas, ciudades y límites por estrato contra los resúmenes completos. Los scripts `repair_county_aliases.py` y `sync_sample_counts.py` conservan la migración aplicada a los 74 condados afectados por el exportador anterior; no son necesarios al generar datos nuevos con los scripts corregidos.

Archivos principales: `js/app.js` (mapa, navegación, carga), `js/charts.js` (gráficas), `js/filters.js` (reloj y lazo), `js/filter-core.js` (operaciones de filtrado), `scripts/build_explorer.py` (muestras), `scripts/enrich_temporal.py` (migración temporal) y `scripts/preprocess_7m.py` (resúmenes completos).
