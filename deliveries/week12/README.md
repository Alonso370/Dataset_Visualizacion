# Semana 12 — Borrador refinado

**VIZU · Patrones de los accidentes de tránsito de mayor impacto en Estados Unidos (2016–2023)**
DS5343 · Visualización de Datos · UTEC · Semestre 2026-2
Prof. Germain García-Zanabria · 28 de octubre de 2026

La aplicación responde al feedback del design review del 14 de octubre. En la demo, el profesor dibujó sobre la Fig. 1 de TripVista (Guo et al., 2011) el layout que esperaba: panel de control a la izquierda, mapa y vista temporal arriba, una columna de vistas pequeñas a la derecha y un brush de tiempo abajo. Pidió además:
- elegir el periodo con un brush y no por año;
- agregar las vistas que faltaban (T4 y T5);
- no cambiar una vista por otra;
- que todo se actualice mientras se mueve el periodo.

| Pedido | Cómo queda |
|---|---|
| Brush de tiempo en lugar del desplegable de año | Franja inferior con barras mensuales (2016-01 a 2023-03) apiladas por fuente y `d3.brushX`, ajustado a meses completos |
| Vistas de T4 y T5 | En la columna derecha, **“¿En qué punto de la vía?”** (T4). **T5:** fijar dos estados o condados como A y B; el mapa, la línea de tiempo y el perfil los superponen |
| No cambiar una vista por otra | El mismo layout en todos los niveles (país, estado, condado, ciudad) |
| Actualización en vivo | Mapa, indicadores, línea de tiempo, perfil y comparación se recalculan mientras se arrastra |
| Lazo de 5 km (anotación del equipo en la revisión) | El lazo no se aleja más de 5 km de su punto inicial; al dibujarlo se ve el círculo límite |

## La decisión central: un índice ajustado por fuente

Los tres proveedores no etiquetan la severidad igual. Source2 marca como Severity ≥ 3 al 34 % de sus reportes y Source1 al 8 %; además, Source1 cambió de criterio entre 2019 y 2021 (33 % en 2018, 2 % en 2021). Un porcentaje bruto hace que un lugar parezca más grave solo porque lo reporta más la fuente que marca más alto.

Por eso el mapa y el perfil muestran un **índice ajustado**:

> esperados = Σ (accidentes del área con la fuente *s* en el año *a*) × (tasa nacional de Severity ≥ 3 de *s* en *a*)
> índice = accidentes Severity ≥ 3 observados ÷ esperados

**Cómo se lee:**
- **1×** es lo esperado dada la mezcla de fuentes y años del área;
- **1.5×** es un 50 % más;
- **0.5×** es la mitad.

Es una estandarización indirecta. Se recalcula para cualquier periodo, porque los datos son mensuales. Si un área tiene menos de 30 accidentes esperados, queda en gris, como "pocos datos".

**Por qué importa, con un ejemplo de los datos:**
- **Arkansas** tiene un 15 % bruto y queda en el puesto 37. Pero lo reporta casi solo Source1, la fuente estricta: con el índice da **2.26×** y sube al puesto 2.
- **Nebraska** tiene un 16 % bruto, pero el 84 % de sus reportes son de Source2, la fuente generosa: con el índice da **0.53×**.

## Qué muestra cada parte

- **Mapa (Mapbox + deck.gl en todos los niveles):**
  - **País y estado:** coroplético del índice en una gama de **un solo tono** (naranja, 7 clases de claro a oscuro). La clase del centro, marcada en la leyenda, es lo esperado (0.95–1.05×).
  - **Condado y ciudad:** los reportes de la muestra como puntos: Severity ≥ 3 en naranja y el resto en gris. Herramientas sobre el mapa:
  - lazo de 5 km;
  - reloj de 24 h;
  - "Solo Severity ≥ 3".

  Al elegir una ciudad, el mapa se ajusta a sus propios accidentes.
- **Ciudades del condado:** ranking en barras por número de accidentes, con su índice. Reemplaza a las burbujas de ciudades de la semana 10, que estaban mal ubicadas: los resúmenes de week10 traen las coordenadas truncadas a grados enteros.
- **¿Cuándo?:** la proporción de Severity ≥ 3 de cada fuente comparada consigo misma, por mes. Si los datos no alcanzan, pasa a años, y si tampoco alcanzan, lo dice en lugar de dibujar. En modo A/B muestra el índice anual de A frente a B.
- **Perfil del área** (si el área tiene menos de 1 000 accidentes Severity ≥ 3 en el periodo, el perfil sube al estado o al país y lo dice en una línea; si una fila no alcanza por fuente, muestra las fuentes combinadas):
  - **¿A qué hora y qué día?:** promedio diario de accidentes Severity ≥ 3 en 7 × 24. Con menos de 300 casos se agrupa en laborables / fin de semana y franjas de 4 horas.
  - **¿En qué punto de la vía?** y **¿Con qué clima?:** índice por elemento y por condición, **con un punto por fuente**, para ver si las fuentes coinciden.
- **Accesibilidad:**
  - "Ver como tabla" junto al mapa;
  - colores validados contra daltonismo con el validador de la skill de visualización: fuentes en violeta `#6250d6` y verde `#199e70`; A y B en azul `#2a78d6` y magenta `#d55181`;
  - tipografía Overpass (inspirada en la de las señales de carretera de EE. UU.) para títulos y cifras, y Public Sans para el texto;
  - etiquetas directas en las líneas;
  - el diseño se adapta a una columna en pantallas angostas.

**Se quitó el RadViz.** Era difícil de leer para el público objetivo y no controlaba la fuente. En su lugar va "¿Con qué clima?", calculado con todos los datos y no con la muestra.

## Hallazgos, calculados sobre los 7,7 M

1. **Source1 cambió de criterio.** Su proporción con Severity ≥ 3 pasa de 33.4 % en 2018 a 2.4 % en 2021, mientras Source2 se mantiene entre 30 y 37 %.
2. **El mal tiempo pesa en las dos fuentes.**
   - Nieve o hielo: 1.20× en Source1 y 1.31× en Source2.
   - Tormenta: 1.23× y 1.29×.
   - Lluvia: 1.07× y 1.17×.
   - La niebla queda por debajo de lo esperado: 0.78× y 0.89×.
3. **Carolina del Sur frente a Ohio.** Con la misma mezcla de fuentes (38–39 % Source1, 60 % Source2), quedan en **0.54×** y **1.22×**.
4. **La infraestructura depende de la fuente:**
   - **semáforo:** 1.10× en Source1 y 0.27× en Source2;
   - **intersección:** 1.70× en Source2, pero 1.04× en Source1 una vez descontado el año.

   **Corrige lo que afirmaba la semana 6**, que "Junction sube en ambas fuentes". Esa subida en Source1 se explicaba sobre todo porque las intersecciones se concentraban en los años en que Source1 todavía marcaba alto.
5. **Hora y día:** el pico nacional de accidentes Severity ≥ 3 es el viernes a las 16 h.

## Contenido

```
deliveries/week12/
├── README.md
└── VIZU/
    ├── index.html
    ├── css/style.css
    ├── js/
    │   ├── config.js        rutas de datos, token público de Mapbox, límites
    │   ├── data-core.js     agregaciones e índice ajustado (funciones puras)
    │   ├── filter-core.js   reloj, lazo y su tope de 5 km
    │   ├── filters.js       interacción del reloj y del lazo
    │   ├── timeline.js      brush de periodo
    │   ├── charts.js        perfil, líneas, ciudades, leyendas y tabla
    │   └── app.js           estado, navegación y coordinación de vistas
    ├── scripts/
    │   ├── build_week12.py  agregados mensuales exactos + índice ID → mes
    │   └── serve.py         servidor local
    ├── data/w12/            datos generados por build_week12.py
    ├── tests/
    └── run_server.bat
```

## Ejecutar

La aplicación lee las muestras de `deliveries/week10/VIZZU_7M_mapbox_deckgl/data/`, así que se sirve desde la raíz del repositorio. `serve.py` lo hace solo:

```bash
python3 deliveries/week12/VIZU/scripts/serve.py
```

Abre `http://127.0.0.1:8000/deliveries/week12/VIZU/`. En Windows también funciona `run_server.bat`. Requiere internet para Mapbox, las bibliotecas por CDN y los límites geográficos.

**Despliegue en GitHub Pages:** pendiente. Quedaría en `https://alonso370.github.io/Dataset_Visualizacion/deliveries/week12/VIZU/`, con el token de Mapbox restringido a ese dominio.

## Datos

| Origen | Qué aporta | Generado por |
|---|---|---|
| `week10/.../data/processed` | Nombres y slugs de condados | `week10/.../scripts/preprocess_7m.py` |
| `week10/.../data/explorer` | Muestras deterministas por estado, condado y ciudad | `week10/.../scripts/build_explorer.py` |
| `week12/VIZU/data/w12` | Totales exactos **por mes**, fuente y área (país, estado, condado y ciudad), infraestructura, día × hora de Severity ≥ 3, clima e `id_month.bin` (ID → mes) | `build_week12.py` |

```bash
pip install pandas pyarrow numpy
python3 deliveries/week12/VIZU/scripts/build_week12.py --input US_Accidents_March23.csv --output deliveries/week12/VIZU/data/w12
```

Unos 90 s, 3 090 archivos, 52 MB. Cuadra con la semana 10: 7 728 394 registros y 1 504 047 con Severity ≥ 3 (19.46 %).

## Verificación

```bash
node deliveries/week12/VIZU/tests/filter-core.cjs
node deliveries/week12/VIZU/tests/data-core.cjs
python3 deliveries/week12/VIZU/tests/test_build_week12.py
node deliveries/week12/VIZU/tests/browser-smoke.cjs     # Playwright + Chromium
```

La prueba de navegador recorre país → California → Los Ángeles → Pasadena y Kentucky → Hardin → Elizabethtown. Comprueba:
- el brush, el lazo de 5 km y la comparación A/B;
- que el mapa nacional pinte los estados;
- que la vista de una ciudad muestre todos sus accidentes;
- que no haya errores de consola ni de red.

## Limitaciones

- **El índice es relativo al promedio nacional de cada fuente y año.** No es un riesgo: el dataset no mide la exposición al tráfico.
- **Los puntos del mapa de calles y el perfil con lazo usan una muestra** de hasta 2 500 reportes, y la vista lo indica. La muestra no trae la condición del clima.
- **Por ciudad solo hay totales mensuales.** En el nivel ciudad, el perfil usa el condado como contexto y lo dice.
- **El mapa está en Mercator**, la proyección de Mapbox, también en el coroplético de país y estado. La clase de datos geoespaciales recomienda área igual para mapas temáticos. El equipo prefirió un solo mapa continuo con navegación a escala de calle, y se declara como limitación.

## Datos e inspiración

US Accidents (2016–2023), S. Moosavi, Kaggle, CC BY-NC-SA 4.0 · TripVista (Guo et al., 2011) · JamVis (Rodriguez, Ferreira y Poco, 2022) · Fan et al. (2015) · Sunkpho y Wipulanusat (2020) · D3.js, Mapbox GL JS y deck.gl.

**Repositorio:** https://github.com/Alonso370/Dataset_Visualizacion
