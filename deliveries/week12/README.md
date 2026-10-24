# Semana 12 — Borrador refinado

**VIZU · Patrones de los accidentes de tránsito de mayor impacto en Estados Unidos (2016–2023)**
DS5343 · Visualización de Datos · UTEC · Semestre 2026-2
Prof. Germain García-Zanabria · 28 de octubre de 2026

La aplicación de esta semana responde al feedback del design review del 14 de octubre. En la demo, el profesor dibujó sobre la Fig. 1 de TripVista (Guo et al., 2011) el layout que esperaba ver y pidió lo siguiente:
- un brush temporal en lugar del desplegable de año;
- vistas para T4 y T5;
- no cambiar una vista por otra;
- que todo se actualice mientras se mueve el periodo.

| Pedido del design review | Cómo queda en esta versión |
|---|---|
| Elegir el tiempo con un brush, no por año | Franja inferior con barras mensuales 2016-01 a 2023-03 apiladas por fuente y `d3.brushX` ajustado a meses completos |
| Vistas para T4 y T5 | Columna derecha: **T4**, proporción con Severity ≥ 3 con y sin cada elemento vial, por fuente. **T5**, dos áreas fijadas como A y B, con su mezcla de fuentes, serie mensual, infraestructura y clima |
| No cambiar una vista por otra | Una sola pantalla en todos los niveles (USA, estado, condado, ciudad). Ya no se ocultan paneles ni cambia el estilo del mapa |
| Que todo se actualice al mover el brush | Mapa, KPI, T1, T3, T4, T5 y la muestra se recalculan mientras se arrastra. El mapa usa una escala fija por clases, así que los colores se comparan entre periodos |
| Lazo de 5 km (anotación del equipo en la revisión) | El lazo no se aleja más de 5 km de su punto inicial; al dibujar se ve el círculo límite |

El detalle de qué se implementó, qué se aplazó y qué se descartó está en `PeerCritiqueResponse`.

## Contenido

```
deliveries/week12/
├── README.md
└── VIZU/                      aplicación
    ├── index.html
    ├── css/style.css
    ├── js/
    │   ├── config.js          rutas de datos, token público de Mapbox, límites
    │   ├── data-core.js       agregaciones puras (sumas por rango, heatmap, infraestructura)
    │   ├── filter-core.js     reloj, lazo y su tope de 5 km
    │   ├── filters.js         interacción del reloj y del lazo
    │   ├── timeline.js        brush de periodo y vista T1
    │   ├── charts.js          T2 RadViz, T3 heatmap, T4, T5, KPI y leyenda
    │   └── app.js             estado, carga de datos y mapa
    ├── scripts/
    │   ├── build_week12.py    agregados mensuales exactos + índice ID → mes
    │   └── serve.py           servidor local
    ├── data/w12/              datos generados por build_week12.py
    ├── tests/
    └── run_server.bat
```

## Ejecutar

La aplicación lee las muestras y los resúmenes de `deliveries/week10/VIZZU_7M_mapbox_deckgl/data/`, así que **se sirve desde la raíz del repositorio**. `serve.py` lo hace solo:

```bash
python deliveries/week12/VIZU/scripts/serve.py        # abre http://127.0.0.1:8000/deliveries/week12/VIZU/
```

En Windows, `run_server.bat` de `VIZU/`. No abras el HTML con doble clic. Requiere internet para Mapbox, las bibliotecas por CDN y los límites geográficos.

**Despliegue en GitHub Pages:** al publicar el repositorio desde `main` y la raíz, la aplicación queda en `https://alonso370.github.io/Dataset_Visualizacion/deliveries/week12/VIZU/`. **Pendiente:** activar Pages y restringir el token de Mapbox a ese dominio.

## Datos

| Origen | Qué aporta | Generado por |
|---|---|---|
| `week10/.../data/processed` | Nombres de condados y ciudades, coordenadas de las ciudades | `week10/.../scripts/preprocess_7m.py` |
| `week10/.../data/explorer` | Muestras deterministas por estado, condado y ciudad (todas las severidades, clima, infraestructura, hora y día) | `week10/.../scripts/build_explorer.py` |
| `week12/VIZU/data/w12` | **Nuevo:** totales exactos **por mes**, fuente y área (USA, estado, condado y ciudad), infraestructura con y sin cada elemento, día × hora de Severity ≥ 3, clima, e `id_month.bin` (ID → mes) para que el brush filtre también la muestra | `week12/VIZU/scripts/build_week12.py` |

```bash
pip install pandas pyarrow numpy
python deliveries/week12/VIZU/scripts/build_week12.py --input US_Accidents_March23.csv --output deliveries/week12/VIZU/data/w12
```

Lee el CSV completo una vez, en bloques de 500 000 filas (unos 90 s en un portátil). Produce 3 090 archivos y 52 MB. Comprobación: 7 728 394 registros y 1 504 047 con Severity ≥ 3 (19,46 %), los mismos totales que los resúmenes de la semana 10 a nivel país, California y Los Ángeles.

## Verificación

```bash
node deliveries/week12/VIZU/tests/filter-core.cjs
node deliveries/week12/VIZU/tests/data-core.cjs
python deliveries/week12/VIZU/tests/test_build_week12.py
node deliveries/week12/VIZU/tests/browser-smoke.cjs     # Playwright + Chromium
```

## Hallazgos que la aplicación permite ver (calculados sobre los 7,7 M)

Están en la aplicación como **recorridos guiados**, en el panel izquierdo.

1. **Source1 cambió de criterio.** Su proporción con Severity ≥ 3 pasa de 33,4 % en 2018 a 2,4 % en 2021, mientras Source2 se mantiene entre 30 y 37 %. La caída de la proporción nacional es un efecto de la fuente, no de las vías.
2. **Intersección (`Junction`) es el patrón robusto.** La proporción sube con el elemento en las dos fuentes: de 7,6 a 13,1 % en Source1 y de 32,6 a 58,1 % en Source2. En cambio, el semáforo (`Traffic_Signal`) solo "reduce" el impacto en Source2 (41,0 → 9,3 %); en Source1 lo sube un poco (8,0 → 9,9 %).
3. **Carolina del Sur frente a Ohio.** Las dos tienen la misma mezcla de fuentes (38 % y 39 % de Source1, 60 % de Source2) y llegan a 11,9 % contra 31,4 %. La brecha se mantiene dentro de cada fuente: Source1 2,4 contra 17,3 %, Source2 18,2 contra 40,4 %.
4. **Hora y día.** Los picos de accidentes con Severity ≥ 3 son el viernes a las 16 h y los martes de 7 a 8 h. Un día laborable promedio tiene unas 1,9 veces más que uno de fin de semana.

## Limitaciones

- **Los conteos no son tasas.** El dataset no mide exposición al tráfico, así que ningún color dice dónde es más peligroso conducir.
- **La proporción con Severity ≥ 3 depende de la fuente.** Por eso la fuente es un filtro de primer nivel, T1 la separa y T4 compara siempre dentro de una fuente.
- **Puntos y RadViz usan una muestra de hasta 2 500 registros.** Lo mismo ocurre con T3 y T4 cuando hay un lazo activo o se está en el nivel ciudad. Cada vista lo indica con una etiqueta "muestra".
- **El mapa sigue en Mercator**, por la navegación a escala de calles; está declarado como limitación (R21). La escala de color ya es segmentada por clases.
- **Las ciudades solo tienen totales mensuales**, así que T5 compara infraestructura y clima solo entre estados o condados.

## Datos e inspiración

US Accidents (2016–2023), S. Moosavi, Kaggle, CC BY-NC-SA 4.0 · TripVista (Guo et al., 2011) · JamVis (Rodriguez, Ferreira y Poco, 2022) · Fan et al. (2015) · Sunkpho y Wipulanusat (2020) · D3.js, Mapbox GL JS y deck.gl.

**Repositorio:** https://github.com/Alonso370/Dataset_Visualizacion
